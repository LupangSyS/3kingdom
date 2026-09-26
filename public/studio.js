/* สามก๊ก กลยุทธ์ — Art Studio: สร้าง/อัปโหลดภาพประกอบให้เกม */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
const ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } },
};

// ขนาดไฟล์ผลลัพธ์ของแต่ละประเภท
const SPECS = {
  heroes: { w: 512, h: 512, round: true, gen: '1024x1024' },
  cards: { w: 360, h: 504, gen: '1024x1536' },
  back: { w: 360, h: 504, gen: '1024x1536' },
  felt: { w: 1600, h: 1000, gen: '1536x1024', jpeg: true },
};
const specOf = (kind, id) => (kind === 'misc' ? SPECS[id] : SPECS[kind]);

const DEFAULT_STYLE = 'Dramatic painted digital illustration in the style of a premium Chinese Three Kingdoms card game, rich colors, cinematic lighting, highly detailed';

const HERO_EN = {
  liubei: ['Liu Bei', 'benevolent Shu Han emperor holding twin swords, red and green imperial robes'],
  guanyu: ['Guan Yu', 'red-faced general with a long black beard and green robe, wielding the Green Dragon crescent blade'],
  zhangfei: ['Zhang Fei', 'fierce wild-bearded warrior roaring with a serpent spear'],
  zhugeliang: ['Zhuge Liang', 'calm genius strategist with a white feather fan and Taoist robe, stars behind him'],
  zhaoyun: ['Zhao Yun', 'young heroic spear general in shining white and silver armor'],
  machao: ['Ma Chao', 'proud cavalry warrior in silver lion-head armor with a spear'],
  huangyueying: ['Huang Yueying', 'brilliant young woman inventor surrounded by wooden mechanical gadgets'],
  caocao: ['Cao Cao', 'cunning ambitious warlord in dark blue armor with a sly smile'],
  simayi: ['Sima Yi', 'shrewd scheming strategist in dark robes with piercing eyes'],
  xiahoudun: ['Xiahou Dun', 'one-eyed fierce general wearing an eyepatch, in blue armor'],
  zhangliao: ['Zhang Liao', 'stern elite cavalry general holding a halberd'],
  xuchu: ['Xu Chu', 'huge bare-chested muscular warrior with an enormous blade'],
  guojia: ['Guo Jia', 'pale young genius advisor holding a wine cup, knowing smile'],
  zhenji: ['Lady Zhen', 'graceful beautiful lady in flowing silk over a misty river'],
  sunquan: ['Sun Quan', 'young emperor of Wu with a purple-tinged beard, green and gold armor'],
  ganning: ['Gan Ning', 'daring former river pirate with feathers and bells, holding a blade'],
  lumeng: ['Lu Meng', 'scholar-general in armor holding an open book'],
  huanggai: ['Huang Gai', 'battle-scarred old veteran general with an iron whip'],
  zhouyu: ['Zhou Yu', 'handsome elegant commander with flames and warships behind him'],
  daqiao: ['Da Qiao', 'elegant graceful lady with a parasol among flower petals'],
  luxun: ['Lu Xun', 'young scholar-general with a sword, fire spreading behind him'],
  sunshangxiang: ['Sun Shangxiang', 'fierce warrior princess drawing a bow'],
  huatuo: ['Hua Tuo', 'legendary old physician with herbs and acupuncture needles'],
  lvbu: ['Lu Bu', 'mighty unrivaled warrior with pheasant-feather headdress and a sky-piercing halberd'],
  diaochan: ['Diao Chan', 'stunningly beautiful dancer under a full moon'],
};

const CARD_EN = {
  attack: 'a swift deadly sword slash, a warrior striking forward', dodge: 'a nimble warrior sidestepping a spear thrust',
  peach: 'glowing magical peaches on a branch, healing light', dismantle: 'soldiers tearing down a wooden bridge over a river',
  steal: 'a sly hand snatching a treasure pouch', duel: 'two generals clashing weapons in a fierce duel',
  barbarian: 'Nanman barbarian army charging with war elephants', arrows: 'a sky darkened by thousands of raining arrows',
  peachgarden: 'three sworn brothers making an oath in a blossoming peach garden', harvest: 'a bountiful golden harvest of five grains',
  exnihilo: 'a glowing magic scroll conjuring objects from thin air', borrowsword: 'a hand passing a sword to another man in shadow',
  negate: 'a radiant shield of light dispelling a magic spell', indulgence: 'a lazy lord enjoying wine and music, ignoring his duties',
  lightning: 'a massive lightning bolt striking from storm clouds',
  crossbow: 'Zhuge repeating crossbow, ornate wooden weapon', double_swords: 'a pair of male and female twin swords, yin and yang',
  blue_steel: 'the Qinggang sword, gleaming blue steel blade', frost_blade: 'an ice-cold frost blade covered in frost',
  green_dragon: 'the Green Dragon Crescent Blade glowing green', serpent_spear: 'the Serpent Spear with a snake-shaped blade',
  axe: 'a massive rock-cleaving battle axe', halberd: 'the ornate Sky Piercer halberd',
  kylin_bow: 'the Kylin bow decorated with a qilin', eight_trigrams: 'Eight Trigrams bagua formation glowing on the ground',
  renwang: 'the Renwang benevolent king shield', jueying: 'Jueying, a swift black warhorse galloping',
  dilu: 'Dilu, a white horse leaping across a river', zhuahuang: 'Zhuahuang Feidian, a golden-yellow warhorse',
  chitu: 'Red Hare, a legendary blood-red warhorse', dawan: 'a Ferghana heavenly horse from Dawan', zixing: 'a purple-maned swift warhorse',
};

const S = { meta: null, status: null, key: ss.get('studio_key') || '', manifest: { items: {} }, pending: [], tab: 'heroes', ed: null };
const socket = io({ transports: ['websocket', 'polling'] });
socket.on('meta', (m) => { S.meta = m; render(); });
socket.on('art', (m) => { S.manifest = m; if (S.status && S.authed) refresh(); else render(); });

function toast(msg) {
  const d = document.createElement('div');
  d.textContent = msg;
  $('#toast').appendChild(d);
  setTimeout(() => d.remove(), 3500);
}

async function api(method, url, body) {
  const r = await fetch(`/api/studio${url}`, {
    method, headers: { 'Content-Type': 'application/json', 'x-studio-key': S.key }, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

async function refresh() {
  const st = await api('GET', '/state');
  S.manifest = st.manifest;
  S.pending = st.pending;
  render();
}

async function init() {
  S.status = await (await fetch('/api/studio/status')).json();
  if (!S.status.needsPassword || S.key) {
    try { await api('POST', '/login'); S.authed = true; await refresh(); return; } catch { S.key = ''; }
  }
  render();
}

const artUrl = (kind, id) => { const u = S.manifest.items[`${kind}/${id}`]; return u ? `art/${u}` : null; };
const bg = (url) => (url ? ` style="background-image:url('${esc(url)}')"` : '');
const style = () => store.get('studio_style') || DEFAULT_STYLE;

function slotList() {
  const M = S.meta;
  if (S.tab === 'heroes') return Object.entries(M.heroes).map(([id, h]) => ({ kind: 'heroes', id, name: h.name, sub: `${h.cn} · ${M.kingdoms[h.kingdom].name}` }));
  if (S.tab === 'cards') return Object.entries(M.cards).map(([id, c]) => ({ kind: 'cards', id, name: c.name, sub: c.cn }));
  return [{ kind: 'misc', id: 'back', name: 'หลังไพ่', sub: 'Card back' }, { kind: 'misc', id: 'felt', name: 'ผ้าปูโต๊ะ', sub: 'Table felt' }];
}

function defaultPrompt(kind, id) {
  const st = style();
  if (kind === 'heroes') {
    const h = S.meta.heroes[id];
    const [en, desc] = HERO_EN[id] || [id, ''];
    return `${st}. Character portrait of ${en} (${h.cn}) from Romance of the Three Kingdoms: ${desc}. Head and shoulders, facing the viewer, face centered in the upper half, plain dark background. No text, no letters, no watermark.`;
  }
  if (kind === 'cards') {
    const c = S.meta.cards[id];
    return `${st}. Artwork for a Three Kingdoms game card "${c.cn}": ${CARD_EN[id] || c.desc}. Vertical composition, main subject centered, leave the bottom fifth simple. No text, no letters, no border, no watermark.`;
  }
  if (id === 'back') return `${st}. Ornate symmetrical playing card back design, deep crimson and gold, Chinese cloud and dragon motifs around a central seal. Vertical, no text, no watermark.`;
  return `${st}. Top-down seamless game table surface: dark green felt with a faint golden Chinese cloud pattern and subtle vignette, no objects, no text.`;
}

function thumbHTML(sl) {
  const url = artUrl(sl.kind, sl.id);
  if (sl.kind === 'heroes') {
    const h = S.meta.heroes[sl.id];
    return `<span class="avatar k-${h.kingdom} ${url ? 'img' : ''}"${bg(url)}>${url ? '' : esc(h.cn[0])}</span>`;
  }
  if (sl.id === 'felt') return `<div class="felt-thumb"${bg(url)}></div>`;
  return cardPreview(sl.kind === 'cards' ? sl.id : null, url);
}

function cardPreview(key, url) {
  if (!key) return `<div class="card back ${url ? 'img' : ''}"${bg(url)}>${url ? '' : '三國'}</div>`;
  const c = S.meta.cards[key];
  if (url) return `<div class="card has-art t-${c.type}"><div class="c-art"${bg(url)}></div><div class="c-corner">A<br>♠</div><div class="c-name">${esc(c.name)}</div></div>`;
  return `<div class="card t-${c.type}"><div class="c-corner">A<br>♠</div><div class="c-name">${esc(c.name)}</div><div class="c-cn">${esc(c.cn)}</div></div>`;
}

function render() {
  const app = $('#app');
  if (!S.meta || !S.status) { app.innerHTML = '<div class="loading">กำลังโหลด…</div>'; return; }
  if (!S.authed) {
    app.innerHTML = `<div class="home"><div class="logo"><div class="logo-cn">畫</div><h1>Art Studio</h1><p>สร้างภาพประกอบให้ สามก๊ก กลยุทธ์</p></div>
      <form class="panel form" data-form="login">
        ${S.status.passwordConfigured ? '' : '<div class="flag">⚠ เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า STUDIO_PASSWORD — ใช้ได้เฉพาะเมื่อเปิดจากเครื่องเซิร์ฟเวอร์เอง (localhost)</div>'}
        <label for="pw">รหัสผ่านสตูดิโอ</label><input type="text" id="pw" autocomplete="current-password" style="-webkit-text-security:disc">
        <button class="btn primary">เข้าสู่ระบบ</button><a class="muted small" href="/">← กลับไปหน้าเกม</a></form></div>`;
    return;
  }
  const slots = slotList();
  const pendingN = S.pending.length;
  const count = (kind, ids) => ids.filter((id) => S.manifest.items[`${kind}/${id}`]).length;
  const nH = count('heroes', Object.keys(S.meta.heroes));
  const nC = count('cards', Object.keys(S.meta.cards));
  const nM = count('misc', ['back', 'felt']);
  app.innerHTML = `<div class="studio">
    <div class="sbar"><h1>🎨 Art Studio<small>畫</small></h1>
      <span class="${S.status.ai ? 'pillok' : 'pilloff'} small">${S.status.ai ? '✓ AI สร้างภาพพร้อมใช้' : '✗ ยังไม่ได้ตั้ง OPENAI_API_KEY (อัปโหลดได้อย่างเดียว)'}</span>
      <span class="${S.status.github ? 'pillok' : 'pilloff'} small">${S.status.github ? `✓ เผยแพร่ไปที่ ${esc(S.status.github)}` : '✗ ยังไม่ได้ตั้ง GITHUB_TOKEN (commit เองด้วย git)'}</span>
      <span class="sp"></span>
      <button class="btn gold" data-act="publish" ${pendingN && S.status.github ? '' : 'disabled'}>⬆ เผยแพร่ขึ้น GitHub${pendingN ? ` (${pendingN})` : ''}</button>
      <a class="btn" href="/">กลับไปเกม</a></div>
    <div class="panel"><label class="small muted" for="style">สไตล์ภาพหลัก (ใช้นำหน้าทุกคำสั่งสร้างภาพ เพื่อให้ภาพทั้งชุดเข้ากัน)</label>
      <textarea id="style">${esc(style())}</textarea>
      <div class="note">บันทึกแล้วภาพจะขึ้นในเกมทันที · กด "เผยแพร่" เพื่อ commit ภาพขึ้น GitHub ให้เก็บถาวร (การ commit จะทำให้ Render deploy ใหม่และห้องที่เล่นอยู่รีเซ็ต — ควรกดตอนไม่มีคนเล่น)${pendingN ? ` · <b>รอเผยแพร่ ${pendingN} ไฟล์</b>` : ''}</div></div>
    <div class="tabs">
      <button class="btn sm ${S.tab === 'heroes' ? 'on' : ''}" data-act="tab" data-tab="heroes">ตัวละคร ${nH}/${Object.keys(S.meta.heroes).length}</button>
      <button class="btn sm ${S.tab === 'cards' ? 'on' : ''}" data-act="tab" data-tab="cards">การ์ด ${nC}/${Object.keys(S.meta.cards).length}</button>
      <button class="btn sm ${S.tab === 'misc' ? 'on' : ''}" data-act="tab" data-tab="misc">หลังไพ่ & โต๊ะ ${nM}/2</button></div>
    <div class="slots">${slots.map((sl) => {
      const has = !!artUrl(sl.kind, sl.id);
      const pend = S.pending.some((p) => p.path.startsWith(`${sl.kind}/${sl.id}.`));
      return `<div class="slot" data-act="edit" data-kind="${sl.kind}" data-id="${sl.id}">
        <span class="st" title="${pend ? 'ยังไม่เผยแพร่' : has ? 'มีภาพแล้ว' : 'ยังไม่มีภาพ'}">${pend ? '🟡' : has ? '✅' : ''}</span>
        ${thumbHTML(sl)}<div class="nm">${esc(sl.name)}</div><div class="sub">${esc(sl.sub)}</div></div>`;
    }).join('')}</div></div>`;
  renderModal();
}

// ─── editor ───
function openEditor(kind, id) {
  const sl = slotList().find((x) => x.kind === kind && x.id === id);
  S.ed = { kind, id, name: sl.name, sub: sl.sub, prompt: defaultPrompt(kind, id), img: null, zoom: 1, ox: 0, oy: 0, busy: false };
  renderModal();
}

function frameSize() {
  const sp = specOf(S.ed.kind, S.ed.id);
  const maxW = Math.min(360, window.innerWidth - 80);
  const maxH = 380;
  const k = Math.min(maxW / sp.w, maxH / sp.h);
  return { fw: Math.round(sp.w * k), fh: Math.round(sp.h * k) };
}

function coverScale(img, fw, fh) { return Math.max(fw / img.naturalWidth, fh / img.naturalHeight); }
function clampPan() {
  const e = S.ed;
  if (!e.img) return;
  const { fw, fh } = frameSize();
  const s = coverScale(e.img, fw, fh) * e.zoom;
  const w = e.img.naturalWidth * s;
  const h = e.img.naturalHeight * s;
  e.ox = Math.min(0, Math.max(fw - w, e.ox));
  e.oy = Math.min(0, Math.max(fh - h, e.oy));
}
function placeImage() {
  const e = S.ed;
  const el = $('.frame img');
  if (!e || !e.img || !el) return;
  const { fw, fh } = frameSize();
  const s = coverScale(e.img, fw, fh) * e.zoom;
  clampPan();
  el.style.width = `${e.img.naturalWidth * s}px`;
  el.style.height = `${e.img.naturalHeight * s}px`;
  el.style.transform = `translate(${e.ox}px, ${e.oy}px)`;
  updatePreview();
}

function exportImage() {
  const e = S.ed;
  const sp = specOf(e.kind, e.id);
  const { fw, fh } = frameSize();
  const c = document.createElement('canvas');
  c.width = sp.w;
  c.height = sp.h;
  const ctx = c.getContext('2d');
  const k = sp.w / fw;
  const s = coverScale(e.img, fw, fh) * e.zoom;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(e.img, e.ox * k, e.oy * k, e.img.naturalWidth * s * k, e.img.naturalHeight * s * k);
  let url = c.toDataURL(sp.jpeg ? 'image/jpeg' : 'image/webp', 0.86);
  if (!sp.jpeg && !url.startsWith('data:image/webp')) url = c.toDataURL('image/png');
  return url;
}

let previewTimer = null;
function updatePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const box = $('#preview');
    if (!box || !S.ed || !S.ed.img) return;
    box.innerHTML = previewHTML(exportImage());
  }, 60);
}

function previewHTML(url) {
  const e = S.ed;
  if (e.kind === 'heroes') {
    const h = S.meta.heroes[e.id];
    return `<div><span class="avatar k-${h.kingdom} ${url ? 'img' : ''}"${bg(url)}>${url ? '' : esc(h.cn[0])}</span><div class="cap">บนโต๊ะ</div></div>
      <div style="width:180px"><div class="hero" style="padding:10px">${url ? `<div class="hero-art"${bg(url)} style="height:120px"></div>` : ''}<b>${esc(h.name)}</b></div><div class="cap">ตอนเลือกตัวละคร</div></div>`;
  }
  if (e.id === 'felt') return `<div class="slot" style="cursor:default;background:none;border:none"><div class="felt-thumb" style="width:240px;height:140px"${bg(url)}></div><div class="cap">โต๊ะ</div></div>`;
  const key = e.kind === 'cards' ? e.id : null;
  return `<div>${cardPreview(key, url)}<div class="cap">ในมือ</div></div><div style="transform:scale(1.6);transform-origin:bottom center;margin-left:30px">${cardPreview(key, url)}</div>`;
}

function renderModal() {
  const box = $('#modal');
  const e = S.ed;
  if (!e) { box.innerHTML = ''; return; }
  const { fw, fh } = frameSize();
  const sp = specOf(e.kind, e.id);
  const cur = artUrl(e.kind, e.id);
  box.innerHTML = `<div class="modal-bg" data-act="bg"><div class="modal editor ${e.busy ? 'busy' : ''}">
    <h3>${esc(e.name)} <span class="muted small">${esc(e.sub)} · ${sp.w}×${sp.h}px</span></h3>
    <div class="ed">
      <div class="cropwrap">
        <div class="frame ${sp.round ? 'round' : ''}" style="width:${fw}px;height:${fh}px">
          ${e.img ? `<img src="${e.img.src}" alt="">` : `<div class="empty">${cur ? `<img src="${esc(cur)}" style="position:static;width:100%;height:100%;object-fit:cover" alt="">` : 'ยังไม่มีภาพ<br>สร้างด้วย AI หรืออัปโหลดไฟล์'}</div>`}
        </div>
        ${e.img ? `<div class="zoom">🔍 <input type="range" id="zoom" min="1" max="4" step="0.01" value="${e.zoom}"><span class="small muted">ลากภาพเพื่อจัดตำแหน่ง</span></div>` : ''}
      </div>
      <div class="form">
        <label for="prompt">คำบรรยายภาพสำหรับ AI (แก้ไขได้)</label>
        <textarea id="prompt" style="min-height:140px">${esc(e.prompt)}</textarea>
        <div class="actions">
          <button class="btn primary" data-act="generate" ${S.status.ai ? '' : 'disabled title="ต้องตั้ง OPENAI_API_KEY"'}>${e.busy === 'gen' ? '<span class="spin">⏳</span> กำลังสร้าง… (~30 วินาที)' : '✨ สร้างด้วย AI'}</button>
          <button class="btn" data-act="resetPrompt">↺ คำบรรยายเริ่มต้น</button>
          <label class="btn">📁 อัปโหลดไฟล์<input type="file" id="file" accept="image/*" hidden></label>
        </div>
        ${e.img ? `<div id="preview" class="previews"></div>` : cur ? `<div class="previews">${previewHTML(cur)}</div>` : ''}
        <div class="actions">
          <button class="btn gold" data-act="save" ${e.img ? '' : 'disabled'}>💾 บันทึกและใช้ในเกม</button>
          ${cur ? '<button class="btn ghost" data-act="remove">🗑 ลบภาพ</button>' : ''}
          <span style="flex:1"></span><button class="btn" data-act="close">ปิด</button>
        </div>
      </div>
    </div></div></div>`;
  placeImage();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('เปิดภาพไม่ได้'));
    img.src = src;
  });
}
async function setImage(src) {
  const img = await loadImage(src);
  Object.assign(S.ed, { img, zoom: 1, ox: 0, oy: 0 });
  const { fw, fh } = frameSize();
  const s = coverScale(img, fw, fh);
  S.ed.ox = (fw - img.naturalWidth * s) / 2;
  S.ed.oy = (fh - img.naturalHeight * s) / 2;
  renderModal();
}

// ─── events ───
document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  try {
    switch (act) {
      case 'bg': if (ev.target === el && !S.ed.busy) { S.ed = null; renderModal(); } break;
      case 'tab': S.tab = el.dataset.tab; render(); break;
      case 'edit': openEditor(el.dataset.kind, el.dataset.id); break;
      case 'close': S.ed = null; renderModal(); break;
      case 'resetPrompt': S.ed.prompt = defaultPrompt(S.ed.kind, S.ed.id); renderModal(); break;
      case 'generate': {
        const e = S.ed;
        e.prompt = $('#prompt').value;
        e.busy = 'gen';
        renderModal();
        try {
          const r = await api('POST', '/generate', { prompt: e.prompt, size: specOf(e.kind, e.id).gen });
          e.busy = false;
          await setImage(r.image);
        } finally { e.busy = false; if (S.ed === e) renderModal(); }
        break;
      }
      case 'save': {
        const e = S.ed;
        const data = exportImage();
        e.busy = true;
        renderModal();
        try {
          await api('POST', '/save', { kind: e.kind, id: e.id, data });
          toast(`บันทึกภาพ ${e.name} แล้ว`);
          S.ed = null;
          await refresh();
        } finally { if (S.ed === e) { e.busy = false; renderModal(); } }
        break;
      }
      case 'remove':
        if (!confirm('ลบภาพนี้? เกมจะกลับไปใช้หน้าตาเดิม')) return;
        await api('DELETE', `/art/${S.ed.kind}/${S.ed.id}`);
        S.ed = null;
        await refresh();
        break;
      case 'publish': {
        if (!confirm('เผยแพร่ภาพขึ้น GitHub? (Render จะ deploy ใหม่และห้องที่กำลังเล่นจะรีเซ็ต)')) return;
        el.disabled = true;
        const r = await api('POST', '/publish');
        toast(r.message);
        await refresh();
        break;
      }
      default: break;
    }
  } catch (e) {
    toast(e.message);
    render();
  }
});

document.addEventListener('change', async (ev) => {
  if (ev.target.id === 'file' && ev.target.files[0]) {
    const f = ev.target.files[0];
    if (S.ed) S.ed.prompt = $('#prompt').value;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result).catch((e) => toast(e.message));
    reader.readAsDataURL(f);
  }
});
document.addEventListener('input', (ev) => {
  if (ev.target.id === 'zoom') {
    const e = S.ed;
    const { fw, fh } = frameSize();
    const old = coverScale(e.img, fw, fh) * e.zoom;
    e.zoom = Number(ev.target.value);
    const nw = coverScale(e.img, fw, fh) * e.zoom;
    // ซูมรอบจุดกึ่งกลางกรอบ
    e.ox = fw / 2 - ((fw / 2 - e.ox) * nw) / old;
    e.oy = fh / 2 - ((fh / 2 - e.oy) * nw) / old;
    placeImage();
  }
  if (ev.target.id === 'style') store.set('studio_style', ev.target.value);
  if (ev.target.id === 'prompt' && S.ed) S.ed.prompt = ev.target.value;
});
document.addEventListener('submit', async (ev) => {
  if (!ev.target.matches('[data-form="login"]')) return;
  ev.preventDefault();
  S.key = $('#pw').value;
  try {
    await api('POST', '/login');
    ss.set('studio_key', S.key);
    S.authed = true;
    await refresh();
  } catch (e) { toast(e.message); }
});

// ลากเพื่อเลื่อนภาพในกรอบ
let drag = null;
document.addEventListener('pointerdown', (ev) => {
  const f = ev.target.closest('.frame');
  if (!f || !S.ed || !S.ed.img) return;
  drag = { x: ev.clientX, y: ev.clientY, ox: S.ed.ox, oy: S.ed.oy };
  f.setPointerCapture(ev.pointerId);
});
document.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  S.ed.ox = drag.ox + ev.clientX - drag.x;
  S.ed.oy = drag.oy + ev.clientY - drag.y;
  placeImage();
});
document.addEventListener('pointerup', () => { drag = null; });

init().catch((e) => toast(e.message));
