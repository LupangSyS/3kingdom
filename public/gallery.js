/* คลังภาพ: แสดงภาพที่บันทึกถาวร + ข้อมูลการ์ด (อ่านอย่างเดียว) และวาดใหม่สดจากตัวสร้างภาพเพื่อตรวจสอบ */
'use strict';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { db: null, manifest: null, tab: 'heroes', live: false, checks: {} };
const TYPE = { basic: 'การ์ดพื้นฐาน', trick: 'การ์ดกลยุทธ์', delayed: 'กลยุทธ์หน่วงเวลา', equip: 'อุปกรณ์' };

async function init() {
  const [db, manifest] = await Promise.all([
    fetch('api/cards').then((r) => r.json()),
    fetch('art/manifest.json', { cache: 'no-cache' }).then((r) => r.json()),
  ]);
  Object.assign(S, { db, manifest });
  render();
}

function slots() {
  const { db } = S;
  if (S.tab === 'heroes') return Object.entries(db.heroes).map(([id, h]) => ({ kind: 'heroes', id, h }));
  if (S.tab === 'cards') return Object.entries(db.cards).map(([id, c]) => ({ kind: 'cards', id, c }));
  return [{ kind: 'misc', id: 'back' }, { kind: 'misc', id: 'felt' }];
}

const artUrl = (kind, id) => { const u = S.manifest.items[`${kind}/${id}`]; return u ? `art/${u}` : null; };

function faceHTML(sl) {
  if (sl.kind === 'heroes') return CardFace.hero(S.db, artUrl, sl.id);
  if (sl.kind === 'cards') {
    const first = (S.db.deck[sl.id] || [])[0] || {};
    return CardFace.card(S.db, artUrl, { key: sl.id, suit: first.suit, rank: first.rank });
  }
  if (sl.id === 'back') return CardFace.card(S.db, artUrl, null);
  return `<img src="${esc(artUrl('misc', 'felt'))}" alt="felt">`;
}

function metaHTML(sl) {
  const { db } = S;
  if (sl.kind === 'heroes') {
    const h = sl.h;
    return `<b>${esc(h.name)}</b><div class="sub">ฝ่าย${esc(db.kingdoms[h.kingdom].name)} · ${h.gender === 'f' ? 'หญิง' : 'ชาย'} · เลือด ${h.hp}</div>`;
  }
  if (sl.kind === 'cards') {
    const c = sl.c;
    const copies = db.deck[sl.id] || [];
    return `<b>${esc(c.name)}</b>
      <div class="sub">${esc(CardFace.typeLine(c))} · ในสำรับ ${copies.length} ใบ</div>
      <p>${esc(c.desc)}</p>
      <div class="suits">${copies.map((x) => `<span class="${x.suit === 'heart' || x.suit === 'diamond' ? 'red' : ''}">${db.suits[x.suit]}${db.ranks[x.rank]}</span>`).join('')}</div>`;
  }
  return sl.id === 'back' ? '<b>หลังไพ่</b><p>ด้านหลังของการ์ดทุกใบ</p>' : '<b>ผ้าปูโต๊ะ</b><p>พื้นโต๊ะกลางห้องเล่น</p>';
}

function render() {
  const { db, manifest } = S;
  const list = slots();
  const n = Object.keys(manifest.items).length;
  document.getElementById('app').innerHTML = `<div class="gal">
    <div class="gbar2"><h1>🖼 คลังภาพ สามก๊ก กลยุทธ์</h1><span class="sp"></span>
      <label class="btn sm"><input type="checkbox" id="live" ${S.live ? 'checked' : ''}> วาดใหม่สดจากโค้ดเพื่อเทียบ</label>
      <a class="btn sm" href="/">กลับไปเกม</a></div>
    <div class="note">ภาพทั้ง ${n} ภาพวาดจากโค้ดทีละพิกเซล (RGB) ด้วย <code>public/artgen/</code> และบันทึกถาวรเป็นไฟล์ใน <code>public/art/</code> พร้อมลายนิ้วมือ SHA-256 —
      ภาพเป็นไฟล์คงที่ ไม่มีระบบแก้ไขหรืออัปโหลด และการทดสอบจะตรวจว่าไฟล์ตรงกับตัวสร้างภาพทุกครั้ง (${esc(manifest.generator)})</div>
    <div class="tabs">
      <button class="btn sm ${S.tab === 'heroes' ? 'on' : ''}" data-tab="heroes">ตัวละคร (${Object.keys(db.heroes).length})</button>
      <button class="btn sm ${S.tab === 'cards' ? 'on' : ''}" data-tab="cards">การ์ด (${Object.keys(db.cards).length})</button>
      <button class="btn sm ${S.tab === 'misc' ? 'on' : ''}" data-tab="misc">หลังไพ่ & โต๊ะ (2)</button></div>
    <div class="items">${list.map((sl) => {
      const key = `${sl.kind}/${sl.id}`;
      const url = manifest.items[key];
      const cls = sl.kind === 'heroes' ? 'hero-it' : sl.id === 'felt' ? 'felt-it' : 'card-it';
      const chk = S.checks[key];
      return `<div class="item ${cls}">
        <div class="pics">${faceHTML(sl)}${url ? `<img hidden src="art/${esc(url)}" alt="" data-key="${esc(key)}">` : ''}${S.live ? `<canvas data-live="${esc(key)}" title="วาดใหม่สดในเบราว์เซอร์"></canvas>` : ''}</div>
        <div class="meta">${metaHTML(sl)}
          <div class="hash">sha256 ${esc((manifest.sha256[`${key}.png`] || '').slice(0, 16))}…</div>
          ${S.live ? `<div class="small ${chk === true ? 'ok' : chk === false ? 'bad' : ''}">${chk === true ? '✓ วาดใหม่ได้ตรงกับไฟล์ทุกพิกเซล' : chk === false ? '✗ ไม่ตรง (อาจเกิดจากเบราว์เซอร์คำนวณต่างเล็กน้อย)' : 'กำลังตรวจ…'}</div>` : ''}
        </div></div>`;
    }).join('')}</div></div>`;
  if (S.live) requestAnimationFrame(drawLive);
}

function drawLive() {
  for (const cv of document.querySelectorAll('canvas[data-live]')) {
    const key = cv.dataset.live;
    const [kind, id] = key.split('/');
    const img = window.ArtDesigns.render(kind, id);
    cv.width = img.w;
    cv.height = img.h;
    const ctx = cv.getContext('2d');
    ctx.putImageData(new ImageData(new Uint8ClampedArray(img.d), img.w, img.h), 0, 0);
    const saved = document.querySelector(`img[data-key="${key}"]`);
    if (saved && S.checks[key] === undefined) compare(key, saved, img);
  }
}

function compare(key, el, img) {
  const run = () => {
    const c = document.createElement('canvas');
    c.width = img.w;
    c.height = img.h;
    const ctx = c.getContext('2d');
    ctx.drawImage(el, 0, 0);
    const got = ctx.getImageData(0, 0, img.w, img.h).data;
    let same = got.length === img.d.length;
    for (let i = 0; same && i < got.length; i += 4) if (got[i + 3] && (Math.abs(got[i] - img.d[i]) > 1 || Math.abs(got[i + 1] - img.d[i + 1]) > 1 || Math.abs(got[i + 2] - img.d[i + 2]) > 1)) same = false;
    S.checks[key] = same;
    const box = el.closest('.item').querySelector('.small');
    if (box) { box.className = `small ${same ? 'ok' : 'bad'}`; box.textContent = same ? '✓ วาดใหม่ได้ตรงกับไฟล์ทุกพิกเซล' : '✗ ไม่ตรง (อาจเกิดจากเบราว์เซอร์คำนวณต่างเล็กน้อย)'; }
  };
  if (el.complete) run(); else el.addEventListener('load', run, { once: true });
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) { S.tab = t.dataset.tab; render(); }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'live') { S.live = e.target.checked; render(); }
});

init().catch((e) => { document.getElementById('app').innerHTML = `<div class="loading">โหลดไม่สำเร็จ: ${esc(e.message)}</div>`; });
