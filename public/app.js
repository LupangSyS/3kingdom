/* สามก๊ก กลยุทธ์ Online — client */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function makeToken() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, () => ((Math.random() * 16) | 0).toString(16));
}
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
let token = store.get('sgs_token');
if (!token) { token = makeToken(); store.set('sgs_token', token); }

const S = {
  meta: null, st: null, offset: 0, online: false,
  sel: null, drawer: null, heroInfo: null, cardInfo: null, hideResult: false,
  seenChat: 0, urlCode: new URLSearchParams(location.search).get('room') || '',
};
const M = () => S.meta;

// ════════════════════ socket ════════════════════
const socket = io({ transports: ['websocket', 'polling'] });
socket.on('connect', () => { S.online = true; socket.emit('hello', { token }); render(); });
socket.on('disconnect', () => { S.online = false; render(); });
socket.on('meta', (m) => { S.meta = m; render(); });
socket.on('toast', (m) => toast(m));
socket.on('state', (st) => {
  S.offset = st.now - Date.now();
  const prevStatus = S.st && S.st.room && S.st.room.status;
  S.st = st;
  if (st.kicked) toast('คุณถูกเชิญออกจากห้อง');
  if (st.replaced) toast('บัญชีนี้เปิดเล่นอยู่ในแท็บอื่น');
  if (st.room) {
    const url = `${location.pathname}?room=${st.room.code}`;
    if (location.search !== `?room=${st.room.code}`) history.replaceState(null, '', url);
    if (st.room.status === 'playing' && prevStatus !== 'playing') S.hideResult = false;
  }
  const pr = curPrompt();
  if (!pr || !S.sel || S.sel.pid !== pr.id) S.sel = pr ? newSel(pr) : null;
  render();
});

function send(ev, data) { socket.emit(ev, data); }
function toast(msg) {
  const d = document.createElement('div');
  d.textContent = msg;
  $('#toast').appendChild(d);
  setTimeout(() => d.remove(), 3000);
}

// ════════════════════ helpers ════════════════════
const G = () => S.st && S.st.game;
const curPrompt = () => (G() && G().prompt) || null;
const me = () => G() && G().players[G().mySeat];
const now = () => Date.now() + S.offset;
const cardInfo = (key) => M().cards[key];
const isRedSuit = (s) => s === 'heart' || s === 'diamond';
const newSel = (pr) => ({ pid: pr.id, opt: null, cards: [], targets: [], refs: [], menu: null });

function roleBadge(role) {
  if (!role) return '';
  return `<span class="role ${role}">${esc(M().roles[role].name)}</span>`;
}
function hpHTML(p) {
  if (!p.maxHp) return '';
  if (p.maxHp > 6) return `<span class="hp">❤ ${p.hp}/${p.maxHp}</span>`;
  let s = '';
  for (let i = 0; i < p.maxHp; i++) s += i < p.hp ? '❤' : '<span class="lost">❤</span>';
  return `<span class="hp">${s}</span>`;
}
function cardName(c) { return cardInfo(c.as || c.key).name; }
function suitRank(c) { return c.suit ? `${M().suits[c.suit]}${M().ranks[c.rank]}` : ''; }

function cardHTML(c, cls = '', attrs = '') {
  if (!c) return `<div class="card back ${cls}" ${attrs}>三國</div>`;
  const info = cardInfo(c.key);
  const color = isRedSuit(c.suit) ? 'red' : 'black';
  const type = { basic: 'พื้นฐาน', trick: 'กลยุทธ์', delayed: 'หน่วงเวลา', equip: 'อุปกรณ์' }[info.type];
  const as = c.as && c.as !== c.key ? `<div class="as">${esc(cardInfo(c.as).name)}</div>` : '';
  const range = info.range ? ` ${info.range}` : '';
  return `<div class="card t-${info.type} ${color} ${cls}" ${attrs} title="${esc(`${info.name}: ${info.desc}`)}">
    <div class="c-corner">${M().ranks[c.rank] || ''}<br>${M().suits[c.suit] || ''}</div>
    <div class="c-name">${esc(info.name)}</div><div class="c-cn">${esc(info.cn)}</div>
    <div class="c-type">${type}${range}</div>${as}</div>`;
}
function virtualCardHTML(key, cls = '') {
  const info = cardInfo(key);
  return `<div class="card t-${info.type} ${cls}" title="${esc(info.desc)}"><div class="c-name">${esc(info.name)}</div><div class="c-cn">${esc(info.cn)}</div><div class="c-type">(ทักษะ)</div></div>`;
}
function chipHTML(c, cls = '', attrs = '') {
  const red = isRedSuit(c.suit) ? 'red' : '';
  return `<span class="chip ${red} ${cls}" ${attrs} title="${esc(cardInfo(c.key).desc)}">${suitRank(c)} ${esc(cardName(c))}</span>`;
}

// ════════════════════ selection logic ════════════════════
function options() {
  const pr = curPrompt();
  if (!pr) return [];
  return pr.type === 'play' ? pr.usables : pr.type === 'respond' ? pr.choices : [];
}
function activeOpt() {
  if (!S.sel || !S.sel.opt) return null;
  return options().find((o) => o.id === S.sel.opt) || null;
}
function selectableCards() {
  const pr = curPrompt();
  if (!pr || (pr.type !== 'play' && pr.type !== 'respond')) return new Set();
  const o = activeOpt();
  if (o && o.pick) return new Set(o.pick.pool);
  const s = new Set();
  for (const x of options()) if (x.cardIds) s.add(x.cardIds[0]);
  return s;
}
function targetSpec() {
  const pr = curPrompt();
  if (!pr) return null;
  if (pr.type === 'players') return { min: pr.min, max: pr.max, candidates: pr.candidates };
  if (pr.type === 'play') { const o = activeOpt(); return o && o.targets ? o.targets : null; }
  return null;
}
function seatCandidates() {
  const t = targetSpec();
  if (!t) return new Set();
  const sel = S.sel.targets;
  if (t.second) {
    if (sel.length === 0) return new Set(t.candidates);
    if (sel.length === 1) return new Set([sel[0], ...(t.second[sel[0]] || [])]);
    return new Set(sel);
  }
  if (sel.length >= t.max) return new Set(sel);
  return new Set([...t.candidates, ...sel]);
}
function selectOpt(o, cardId) {
  S.sel.opt = o.id;
  S.sel.menu = null;
  S.sel.cards = o.cardIds ? [...o.cardIds] : (cardId && o.pick && o.pick.pool.includes(cardId) ? [cardId] : []);
  S.sel.targets = [];
  if (o.targets && !o.targets.second && o.targets.candidates.length === 1 && o.targets.min === 1) S.sel.targets = [o.targets.candidates[0]];
}
function onCard(id) {
  const pr = curPrompt();
  if (pr && S.sel && S.sel.sent) return;
  if (!pr || (pr.type !== 'play' && pr.type !== 'respond')) return showCard(id);
  const o = activeOpt();
  if (o && o.pick) {
    if (!o.pick.pool.includes(id)) return;
    const i = S.sel.cards.indexOf(id);
    if (i >= 0) S.sel.cards.splice(i, 1);
    else if (S.sel.cards.length < o.pick.max) S.sel.cards.push(id);
    return render();
  }
  if (o && o.cardIds && o.cardIds[0] === id) { S.sel = newSel(pr); return render(); }
  const list = options().filter((x) => x.cardIds && x.cardIds[0] === id);
  if (!list.length) return showCard(id);
  if (list.length === 1) selectOpt(list[0]);
  else { S.sel = newSel(pr); S.sel.menu = { cardId: id, ids: list.map((x) => x.id) }; }
  render();
}
function showCard(id) {
  const all = [...(G().hand || []), ...G().players.flatMap((p) => [...Object.values(p.equip).filter(Boolean), ...p.judge])];
  const c = all.find((x) => x && x.id === id);
  if (c) { S.cardInfo = c; renderModal(); }
}
function onSeat(seat) {
  if (S.sel && S.sel.sent) return;
  const cands = seatCandidates();
  if (!cands.has(seat)) {
    const p = G().players[seat];
    if (p && p.hero) { S.heroInfo = p.hero; renderModal(); }
    return;
  }
  const t = targetSpec();
  const sel = S.sel.targets;
  const i = sel.indexOf(seat);
  if (i >= 0) sel.splice(t.second ? i : i, t.second ? sel.length - i : 1);
  else if (sel.length < t.max) sel.push(seat);
  else if (t.max === 1) sel.splice(0, 1, seat);
  render();
}
function canConfirm() {
  const pr = curPrompt();
  if (!pr || !S.sel) return false;
  if (pr.type === 'players') return S.sel.targets.length >= pr.min && S.sel.targets.length <= pr.max;
  if (pr.type === 'select') return S.sel.refs.length >= pr.min && S.sel.refs.length <= pr.max;
  const o = activeOpt();
  if (!o) return false;
  if (o.pick && (S.sel.cards.length < o.pick.min || S.sel.cards.length > o.pick.max)) return false;
  if (pr.type === 'play' && o.targets) {
    const n = S.sel.targets.length;
    if (n < o.targets.min || n > o.targets.max) return false;
  }
  return true;
}
function answer(data) {
  const pr = curPrompt();
  if (!pr) return;
  send('answer', { promptId: pr.id, data });
  S.sel = newSel(pr);
  S.sel.sent = true;
  render();
}
function confirmSel() {
  const pr = curPrompt();
  if (!canConfirm()) return;
  if (pr.type === 'play') answer({ usable: S.sel.opt, cards: S.sel.cards, targets: S.sel.targets });
  else if (pr.type === 'respond') answer({ choice: S.sel.opt, cards: S.sel.cards });
  else if (pr.type === 'players') answer({ seats: S.sel.targets });
  else if (pr.type === 'select') answer({ refs: S.sel.refs });
}

// ════════════════════ rendering ════════════════════
function snapshotInputs() {
  const a = document.activeElement;
  const vals = {};
  document.querySelectorAll('#app input[id]').forEach((i) => { vals[i.id] = i.value; });
  return { vals, focus: a && a.id, start: a && a.selectionStart, end: a && a.selectionEnd };
}
function restoreInputs(s) {
  for (const [id, v] of Object.entries(s.vals)) { const el = document.getElementById(id); if (el) el.value = v; }
  if (s.focus) {
    const el = document.getElementById(s.focus);
    if (el) { el.focus(); try { el.setSelectionRange(s.start, s.end); } catch { /* */ } }
  }
}

function render() {
  const app = $('#app');
  const snap = snapshotInputs();
  const logBox = $('#logbox');
  const logAtBottom = !logBox || logBox.scrollHeight - logBox.scrollTop - logBox.clientHeight < 40;
  if (!S.meta || !S.st) app.innerHTML = `<div class="loading">${S.online ? 'กำลังโหลด…' : 'กำลังเชื่อมต่อเซิร์ฟเวอร์…'}</div>`;
  else if (!S.st.room) app.innerHTML = homeHTML();
  else if (S.st.room.status === 'lobby' || !G()) app.innerHTML = lobbyHTML();
  else app.innerHTML = gameHTML();
  restoreInputs(snap);
  document.querySelectorAll('.msgs').forEach((m) => { if (m.id !== 'logbox' || logAtBottom) m.scrollTop = m.scrollHeight; });
  renderModal();
  drawArrows();
  tick();
}

function homeHTML() {
  const name = store.get('sgs_name') || '';
  return `<div class="home">
    <div class="logo"><div class="logo-cn">三國殺</div><h1>สามก๊ก กลยุทธ์</h1><p>War of the Three Kingdoms · เล่นออนไลน์กับเพื่อน</p></div>
    <div class="panel form">
      <label for="name">ชื่อของคุณ</label>
      <input type="text" id="name" maxlength="16" placeholder="เช่น ขุนพลไร้นาม" value="${esc(name)}">
      <button class="btn primary" data-act="create">สร้างห้องใหม่</button>
      <div class="or">— หรือเข้าร่วมห้องของเพื่อน —</div>
      <div class="row"><input type="text" id="code" maxlength="4" placeholder="รหัสห้อง 4 ตัว" value="${esc(S.urlCode)}" style="text-transform:uppercase"><button class="btn gold" data-act="join">เข้าร่วม</button></div>
      ${S.online ? '' : '<div class="flag">⚠ ยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์</div>'}
    </div>
    <details class="panel rules"><summary>📖 วิธีเล่นโดยย่อ</summary><ul>
      <li>ผู้เล่น 2–10 คน แต่ละคนได้รับ <b>บทบาทลับ</b>: จักรพรรดิ (เปิดเผย), ขุนนางภักดี, กบฏ, ผู้ทรยศ</li>
      <li><b>จักรพรรดิ</b> ต้องกำจัดกบฏและผู้ทรยศทั้งหมด · <b>กบฏ</b> ต้องสังหารจักรพรรดิ · <b>ผู้ทรยศ</b> ต้องเป็นคนสุดท้ายที่รอด</li>
      <li>แต่ละเทิร์น: เริ่ม → ตัดสิน → จั่ว 2 ใบ → เล่นการ์ด → ทิ้งการ์ดให้เหลือเท่าเลือด → จบ</li>
      <li>ใช้「สังหาร」ได้ 1 ครั้งต่อเทิร์นกับคนในระยะโจมตี เป้าหมายตอบด้วย「หลบ」</li>
      <li>เลือดหมดจะเข้าสู่สภาวะใกล้ตาย ทุกคนสามารถใช้「ลูกท้อ」ช่วยได้</li>
      <li>สังหารกบฏได้จั่ว 3 ใบ · จักรพรรดิสังหารขุนนางภักดีต้องทิ้งการ์ดทั้งหมด</li>
      <li>หลุดการเชื่อมต่อ? เปิดหน้าเว็บนี้อีกครั้งจากเบราว์เซอร์เดิม ระบบจะพากลับเข้าเกมอัตโนมัติ</li>
    </ul></details>
  </div>`;
}

function roleDistribution(n) {
  const T = { 2: 'lord rebel', 3: 'lord rebel traitor', 4: 'lord loyalist rebel traitor', 5: 'lord loyalist rebel rebel traitor', 6: 'lord loyalist rebel rebel rebel traitor', 7: 'lord loyalist loyalist rebel rebel rebel traitor', 8: 'lord loyalist loyalist rebel rebel rebel rebel traitor', 9: 'lord loyalist loyalist loyalist rebel rebel rebel rebel traitor', 10: 'lord loyalist loyalist loyalist rebel rebel rebel rebel traitor traitor' };
  if (!T[n]) return '';
  const counts = {};
  T[n].split(' ').forEach((r) => { counts[r] = (counts[r] || 0) + 1; });
  return Object.entries(counts).map(([r, c]) => `${roleBadge(r)}${c > 1 ? ` ×${c}` : ''}`).join(' ');
}

function chatHTML(withTitle = true) {
  const chat = S.st.room.chat;
  S.seenChat = chat.length ? chat[chat.length - 1].id : 0;
  return `<div class="chat">${withTitle ? '<b>💬 แชท</b>' : ''}
    <div class="msgs" id="chatbox">${chat.map((m) => (m.from ? `<div><b>${esc(m.from)}:</b> ${esc(m.text)}</div>` : `<div class="sys">${esc(m.text)}</div>`)).join('')}</div>
    <form data-form="chat"><input type="text" id="chatin" maxlength="200" placeholder="พิมพ์ข้อความ…" autocomplete="off"><button class="btn sm">ส่ง</button></form></div>`;
}

function lobbyHTML() {
  const r = S.st.room;
  const host = r.hostPid === S.st.me;
  const n = r.players.length;
  const rows = r.players.map((p, i) => `<li>
      <span class="dot ${p.connected ? '' : 'off'}"></span><span class="muted">${i + 1}.</span>
      <span class="nm">${esc(p.name)}${p.pid === S.st.me ? ' <span class="muted">(คุณ)</span>' : ''}</span>
      ${p.pid === r.hostPid ? '<span class="badge host">หัวห้อง</span>' : ''}${p.isBot ? '<span class="badge bot">บอท</span>' : ''}
      ${host && p.pid !== S.st.me ? `<button class="btn sm ghost" data-act="kick" data-pid="${esc(p.pid)}">✕</button>` : ''}
    </li>`).join('');
  const ended = r.status !== 'lobby';
  return `<div class="lobby">
    <div class="panel">
      <div class="roomcode">ห้อง <b>${esc(r.code)}</b><button class="btn sm" data-act="copy">📋 คัดลอกลิงก์เชิญ</button></div>
      <p class="muted small">ส่งลิงก์ให้เพื่อน หรือเพิ่มบอทให้ครบ · รองรับ 2–10 คน · ปิดหน้าเว็บแล้วเปิดใหม่ได้ ระบบจำที่นั่งของคุณ</p>
      <ul class="plist">${rows}</ul>
      <div class="roles-line">${roleDistribution(n)}</div>
      <div class="actions" style="margin-top:14px">
        ${host && !ended ? `<button class="btn" data-act="addBot" ${n >= 10 ? 'disabled' : ''}>🤖 เพิ่มบอท</button>
          <button class="btn primary" data-act="start" ${n < 2 ? 'disabled' : ''}>⚔ เริ่มเกม (${n} คน)</button>` : `<span class="muted">${ended ? 'เกมจบแล้ว' : 'รอหัวห้องเริ่มเกม…'}</span>`}
        <span class="sp" style="flex:1"></span>
        <button class="btn ghost" data-act="leave">ออกจากห้อง</button>
      </div>
    </div>
    <div class="panel">${chatHTML()}</div>
  </div>`;
}

function tileHTML(p, { mine = false } = {}) {
  const g = G();
  const h = p.hero && M().heroes[p.hero];
  const cands = seatCandidates();
  const cls = [
    'tile', h ? `k-${h.kingdom}` : '',
    g.turnSeat === p.seat ? 'current' : '', p.alive ? '' : 'dead',
    cands.has(p.seat) ? 'cand' : '', S.sel && S.sel.targets.includes(p.seat) ? 'picked' : '',
    g.waiting.some((w) => w.seat === p.seat) ? 'waiting' : '',
  ].join(' ');
  const selIdx = S.sel ? S.sel.targets.indexOf(p.seat) : -1;
  const selNo = selIdx >= 0 && (targetSpec() || {}).max > 1 ? ` <span class="badge">#${selIdx + 1}</span>` : '';
  const pickable = selectableCards();
  const eq = Object.values(p.equip).filter(Boolean).map((c) => {
    const click = mine && pickable.has(c.id);
    const picked = mine && S.sel && S.sel.cards.includes(c.id);
    return chipHTML(c, `${click ? 'click' : ''} ${picked ? 'picked' : ''}`, `data-card="${c.id}"`);
  }).join('');
  const judge = p.judge.map((c) => `<span class="chip judge" data-card="${c.id}" title="${esc(cardInfo(c.as || c.key).desc)}">⚖ ${esc(cardInfo(c.as || c.key).name)}</span>`).join('');
  const flags = [!p.connected && !p.isBot ? '📴 หลุด' : '', p.isBot ? '🤖' : ''].filter(Boolean).join(' ');
  return `<div class="${cls}" data-seat="${p.seat}">
    <div class="t-top"><span class="avatar">${h ? esc(h.cn[0]) : '?'}</span>
      <div class="t-names"><b>${esc(p.name)}${selNo}</b><small>${h ? `${esc(h.name)} · ${esc(M().kingdoms[h.kingdom].name)}` : 'กำลังเลือก…'}</small></div>
      ${h ? `<button class="info" data-hero="${p.hero}" title="ดูทักษะ">?</button>` : ''}</div>
    <div class="t-meta">${hpHTML(p)} ${roleBadge(p.role)} ${p.alive ? '' : '☠'}</div>
    <div class="t-meta"><span class="hc">🂠 ${p.handCount}</span>${p.distance != null ? `<span class="${p.inRange ? 'inr' : ''}">ระยะ ${p.distance}${p.inRange ? ' 🎯' : ''}</span>` : ''}<span class="flag">${flags}</span></div>
    ${eq || judge ? `<div class="chips">${eq}${judge}</div>` : ''}
  </div>`;
}

// ตำแหน่งที่นั่งรอบโต๊ะ: คุณอยู่ล่างสุด คนถัดไปเรียงตามเข็มนาฬิกา (ซ้าย → บน → ขวา)
function seatPos(seat) {
  const g = G();
  const n = g.players.length;
  const i = (seat - g.mySeat + n) % n;
  const a = ((90 + (i * 360) / n) * Math.PI) / 180;
  return { cx: Math.cos(a), cy: Math.sin(a) };
}

const SLOT_ICON = { weapon: '⚔', armor: '🛡', defHorse: '🐎+1', offHorse: '🐎-1' };

function seatHTML(p) {
  const g = G();
  const h = p.hero && M().heroes[p.hero];
  const cands = seatCandidates();
  const pos = seatPos(p.seat);
  const cls = [
    'seat', h ? `k-${h.kingdom}` : '',
    g.turnSeat === p.seat ? 'current' : '', p.alive ? '' : 'dead',
    cands.has(p.seat) ? 'cand' : '', S.sel && S.sel.targets.includes(p.seat) ? 'picked' : '',
    g.waiting.some((w) => w.seat === p.seat) ? 'waiting' : '',
  ].join(' ');
  const selIdx = S.sel ? S.sel.targets.indexOf(p.seat) : -1;
  const selNo = selIdx >= 0 && (targetSpec() || {}).max > 1 ? `<span class="s-no">${selIdx + 1}</span>` : '';
  const eq = Object.entries(p.equip).filter(([, c]) => c).map(([slot, c]) => {
    const info = cardInfo(c.key);
    return `<span class="s-eqi ${isRedSuit(c.suit) ? 'red' : ''}" data-card="${c.id}" title="${esc(`${info.name} ${suitRank(c)}: ${info.desc}`)}"><i>${SLOT_ICON[slot]}</i><em>${esc(info.name.replace(/ [+-]1$/, ''))}</em></span>`;
  }).join('');
  const judge = p.judge.map((c) => {
    const info = cardInfo(c.as || c.key);
    return `<span class="s-judge" data-card="${c.id}" title="${esc(`${info.name}: ${info.desc}`)}">${esc(info.cn[0])}</span>`;
  }).join('');
  const off = !p.connected && !p.isBot ? '<span class="s-flag" title="หลุดการเชื่อมต่อ">📴</span>' : p.isBot ? '<span class="s-flag" title="บอท">🤖</span>' : '';
  const dist = p.distance != null && p.alive ? `<span class="s-dist ${p.inRange ? 'inr' : ''}" title="ระยะจากคุณ${p.inRange ? ' (อยู่ในระยะโจมตี)' : ''}">${p.inRange ? '🎯' : '↔'}${p.distance}</span>` : '';
  return `<div class="${cls}" data-seat="${p.seat}" style="left:calc(50% + ${pos.cx.toFixed(4)} * (50% - var(--shw)));top:calc(50% + ${pos.cy.toFixed(4)} * (50% - var(--shh)))">
    <div class="s-av"><span class="avatar">${h ? esc(h.cn[0]) : '?'}</span>
      <span class="s-hc" title="การ์ดในมือ">${p.handCount}</span>${judge ? `<span class="s-judges">${judge}</span>` : ''}${selNo}
      ${h ? `<button class="info s-info" data-hero="${p.hero}" title="ดูทักษะ">?</button>` : ''}</div>
    <div class="s-name">${off}${esc(p.name)}</div>
    <div class="s-hero">${h ? esc(h.name) : 'กำลังเลือก…'} ${roleBadge(p.role)}</div>
    <div class="s-hp">${p.alive ? hpHTML(p) : '☠ เสียชีวิต'} ${dist}</div>
    ${eq ? `<div class="s-eq">${eq}</div>` : ''}
  </div>`;
}

function arrowsHTML() {
  const g = G();
  const last = g.table[g.table.length - 1];
  if (!last || last.seat == null || !last.targets.length) return '';
  const pairs = last.targets.filter((t) => t !== last.seat).map((t) => `${last.seat}-${t}`).join(',');
  return `<svg class="arrows" data-pairs="${pairs}"></svg>`;
}

// วาดลูกศรจากผู้ใช้การ์ดไปยังเป้าหมาย ตามตำแหน่งจริงบนจอ
function drawArrows() {
  const svg = $('.arrows');
  const board = $('.board');
  if (!svg || !board) return;
  const br = board.getBoundingClientRect();
  const center = (seat) => {
    const el = seat === G().mySeat ? $('.myrow .tile') : $(`.board [data-seat="${seat}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - br.left, y: (seat === G().mySeat ? r.top : r.top + r.height / 2) - br.top };
  };
  svg.innerHTML = svg.dataset.pairs.split(',').filter(Boolean).map((pr) => {
    const [a, b] = pr.split('-').map((x) => center(Number(x)));
    if (!a || !b) return '';
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/><circle cx="${b.x}" cy="${b.y}" r="5"/>`;
  }).join('');
}

function tableHTML() {
  const g = G();
  const name = (s) => (s == null ? '' : esc(g.players[s].name));
  const recent = g.table.slice(-4);
  const items = recent.map((t, i) => {
    const cards = t.cards.length
      ? t.cards.map((c) => cardHTML({ ...c, as: t.as !== c.key ? t.as : undefined }, 'sm')).join('')
      : virtualCardHTML(t.as, 'sm');
    const tg = t.targets.length ? ` → ${t.targets.map(name).join(', ')}` : '';
    return `<div class="tplay ${i < recent.length - 2 ? 'old' : ''}"><div class="cards">${cards}</div><div>${name(t.seat)}${tg}${t.label ? `<br>${esc(t.label)}` : ''}</div></div>`;
  }).join('');
  const harvest = g.harvest ? `<div class="tplay"><div class="cards">${g.harvest.map((c) => cardHTML(c, 'sm')).join('')}</div><div>เก็บเกี่ยวห้าธัญพืช</div></div>` : '';
  return `<div class="tablecards">${items}${harvest}</div>`;
}

function waitingHTML() {
  const g = G();
  const seen = new Set();
  const list = g.waiting.filter((w) => {
    if (curPrompt() && w.seat === g.mySeat) return false;
    const k = w.seat == null ? 'hidden' : w.seat;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!list.length) return '';
  return list.slice(0, 3).map((w) => `<div>⏳ ${w.seat != null ? `<b>${esc(g.players[w.seat].name)}</b>: ` : ''}${esc(w.title)} <span class="cd" data-deadline="${w.deadline}"></span></div>`).join('');
}

function promptHTML() {
  const pr = curPrompt();
  const g = G();
  if (!pr) {
    if (g.phase === 'over') return `<div class="title">🏁 ${esc(g.result ? g.result.text : 'จบเกม')}</div><div class="actions"><button class="btn gold sm" data-act="showResult">ดูผล</button></div>`;
    return `<div class="hint">${me() && !me().alive ? '☠ คุณเสียชีวิตแล้ว — ชมเกมต่อได้' : 'รอผู้เล่นอื่น…'}</div>`;
  }
  if (S.sel && S.sel.sent) return '<div class="hint">กำลังส่ง…</div>';
  const timer = `<div class="timer" data-deadline="${pr.deadline}" data-total="${pr.deadline - now()}"><i></i></div>`;
  const title = `<div class="title mine">${esc(pr.title)}</div>`;
  const o = activeOpt();
  let hint = '';
  let buttons = '';
  if (pr.type === 'play' || pr.type === 'respond') {
    const btnOpts = options().filter((x) => x.button || (!x.cardIds && !x.pick));
    if (S.sel.menu) {
      buttons += S.sel.menu.ids.map((id) => {
        const x = options().find((y) => y.id === id);
        return `<button class="btn sm gold" data-act="opt" data-id="${esc(id)}">${esc(x.label)}</button>`;
      }).join('');
      hint = 'การ์ดใบนี้ใช้ได้หลายแบบ เลือกวิธีใช้';
    } else {
      buttons += btnOpts.map((x) => `<button class="btn sm ${S.sel.opt === x.id ? 'gold' : ''}" data-act="opt" data-id="${esc(x.id)}">${esc(x.label)}</button>`).join('');
    }
    if (o) {
      const sk = o.skill && M().skills[o.skill];
      const cd = o.as ? cardInfo(o.as) : null;
      hint = `▶ ${esc(o.label)}${sk ? ` — ${esc(sk.desc)}` : cd ? ` — ${esc(cd.desc)}` : ''}`;
      if (o.pick) hint += ` <b>(เลือกการ์ด ${o.pick.min === o.pick.max ? o.pick.min : `${o.pick.min}–${o.pick.max}`} ใบ: เลือกแล้ว ${S.sel.cards.length})</b>`;
      if (pr.type === 'play' && o.targets) {
        const t = o.targets;
        hint += t.second
          ? ` <b>(เลือกผู้ถือดาบ แล้วเลือกเป้าหมายของเขา)</b>`
          : ` <b>(เลือกเป้าหมาย ${t.min === t.max ? t.min : `${t.min}–${t.max}`} คน${t.ordered ? ' ตามลำดับ' : ''})</b>`;
      }
      buttons += `<button class="btn sm primary" data-act="confirm" ${canConfirm() ? '' : 'disabled'}>✔ ยืนยัน</button><button class="btn sm" data-act="cancel">ยกเลิก</button>`;
    } else if (!S.sel.menu) {
      hint = pr.type === 'play' ? 'แตะการ์ดที่ไฮไลต์หรือปุ่มทักษะเพื่อเลือก' : 'แตะการ์ดที่ไฮไลต์เพื่อตอบสนอง';
    }
    if (pr.type === 'play') buttons += `<button class="btn sm" data-act="end">จบเทิร์น ⏭</button>`;
    else buttons += `<button class="btn sm" data-act="pass">${esc(pr.passLabel || 'ไม่ใช้')}</button>`;
  } else if (pr.type === 'players') {
    hint = `เลือกผู้เล่น ${pr.min === pr.max ? pr.min : `${pr.min}–${pr.max}`} คน (แตะที่ช่องผู้เล่น)`;
    buttons = `<button class="btn sm primary" data-act="confirm" ${canConfirm() ? '' : 'disabled'}>✔ ยืนยัน</button>`;
    if (pr.min === 0) buttons += `<button class="btn sm" data-act="skipPlayers">ข้าม</button>`;
  } else if (pr.type === 'option') {
    buttons = pr.options.map((x) => `<button class="btn sm ${x.id === 'yes' ? 'gold' : ''}" data-act="option" data-id="${esc(x.id)}">${esc(x.label)}</button>`).join('');
  } else if (pr.type === 'select' || pr.type === 'hero') {
    hint = 'ดูหน้าต่างที่เปิดขึ้น';
    buttons = `<button class="btn sm gold" data-act="reopen">เปิดหน้าต่างเลือก</button>`;
  }
  return `${title}${timer}${hint ? `<div class="hint">${hint}</div>` : ''}<div class="actions">${buttons}</div>`;
}

function gameHTML() {
  const g = G();
  const r = S.st.room;
  const n = g.players.length;
  const my = g.mySeat;
  const order = [];
  for (let i = 1; i < n; i++) order.push(g.players[(my + i) % n]);
  const mine = g.players[my];
  const pickable = selectableCards();
  const hand = g.hand.map((c) => {
    const cls = [pickable.has(c.id) ? 'click' : (curPrompt() && ['play', 'respond'].includes(curPrompt().type) ? 'dim' : ''), S.sel && S.sel.cards.includes(c.id) ? 'picked' : ''].join(' ');
    return cardHTML(c, cls, `data-card="${c.id}"`);
  }).join('') || '<div class="empty">ไม่มีการ์ดในมือ</div>';
  const chat = r.chat;
  const lastId = chat.length ? chat[chat.length - 1].id : 0;
  const unread = S.drawer !== 'chat' && lastId && lastId !== S.seenChat ? '<span class="unread">ใหม่</span>' : '';
  const turnP = g.turnSeat != null ? g.players[g.turnSeat] : null;
  return `<div class="game">
    <header class="gbar">
      <b>ห้อง ${esc(r.code)}</b><span>รอบ ${g.round}</span><span>🂠 กอง ${g.deckCount}</span>
      <span class="phase">${turnP ? `เทิร์น ${esc(turnP.name)} · ` : ''}${esc(g.phaseName)}</span>
      ${S.online ? '' : '<span class="offline">⚠ กำลังเชื่อมต่อใหม่…</span>'}
      <span class="sp"></span>
      <button class="btn sm" data-act="drawer" data-tab="log">📜 บันทึก</button>
      <button class="btn sm" data-act="drawer" data-tab="chat">💬${unread}</button>
      <button class="btn sm ghost" data-act="leaveGame">ออก</button>
    </header>
    <section class="board">
      <div class="felt"><div class="felt-inner">
        <div class="piles"><div class="pile" title="กองจั่ว">${cardHTML(null, 'sm')}<span>${g.deckCount}</span></div>
          <div class="pile" title="กองทิ้ง"><div class="card sm discard">ทิ้ง</div><span>${g.discardCount}</span></div></div>
        ${tableHTML()}<div class="status">${waitingHTML()}</div>
      </div></div>
      ${arrowsHTML()}
      ${order.map((p) => seatHTML(p)).join('')}
    </section>
    <section class="prompt">${promptHTML()}</section>
    <section class="mine">
      <div class="myrow">${tileHTML(mine, { mine: true })}</div>
      <div class="hand">${hand}</div>
    </section>
  </div>${S.drawer ? drawerHTML() : ''}`;
}

function drawerHTML() {
  const g = G();
  const tab = S.drawer;
  const body = tab === 'log'
    ? `<div class="chat"><div class="msgs" id="logbox">${g.log.map((l) => `<div>${esc(l.text)}</div>`).join('')}</div></div>`
    : chatHTML(false);
  return `<aside class="drawer">
    <div class="tabs"><button class="btn sm ${tab === 'log' ? 'on' : ''}" data-act="drawer" data-tab="log">📜 บันทึก</button>
    <button class="btn sm ${tab === 'chat' ? 'on' : ''}" data-act="drawer" data-tab="chat">💬 แชท</button><span style="flex:1"></span>
    <button class="btn sm" data-act="closeDrawer">✕</button></div>${body}</aside>`;
}

function heroCardHTML(id, pick = false) {
  const h = M().heroes[id];
  const skills = h.skills.map((s) => {
    const sk = M().skills[s];
    return `<div class="sk"><b>${esc(sk.name)} ${esc(sk.cn)}</b>${sk.lord ? ' <span class="badge host">จักรพรรดิ</span>' : ''}<br>${esc(sk.desc)}</div>`;
  }).join('');
  return `<div class="hero k-${h.kingdom} ${pick ? 'pick' : ''}" ${pick ? `data-act="hero" data-id="${id}"` : ''}>
    <div class="t-top"><span class="avatar k-${h.kingdom}">${esc(h.cn[0])}</span><div class="t-names"><b>${esc(h.name)}</b><small>${esc(h.cn)} · ฝ่าย${esc(M().kingdoms[h.kingdom].name)} · ${h.gender === 'f' ? 'หญิง' : 'ชาย'}</small></div></div>
    <div class="hp">${'❤'.repeat(h.hp)}</div>${skills}</div>`;
}

function renderModal() {
  const box = $('#modal');
  let html = '';
  const pr = curPrompt();
  const g = G();
  if (pr && S.sel && S.sel.sent) {
    html = '';
  } else if (pr && pr.type === 'hero' && !S.sel.hidden) {
    const lord = g.players.find((p) => p.role === 'lord');
    html = `<div class="modal"><h3>${esc(pr.title)}</h3>
      <div class="muted">บทบาทของคุณ: ${roleBadge(me().role)} — ${esc(M().roles[me().role].goal)}${lord && lord.hero && lord !== me() ? ` · จักรพรรดิ: ${esc(lord.name)}` : ''}</div>
      <div class="timer" data-deadline="${pr.deadline}" data-total="${pr.deadline - now()}"><i></i></div>
      <div class="heroes">${pr.heroes.map((h) => heroCardHTML(h, true)).join('')}</div></div>`;
  } else if (pr && pr.type === 'select' && !S.sel.hidden) {
    const items = pr.items.map((it) => {
      const picked = S.sel.refs.includes(it.ref);
      const zone = { hand: 'ในมือ', equip: 'อุปกรณ์', judge: 'ช่องตัดสิน' }[it.zone] || '';
      return `<div class="pickwrap">${cardHTML(it.card, `click ${picked ? 'picked' : ''}`, `data-ref="${esc(it.ref)}"`)}${zone ? `<div class="zone">${zone}</div>` : ''}</div>`;
    }).join('');
    const range = pr.min === pr.max ? `${pr.min}` : `${pr.min}–${pr.max}`;
    html = `<div class="modal"><h3>${esc(pr.title)}</h3>
      <div class="timer" data-deadline="${pr.deadline}" data-total="${pr.deadline - now()}"><i></i></div>
      <div class="cards">${items}</div>
      <div class="actions"><span class="muted">เลือก ${range} ใบ · เลือกแล้ว ${S.sel.refs.length}</span><span style="flex:1"></span>
      <button class="btn ghost sm" data-act="hideModal">ดูกระดาน</button>
      <button class="btn primary" data-act="confirm" ${canConfirm() ? '' : 'disabled'}>✔ ยืนยัน</button></div></div>`;
  } else if (S.heroInfo) {
    html = `<div class="modal">${heroCardHTML(S.heroInfo)}<div class="actions"><span style="flex:1"></span><button class="btn" data-act="closeInfo">ปิด</button></div></div>`;
  } else if (S.cardInfo) {
    const c = S.cardInfo;
    const info = cardInfo(c.as || c.key);
    html = `<div class="modal" style="max-width:360px"><div class="cards">${cardHTML(c)}</div><h3>${esc(info.name)} ${esc(info.cn)}</h3><div>${esc(info.desc)}</div><div class="actions"><span style="flex:1"></span><button class="btn" data-act="closeInfo">ปิด</button></div></div>`;
  } else if (g && g.phase === 'over' && g.result && !S.hideResult) {
    const host = S.st.room.hostPid === S.st.me;
    const rows = g.players.map((p) => {
      const h = p.hero && M().heroes[p.hero];
      const win = g.result.winners.includes(p.pid);
      return `<div class="${win ? 'win' : ''}">${win ? '🏆' : '·'} <b>${esc(p.name)}</b> ${h ? esc(h.name) : ''} ${roleBadge(p.role)} ${p.alive ? '' : '☠'}</div>`;
    }).join('');
    const iWon = g.result.winners.includes(S.st.me);
    html = `<div class="modal" style="max-width:480px"><div class="result">${iWon ? '🎉 คุณชนะ!' : '🏁 จบเกม'}</div>
      <div style="text-align:center">${esc(g.result.text)}</div><div class="rlist">${rows}</div>
      <div class="actions"><button class="btn ghost" data-act="hideResult">ดูกระดาน</button><span style="flex:1"></span>
      ${host ? '<button class="btn gold" data-act="toLobby">กลับห้องรอ / เล่นอีกครั้ง</button>' : '<span class="muted">รอหัวห้องเริ่มรอบใหม่</span>'}</div></div>`;
  }
  box.innerHTML = html ? `<div class="modal-bg" data-act="bg">${html}</div>` : '';
}

function tick() {
  const t = now();
  document.querySelectorAll('.timer[data-deadline]').forEach((el) => {
    const left = Number(el.dataset.deadline) - t;
    const total = Math.max(1, Number(el.dataset.total) || 1);
    el.firstElementChild.style.width = `${Math.max(0, Math.min(100, (left / total) * 100))}%`;
    el.classList.toggle('low', left < 5000);
  });
  document.querySelectorAll('.cd[data-deadline]').forEach((el) => {
    const left = Math.max(0, Math.ceil((Number(el.dataset.deadline) - t) / 1000));
    el.textContent = `(${left}s)`;
  });
}
setInterval(tick, 500);
window.addEventListener('resize', drawArrows);

// ════════════════════ events ════════════════════
function nameVal() {
  const el = $('#name');
  const v = (el && el.value.trim()) || store.get('sgs_name') || '';
  if (v) store.set('sgs_name', v);
  return v;
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act],[data-card],[data-seat],[data-ref],[data-hero]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'bg') {
    if (e.target !== el) return;
    if (S.heroInfo || S.cardInfo) { S.heroInfo = null; S.cardInfo = null; renderModal(); }
    return;
  }
  if (el.dataset.hero && !act) { e.stopPropagation(); S.heroInfo = el.dataset.hero; renderModal(); return; }
  if (el.dataset.ref) {
    const pr = curPrompt();
    if (!pr || pr.type !== 'select') return;
    const refs = S.sel.refs;
    const i = refs.indexOf(el.dataset.ref);
    if (i >= 0) refs.splice(i, 1);
    else if (pr.max === 1) refs.splice(0, refs.length, el.dataset.ref);
    else if (refs.length < pr.max) refs.push(el.dataset.ref);
    renderModal();
    return;
  }
  if (el.dataset.card && !act) { onCard(Number(el.dataset.card)); return; }
  if (el.dataset.seat && !act) { onSeat(Number(el.dataset.seat)); return; }
  const pr = curPrompt();
  switch (act) {
    case 'create': {
      const name = nameVal();
      if (!name) { toast('กรุณาใส่ชื่อ'); $('#name').focus(); return; }
      send('create', { name });
      break;
    }
    case 'join': {
      const name = nameVal();
      const code = ($('#code').value || '').trim().toUpperCase();
      if (!name) { toast('กรุณาใส่ชื่อ'); $('#name').focus(); return; }
      if (code.length !== 4) { toast('รหัสห้องต้องมี 4 ตัว'); return; }
      send('join', { code, name });
      break;
    }
    case 'copy': {
      const url = `${location.origin}${location.pathname}?room=${S.st.room.code}`;
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('คัดลอกลิงก์แล้ว'), () => prompt('คัดลอกลิงก์นี้', url));
      break;
    }
    case 'leave': send('leave'); S.urlCode = ''; history.replaceState(null, '', location.pathname); break;
    case 'leaveGame':
      if (confirm('ออกจากเกม? บอทจะเล่นแทนคุณ และคุณจะกลับเข้ามาไม่ได้')) { send('leave'); S.urlCode = ''; history.replaceState(null, '', location.pathname); }
      break;
    case 'addBot': send('addBot'); break;
    case 'kick': send('kick', { pid: el.dataset.pid }); break;
    case 'start': send('start'); break;
    case 'toLobby': send('toLobby'); break;
    case 'drawer': S.drawer = S.drawer === el.dataset.tab ? null : el.dataset.tab; render(); break;
    case 'closeDrawer': S.drawer = null; render(); break;
    case 'closeInfo': S.heroInfo = null; S.cardInfo = null; renderModal(); break;
    case 'hideResult': S.hideResult = true; renderModal(); break;
    case 'showResult': S.hideResult = false; renderModal(); break;
    case 'hideModal': if (S.sel) S.sel.hidden = true; renderModal(); break;
    case 'reopen': if (S.sel) S.sel.hidden = false; renderModal(); break;
    case 'hero': answer({ hero: el.dataset.id }); break;
    case 'opt': {
      const o = options().find((x) => x.id === el.dataset.id);
      if (!o) return;
      const cardId = S.sel.menu ? S.sel.menu.cardId : null;
      if (S.sel.opt === o.id && !S.sel.menu) S.sel = newSel(pr);
      else selectOpt(o, cardId);
      // ตัวเลือกพิเศษที่ไม่ต้องเลือกอะไรเพิ่ม (เช่น ค่ายกลแปดทิศ) — ใช้ได้ทันที
      if (pr.type === 'respond' && S.sel.opt && !o.pick && !o.cardIds) { confirmSel(); return; }
      if (pr.type === 'play' && S.sel.opt && !o.pick && !o.cardIds && !o.targets) { confirmSel(); return; }
      render();
      break;
    }
    case 'confirm': confirmSel(); break;
    case 'cancel': S.sel = newSel(pr); render(); break;
    case 'end': answer({ end: true }); break;
    case 'pass': answer({ pass: true }); break;
    case 'skipPlayers': answer({ seats: [] }); break;
    case 'option': answer({ option: el.dataset.id }); break;
    default: break;
  }
});

document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-form="chat"]');
  if (!f) return;
  e.preventDefault();
  const inp = $('#chatin', f);
  const text = inp.value.trim();
  if (text) send('chat', { text });
  inp.value = '';
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'code') $('[data-act="join"]').click();
  if (e.key === 'Enter' && e.target.id === 'name' && !$('#code').value) $('[data-act="create"]').click();
  if (e.key === 'Escape') { S.heroInfo = null; S.cardInfo = null; renderModal(); }
});
