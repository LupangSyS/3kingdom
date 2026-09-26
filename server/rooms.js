'use strict';

const crypto = require('crypto');
const { Game } = require('./game/engine');
const { Banter } = require('./game/banter');
const { CARD_INFO, SUIT_SYMBOL, RANK_STR } = require('./game/cards');
const { HEROES, SKILLS, KINGDOMS, ROLES } = require('./game/heroes');

const META = { cards: CARD_INFO, heroes: HEROES, skills: SKILLS, kingdoms: KINGDOMS, roles: ROLES, suits: SUIT_SYMBOL, ranks: RANK_STR };
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BOT_NAMES = ['บอทกวนอู', 'บอทจูล่ง', 'บอทเตียวหุย', 'บอทโจโฉ', 'บอทซุนกวน', 'บอทลิโป้', 'บอทจิวยี่', 'บอทสุมาอี้', 'บอทม้าเฉียว', 'บอทกำเหลง'];
const MAX_PLAYERS = 10;
const ROOM_IDLE_MS = 30 * 60 * 1000;

const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 16) || 'ผู้เล่น';

class RoomManager {
  constructor(io, opts = {}) {
    this.io = io;
    this.opts = opts;
    this.rooms = new Map();
    this.tokens = new Map(); // token -> room code
    this.sweeper = setInterval(() => this.sweep(), 60 * 1000);
    this.sweeper.unref();
  }

  newCode() {
    for (;;) {
      let c = '';
      for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
      if (!this.rooms.has(c)) return c;
    }
  }

  createRoom() {
    const room = { code: this.newCode(), players: [], hostPid: null, status: 'lobby', game: null, chat: [], lastActive: Date.now(), timer: null };
    this.rooms.set(room.code, room);
    return room;
  }

  lookup(token) {
    const code = token && this.tokens.get(token);
    const room = code && this.rooms.get(code);
    const pl = room && room.players.find((p) => p.token === token);
    return pl ? { room, pl } : { room: null, pl: null };
  }

  handle(socket) {
    let token = null;
    socket.emit('meta', META);
    const toast = (msg) => socket.emit('toast', msg);
    const on = (ev, fn) => socket.on(ev, (data = {}) => {
      try { fn(data || {}); } catch (e) { console.error(`socket ${ev} error`, e); toast('เกิดข้อผิดพลาด'); }
    });

    on('hello', ({ token: t }) => {
      if (typeof t !== 'string' || t.length < 8 || t.length > 100) return toast('token ไม่ถูกต้อง');
      token = t;
      const { room, pl } = this.lookup(token);
      if (room) this.attach(room, pl, socket);
      else socket.emit('state', { now: Date.now(), room: null });
    });

    on('create', ({ name }) => {
      if (!token) return;
      this.leaveCurrent(token);
      const room = this.createRoom();
      const pl = this.addHuman(room, token, name);
      this.attach(room, pl, socket);
    });

    on('join', ({ code, name }) => {
      if (!token) return;
      code = String(code || '').toUpperCase().trim();
      const room = this.rooms.get(code);
      if (!room) return toast('ไม่พบห้องนี้');
      const existing = room.players.find((p) => p.token === token);
      if (existing) return this.attach(room, existing, socket);
      if (room.status !== 'lobby') return toast('เกมในห้องนี้เริ่มไปแล้ว');
      if (room.players.length >= MAX_PLAYERS) return toast('ห้องเต็มแล้ว');
      this.leaveCurrent(token);
      const pl = this.addHuman(room, token, name);
      this.sysChat(room, `${pl.name} เข้าห้อง`);
      this.attach(room, pl, socket);
    });

    on('leave', () => {
      if (!token) return;
      this.leaveCurrent(token);
      socket.emit('state', { now: Date.now(), room: null });
    });

    on('rename', ({ name }) => {
      const { room, pl } = this.lookup(token);
      if (!room || room.status !== 'lobby') return;
      pl.name = cleanName(name);
      this.broadcast(room);
    });

    on('addBot', () => {
      const { room, pl } = this.lookup(token);
      if (!room || room.hostPid !== pl.pid || room.status !== 'lobby') return;
      if (room.players.length >= MAX_PLAYERS) return toast('ห้องเต็มแล้ว');
      const used = new Set(room.players.map((p) => p.name));
      const name = BOT_NAMES.find((n) => !used.has(n)) || `บอท${room.players.length + 1}`;
      room.players.push({ pid: crypto.randomUUID(), token: null, name, isBot: true, connected: true, socketId: null });
      this.broadcast(room);
    });

    on('kick', ({ pid }) => {
      const { room, pl } = this.lookup(token);
      if (!room || room.hostPid !== pl.pid || room.status !== 'lobby' || pid === pl.pid) return;
      const target = room.players.find((p) => p.pid === pid);
      if (!target) return;
      this.removePlayer(room, target);
      if (target.socketId) this.io.to(target.socketId).emit('state', { now: Date.now(), room: null, kicked: true });
      this.broadcast(room);
    });

    on('start', () => {
      const { room, pl } = this.lookup(token);
      if (!room || room.hostPid !== pl.pid || room.status !== 'lobby') return;
      if (room.players.length < 2) return toast('ต้องมีผู้เล่นอย่างน้อย 2 คน (เพิ่มบอทได้)');
      this.startGame(room);
    });

    on('answer', ({ promptId, data }) => {
      const { room, pl } = this.lookup(token);
      if (!room || !room.game) return;
      const err = room.game.submit(pl.pid, promptId, data);
      if (err) { toast(err); this.sendState(room, pl); }
    });

    on('chat', ({ text }) => {
      const { room, pl } = this.lookup(token);
      if (!room) return;
      const t = String(text || '').trim().slice(0, 200);
      if (!t) return;
      this.pushChat(room, { from: pl.name, pid: pl.pid, text: t });
      this.broadcast(room);
      if (room.game && room.banter && !room.game.result) {
        this.botSay(room, room.game, room.banter.replyTo(room.game, pl, t));
      }
    });

    on('toLobby', () => {
      const { room, pl } = this.lookup(token);
      if (!room || room.hostPid !== pl.pid || room.status !== 'ended') return;
      room.game = null;
      room.status = 'lobby';
      room.players = room.players.filter((p) => !p.left);
      this.broadcast(room);
    });

    socket.on('disconnect', () => {
      const { room, pl } = this.lookup(token);
      if (!pl || pl.socketId !== socket.id) return;
      pl.connected = false;
      pl.socketId = null;
      if (room.game) room.game.setConnected(pl.pid, false);
      this.broadcast(room);
    });
  }

  addHuman(room, token, name) {
    const pl = { pid: crypto.randomUUID(), token, name: cleanName(name), isBot: false, connected: true, socketId: null };
    room.players.push(pl);
    if (!room.hostPid) room.hostPid = pl.pid;
    this.tokens.set(token, room.code);
    return pl;
  }

  attach(room, pl, socket) {
    if (pl.socketId && pl.socketId !== socket.id) {
      this.io.to(pl.socketId).emit('state', { now: Date.now(), room: null, replaced: true });
    }
    const wasAway = !pl.connected;
    pl.socketId = socket.id;
    pl.connected = true;
    room.lastActive = Date.now();
    if (room.game) room.game.setConnected(pl.pid, true);
    if (wasAway && room.status === 'playing') this.sysChat(room, `${pl.name} กลับเข้าเกม`);
    this.broadcast(room);
  }

  leaveCurrent(token) {
    const { room, pl } = this.lookup(token);
    if (!room) return;
    this.tokens.delete(token);
    if (room.status === 'lobby') {
      this.removePlayer(room, pl);
      this.sysChat(room, `${pl.name} ออกจากห้อง`);
    } else {
      // ระหว่างเกม: ให้บอทเล่นแทน
      pl.left = true;
      pl.token = null;
      pl.socketId = null;
      pl.connected = false;
      if (room.game) room.game.setBot(pl.pid);
      this.sysChat(room, `${pl.name} ออกจากเกม (บอทเล่นแทน)`);
      if (room.hostPid === pl.pid) this.pickHost(room);
    }
    if (!room.players.some((p) => !p.isBot && !p.left)) this.destroy(room);
    else this.broadcast(room);
  }

  removePlayer(room, pl) {
    room.players = room.players.filter((p) => p !== pl);
    if (pl.token) this.tokens.delete(pl.token);
    if (room.hostPid === pl.pid) this.pickHost(room);
  }

  pickHost(room) {
    const h = room.players.find((p) => !p.isBot && !p.left);
    room.hostPid = h ? h.pid : null;
  }

  destroy(room) {
    if (room.game) room.game.abort();
    for (const p of room.players) if (p.token) this.tokens.delete(p.token);
    clearTimeout(room.timer);
    this.rooms.delete(room.code);
  }

  sweep() {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      if (room.players.some((p) => p.connected && !p.isBot)) { room.lastActive = now; continue; }
      if (now - room.lastActive > (this.opts.roomIdleMs || ROOM_IDLE_MS)) this.destroy(room);
    }
  }

  startGame(room) {
    room.players = room.players.filter((p) => !p.left);
    room.status = 'playing';
    room.chat = room.chat.slice(-20);
    const banter = new Banter();
    room.banter = banter;
    const game = new Game({
      players: room.players.map((p) => ({ pid: p.pid, name: p.name, isBot: p.isBot })),
      onUpdate: () => this.broadcast(room),
      onEvent: (ev) => { if (this.opts.botChat !== false) this.botSay(room, game, banter.react(game, ev)); },
      botDelay: this.opts.botDelay ?? 900,
      timeouts: this.opts.timeouts,
    });
    for (const p of room.players) if (!p.isBot && !p.connected) game.setConnected(p.pid, false);
    room.game = game;
    this.sysChat(room, 'เริ่มเกม!');
    game.run().then(() => {
      if (room.game !== game) return;
      room.status = 'ended';
      this.broadcast(room);
    });
    this.broadcast(room);
  }

  /** บอทพูดในแชท โดยหน่วงเวลาให้ดูเป็นธรรมชาติ */
  botSay(room, game, lines) {
    lines.forEach((l, i) => {
      const delay = 600 + i * 1400 + Math.random() * 900;
      setTimeout(() => {
        if (room.game !== game || !this.rooms.has(room.code)) return;
        this.pushChat(room, { from: l.name, pid: l.pid, text: l.text, bot: true });
        this.broadcast(room);
      }, delay).unref?.();
    });
  }

  pushChat(room, msg) {
    room.chat.push({ id: crypto.randomUUID(), at: Date.now(), ...msg });
    if (room.chat.length > 100) room.chat.shift();
  }
  sysChat(room, text) { this.pushChat(room, { from: null, text }); }

  stateFor(room, pl) {
    return {
      now: Date.now(),
      me: pl.pid,
      room: {
        code: room.code,
        hostPid: room.hostPid,
        status: room.status,
        players: room.players.filter((p) => !p.left || room.status !== 'lobby').map((p) => ({
          pid: p.pid, name: p.name, isBot: p.isBot, connected: p.connected, left: !!p.left,
        })),
        chat: room.chat.slice(-50),
      },
      game: room.game ? room.game.viewFor(pl.pid) : null,
    };
  }

  sendState(room, pl) {
    if (pl.socketId) this.io.to(pl.socketId).emit('state', this.stateFor(room, pl));
  }

  broadcast(room) {
    if (room.timer) return;
    room.timer = setTimeout(() => {
      room.timer = null;
      for (const pl of room.players) this.sendState(room, pl);
    }, 25);
  }
}

module.exports = { RoomManager, META };
