'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { Game } = require('../server/game/engine');
const { Banter, LINES, stanceOf } = require('../server/game/banter');

const bots = (n) => Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, name: `บอท${i}`, isBot: true }));

test('phrase bank is large and every situation has lines', () => {
  let total = 0;
  for (const [key, byStance] of Object.entries(LINES)) {
    for (const [st, lines] of Object.entries(byStance)) {
      assert.ok(lines.length > 0, `${key}.${st}`);
      total += lines.length;
    }
  }
  assert.ok(total >= 250, `only ${total} lines`);
});

test('bots chat during full games: names filled in, no errors', async () => {
  for (let i = 0; i < 40; i++) {
    let clock = 0;
    const b = new Banter({ now: () => clock });
    const said = [];
    let g;
    g = new Game({
      players: bots(2 + (i % 9)), botDelay: 0, maxRounds: 60,
      onEvent: (ev) => { clock += 1500; for (const l of b.react(g, ev)) said.push({ ...l, at: clock }); },
    });
    const r = await g.run();
    assert.ok(r.text);
    for (const l of said) {
      assert.ok(!/[{}]/.test(l.text), `unfilled placeholder: ${l.text}`);
      assert.ok(l.text.trim().length > 0);
    }
    assert.ok(said.length > 0, 'bots said something');
  }
});

test('bluffing: rebels and traitors pretend to be loyal until exposed', () => {
  const g = new Game({ players: bots(8), botDelay: 0 });
  const rebel = g.players.find((p) => p.role === 'rebel');
  const traitor = g.players.find((p) => p.role === 'traitor');
  assert.strictEqual(stanceOf(g, rebel), 'fake');
  assert.strictEqual(stanceOf(g, traitor), 'fake');
  rebel.rebelScore = 4; // attacked the lord a lot
  assert.strictEqual(stanceOf(g, rebel), 'rebel');
  const b = new Banter({ rnd: () => 0 });
  const fakeLine = b.line(g, traitor, 'start');
  assert.ok(LINES.start.fake.includes(fakeLine), 'traitor uses a fake-loyal line');
  // traitor reveals only when alone with the lord
  for (const p of g.players) if (p !== traitor && p.role !== 'lord') p.alive = false;
  assert.strictEqual(stanceOf(g, traitor), 'traitor');
});

test('bots answer when a human mentions their name', () => {
  const g = new Game({ players: [{ pid: 'h', name: 'ไชไช' }, ...bots(3)], botDelay: 0 });
  const b = new Banter();
  const out = b.replyTo(g, { pid: 'h', name: 'ไชไช' }, 'บอท2 เป็นกบฏใช่ไหม');
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].pid, 'p2');
  assert.ok(out[0].text.length > 0);
});
