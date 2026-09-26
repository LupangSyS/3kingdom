'use strict';

// บอทแบบง่าย: เดาฝ่ายจากพฤติกรรม (rebelScore) แล้วเล่นตามบทบาท

const { CARD_INFO } = require('./cards');

const VALUE = { peach: 9, negate: 7, exnihilo: 7, dodge: 6, attack: 4, duel: 4, steal: 5, dismantle: 4, indulgence: 5, barbarian: 3, arrows: 3, harvest: 3, peachgarden: 3, borrowsword: 3, lightning: 1 };
const value = (c) => (c ? VALUE[c.key] ?? 2 : 0);
const pickRandom = (a) => a[Math.floor(Math.random() * a.length)];

function isEnemy(g, me, t) {
  if (!t || me === t) return false;
  const alive = g.alive().length;
  switch (me.role) {
    case 'lord':
    case 'loyalist':
      return t.role !== 'lord' && t.rebelScore > 0;
    case 'rebel':
      return t.role === 'lord' || t.rebelScore < 0;
    case 'traitor':
      if (alive <= 2) return true;
      return t.role !== 'lord' && t.rebelScore > 0;
    default:
      return false;
  }
}

function isFriend(g, me, t) {
  if (!t) return false;
  if (me === t) return true;
  switch (me.role) {
    case 'lord':
    case 'loyalist':
      return t.role === 'lord' || t.rebelScore < 0;
    case 'rebel':
      return t.role !== 'lord' && t.rebelScore > 1;
    case 'traitor':
      return t.role === 'lord' && g.alive().length > 2;
    default:
      return false;
  }
}

/** เลือกศัตรูที่ดีที่สุดจากรายการที่นั่ง; ถ้าไม่มีศัตรูที่รู้ อาจสุ่มโจมตี (กันเกมไม่คืบ) */
function chooseEnemies(g, me, seats, max = 1, aggressive = true) {
  const ps = seats.map((s) => g.players[s]);
  let en = ps.filter((t) => isEnemy(g, me, t)).sort((a, b) => a.hp - b.hp);
  if (!en.length && aggressive) {
    const neutral = ps.filter((t) => !isFriend(g, me, t));
    if (neutral.length && Math.random() < (me.role === 'rebel' ? 0.7 : 0.35)) en = [pickRandom(neutral)];
  }
  return en.slice(0, max).map((t) => t.seat);
}

function cheapest(cards, n) {
  return [...cards].sort((a, b) => value(a) - value(b)).slice(0, n);
}

function play(g, p, req) {
  const us = req.usables;
  const byAs = (k) => us.filter((u) => u.as === k);
  const cardOf = (u) => u.cardIds && g.cardById.get(u.cardIds[0]);
  const direct = (u) => !u.skill && u.cardIds && cardOf(u).key === u.as;
  const go = (u, cards = u.cardIds || [], targets = []) => ({ usable: u.id, cards, targets });

  // อุปกรณ์
  for (const u of us) {
    if (!u.cardIds || u.skill) continue;
    const c = cardOf(u);
    const info = CARD_INFO[c.key];
    if (info.type !== 'equip') continue;
    const cur = p.equip[info.slot];
    if (!cur) return go(u);
    if (info.slot === 'weapon' && (info.range || 1) > (CARD_INFO[cur.key].range || 1)) return go(u);
  }
  // ฟื้นฟู
  if (p.hp < p.maxHp) {
    const u = byAs('peach').find(direct);
    if (u) return go(u);
  }
  for (const k of ['exnihilo', 'harvest']) {
    const u = byAs(k)[0];
    if (u) return go(u);
  }
  if (p.hp < p.maxHp && byAs('peachgarden')[0]) return go(byAs('peachgarden')[0]);

  // ทักษะที่เป็นประโยชน์
  const skill = (id) => us.find((u) => u.skill === id && !u.as);
  let u = skill('qingnang');
  if (u) {
    const t = u.targets.candidates.map((s) => g.players[s]).filter((t) => isFriend(g, p, t)).sort((a, b) => a.hp - b.hp)[0];
    if (t) return go(u, cheapest(p.hand, 1).map((c) => c.id), [t.seat]);
  }
  u = skill('jieyin');
  if (u && p.hp < p.maxHp) {
    const t = u.targets.candidates.find((s) => !isEnemy(g, p, g.players[s]));
    if (t !== undefined) return go(u, cheapest(p.hand, 2).map((c) => c.id), [t]);
  }
  u = skill('kurou');
  if (u && (p.hp >= 3 || (p.hp >= 2 && p.hand.some((c) => c.key === 'peach')))) return go(u);
  u = skill('rende');
  if (u && p.hand.length > p.hp) {
    const t = u.targets.candidates.find((s) => isFriend(g, p, g.players[s]));
    if (t !== undefined) return go(u, cheapest(p.hand, Math.min(2, p.hand.length)).map((c) => c.id), [t]);
  }
  u = skill('zhiheng');
  if (u) {
    const junk = p.hand.filter((c) => value(c) <= 3);
    if (junk.length >= 2) return go(u, junk.map((c) => c.id));
  }
  u = skill('fanjian');
  if (u) {
    const t = chooseEnemies(g, p, u.targets.candidates, 1, false);
    if (t.length) return go(u, [], t);
  }
  u = skill('lijian');
  if (u) {
    const en = u.targets.candidates.filter((s) => isEnemy(g, p, g.players[s]));
    if (en.length >= 2) return go(u, cheapest([...p.hand, ...g.equipCards(p)], 1).map((c) => c.id), en.slice(0, 2));
  }

  // กลยุทธ์ใส่ศัตรู
  for (const k of ['indulgence', 'steal', 'dismantle', 'duel']) {
    for (const x of byAs(k)) {
      const t = chooseEnemies(g, p, x.targets.candidates, 1, k !== 'duel');
      if (t.length) return go(x, x.cardIds, t);
    }
  }
  const bs = byAs('borrowsword')[0];
  if (bs) {
    for (const a of bs.targets.candidates) {
      const b = chooseEnemies(g, p, bs.targets.second[a], 1, false);
      if (b.length && b[0] !== a) return go(bs, bs.cardIds, [a, b[0]]);
    }
  }
  for (const k of ['barbarian', 'arrows']) {
    const x = byAs(k)[0];
    if (!x) continue;
    const others = g.others(p);
    const foes = others.filter((t) => isEnemy(g, p, t)).length;
    const pals = others.filter((t) => isFriend(g, p, t)).length;
    if (foes >= pals || Math.random() < 0.3) return go(x);
  }
  const lt = byAs('lightning')[0];
  if (lt && Math.random() < 0.3) return go(lt);

  // สังหาร
  const attacks = [...byAs('attack')].sort((a, b) => (a.skill ? 1 : 0) - (b.skill ? 1 : 0));
  for (const x of attacks) {
    if (x.id === 'skill:jijiang' && Math.random() < 0.5) continue;
    const t = chooseEnemies(g, p, x.targets.candidates, x.targets.max);
    if (!t.length) continue;
    if (x.pick) return go(x, cheapest(p.hand, 2).map((c) => c.id), t);
    return go(x, x.cardIds || [], t);
  }
  return { end: true };
}

function respond(g, p, req) {
  const ch = req.choices;
  const ctx = req.ctx || {};
  const take = (c) => (c.pick ? { choice: c.id, cards: cheapest(p.hand.filter((x) => c.pick.pool.includes(x.id)), c.pick.min).map((x) => x.id) } : { choice: c.id });
  const best = () => {
    const sp = ch.filter((c) => c.special === 'armor');
    if (sp.length) return take(sp[0]);
    const cards = ch.filter((c) => c.cardIds).sort((a, b) => value(g.cardById.get(a.cardIds[0])) - value(g.cardById.get(b.cardIds[0])));
    if (cards.length) return take(cards[0]);
    const other = ch.find((c) => c.pick || c.special);
    return other ? take(other) : { pass: true };
  };
  switch (req.kind) {
    case 'dodge':
    case 'attack': {
      if (ctx.reason === 'lordhelp') return isFriend(g, p, g.players[ctx.forSeat]) ? best() : { pass: true };
      if (ctx.use) {
        // ยืมดาบ / ง้าวมังกร: ใช้ถ้าเป้าไม่ใช่มิตร
        const t = g.players[ctx.targetSeat];
        if (ctx.reason === 'borrowsword') return isFriend(g, p, t) && p.equip.weapon ? { pass: true } : best();
        return isFriend(g, p, t) ? { pass: true } : best();
      }
      return best();
    }
    case 'peach': {
      const t = g.players[ctx.dyingSeat];
      if (t === p || isFriend(g, p, t)) return best();
      return { pass: true };
    }
    case 'negate': {
      const t = g.players[ctx.targetSeat];
      const harmful = !['exnihilo', 'peachgarden', 'harvest'].includes(ctx.trickKey);
      if (!ctx.negated && harmful && isFriend(g, p, t)) return best();
      if (ctx.negated && harmful && isEnemy(g, p, t) && Math.random() < 0.5) return best();
      if (!ctx.negated && !harmful && isEnemy(g, p, t) && ctx.trickKey === 'exnihilo' && Math.random() < 0.3) return best();
      return { pass: true };
    }
    case 'guicai':
      return { pass: true };
    default:
      return { pass: true };
  }
}

function select(g, p, req) {
  const items = req.items;
  const n = Math.max(req.min, 0);
  switch (req.kind) {
    case 'discard':
    case 'axe': {
      if (req.kind === 'axe') {
        const t = g.ts && g.ts.player;
        if (!items.length || req.max < 2) return { refs: [] };
        const cheap = [...items].sort((a, b) => value(a.card) - value(b.card)).slice(0, 2);
        return { refs: value(cheap[0].card) + value(cheap[1].card) <= 8 && t ? cheap.map((i) => i.ref) : [] };
      }
      return { refs: [...items].sort((a, b) => value(a.card) - value(b.card)).slice(0, n).map((i) => i.ref) };
    }
    case 'harvest':
      return { refs: [[...items].sort((a, b) => value(b.card) - value(a.card))[0].ref] };
    case 'guanxing':
      return { refs: items.filter((i) => value(i.card) <= 2).map((i) => i.ref) };
    case 'take': {
      const t = g.players[req.targetSeat];
      if (t && isFriend(g, p, t)) {
        const j = items.find((i) => i.zone === 'judge');
        if (j) return { refs: [j.ref] };
      }
      const eq = items.filter((i) => i.zone === 'equip');
      if (eq.length && Math.random() < 0.5) return { refs: [pickRandom(eq).ref] };
      return { refs: [pickRandom(items).ref] };
    }
    default:
      return { refs: items.slice(0, n).map((i) => i.ref) };
  }
}

function players(g, p, req) {
  switch (req.kind) {
    case 'tuxi': {
      const en = req.candidates.filter((s) => !isFriend(g, p, g.players[s]));
      return { seats: en.slice(0, req.max) };
    }
    case 'liuli': {
      const en = req.candidates.filter((s) => isEnemy(g, p, g.players[s]));
      if (en.length) return { seats: [en[0]] };
      const nf = req.candidates.filter((s) => !isFriend(g, p, g.players[s]));
      return { seats: nf.length && Math.random() < 0.5 ? [nf[0]] : [] };
    }
    default:
      return { seats: req.candidates.slice(0, req.min) };
  }
}

function option(g, p, req) {
  const has = (id) => req.options.some((o) => o.id === id);
  switch (req.kind) {
    case 'luoyi':
      return { option: p.hand.some((c) => c.key === 'attack' || c.key === 'duel') ? 'yes' : 'no' };
    case 'frost_blade':
      return { option: 'no' };
    case 'double_swords_target':
      return { option: 'letdraw' };
    case 'ganglie':
      return { option: p.hp <= 2 ? 'discard' : 'damage' };
    case 'fanjian_suit':
      return { option: pickRandom(req.options).id };
    case 'ganglie_confirm':
    default:
      if (has('yes')) return { option: 'yes' };
      return { option: req.options[0].id };
  }
}

function decide(g, p, req) {
  switch (req.type) {
    case 'hero': return { hero: pickRandom(req.heroes) };
    case 'play': return play(g, p, req);
    case 'respond': return respond(g, p, req);
    case 'select': return select(g, p, req);
    case 'players': return players(g, p, req);
    case 'option': return option(g, p, req);
    default: return null;
  }
}

module.exports = { decide, isEnemy, isFriend };
