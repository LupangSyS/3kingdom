'use strict';

const { CARD_INFO, SUIT_NAME, buildDeck, colorOf, isRed, isBlack, cardStr } = require('./cards');
const { HEROES, SKILLS, LORD_HEROES, ROLES } = require('./heroes');
const bot = require('./bot');

const ROLE_TABLE = {
  2: ['lord', 'rebel'],
  3: ['lord', 'rebel', 'traitor'],
  4: ['lord', 'loyalist', 'rebel', 'traitor'],
  5: ['lord', 'loyalist', 'rebel', 'rebel', 'traitor'],
  6: ['lord', 'loyalist', 'rebel', 'rebel', 'rebel', 'traitor'],
  7: ['lord', 'loyalist', 'loyalist', 'rebel', 'rebel', 'rebel', 'traitor'],
  8: ['lord', 'loyalist', 'loyalist', 'rebel', 'rebel', 'rebel', 'rebel', 'traitor'],
  9: ['lord', 'loyalist', 'loyalist', 'loyalist', 'rebel', 'rebel', 'rebel', 'rebel', 'traitor'],
  10: ['lord', 'loyalist', 'loyalist', 'loyalist', 'rebel', 'rebel', 'rebel', 'rebel', 'traitor', 'traitor'],
};

const PHASE_NAMES = {
  setup: 'เลือกตัวละคร', start: 'เริ่มเทิร์น', judge: 'ตัดสิน', draw: 'จั่วการ์ด',
  play: 'เล่นการ์ด', discard: 'ทิ้งการ์ด', finish: 'จบเทิร์น', over: 'จบเกม',
};

const HARMFUL = new Set(['attack', 'duel', 'dismantle', 'steal', 'indulgence', 'borrowsword']);

class GameOver extends Error {
  constructor(result) { super('game over'); this.result = result; }
}
class GameAborted extends Error {
  constructor() { super('game aborted'); }
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const uniq = (arr) => new Set(arr).size === arr.length;
const strip = (c) => (c ? { id: c.id, key: c.key, suit: c.suit, rank: c.rank, as: c.asKey || undefined } : null);

class Game {
  /**
   * @param {object} o
   * @param {{pid:string,name:string,isBot?:boolean}[]} o.players ลำดับที่นั่ง
   * @param {Function} [o.onUpdate] เรียกทุกครั้งที่สถานะเปลี่ยน
   * @param {number} [o.botDelay] หน่วงเวลาบอท (ms)
   * @param {object} [o.timeouts] { play, respond, negate, disconnected }
   * @param {number} [o.maxRounds] จำกัดจำนวนรอบ (0 = ไม่จำกัด) — ใช้ในการทดสอบ
   */
  constructor(o) {
    const n = o.players.length;
    if (!ROLE_TABLE[n]) throw new Error('จำนวนผู้เล่นต้องอยู่ระหว่าง 2-10 คน');
    this.onUpdate = o.onUpdate || (() => {});
    this.botDelay = o.botDelay ?? 700;
    this.timeouts = { play: 90000, respond: 25000, negate: 12000, disconnected: 12000, ...(o.timeouts || {}) };
    this.maxRounds = o.maxRounds || 0;
    const roles = shuffle([...ROLE_TABLE[n]]);
    this.players = o.players.map((p, i) => ({
      pid: p.pid, name: p.name, isBot: !!p.isBot, connected: true, seat: i, role: roles[i],
      hero: null, hp: 0, maxHp: 0, gender: 'm', kingdom: '', alive: true,
      hand: [], equip: { weapon: null, armor: null, defHorse: null, offHorse: null }, judgeZone: [],
      rebelScore: 0,
    }));
    const deck = buildDeck();
    this.cardById = new Map(deck.map((c) => [c.id, c]));
    this.deck = shuffle(deck);
    this.discard = [];
    this.pending = new Map();
    this.promptSeq = 0;
    this.logs = [];
    this.logSeq = 0;
    this.table = [];
    this.ts = null;
    this.round = 0;
    this.phase = 'setup';
    this.result = null;
    this.aborted = false;
  }

  // ════════════════════════════ utilities ════════════════════════════

  update() { this.onUpdate(); }

  log(text) {
    this.logs.push({ id: ++this.logSeq, text });
    if (this.logs.length > 300) this.logs.splice(0, this.logs.length - 300);
    this.update();
  }

  pushTable(p, v, targets = [], label) {
    this.table.push({
      seat: p ? p.seat : null,
      as: v.key,
      cards: v.real.map(strip),
      targets,
      label: label || null,
    });
    if (this.table.length > 8) this.table.shift();
  }

  player(pid) { return this.players.find((p) => p.pid === pid); }
  alive() { return this.players.filter((p) => p.alive); }
  orderFrom(p) {
    const n = this.players.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      const q = this.players[(p.seat + i) % n];
      if (q.alive) out.push(q);
    }
    return out;
  }
  others(p) { return this.orderFrom(p).filter((q) => q !== p); }
  nextAlive(p) {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const q = this.players[(p.seat + i) % n];
      if (q.alive) return q;
    }
    return null;
  }

  hasSkill(p, id) {
    if (!p || !p.alive || !p.hero) return false;
    if (!HEROES[p.hero].skills.includes(id)) return false;
    if (SKILLS[id].lord && p.role !== 'lord') return false;
    return true;
  }
  equipCards(p) { return Object.values(p.equip).filter(Boolean); }
  hasAnyCard(p, withJudge = true) {
    return p.hand.length > 0 || this.equipCards(p).length > 0 || (withJudge && p.judgeZone.length > 0);
  }
  weaponKey(p) { return p.equip.weapon ? p.equip.weapon.key : null; }
  attackRange(p) { return p.equip.weapon ? CARD_INFO[p.equip.weapon.key].range : 1; }
  distance(a, b) {
    if (a === b) return 0;
    const al = this.alive();
    const ia = al.indexOf(a);
    const ib = al.indexOf(b);
    const n = al.length;
    let d = Math.abs(ia - ib);
    d = Math.min(d, n - d);
    if (b.equip.defHorse) d++;
    if (a.equip.offHorse) d--;
    if (this.hasSkill(a, 'mashu')) d--;
    return Math.max(1, d);
  }
  inAttackRange(a, b) { return a !== b && b.alive && this.distance(a, b) <= this.attackRange(a); }
  canBeAttacked(t) { return t.alive && !(this.hasSkill(t, 'kongcheng') && t.hand.length === 0); }
  canUseAttack(p) {
    return this.hasSkill(p, 'paoxiao') || this.weaponKey(p) === 'crossbow' || this.ts.attacksUsed < 1;
  }

  makeV(key, real) {
    let color = null;
    if (real.length) {
      const cs = real.map(colorOf);
      color = cs.every((c) => c === cs[0]) ? cs[0] : null;
    }
    return {
      key, real, color,
      suit: real.length === 1 ? real[0].suit : null,
      rank: real.length === 1 ? real[0].rank : null,
    };
  }
  vName(v) {
    const name = CARD_INFO[v.key].name;
    if (!v.real.length) return `「${name}」`;
    if (v.real.length === 1 && v.real[0].key === v.key) return `「${cardStr(v.real[0])}」`;
    return `「${name}」(จาก ${v.real.map(cardStr).join(', ')})`;
  }

  drawOne() {
    if (!this.deck.length) {
      this.deck = shuffle(this.discard);
      this.discard = [];
      if (this.deck.length) this.log('สับกองทิ้งกลับเป็นกองจั่ว');
    }
    return this.deck.pop() || null;
  }
  draw(p, n) {
    let got = 0;
    for (let i = 0; i < n; i++) {
      const c = this.drawOne();
      if (!c) break;
      p.hand.push(c);
      got++;
    }
    this.update();
    return got;
  }
  toDiscard(cards) {
    for (const c of cards) {
      if (!c) continue;
      delete c.asKey;
      this.discard.push(c);
    }
  }
  /** นำการ์ดออกจากพื้นที่ของเจ้าของ พร้อมทริกเกอร์ ต่อเนื่อง / วีรสตรี */
  removeCard(c) {
    for (const p of this.players) {
      const hi = p.hand.indexOf(c);
      if (hi >= 0) {
        p.hand.splice(hi, 1);
        if (p.hand.length === 0 && this.hasSkill(p, 'lianying')) {
          this.log(`${p.name} ใช้ทักษะ ${SKILLS.lianying.name} จั่ว 1 ใบ`);
          this.draw(p, 1);
        }
        return p;
      }
      for (const slot of Object.keys(p.equip)) {
        if (p.equip[slot] === c) {
          p.equip[slot] = null;
          if (this.hasSkill(p, 'xiaoji')) {
            this.log(`${p.name} ใช้ทักษะ ${SKILLS.xiaoji.name} จั่ว 2 ใบ`);
            this.draw(p, 2);
          }
          return p;
        }
      }
      const ji = p.judgeZone.indexOf(c);
      if (ji >= 0) {
        p.judgeZone.splice(ji, 1);
        return p;
      }
    }
    return null;
  }
  obtain(p, c) {
    this.removeCard(c);
    delete c.asKey;
    p.hand.push(c);
  }
  randomHand(p) { return p.hand.length ? p.hand[Math.floor(Math.random() * p.hand.length)] : null; }

  noteHostile(src, t, amount = 1) {
    if (!src || src === t) return;
    if (t.role === 'lord') src.rebelScore += 2 * amount;
    else if (t.rebelScore > 0) src.rebelScore -= amount;
    else if (t.rebelScore < 0) src.rebelScore += amount;
  }
  noteFriendly(src, t) {
    if (!src || src === t) return;
    if (t.role === 'lord') src.rebelScore -= 2;
    else if (t.rebelScore > 0) src.rebelScore += 1;
    else if (t.rebelScore < 0) src.rebelScore -= 1;
  }

  // ════════════════════════════ prompts ════════════════════════════

  ask(p, req) {
    if (this.aborted) return Promise.reject(new GameAborted());
    const old = this.pending.get(p.pid);
    if (old) old.finish(null);
    return new Promise((resolve, reject) => {
      const id = ++this.promptSeq;
      req.id = id;
      const tmo = req.timeout || (req.type === 'play' ? this.timeouts.play : this.timeouts.respond);
      delete req.timeout;
      req.deadline = Date.now() + tmo;
      const entry = { id, p, req, timers: [], reject };
      entry.finish = (raw) => {
        if (this.pending.get(p.pid) !== entry) return;
        entry.timers.forEach(clearTimeout);
        this.pending.delete(p.pid);
        let ans = raw ? this.normalize(req, raw) : null;
        if (!ans) ans = this.normalize(req, this.fallback(req));
        this.update();
        resolve(ans);
      };
      this.pending.set(p.pid, entry);
      if (p.isBot) {
        this.scheduleBot(entry);
      } else {
        entry.timers.push(setTimeout(() => entry.finish(this.timeoutAnswer(p, req)), tmo));
        if (!p.connected) this.addDisconnectTimer(entry);
      }
      this.update();
    });
  }
  scheduleBot(entry) {
    const run = () => entry.finish(this.botAnswer(entry.p, entry.req));
    if (!this.botDelay) { setImmediate(run); return; }
    entry.timers.push(setTimeout(run, this.botDelay * (0.6 + Math.random() * 0.8)));
  }
  addDisconnectTimer(entry) {
    entry.timers.push(setTimeout(() => entry.finish(this.timeoutAnswer(entry.p, entry.req)), this.timeouts.disconnected));
  }
  botAnswer(p, req) {
    try { return bot.decide(this, p, req); } catch (e) { console.error('bot error', e); return null; }
  }
  timeoutAnswer(p, req) {
    if (req.type === 'play') return { end: true };
    return this.botAnswer(p, req);
  }
  fallback(req) {
    switch (req.type) {
      case 'play': return { end: true };
      case 'respond': return { pass: true };
      case 'select': return { refs: req.items.slice(0, req.min).map((i) => i.ref) };
      case 'players': return { seats: req.candidates.slice(0, req.min) };
      case 'option': return { option: req.defaultOption || req.options[0].id };
      case 'hero': return { hero: req.heroes[0] };
      default: return null;
    }
  }
  normalize(req, a) {
    if (!a || typeof a !== 'object') return null;
    const arr = (x) => (Array.isArray(x) ? x : []);
    const inRange = (n, spec) => n >= spec.min && n <= spec.max;
    switch (req.type) {
      case 'play': {
        if (a.end) return { end: true };
        const u = req.usables.find((x) => x.id === a.usable);
        if (!u) return null;
        let cards = [];
        if (u.cardIds) cards = u.cardIds;
        else if (u.pick) {
          cards = arr(a.cards);
          if (!uniq(cards) || !inRange(cards.length, u.pick) || !cards.every((c) => u.pick.pool.includes(c))) return null;
        }
        let targets = [];
        if (u.targets) {
          targets = arr(a.targets);
          if (!uniq(targets) || !inRange(targets.length, u.targets)) return null;
          if (u.targets.second) {
            if (!u.targets.candidates.includes(targets[0])) return null;
            if (!(u.targets.second[targets[0]] || []).includes(targets[1])) return null;
          } else if (!targets.every((t) => u.targets.candidates.includes(t))) return null;
        }
        return { usable: u, cards, targets };
      }
      case 'respond': {
        if (a.pass) return { pass: true };
        const ch = req.choices.find((x) => x.id === a.choice);
        if (!ch) return null;
        let cards = ch.cardIds || [];
        if (ch.pick) {
          cards = arr(a.cards);
          if (!uniq(cards) || !inRange(cards.length, ch.pick) || !cards.every((c) => ch.pick.pool.includes(c))) return null;
        }
        return { choice: ch, cards };
      }
      case 'select': {
        const refs = arr(a.refs);
        if (!uniq(refs) || !inRange(refs.length, req) || !refs.every((r) => req.items.some((i) => i.ref === r))) return null;
        return { refs };
      }
      case 'players': {
        const seats = arr(a.seats);
        if (!uniq(seats) || !inRange(seats.length, req) || !seats.every((s) => req.candidates.includes(s))) return null;
        return { seats };
      }
      case 'option': {
        const o = req.options.find((x) => x.id === a.option);
        return o ? { option: o.id } : null;
      }
      case 'hero':
        return req.heroes.includes(a.hero) ? { hero: a.hero } : null;
      default:
        return null;
    }
  }

  /** คำตอบจากไคลเอนต์ — คืนข้อความ error ถ้าไม่ถูกต้อง */
  submit(pid, promptId, data) {
    const entry = this.pending.get(pid);
    if (!entry || entry.id !== promptId) return 'คำสั่งนี้หมดอายุแล้ว';
    if (!this.normalize(entry.req, data)) return 'การเลือกไม่ถูกต้อง';
    entry.finish(data);
    return null;
  }

  /** ถามหลายคนพร้อมกัน คนแรกที่ตอบ (ไม่ผ่าน) ชนะ */
  askRace(players, reqFn) {
    return new Promise((resolve) => {
      let remaining = players.length;
      let done = false;
      const ids = new Map();
      players.forEach((q) => {
        const req = reqFn(q);
        const pr = this.ask(q, req);
        ids.set(q, req.id);
        pr.then((ans) => {
          if (done) return;
          if (ans && !ans.pass) {
            done = true;
            for (const o of players) {
              const e = this.pending.get(o.pid);
              if (o !== q && e && e.id === ids.get(o)) e.finish({ pass: true });
            }
            resolve({ player: q, ans });
          } else if (--remaining === 0) {
            done = true;
            resolve(null);
          }
        }, () => { if (!done) { done = true; resolve(null); } });
      });
    });
  }

  confirm(p, kind, title, yes = 'ใช้', no = 'ไม่ใช้') {
    return this.ask(p, { type: 'option', kind, title, options: [{ id: 'yes', label: yes }, { id: 'no', label: no }], defaultOption: 'no' })
      .then((a) => a.option === 'yes');
  }

  async chooseOwn(p, { min, max, zones = ['hand'], exclude = [], title, kind = 'discard' }) {
    const pool = [];
    if (zones.includes('hand')) pool.push(...p.hand);
    if (zones.includes('equip')) pool.push(...this.equipCards(p));
    const list = pool.filter((c) => !exclude.includes(c));
    if (!list.length || max <= 0) return [];
    const items = list.map((c) => ({ ref: 'c' + c.id, card: strip(c), zone: p.hand.includes(c) ? 'hand' : 'equip' }));
    const ans = await this.ask(p, { type: 'select', kind, title, items, min: Math.min(min, list.length), max: Math.min(max, list.length) });
    return ans.refs.map((r) => this.cardById.get(Number(r.slice(1))));
  }

  async chooseCardFrom(chooser, target, { hand = true, equip = true, judge = true, title, kind = 'take', only } = {}) {
    const items = [];
    const map = new Map();
    if (hand) {
      shuffle([...target.hand]).forEach((c, i) => {
        const ref = 'h' + i;
        map.set(ref, c);
        items.push({ ref, card: chooser === target ? strip(c) : null, zone: 'hand' });
      });
    }
    if (equip) {
      for (const c of this.equipCards(target)) {
        if (only && !only.includes(c)) continue;
        map.set('e' + c.id, c);
        items.push({ ref: 'e' + c.id, card: strip(c), zone: 'equip' });
      }
    }
    if (judge) {
      for (const c of target.judgeZone) {
        map.set('j' + c.id, c);
        items.push({ ref: 'j' + c.id, card: strip(c), zone: 'judge' });
      }
    }
    if (!items.length) return null;
    const ans = await this.ask(chooser, { type: 'select', kind, title, items, min: 1, max: 1, targetSeat: target.seat });
    return map.get(ans.refs[0]) || null;
  }

  // ════════════════════════════ main flow ════════════════════════════

  async run() {
    try {
      await this.chooseHeroes();
      for (const p of this.players) this.draw(p, 4);
      this.log('แจกการ์ดคนละ 4 ใบ เริ่มเกม!');
      let cur = this.players.find((p) => p.role === 'lord');
      for (;;) {
        if (cur.role === 'lord') {
          this.round++;
          if (this.maxRounds && this.round > this.maxRounds) {
            throw new GameOver({ winnerRole: null, winners: [], text: 'เสมอ (ครบจำนวนรอบ)' });
          }
        }
        await this.runTurn(cur);
        cur = this.nextAlive(cur);
      }
    } catch (e) {
      if (e instanceof GameOver) this.finish(e.result);
      else if (e instanceof GameAborted) { /* ถูกยกเลิก */ }
      else {
        console.error('game engine error', e);
        this.finish({ winnerRole: null, winners: [], text: 'เกมสิ้นสุดเนื่องจากข้อผิดพลาดของระบบ' });
      }
    }
    return this.result;
  }

  finish(result) {
    this.result = result;
    this.phase = 'over';
    for (const e of [...this.pending.values()]) { e.timers.forEach(clearTimeout); }
    this.pending.clear();
    this.log(`🏁 จบเกม: ${result.text}`);
    this.update();
  }

  abort() {
    this.aborted = true;
    for (const e of [...this.pending.values()]) {
      e.timers.forEach(clearTimeout);
      e.reject(new GameAborted());
    }
    this.pending.clear();
  }

  setConnected(pid, connected) {
    const p = this.player(pid);
    if (!p) return;
    p.connected = connected;
    const e = this.pending.get(pid);
    if (e && !connected && !p.isBot) this.addDisconnectTimer(e);
    this.update();
  }

  setBot(pid) {
    const p = this.player(pid);
    if (!p || p.isBot) return;
    p.isBot = true;
    const e = this.pending.get(pid);
    if (e) this.scheduleBot(e);
    this.update();
  }

  async chooseHeroes() {
    const lord = this.players.find((p) => p.role === 'lord');
    const pool = shuffle(Object.keys(HEROES).filter((h) => !LORD_HEROES.includes(h)));
    const lordChoices = [...LORD_HEROES, pool.pop(), pool.pop()];
    this.log(`${lord.name} เป็นจักรพรรดิ กำลังเลือกตัวละคร...`);
    const a = await this.ask(lord, { type: 'hero', title: 'คุณคือจักรพรรดิ! เลือกตัวละคร', heroes: lordChoices, timeout: 45000 });
    this.setHero(lord, a.hero);
    const rest = [...pool, ...lordChoices.filter((h) => h !== a.hero)];
    shuffle(rest);
    const others = this.players.filter((p) => p !== lord);
    const k = Math.max(1, Math.min(3, Math.floor(rest.length / others.length)));
    const lordHero = HEROES[lord.hero];
    await Promise.all(others.map((p) => {
      const opts = rest.splice(0, k);
      return this.ask(p, {
        type: 'hero', title: `เลือกตัวละคร (จักรพรรดิเลือก ${lordHero.name})`, heroes: opts, timeout: 45000,
      }).then((ans) => this.setHero(p, ans.hero, true));
    }));
    for (const p of others) this.log(`${p.name} เลือก ${HEROES[p.hero].name}`);
  }

  setHero(p, id, quiet) {
    const h = HEROES[id];
    p.hero = id;
    p.maxHp = h.hp + (p.role === 'lord' && this.players.length >= 5 ? 1 : 0);
    p.hp = p.maxHp;
    p.gender = h.gender;
    p.kingdom = h.kingdom;
    if (!quiet) this.log(`${p.name} เลือก ${h.name}`);
  }

  async runTurn(p) {
    this.ts = {
      player: p, attacksUsed: 0, usedAttack: false, used: new Set(),
      luoyi: false, rendeGiven: 0, rendeHealed: false, jijiangFailed: false,
    };
    this.table = [];
    this.log(`── เทิร์นของ ${p.name} (${HEROES[p.hero].name}) ──`);

    // เริ่มเทิร์น
    this.phase = 'start';
    if (this.hasSkill(p, 'guanxing')) await this.doGuanxing(p);
    if (this.hasSkill(p, 'luoshen')) await this.doLuoshen(p);
    if (!p.alive) return;

    // ตัดสิน
    this.phase = 'judge';
    let skipPlay = false;
    for (const c of [...p.judgeZone].reverse()) {
      if (!p.alive) return;
      if (!p.judgeZone.includes(c)) continue;
      const key = c.asKey;
      this.removeCard(c);
      this.log(`${p.name} ตัดสิน「${CARD_INFO[key].name}」`);
      const negated = await this.askNegate(key, p, null);
      if (key === 'indulgence') {
        if (!negated) {
          const j = await this.judge(p, CARD_INFO.indulgence.name);
          if (!j || j.suit !== 'heart') { skipPlay = true; this.log(`${p.name} ต้องข้ามช่วงเล่นการ์ด`); }
          else this.log('ผลเป็นโพแดง ไม่มีผล');
          this.judgeDone(p, j);
        }
        this.toDiscard([c]);
      } else if (key === 'lightning') {
        let hit = false;
        if (!negated) {
          const j = await this.judge(p, CARD_INFO.lightning.name);
          hit = !!j && j.suit === 'spade' && j.rank >= 2 && j.rank <= 9;
          this.judgeDone(p, j);
        }
        if (hit) {
          this.toDiscard([c]);
          this.log(`⚡ สายฟ้าฟาด ${p.name}!`);
          await this.damage(null, p, 3, null, 'thunder');
        } else {
          this.passLightning(p, c);
        }
      }
    }
    if (!p.alive) return;

    // จั่ว
    this.phase = 'draw';
    await this.drawPhase(p);
    if (!p.alive) return;

    // เล่นการ์ด
    if (!skipPlay) {
      this.phase = 'play';
      await this.playPhase(p);
      if (!p.alive) return;
    }

    // ทิ้งการ์ด
    this.phase = 'discard';
    if (this.hasSkill(p, 'keji') && !this.ts.usedAttack) {
      if (p.hand.length > p.hp) this.log(`${p.name} ใช้ทักษะ ${SKILLS.keji.name} ข้ามช่วงทิ้งการ์ด`);
    } else {
      const excess = p.hand.length - Math.max(0, p.hp);
      if (excess > 0) {
        const cards = await this.chooseOwn(p, { min: excess, max: excess, title: `ช่วงทิ้งการ์ด: ทิ้งการ์ด ${excess} ใบ (เก็บได้เท่าเลือด)` });
        cards.forEach((c) => this.removeCard(c));
        this.toDiscard(cards);
        this.log(`${p.name} ทิ้ง ${cards.map(cardStr).join(', ')}`);
      }
    }

    // จบเทิร์น
    this.phase = 'finish';
    if (this.hasSkill(p, 'biyue')) {
      this.log(`${p.name} ใช้ทักษะ ${SKILLS.biyue.name} จั่ว 1 ใบ`);
      this.draw(p, 1);
    }
  }

  passLightning(from, c) {
    let q = this.nextAlive(from);
    while (q && q !== from) {
      if (!q.judgeZone.some((x) => x.asKey === 'lightning')) {
        c.asKey = 'lightning';
        q.judgeZone.push(c);
        this.log(`สายฟ้าเคลื่อนไปยัง ${q.name}`);
        return;
      }
      q = this.nextAlive(q);
    }
    if (from.alive && !from.judgeZone.some((x) => x.asKey === 'lightning')) {
      c.asKey = 'lightning';
      from.judgeZone.push(c);
    } else this.toDiscard([c]);
  }

  async doGuanxing(p) {
    const n = Math.min(5, this.alive().length);
    const top = [];
    for (let i = 0; i < n; i++) { const c = this.drawOne(); if (c) top.push(c); }
    if (!top.length) return;
    this.log(`${p.name} ใช้ทักษะ ${SKILLS.guanxing.name} ดูการ์ด ${top.length} ใบบนกอง`);
    const ans = await this.ask(p, {
      type: 'select', kind: 'guanxing', title: `${SKILLS.guanxing.name}: เลือกการ์ดที่จะวาง "ใต้กอง" (ที่เหลือวางบนกอง ใบซ้ายสุดอยู่บนสุด)`,
      items: top.map((c) => ({ ref: 'c' + c.id, card: strip(c) })), min: 0, max: top.length,
    });
    const bottom = new Set(ans.refs);
    const rest = top.filter((c) => !bottom.has('c' + c.id));
    const low = top.filter((c) => bottom.has('c' + c.id));
    for (let i = rest.length - 1; i >= 0; i--) this.deck.push(rest[i]);
    this.deck.unshift(...low);
    this.log(`${p.name} วาง ${rest.length} ใบบนกอง และ ${low.length} ใบใต้กอง`);
  }

  async doLuoshen(p) {
    for (let guard = 0; guard < 30 && p.alive; guard++) {
      if (!(await this.confirm(p, 'luoshen', `ใช้ทักษะ ${SKILLS.luoshen.name} ตัดสินหรือไม่? (สีดำ = เก็บขึ้นมือ)`))) return;
      const j = await this.judge(p, SKILLS.luoshen.name);
      if (!j) return;
      if (isBlack(j)) {
        p.hand.push(j);
        this.log(`${p.name} เก็บ ${cardStr(j)} ขึ้นมือ`);
      } else {
        this.judgeDone(p, j);
        return;
      }
    }
  }

  async drawPhase(p) {
    if (this.hasSkill(p, 'tuxi')) {
      const cands = this.others(p).filter((q) => q.hand.length > 0).map((q) => q.seat);
      if (cands.length) {
        const ans = await this.ask(p, {
          type: 'players', kind: 'tuxi', title: `${SKILLS.tuxi.name}: เลือกผู้เล่นสูงสุด 2 คนเพื่อหยิบการ์ดในมือคนละ 1 ใบ (แทนการจั่ว) หรือกดข้ามเพื่อจั่วปกติ`,
          candidates: cands, min: 0, max: 2,
        });
        if (ans.seats.length) {
          for (const s of ans.seats) {
            const q = this.players[s];
            const c = this.randomHand(q);
            if (c) { this.obtain(p, c); this.noteHostile(p, q); }
          }
          this.log(`${p.name} ใช้ทักษะ ${SKILLS.tuxi.name} หยิบการ์ดจาก ${ans.seats.map((s) => this.players[s].name).join(', ')}`);
          return;
        }
      }
    }
    let n = 2;
    if (this.hasSkill(p, 'yingzi')) n++;
    if (this.hasSkill(p, 'luoyi') && (await this.confirm(p, 'luoyi', `ใช้ทักษะ ${SKILLS.luoyi.name}? (จั่วน้อยลง 1 ใบ แต่สังหาร/ดวล แรงขึ้น +1)`))) {
      n--;
      this.ts.luoyi = true;
      this.log(`${p.name} ใช้ทักษะ ${SKILLS.luoyi.name}!`);
    }
    this.draw(p, n);
    this.log(`${p.name} จั่ว ${n} ใบ`);
  }

  async playPhase(p) {
    for (let guard = 0; guard < 150 && p.alive; guard++) {
      const usables = this.playUsables(p);
      const ans = await this.ask(p, { type: 'play', title: 'ช่วงเล่นการ์ดของคุณ', usables });
      if (ans.end) break;
      await this.performUsable(p, ans.usable, ans.cards, ans.targets);
      this.update();
    }
  }

  // ════════════════════════════ play-phase options ════════════════════════════

  cardTargets(p, key, cards) {
    const others = this.others(p);
    const seats = (list) => list.map((q) => q.seat);
    const spec = (list, max = 1) => (list.length ? { min: 1, max, candidates: seats(list) } : false);
    const trickRangeOk = (q) => this.hasSkill(p, 'qicai') || this.distance(p, q) <= 1;
    switch (key) {
      case 'attack': {
        if (!this.canUseAttack(p)) return false;
        const list = others.filter((q) => this.inAttackRange(p, q) && this.canBeAttacked(q));
        let max = 1;
        if (this.weaponKey(p) === 'halberd' && cards && cards.length === 1 && p.hand.length === 1 && p.hand[0] === cards[0]) max = 3;
        return spec(list, max);
      }
      case 'peach': return p.hp < p.maxHp ? null : false;
      case 'dodge': case 'negate': return false;
      case 'dismantle': return spec(others.filter((q) => this.hasAnyCard(q)));
      case 'steal': return spec(others.filter((q) => this.hasAnyCard(q) && trickRangeOk(q) && !this.hasSkill(q, 'qianxun')));
      case 'duel': return spec(others.filter((q) => this.canBeAttacked(q)));
      case 'barbarian': case 'arrows': case 'harvest': case 'exnihilo': case 'peachgarden': return null;
      case 'borrowsword': {
        const second = {};
        const firsts = [];
        for (const a of others) {
          if (!a.equip.weapon) continue;
          const bs = this.alive().filter((b) => b !== a && this.inAttackRange(a, b) && this.canBeAttacked(b)).map((b) => b.seat);
          if (bs.length) { second[a.seat] = bs; firsts.push(a.seat); }
        }
        return firsts.length ? { min: 2, max: 2, candidates: firsts, second } : false;
      }
      case 'indulgence':
        return spec(others.filter((q) => !q.judgeZone.some((c) => c.asKey === 'indulgence') && !this.hasSkill(q, 'qianxun')));
      case 'lightning': return p.judgeZone.some((c) => c.asKey === 'lightning') ? false : null;
      default: return CARD_INFO[key].type === 'equip' ? null : false;
    }
  }

  playUsables(p) {
    const out = [];
    const ts = this.ts;
    const hand = p.hand;
    const he = [...hand, ...this.equipCards(p)];
    const addCard = (c, as, via) => {
      const t = this.cardTargets(p, as, [c]);
      if (t === false) return;
      const nm = CARD_INFO[as].name;
      out.push({
        id: `${via || 'c'}:${c.id}:${as}`, cardIds: [c.id], as, skill: via || null, targets: t,
        label: via ? `${SKILLS[via].name}: ใช้เป็น ${nm}` : `ใช้ ${nm}`,
      });
    };
    for (const c of hand) addCard(c, c.key);
    if (this.hasSkill(p, 'wusheng')) he.filter((c) => isRed(c) && c.key !== 'attack').forEach((c) => addCard(c, 'attack', 'wusheng'));
    if (this.hasSkill(p, 'longdan')) hand.filter((c) => c.key === 'dodge').forEach((c) => addCard(c, 'attack', 'longdan'));
    if (this.hasSkill(p, 'qixi')) he.filter((c) => isBlack(c) && c.key !== 'dismantle').forEach((c) => addCard(c, 'dismantle', 'qixi'));
    if (this.hasSkill(p, 'guose')) he.filter((c) => c.suit === 'diamond' && c.key !== 'indulgence').forEach((c) => addCard(c, 'indulgence', 'guose'));
    if (this.weaponKey(p) === 'serpent_spear' && hand.length >= 2) {
      const t = this.cardTargets(p, 'attack', null);
      if (t) out.push({ id: 'spear', as: 'attack', label: `${CARD_INFO.serpent_spear.name}: ใช้การ์ดในมือ 2 ใบเป็น สังหาร`, pick: { min: 2, max: 2, pool: hand.map((c) => c.id) }, targets: t, button: true });
    }
    const others = this.others(p);
    const sk = (id, extra) => out.push({ id: 'skill:' + id, skill: id, label: SKILLS[id].name, button: true, ...extra });
    if (this.hasSkill(p, 'rende') && hand.length) {
      sk('rende', { pick: { min: 1, max: hand.length, pool: hand.map((c) => c.id) }, targets: { min: 1, max: 1, candidates: others.map((q) => q.seat) } });
    }
    if (this.hasSkill(p, 'zhiheng') && !ts.used.has('zhiheng') && he.length) {
      sk('zhiheng', { pick: { min: 1, max: he.length, pool: he.map((c) => c.id) } });
    }
    if (this.hasSkill(p, 'kurou') && p.hp > 0) sk('kurou', {});
    if (this.hasSkill(p, 'fanjian') && !ts.used.has('fanjian') && hand.length) {
      sk('fanjian', { targets: { min: 1, max: 1, candidates: others.map((q) => q.seat) } });
    }
    if (this.hasSkill(p, 'jieyin') && !ts.used.has('jieyin') && hand.length >= 2) {
      const c = others.filter((q) => q.gender === 'm' && q.hp < q.maxHp);
      if (c.length) sk('jieyin', { pick: { min: 2, max: 2, pool: hand.map((x) => x.id) }, targets: { min: 1, max: 1, candidates: c.map((q) => q.seat) } });
    }
    if (this.hasSkill(p, 'qingnang') && !ts.used.has('qingnang') && hand.length) {
      const c = this.alive().filter((q) => q.hp < q.maxHp);
      if (c.length) sk('qingnang', { pick: { min: 1, max: 1, pool: hand.map((x) => x.id) }, targets: { min: 1, max: 1, candidates: c.map((q) => q.seat) } });
    }
    if (this.hasSkill(p, 'lijian') && !ts.used.has('lijian') && he.length) {
      const males = others.filter((q) => q.gender === 'm');
      if (males.length >= 2) sk('lijian', { pick: { min: 1, max: 1, pool: he.map((x) => x.id) }, targets: { min: 2, max: 2, candidates: males.map((q) => q.seat), ordered: true } });
    }
    if (this.hasSkill(p, 'jijiang') && !ts.jijiangFailed && others.some((q) => q.kingdom === 'shu')) {
      const t = this.cardTargets(p, 'attack', null);
      if (t) sk('jijiang', { targets: t });
    }
    return out;
  }

  async performUsable(p, u, cardIds, seats) {
    const targets = seats.map((s) => this.players[s]);
    const real = cardIds.map((id) => this.cardById.get(id));
    if (u.as) {
      if (u.skill) this.log(`${p.name} ใช้ทักษะ ${SKILLS[u.skill].name}`);
      await this.useCard(p, this.makeV(u.as, real), targets);
    } else {
      await this.useSkill(p, u.skill, real, targets);
    }
  }

  // ════════════════════════════ card effects ════════════════════════════

  async useCard(user, v, targets) {
    for (const c of v.real) this.removeCard(c);
    const info = CARD_INFO[v.key];
    this.pushTable(user, v, targets.map((t) => t.seat));
    const tnames = targets.length ? ` → ${targets.map((t) => t.name).join(', ')}` : '';
    this.log(`${user.name} ใช้ ${this.vName(v)}${tnames}`);

    if (info.type === 'equip') { this.equipCard(user, v.real[0]); return; }
    if (info.type === 'delayed') {
      const t = v.key === 'lightning' ? user : targets[0];
      const c = v.real[0];
      if (t.judgeZone.some((x) => x.asKey === v.key)) { this.toDiscard([c]); return; }
      c.asKey = v.key;
      t.judgeZone.push(c);
      if (v.key === 'indulgence') this.noteHostile(user, t);
      return;
    }
    this.toDiscard(v.real);
    if (info.type === 'trick' && this.hasSkill(user, 'jizhi')) {
      this.log(`${user.name} ใช้ทักษะ ${SKILLS.jizhi.name} จั่ว 1 ใบ`);
      this.draw(user, 1);
    }
    for (const t of targets) if (HARMFUL.has(v.key)) this.noteHostile(user, t);

    switch (v.key) {
      case 'attack':
        this.ts.attacksUsed++;
        if (user === this.ts.player) this.ts.usedAttack = true;
        await this.resolveAttack(user, v, targets);
        break;
      case 'peach':
        this.heal(user, 1, user);
        break;
      case 'dismantle': case 'steal': {
        const t = targets[0];
        if (await this.askNegate(v.key, t, user)) break;
        if (!t.alive || !this.hasAnyCard(t)) break;
        const verb = v.key === 'steal' ? 'หยิบ' : 'ทิ้ง';
        const c = await this.chooseCardFrom(user, t, { title: `${CARD_INFO[v.key].name}: เลือกการ์ดของ ${t.name} ที่จะ${verb}` });
        if (!c) break;
        const zone = t.hand.includes(c) ? 'hand' : 'other';
        if (v.key === 'steal') {
          this.obtain(user, c);
          this.log(`${user.name} หยิบ${zone === 'hand' ? 'การ์ดในมือ 1 ใบ' : cardStr(c)}จาก ${t.name}`);
        } else {
          this.removeCard(c);
          this.toDiscard([c]);
          this.log(`${user.name} ทิ้ง ${cardStr(c)} ของ ${t.name}`);
        }
        break;
      }
      case 'duel': {
        const t = targets[0];
        if (await this.askNegate('duel', t, user)) break;
        await this.resolveDuel(user, t, v);
        break;
      }
      case 'barbarian': case 'arrows': {
        const need = v.key === 'barbarian' ? 'attack' : 'dodge';
        for (const q of this.others(user)) {
          if (!q.alive || !user.alive) continue;
          if (await this.askNegate(v.key, q, user)) continue;
          const title = `${user.name} ใช้「${CARD_INFO[v.key].name}」 ใช้「${CARD_INFO[need].name}」หรือรับความเสียหาย 1`;
          const ok = need === 'attack'
            ? await this.requestCard(q, 'attack', { title, sourceSeat: user.seat, reason: v.key })
            : await this.requestDodges(q, 1, { title, source: user, reason: v.key });
          if (!ok) await this.damage(user, q, 1, v);
        }
        break;
      }
      case 'peachgarden':
        for (const q of this.orderFrom(user)) {
          if (!q.alive || q.hp >= q.maxHp) continue;
          if (await this.askNegate('peachgarden', q, user)) continue;
          this.heal(q, 1, user);
        }
        break;
      case 'exnihilo':
        if (await this.askNegate('exnihilo', user, user)) break;
        this.draw(user, 2);
        this.log(`${user.name} จั่ว 2 ใบ`);
        break;
      case 'harvest': {
        const shown = [];
        for (let i = 0; i < this.alive().length; i++) { const c = this.drawOne(); if (c) shown.push(c); }
        this.harvestCards = shown;
        this.log(`เปิดการ์ด: ${shown.map(cardStr).join(', ')}`);
        for (const q of this.orderFrom(user)) {
          if (!shown.length) break;
          if (!q.alive) continue;
          if (await this.askNegate('harvest', q, user)) continue;
          const ans = await this.ask(q, {
            type: 'select', kind: 'harvest', title: `${CARD_INFO.harvest.name}: เลือกเก็บการ์ด 1 ใบ`,
            items: shown.map((c) => ({ ref: 'c' + c.id, card: strip(c) })), min: 1, max: 1,
          });
          const c = shown.find((x) => 'c' + x.id === ans.refs[0]);
          shown.splice(shown.indexOf(c), 1);
          q.hand.push(c);
          this.log(`${q.name} เก็บ ${cardStr(c)}`);
        }
        this.toDiscard(shown);
        this.harvestCards = null;
        break;
      }
      case 'borrowsword': {
        const [a, b] = targets;
        if (await this.askNegate('borrowsword', a, user)) break;
        if (!a.alive || !a.equip.weapon) break;
        let used = null;
        if (b.alive && this.inAttackRange(a, b) && this.canBeAttacked(b)) {
          used = await this.requestCard(a, 'attack', {
            title: `${user.name} ใช้「ยืมดาบฆ่าคน」: ใช้ สังหาร ใส่ ${b.name} มิฉะนั้นเสียอาวุธให้ ${user.name}`,
            sourceSeat: user.seat, targetSeat: b.seat, reason: 'borrowsword', use: true,
          });
        }
        if (used) {
          this.noteHostile(a, b);
          await this.resolveAttack(a, used, [b]);
        } else if (a.equip.weapon && user.alive) {
          const w = a.equip.weapon;
          this.obtain(user, w);
          this.log(`${user.name} ได้ ${cardStr(w)} ของ ${a.name}`);
        }
        break;
      }
      default:
        break;
    }
  }

  equipCard(p, c) {
    const slot = CARD_INFO[c.key].slot;
    const old = p.equip[slot];
    if (old) {
      this.removeCard(old);
      this.toDiscard([old]);
    }
    p.equip[slot] = c;
  }

  async resolveAttack(user, v, targets) {
    for (const t0 of targets) {
      if (!t0.alive || !user.alive) continue;
      let t = t0;
      if (this.hasSkill(t, 'liuli') && this.hasAnyCard(t, false)) {
        const cands = this.alive().filter((q) => q !== t && q !== user && this.inAttackRange(t, q) && this.canBeAttacked(q));
        if (cands.length) {
          const a = await this.ask(t, {
            type: 'players', kind: 'liuli', title: `${SKILLS.liuli.name}: ทิ้งการ์ด 1 ใบเพื่อโอน「สังหาร」ของ ${user.name} ไปยังผู้เล่นอื่น? (กดข้ามถ้าไม่ใช้)`,
            candidates: cands.map((q) => q.seat), min: 0, max: 1, sourceSeat: user.seat,
          });
          if (a.seats.length) {
            const [c] = await this.chooseOwn(t, { min: 1, max: 1, zones: ['hand', 'equip'], title: `${SKILLS.liuli.name}: เลือกการ์ดที่จะทิ้ง` });
            if (c) {
              this.removeCard(c);
              this.toDiscard([c]);
              const nt = this.players[a.seats[0]];
              this.log(`${t.name} ใช้ทักษะ ${SKILLS.liuli.name} ทิ้ง ${cardStr(c)} โอนสังหารไปยัง ${nt.name}`);
              t = nt;
            }
          }
        }
      }
      await this.attackHit(user, v, t);
    }
  }

  async attackHit(user, v, t) {
    if (!t.alive || !user.alive) return;
    const wk = this.weaponKey(user);
    const ignoreArmor = wk === 'blue_steel';
    if (!ignoreArmor && t.equip.armor && t.equip.armor.key === 'renwang' && v.color === 'black') {
      this.log(`${CARD_INFO.renwang.name} ของ ${t.name} ป้องกันสังหารสีดำ`);
      return;
    }
    if (wk === 'double_swords' && user.gender !== t.gender) {
      if (await this.confirm(user, 'double_swords', `ใช้ความสามารถ ${CARD_INFO.double_swords.name} กับ ${t.name}?`)) {
        let choice = 'letdraw';
        if (t.hand.length) {
          const a = await this.ask(t, {
            type: 'option', kind: 'double_swords_target', title: `${user.name} ใช้ ${CARD_INFO.double_swords.name}: เลือก`,
            options: [{ id: 'discard', label: 'ทิ้งการ์ดในมือ 1 ใบ' }, { id: 'letdraw', label: `ให้ ${user.name} จั่ว 1 ใบ` }], defaultOption: 'letdraw',
          });
          choice = a.option;
        }
        if (choice === 'discard') {
          const cs = await this.chooseOwn(t, { min: 1, max: 1, title: 'ทิ้งการ์ดในมือ 1 ใบ' });
          cs.forEach((c) => this.removeCard(c));
          this.toDiscard(cs);
          this.log(`${t.name} ทิ้ง ${cs.map(cardStr).join(', ')}`);
        } else {
          this.draw(user, 1);
          this.log(`${user.name} จั่ว 1 ใบ (${CARD_INFO.double_swords.name})`);
        }
      }
    }
    let noDodge = false;
    if (this.hasSkill(user, 'tieji') && (await this.confirm(user, 'tieji', `ใช้ทักษะ ${SKILLS.tieji.name} กับ ${t.name}?`))) {
      const j = await this.judge(user, SKILLS.tieji.name);
      noDodge = isRed(j);
      this.judgeDone(user, j);
      if (noDodge) this.log(`${t.name} ไม่สามารถใช้ หลบ ได้!`);
    }
    let hit = noDodge;
    if (!noDodge && t.alive) {
      const need = this.hasSkill(user, 'wushuang') ? 2 : 1;
      const dodged = await this.requestDodges(t, need, {
        title: `${user.name} ใช้「สังหาร」ใส่คุณ${need > 1 ? ' (ต้องใช้ หลบ 2 ใบ)' : ''}`,
        source: user, ignoreArmor, reason: 'attack',
      });
      hit = !dodged;
    }
    if (!hit) {
      if (wk === 'green_dragon' && user.alive && t.alive && this.canBeAttacked(t)) {
        const c = await this.requestCard(user, 'attack', {
          title: `${CARD_INFO.green_dragon.name}: ใช้ สังหาร ใส่ ${t.name} ต่อหรือไม่?`, targetSeat: t.seat, reason: 'green_dragon', use: true,
        });
        if (c) { await this.attackHit(user, c, t); return; }
      }
      if (wk === 'axe' && user.alive && t.alive) {
        const pool = [...user.hand, ...this.equipCards(user)].filter((c) => c !== user.equip.weapon);
        if (pool.length >= 2) {
          const cs = await this.chooseOwn(user, { min: 0, max: 2, zones: ['hand', 'equip'], exclude: [user.equip.weapon], kind: 'axe', title: `${CARD_INFO.axe.name}: ทิ้งการ์ด 2 ใบเพื่อให้สังหารโดน? (ไม่เลือก = ไม่ใช้)` });
          if (cs.length === 2) {
            cs.forEach((c) => this.removeCard(c));
            this.toDiscard(cs);
            this.log(`${user.name} ใช้ ${CARD_INFO.axe.name} ทิ้ง 2 ใบ สังหารโดน!`);
            hit = true;
          }
        }
      }
    }
    if (!hit || !t.alive) return;
    if (this.weaponKey(user) === 'frost_blade' && this.hasAnyCard(t, false) &&
      (await this.confirm(user, 'frost_blade', `${CARD_INFO.frost_blade.name}: ทิ้งการ์ด 2 ใบของ ${t.name} แทนการทำความเสียหาย?`))) {
      for (let i = 0; i < 2 && this.hasAnyCard(t, false); i++) {
        const c = await this.chooseCardFrom(user, t, { judge: false, title: `${CARD_INFO.frost_blade.name}: เลือกการ์ดของ ${t.name} ที่จะทิ้ง` });
        if (!c) break;
        this.removeCard(c);
        this.toDiscard([c]);
        this.log(`${user.name} ทิ้ง ${cardStr(c)} ของ ${t.name}`);
      }
      return;
    }
    if (this.weaponKey(user) === 'kylin_bow' && (t.equip.defHorse || t.equip.offHorse) &&
      (await this.confirm(user, 'kylin_bow', `${CARD_INFO.kylin_bow.name}: ทิ้งม้าของ ${t.name}?`))) {
      const horses = [t.equip.defHorse, t.equip.offHorse].filter(Boolean);
      const c = horses.length === 1 ? horses[0]
        : await this.chooseCardFrom(user, t, { hand: false, judge: false, only: horses, title: 'เลือกม้าที่จะทิ้ง' });
      if (c) { this.removeCard(c); this.toDiscard([c]); this.log(`${user.name} ทิ้ง ${cardStr(c)} ของ ${t.name}`); }
    }
    const amount = 1 + (this.ts.luoyi && user === this.ts.player ? 1 : 0);
    await this.damage(user, t, amount, v);
  }

  async resolveDuel(source, target, v) {
    if (!target.alive || !source.alive) return;
    let cur = target;
    let other = source;
    for (let guard = 0; guard < 200; guard++) {
      const need = this.hasSkill(other, 'wushuang') ? 2 : 1;
      let ok = true;
      for (let i = 0; i < need; i++) {
        const c = await this.requestCard(cur, 'attack', {
          title: `ดวลกับ ${other.name}: ใช้「สังหาร」${need > 1 ? ` (ใบที่ ${i + 1}/${need})` : ''} มิฉะนั้นได้รับความเสียหาย 1`,
          sourceSeat: other.seat, reason: 'duel',
        });
        if (!c) { ok = false; break; }
      }
      if (!ok) {
        const amount = 1 + (this.ts.luoyi && other === this.ts.player ? 1 : 0);
        await this.damage(other, cur, amount, v);
        return;
      }
      [cur, other] = [other, cur];
    }
  }

  // ════════════════════════════ responses ════════════════════════════

  responseChoices(p, key, ctx = {}) {
    const out = [];
    const hand = p.hand;
    const he = [...hand, ...this.equipCards(p)];
    const add = (c, as, via) => out.push({
      id: `${via || 'c'}:${c.id}`, cardIds: [c.id], as, skill: via || null,
      label: via ? `${SKILLS[via].name} (เป็น ${CARD_INFO[as].name})` : CARD_INFO[as].name,
    });
    for (const c of hand) if (c.key === key) add(c, key);
    const lordHelpers = (kingdom) => this.others(p).some((q) => q.kingdom === kingdom);
    if (key === 'dodge') {
      if (this.hasSkill(p, 'longdan')) hand.filter((c) => c.key === 'attack').forEach((c) => add(c, 'dodge', 'longdan'));
      if (this.hasSkill(p, 'qingguo')) hand.filter((c) => isBlack(c) && c.key !== 'dodge').forEach((c) => add(c, 'dodge', 'qingguo'));
      if (!ctx.ignoreArmor && !ctx.armorTried && p.equip.armor && p.equip.armor.key === 'eight_trigrams') {
        out.push({ id: 'armor', special: 'armor', label: `${CARD_INFO.eight_trigrams.name} (ตัดสิน)`, button: true });
      }
      if (!ctx.noLord && !ctx.lordTried && this.hasSkill(p, 'hujia') && lordHelpers('wei')) {
        out.push({ id: 'hujia', special: 'hujia', label: `${SKILLS.hujia.name} (ขอหลบจากฝ่ายวุย)`, button: true });
      }
    } else if (key === 'attack') {
      if (this.hasSkill(p, 'longdan')) hand.filter((c) => c.key === 'dodge').forEach((c) => add(c, 'attack', 'longdan'));
      if (this.hasSkill(p, 'wusheng')) he.filter((c) => isRed(c) && c.key !== 'attack').forEach((c) => add(c, 'attack', 'wusheng'));
      if (this.weaponKey(p) === 'serpent_spear' && hand.length >= 2) {
        out.push({ id: 'spear', as: 'attack', label: `${CARD_INFO.serpent_spear.name} (2 ใบเป็น สังหาร)`, pick: { min: 2, max: 2, pool: hand.map((c) => c.id) }, button: true });
      }
      if (!ctx.noLord && !ctx.lordTried && this.hasSkill(p, 'jijiang') && lordHelpers('shu')) {
        out.push({ id: 'jijiang', special: 'jijiang', label: `${SKILLS.jijiang.name} (ขอสังหารจากฝ่ายจ๊ก)`, button: true });
      }
    } else if (key === 'peach') {
      if (this.hasSkill(p, 'jijiu') && (!this.ts || this.ts.player !== p)) {
        he.filter((c) => isRed(c) && c.key !== 'peach').forEach((c) => add(c, 'peach', 'jijiu'));
      }
    }
    return out;
  }

  /** ขอให้ผู้เล่นใช้/ตอบสนองด้วยการ์ดชนิด key คืนค่า virtual card หรือ null */
  async requestCard(p, key, ctx = {}) {
    let armorTried = false;
    let lordTried = false;
    for (let guard = 0; guard < 10 && p.alive; guard++) {
      const choices = this.responseChoices(p, key, { ...ctx, armorTried, lordTried });
      if (!choices.length) return null;
      const pub = {
        sourceSeat: ctx.source ? ctx.source.seat : ctx.sourceSeat, targetSeat: ctx.targetSeat, dyingSeat: ctx.dyingSeat,
        forSeat: ctx.forSeat, reason: ctx.reason, use: !!ctx.use,
      };
      const ans = await this.ask(p, {
        type: 'respond', kind: key, title: ctx.title || `ใช้「${CARD_INFO[key].name}」หรือไม่?`, choices, ctx: pub,
        passLabel: ctx.passLabel || 'ไม่ใช้',
      });
      if (ans.pass) return null;
      const ch = ans.choice;
      if (ch.special === 'armor') {
        armorTried = true;
        this.log(`${p.name} ใช้ ${CARD_INFO.eight_trigrams.name}`);
        const j = await this.judge(p, CARD_INFO.eight_trigrams.name);
        const red = isRed(j);
        this.judgeDone(p, j);
        if (red) { this.log('ผลเป็นสีแดง นับเป็น หลบ'); return this.makeV('dodge', []); }
        this.log('ผลเป็นสีดำ ไม่มีผล');
        continue;
      }
      if (ch.special === 'hujia' || ch.special === 'jijiang') {
        lordTried = true;
        const kingdom = ch.special === 'hujia' ? 'wei' : 'shu';
        this.log(`${p.name} ใช้ทักษะ ${SKILLS[ch.special].name}`);
        for (const q of this.others(p)) {
          if (q.kingdom !== kingdom) continue;
          const c = await this.requestCard(q, key, {
            title: `${p.name} (${SKILLS[ch.special].name}) ขอให้คุณใช้「${CARD_INFO[key].name}」แทน`,
            forSeat: p.seat, noLord: true, sourceSeat: pub.sourceSeat, reason: 'lordhelp',
          });
          if (c) { this.noteFriendly(q, p); return c; }
        }
        this.log('ไม่มีใครช่วย');
        continue;
      }
      const real = ans.cards.map((id) => this.cardById.get(id));
      const v = this.makeV(ch.as, real);
      for (const c of real) this.removeCard(c);
      this.toDiscard(real);
      this.pushTable(p, v, []);
      this.log(`${p.name} ${ctx.use ? 'ใช้' : 'ตอบสนองด้วย'} ${this.vName(v)}${ch.skill ? ` (${SKILLS[ch.skill].name})` : ''}`);
      if (key === 'attack' && this.ts && p === this.ts.player) this.ts.usedAttack = true;
      return v;
    }
    return null;
  }

  async requestDodges(t, need, ctx) {
    for (let i = 0; i < need; i++) {
      const title = need > 1 ? `${ctx.title} [${i + 1}/${need}]` : ctx.title;
      const c = await this.requestCard(t, 'dodge', { ...ctx, title });
      if (!c) return false;
    }
    return true;
  }

  async askNegate(trickKey, target, source) {
    let negated = false;
    const tname = CARD_INFO[trickKey].name;
    for (let guard = 0; guard < 30; guard++) {
      const holders = this.alive().filter((q) => q.hand.some((c) => c.key === 'negate'));
      if (!holders.length) break;
      const title = negated
        ? `「${tname}」ต่อ ${target.name} ถูกยกเลิกอยู่ ใช้「ไร้ช่องโหว่」ยกเลิกการยกเลิกหรือไม่?`
        : `ใช้「ไร้ช่องโหว่」ยกเลิก「${tname}」ที่มีผลต่อ ${target.name} หรือไม่?`;
      const r = await this.askRace(holders, (q) => ({
        type: 'respond', kind: 'negate', title, choices: this.responseChoices(q, 'negate'),
        ctx: { trickKey, targetSeat: target.seat, sourceSeat: source ? source.seat : null, negated },
        hideWaiting: true, timeout: this.timeouts.negate,
      }));
      if (!r) break;
      const { player: q, ans } = r;
      const real = ans.cards.map((id) => this.cardById.get(id));
      real.forEach((c) => this.removeCard(c));
      this.toDiscard(real);
      this.pushTable(q, this.makeV('negate', real), [target.seat]);
      this.log(`${q.name} ใช้「ไร้ช่องโหว่」${negated ? 'ยกเลิกไร้ช่องโหว่' : `ยกเลิก「${tname}」ต่อ ${target.name}`}`);
      if (this.hasSkill(q, 'jizhi')) { this.log(`${q.name} ใช้ทักษะ ${SKILLS.jizhi.name} จั่ว 1 ใบ`); this.draw(q, 1); }
      negated = !negated;
    }
    return negated;
  }

  async judge(p, reason) {
    let c = this.drawOne();
    if (!c) return null;
    this.log(`${p.name} ตัดสิน [${reason}]: ${cardStr(c)}`);
    this.pushTable(p, this.makeV(c.key, [c]), [], `ตัดสิน: ${reason}`);
    const start = this.ts ? this.ts.player : p;
    for (const g of this.orderFrom(start.alive ? start : p)) {
      if (!this.hasSkill(g, 'guicai') || !g.hand.length) continue;
      const ans = await this.ask(g, {
        type: 'respond', kind: 'guicai',
        title: `${SKILLS.guicai.name}: เปลี่ยนผลตัดสิน [${reason}] ของ ${p.name} (ตอนนี้ ${cardStr(c)}) ด้วยการ์ดในมือ?`,
        choices: g.hand.map((h) => ({ id: 'g:' + h.id, cardIds: [h.id], as: h.key, label: 'ใช้แทนผลตัดสิน' })),
        ctx: { judgeSeat: p.seat, reason, judgeCard: strip(c) },
      });
      if (ans.pass) continue;
      const nc = this.cardById.get(ans.cards[0]);
      this.removeCard(nc);
      this.toDiscard([c]);
      c = nc;
      this.log(`${g.name} ใช้ทักษะ ${SKILLS.guicai.name} เปลี่ยนผลตัดสินเป็น ${cardStr(c)}`);
      this.pushTable(g, this.makeV(c.key, [c]), [], `เปลี่ยนผลตัดสิน`);
    }
    return c;
  }

  judgeDone(p, c) {
    if (!c) return;
    if (this.hasSkill(p, 'tiandu')) {
      p.hand.push(c);
      this.log(`${p.name} ใช้ทักษะ ${SKILLS.tiandu.name} เก็บ ${cardStr(c)}`);
    } else this.toDiscard([c]);
  }

  // ════════════════════════════ skills ════════════════════════════

  async useSkill(p, id, cards, targets) {
    const name = SKILLS[id].name;
    const t = targets[0];
    const discardCards = () => { cards.forEach((c) => this.removeCard(c)); this.toDiscard(cards); };
    switch (id) {
      case 'rende': {
        cards.forEach((c) => this.obtain(t, c));
        this.noteFriendly(p, t);
        this.log(`${p.name} ใช้ทักษะ ${name} มอบการ์ด ${cards.length} ใบให้ ${t.name}`);
        this.ts.rendeGiven += cards.length;
        if (this.ts.rendeGiven >= 2 && !this.ts.rendeHealed) {
          this.ts.rendeHealed = true;
          if (p.hp < p.maxHp) this.heal(p, 1, p);
        }
        break;
      }
      case 'zhiheng':
        this.ts.used.add(id);
        discardCards();
        this.log(`${p.name} ใช้ทักษะ ${name} ทิ้ง ${cards.map(cardStr).join(', ')} แล้วจั่ว ${cards.length} ใบ`);
        this.draw(p, cards.length);
        break;
      case 'kurou':
        this.log(`${p.name} ใช้ทักษะ ${name}`);
        await this.loseHp(p, 1);
        if (p.alive) this.draw(p, 2);
        break;
      case 'fanjian': {
        this.ts.used.add(id);
        this.log(`${p.name} ใช้ทักษะ ${name} กับ ${t.name}`);
        const suits = ['spade', 'heart', 'club', 'diamond'];
        const a = await this.ask(t, {
          type: 'option', kind: 'fanjian_suit', title: `${p.name} ใช้ ${name}: ทายดอกของการ์ดที่คุณจะได้`,
          options: suits.map((s) => ({ id: s, label: SUIT_NAME[s] })),
        });
        const c = this.randomHand(p);
        if (!c) break;
        this.obtain(t, c);
        this.log(`${t.name} ทาย ${SUIT_NAME[a.option]} ได้ ${cardStr(c)}`);
        if (c.suit !== a.option) { this.noteHostile(p, t); await this.damage(p, t, 1, null); }
        break;
      }
      case 'jieyin':
        this.ts.used.add(id);
        discardCards();
        this.log(`${p.name} ใช้ทักษะ ${name} กับ ${t.name}`);
        this.noteFriendly(p, t);
        this.heal(p, 1, p);
        this.heal(t, 1, p);
        break;
      case 'qingnang':
        this.ts.used.add(id);
        discardCards();
        this.log(`${p.name} ใช้ทักษะ ${name} รักษา ${t.name}`);
        this.noteFriendly(p, t);
        this.heal(t, 1, p);
        break;
      case 'lijian': {
        this.ts.used.add(id);
        discardCards();
        const [a, b] = targets;
        this.log(`${p.name} ใช้ทักษะ ${name}: ${a.name} ดวลกับ ${b.name}`);
        this.pushTable(a, this.makeV('duel', []), [b.seat], name);
        if (!(await this.askNegate('duel', b, a))) await this.resolveDuel(a, b, null);
        break;
      }
      case 'jijiang': {
        this.log(`${p.name} ใช้ทักษะ ${name} ขอ「สังหาร」ใส่ ${targets.map((x) => x.name).join(', ')}`);
        for (const q of this.others(p)) {
          if (q.kingdom !== 'shu') continue;
          const c = await this.requestCard(q, 'attack', {
            title: `${p.name} (${name}) ขอให้คุณใช้「สังหาร」แทน ใส่ ${targets.map((x) => x.name).join(', ')}`,
            forSeat: p.seat, targetSeat: targets[0].seat, noLord: true, reason: 'lordhelp',
          });
          if (c) {
            this.noteFriendly(q, p);
            this.ts.attacksUsed++;
            this.ts.usedAttack = true;
            targets.forEach((x) => this.noteHostile(p, x));
            await this.resolveAttack(p, c, targets);
            return;
          }
        }
        this.ts.jijiangFailed = true;
        this.log('ไม่มีใครช่วย');
        break;
      }
      default:
        break;
    }
  }

  // ════════════════════════════ health ════════════════════════════

  heal(p, n, src) {
    if (!p.alive) return;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + n);
    if (p.hp > before) {
      this.log(`${p.name} ฟื้นฟูเลือด ${p.hp - before} (${p.hp}/${p.maxHp})`);
      if (src) this.noteFriendly(src, p);
    }
  }

  async loseHp(p, n) {
    p.hp -= n;
    this.log(`${p.name} เสียเลือด ${n} (${p.hp}/${p.maxHp})`);
    if (p.hp <= 0) await this.dying(p, null);
  }

  async damage(source, target, amount, v, nature) {
    if (!target.alive) return;
    target.hp -= amount;
    this.log(`💥 ${target.name} ได้รับความเสียหาย${nature === 'thunder' ? 'สายฟ้า' : ''} ${amount}${source ? ` จาก ${source.name}` : ''} (${target.hp}/${target.maxHp})`);
    this.noteHostile(source, target, amount);
    this.update();
    if (target.hp <= 0) await this.dying(target, source);
    if (!target.alive) return;

    if (this.hasSkill(target, 'jianxiong') && v && v.real.length) {
      const got = v.real.filter((c) => this.discard.includes(c));
      if (got.length) {
        got.forEach((c) => { this.discard.splice(this.discard.indexOf(c), 1); target.hand.push(c); });
        this.log(`${target.name} ใช้ทักษะ ${SKILLS.jianxiong.name} เก็บ ${got.map(cardStr).join(', ')}`);
      }
    }
    if (this.hasSkill(target, 'fankui') && source && source !== target && source.alive && this.hasAnyCard(source, false)) {
      const c = await this.chooseCardFrom(target, source, { judge: false, title: `${SKILLS.fankui.name}: เลือกการ์ดของ ${source.name} ที่จะหยิบ` });
      if (c) {
        const fromHand = source.hand.includes(c);
        this.obtain(target, c);
        this.log(`${target.name} ใช้ทักษะ ${SKILLS.fankui.name} หยิบ${fromHand ? 'การ์ดในมือ 1 ใบ' : cardStr(c)}จาก ${source.name}`);
      }
    }
    if (this.hasSkill(target, 'ganglie') && source && source !== target && source.alive &&
      (await this.confirm(target, 'ganglie', `ใช้ทักษะ ${SKILLS.ganglie.name} ต่อ ${source.name}?`))) {
      const j = await this.judge(target, SKILLS.ganglie.name);
      const heart = j && j.suit === 'heart';
      this.judgeDone(target, j);
      if (!heart && source.alive) {
        let choice = 'damage';
        if (source.hand.length >= 2) {
          const a = await this.ask(source, {
            type: 'option', kind: 'ganglie', title: `${target.name} ใช้ ${SKILLS.ganglie.name}: เลือก`,
            options: [{ id: 'discard', label: 'ทิ้งการ์ดในมือ 2 ใบ' }, { id: 'damage', label: 'รับความเสียหาย 1' }], defaultOption: 'discard',
          });
          choice = a.option;
        }
        if (choice === 'discard') {
          const cs = await this.chooseOwn(source, { min: 2, max: 2, title: `${SKILLS.ganglie.name}: ทิ้งการ์ดในมือ 2 ใบ` });
          cs.forEach((c) => this.removeCard(c));
          this.toDiscard(cs);
          this.log(`${source.name} ทิ้ง ${cs.map(cardStr).join(', ')}`);
        } else {
          await this.damage(target, source, 1, null);
        }
      } else if (heart) this.log('ผลเป็นโพแดง ไม่มีผล');
    }
    if (this.hasSkill(target, 'yiji')) {
      this.log(`${target.name} ใช้ทักษะ ${SKILLS.yiji.name} จั่ว ${2 * amount} ใบ`);
      this.draw(target, 2 * amount);
    }
  }

  async dying(target, source) {
    this.log(`🩸 ${target.name} อยู่ในสภาวะใกล้ตาย! ต้องการ ลูกท้อ ${1 - target.hp} ใบ`);
    const start = this.ts && this.ts.player.alive ? this.ts.player : target;
    for (const s of this.orderFrom(start)) {
      while (target.hp <= 0 && s.alive) {
        const need = 1 - target.hp;
        const c = await this.requestCard(s, 'peach', {
          title: s === target ? `คุณใกล้ตาย! ใช้「ลูกท้อ」ช่วยตัวเอง? (ต้องการ ${need})` : `${target.name} ใกล้ตาย! ใช้「ลูกท้อ」ช่วยหรือไม่? (ต้องการ ${need})`,
          dyingSeat: target.seat, reason: 'dying',
        });
        if (!c) break;
        const extra = this.hasSkill(target, 'jiuyuan') && s !== target && s.kingdom === 'wu' ? 1 : 0;
        if (extra) this.log(`${target.name} ทักษะ ${SKILLS.jiuyuan.name}: ฟื้นฟูเพิ่ม 1`);
        target.hp += 1 + extra;
        this.noteFriendly(s, target);
        this.log(`${s.name} ช่วย ${target.name} (${target.hp}/${target.maxHp})`);
      }
      if (target.hp > 0) break;
    }
    if (target.hp > 0) {
      target.hp = Math.min(target.hp, target.maxHp);
      return;
    }
    await this.kill(target, source);
  }

  async kill(target, source) {
    target.alive = false;
    target.hp = 0;
    this.log(`☠️ ${target.name} (${HEROES[target.hero].name}) เสียชีวิต — บทบาท: ${ROLES[target.role].name}`);
    const all = [...target.hand, ...this.equipCards(target), ...target.judgeZone];
    target.hand = [];
    target.equip = { weapon: null, armor: null, defHorse: null, offHorse: null };
    target.judgeZone = [];
    this.toDiscard(all);
    this.checkVictory();
    if (source && source.alive) {
      if (target.role === 'rebel') {
        this.log(`${source.name} สังหารกบฏ ได้รางวัลจั่ว 3 ใบ`);
        this.draw(source, 3);
      } else if (target.role === 'loyalist' && source.role === 'lord') {
        this.log(`จักรพรรดิสังหารขุนนางภักดี! ต้องทิ้งการ์ดทั้งหมด`);
        const cs = [...source.hand, ...this.equipCards(source)];
        cs.forEach((c) => this.removeCard(c));
        this.toDiscard(cs);
      }
    }
    this.update();
  }

  checkVictory() {
    const lord = this.players.find((p) => p.role === 'lord');
    const al = this.alive();
    const pidsOf = (roles) => this.players.filter((p) => roles.includes(p.role)).map((p) => p.pid);
    if (!lord.alive) {
      if (al.length === 1 && al[0].role === 'traitor') {
        throw new GameOver({ winnerRole: 'traitor', winners: [al[0].pid], text: `ผู้ทรยศ ${al[0].name} ชนะ!` });
      }
      throw new GameOver({ winnerRole: 'rebel', winners: pidsOf(['rebel']), text: 'ฝ่ายกบฏชนะ! จักรพรรดิถูกโค่นล้ม' });
    }
    if (!al.some((p) => p.role === 'rebel' || p.role === 'traitor')) {
      throw new GameOver({ winnerRole: 'lord', winners: pidsOf(['lord', 'loyalist']), text: 'จักรพรรดิและขุนนางภักดีชนะ!' });
    }
  }

  // ════════════════════════════ views ════════════════════════════

  viewFor(pid) {
    const me = this.player(pid);
    const over = this.phase === 'over';
    const pe = me && this.pending.get(me.pid);
    return {
      phase: this.phase,
      phaseName: PHASE_NAMES[this.phase],
      round: this.round,
      turnSeat: this.ts ? this.ts.player.seat : null,
      mySeat: me ? me.seat : null,
      deckCount: this.deck.length,
      discardCount: this.discard.length,
      players: this.players.map((p) => ({
        seat: p.seat, pid: p.pid, name: p.name, hero: p.hero, hp: p.hp, maxHp: p.maxHp, alive: p.alive,
        kingdom: p.kingdom, gender: p.gender, isBot: p.isBot, connected: p.connected,
        handCount: p.hand.length,
        equip: Object.fromEntries(Object.entries(p.equip).map(([k, c]) => [k, strip(c)])),
        judge: p.judgeZone.map(strip),
        role: over || p === me || p.role === 'lord' || !p.alive ? p.role : null,
        distance: me && me.alive && p.alive && p !== me ? this.distance(me, p) : null,
        inRange: me && me.alive && p.alive && p !== me ? this.inAttackRange(me, p) : false,
      })),
      hand: me ? me.hand.map(strip) : [],
      table: this.table,
      harvest: this.harvestCards ? this.harvestCards.map(strip) : null,
      log: this.logs.slice(-80),
      waiting: [...this.pending.values()].map((e) => (e.req.hideWaiting
        ? { seat: null, title: 'รอผู้เล่นตัดสินใจใช้「ไร้ช่องโหว่」', deadline: e.req.deadline }
        : { seat: e.p.seat, title: e.req.title, deadline: e.req.deadline })),
      prompt: pe ? pe.req : null,
      result: this.result,
    };
  }
}

module.exports = { Game, ROLE_TABLE, GameOver, GameAborted };
