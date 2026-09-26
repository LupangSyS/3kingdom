'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { Game } = require('../server/game/engine');
const { buildDeck, CARD_INFO } = require('../server/game/cards');
const { HEROES, SKILLS } = require('../server/game/heroes');

const bots = (n) => Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, name: `P${i}`, isBot: true }));
const allCards = (g) => [
  ...g.deck, ...g.discard,
  ...g.players.flatMap((p) => [...p.hand, ...Object.values(p.equip).filter(Boolean), ...p.judgeZone]),
];

test('deck has 108 cards and every card/skill is defined', () => {
  const deck = buildDeck();
  assert.strictEqual(deck.length, 108);
  for (const c of deck) assert.ok(CARD_INFO[c.key], c.key);
  for (const [k, info] of Object.entries(CARD_INFO)) assert.ok(info.short && info.short.length <= 70, `short effect text for ${k}`);
  for (const h of Object.values(HEROES)) for (const s of h.skills) assert.ok(SKILLS[s], s);
});

test('all-bot games finish for every player count, with cards conserved', async () => {
  const errors = [];
  const orig = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  try {
    for (let i = 0; i < 180; i++) {
      const n = 2 + (i % 9);
      const g = new Game({ players: bots(n), botDelay: 0, maxRounds: 100 });
      const r = await g.run();
      assert.ok(r && r.text, 'game produced a result');
      const cards = allCards(g);
      assert.strictEqual(cards.length, 108, `card count after ${n}-player game`);
      assert.strictEqual(new Set(cards.map((c) => c.id)).size, 108, 'no duplicate cards');
      if (r.winnerRole === 'lord') assert.ok(!g.alive().some((p) => p.role === 'rebel' || p.role === 'traitor'));
      if (r.winnerRole === 'rebel') assert.ok(!g.players.find((p) => p.role === 'lord').alive);
      if (r.winnerRole === 'traitor') assert.deepStrictEqual(g.alive().map((p) => p.role), ['traitor']);
    }
  } finally {
    console.error = orig;
  }
  assert.deepStrictEqual(errors, []);
});

test('human prompts: invalid answers are rejected, valid ones accepted, timeouts fall back', async () => {
  const players = [{ pid: 'h', name: 'Human' }, ...bots(3)];
  const g = new Game({ players, botDelay: 0, timeouts: { play: 150, respond: 150, negate: 50, disconnected: 50 }, maxRounds: 3 });
  const done = g.run();
  const human = g.player('h');
  // wait for the human's first prompt
  let pe;
  for (let i = 0; i < 200 && !(pe = g.pending.get('h')); i++) await new Promise((r) => setTimeout(r, 5));
  assert.ok(pe, 'human got a prompt');
  assert.strictEqual(g.submit('h', pe.id + 999, {}), 'คำสั่งนี้หมดอายุแล้ว');
  if (pe.req.type === 'hero') {
    assert.strictEqual(g.submit('h', pe.id, { hero: 'not-a-hero' }), 'การเลือกไม่ถูกต้อง');
    assert.strictEqual(g.submit('h', pe.id, { hero: pe.req.heroes[0] }), null);
    await new Promise((r) => setImmediate(r));
    assert.strictEqual(human.hero, pe.req.heroes[0]);
  }
  // view for the human never leaks other hands or hidden roles
  const v = g.viewFor('h');
  for (const p of v.players) {
    assert.ok(!('hand' in p));
    if (p.pid !== 'h' && p.role && p.alive && v.phase !== 'over') assert.strictEqual(p.role, 'lord');
  }
  const r = await done; // remaining prompts time out and resolve automatically
  assert.ok(r.text);
});

test('rejoin: disconnected player keeps seat and pending prompt', async () => {
  const players = [{ pid: 'h', name: 'Human' }, ...bots(1)];
  const g = new Game({ players, botDelay: 0, timeouts: { play: 5000, respond: 5000, disconnected: 5000 } });
  g.run();
  let pe;
  for (let i = 0; i < 200 && !(pe = g.pending.get('h')); i++) await new Promise((r) => setTimeout(r, 5));
  g.setConnected('h', false);
  g.setConnected('h', true);
  const v = g.viewFor('h');
  assert.ok(v.prompt, 'prompt still available after reconnect');
  assert.strictEqual(v.prompt.id, pe.id);
  g.abort();
});

test('attack range, horses and distance', () => {
  const g = new Game({ players: bots(6), botDelay: 0 });
  g.players.forEach((p) => g.setHero(p, 'guanyu', true));
  g.ts = { player: g.players[0], attacksUsed: 0, used: new Set() };
  const [a, , , d] = g.players;
  assert.strictEqual(g.distance(a, d), 3);
  assert.strictEqual(g.inAttackRange(a, g.players[1]), true);
  assert.strictEqual(g.inAttackRange(a, d), false);
  const deck = [...g.cardById.values()];
  a.equip.weapon = deck.find((c) => c.key === 'green_dragon');
  assert.strictEqual(g.inAttackRange(a, d), true);
  d.equip.defHorse = deck.find((c) => c.key === 'jueying');
  assert.strictEqual(g.distance(a, d), 4);
  assert.strictEqual(g.inAttackRange(a, d), false);
});
