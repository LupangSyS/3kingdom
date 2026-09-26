'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { io: connect } = require('socket.io-client');
const { createServer } = require('../server');

function client(url) {
  const s = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  s.last = null;
  s.on('state', (st) => { s.last = st; });
  return s;
}
function waitFor(s, pred, ms = 3000) {
  return new Promise((resolve, reject) => {
    if (s.last && pred(s.last)) return resolve(s.last);
    const t = setTimeout(() => { s.off('state', h); reject(new Error('timeout waiting for state')); }, ms);
    const h = (st) => { if (pred(st)) { clearTimeout(t); s.off('state', h); resolve(st); } };
    s.on('state', h);
  });
}

test('room flow: create, join, bots, start, rejoin after disconnect', async () => {
  const { server, rooms } = createServer({ botDelay: 0, timeouts: { play: 20000, respond: 20000 } });
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}`;
  try {
    const a = client(url);
    a.emit('hello', { token: 'token-alice-123' });
    await waitFor(a, (st) => st.room === null);
    a.emit('create', { name: 'Alice' });
    const s1 = await waitFor(a, (st) => st.room && st.room.players.length === 1);
    const code = s1.room.code;
    assert.match(code, /^[A-Z2-9]{4}$/);
    assert.strictEqual(s1.room.hostPid, s1.me);

    const b = client(url);
    b.emit('hello', { token: 'token-bob-456' });
    await waitFor(b, (st) => st.room === null);
    b.emit('join', { code: code.toLowerCase(), name: '<b>Bob</b>' });
    await waitFor(b, (st) => st.room && st.room.players.length === 2);

    // non-host cannot start; host adds bots and starts
    b.emit('start');
    a.emit('addBot');
    a.emit('addBot');
    await waitFor(a, (st) => st.room.players.length === 4);
    a.emit('start');
    await waitFor(a, (st) => st.room.status === 'playing' && st.game);

    // Bob disconnects mid-game then comes back with the same token
    const bobPid = b.last.me;
    b.disconnect();
    await waitFor(a, (st) => st.room.players.some((p) => p.pid === bobPid && !p.connected));
    const b2 = client(url);
    b2.emit('hello', { token: 'token-bob-456' });
    const back = await waitFor(b2, (st) => st.room && st.game);
    assert.strictEqual(back.me, bobPid, 'same seat after rejoin');
    assert.strictEqual(back.room.code, code);
    assert.ok(back.game.mySeat !== null);
    await waitFor(a, (st) => st.room.players.some((p) => p.pid === bobPid && p.connected));

    // a stranger cannot join a running game
    const c = client(url);
    c.emit('hello', { token: 'token-carol-789' });
    await waitFor(c, (st) => st.room === null);
    const toast = new Promise((r) => c.once('toast', r));
    c.emit('join', { code, name: 'Carol' });
    assert.match(await toast, /เริ่มไปแล้ว/);

    // leaving mid-game hands the seat to a bot
    b2.emit('leave');
    await waitFor(b2, (st) => st.room === null);
    assert.strictEqual(rooms.rooms.get(code).game.player(bobPid).isBot, true);

    [a, b2, c].forEach((s) => s.disconnect());
  } finally {
    for (const r of rooms.rooms.values()) rooms.destroy(r);
    await new Promise((r) => server.close(r));
  }
});
