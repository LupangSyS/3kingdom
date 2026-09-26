/* สูตรวาดภาพประกอบทุกใบของ สามก๊ก กลยุทธ์ — pixel art สร้างจากโค้ดล้วน
   ภาพผลลัพธ์ถูกบันทึกถาวรที่ public/art/ ด้วย scripts/build-art.js */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./raster'));
  else root.ArtDesigns = factory(root.ArtRaster);
}(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';

  const { Canvas, hash, rng, mix, shade } = R;
  const VERSION = 1;

  // ขนาดพิกเซลจริง (logical) และตัวคูณขยายตอนบันทึกเป็นไฟล์
  const SPECS = {
    cards: { w: 66, h: 94, scale: 3 },
    heroes: { w: 48, h: 48, scale: 4 },
    back: { w: 66, h: 94, scale: 3 },
    felt: { w: 160, h: 100, scale: 4 },
  };

  // ───────────────────────── helpers ─────────────────────────
  const INK = '#140b07';
  const unit = (x0, y0, x1, y1) => { const l = Math.hypot(x1 - x0, y1 - y0) || 1; return [(x1 - x0) / l, (y1 - y0) / l, l]; };

  function background(w, h, seed, top, bottom, glow, gy = 0.42) {
    const r = rng(seed);
    return new Canvas(w, h).fill((x, y) => {
      let c = mix(top, bottom, y / (h - 1));
      const dx = (x - w / 2) / w; const dy = (y - h * gy) / h;
      const g = Math.max(0, 1 - Math.hypot(dx, dy) * 2.3);
      c = mix(c, glow, g * g * 0.75);
      const v = Math.max(0, Math.hypot((x - w / 2) / (w / 2), (y - h / 2) / (h / 2)) - 0.8) * 110;
      const n = (r() - 0.5) * 12;
      return [c[0] + n - v, c[1] + n - v, c[2] + n - v];
    });
  }

  function compose(bg, draw) {
    const L = new Canvas(bg.w, bg.h);
    draw(L);
    return bg.draw(L.outline(INK));
  }

  function sparkle(cv, x, y, s, c = '#fff6c8', a = 1) {
    cv.line(x - s, y, x + s, y, 1, c, a).line(x, y - s, x, y + s, 1, c, a);
    cv.px(x, y, '#ffffff', a);
  }
  function sparkles(cv, seed, n, box, c) {
    const r = rng(seed);
    for (let i = 0; i < n; i++) sparkle(cv, box[0] + r() * box[2], box[1] + r() * box[3], 1 + Math.floor(r() * 2), c, 0.9);
  }

  function sword(cv, x0, y0, x1, y1, o = {}) {
    const [ux, uy, L] = unit(x0, y0, x1, y1);
    const px = -uy; const py = ux;
    const bw = o.w || 2.2;
    const gk = o.grip || 0.26;
    const g = [x0 + ux * L * gk, y0 + uy * L * gk];
    const n = [x1 - ux * 4, y1 - uy * 4];
    cv.poly([[g[0] + px * bw, g[1] + py * bw], [n[0] + px * bw * 0.9, n[1] + py * bw * 0.9], [x1, y1], [n[0] - px * bw * 0.9, n[1] - py * bw * 0.9], [g[0] - px * bw, g[1] - py * bw]], o.blade || '#d9e2ea');
    cv.line(g[0] + px * 0.4, g[1] + py * 0.4, n[0] + px * 0.4, n[1] + py * 0.4, 1, o.shine || '#ffffff', 0.9);
    cv.line(g[0] - px * bw * 0.6, g[1] - py * bw * 0.6, n[0] - px * bw * 0.5, n[1] - py * bw * 0.5, 1, o.edge || '#8ea3b5');
    const gw = o.guard || 5;
    cv.line(g[0] + px * gw, g[1] + py * gw, g[0] - px * gw, g[1] - py * gw, 2.4, o.gold || '#d8a23c');
    cv.line(x0, y0, g[0], g[1], 2.4, o.hilt || '#5a2d14');
    cv.circle(x0, y0, 1.8, o.gold || '#d8a23c');
    if (o.tassel) cv.path([[x0, y0], [x0 - px * 3 + ux * -2, y0 - py * 3 + uy * -2], [x0 - px * 2 + ux * -5, y0 - py * 2 + uy * -5]], 1.4, o.tassel);
  }

  function arrow(cv, x0, y0, x1, y1, o = {}) {
    const [ux, uy] = unit(x0, y0, x1, y1);
    const px = -uy; const py = ux;
    cv.line(x0, y0, x1 - ux * 2, y1 - uy * 2, o.w || 1, o.shaft || '#9b6a35');
    cv.poly([[x1 + ux * 1.5, y1 + uy * 1.5], [x1 - ux * 3 + px * 2, y1 - uy * 3 + py * 2], [x1 - ux * 3 - px * 2, y1 - uy * 3 - py * 2]], o.head || '#cfd8de');
    cv.line(x0, y0, x0 - ux * 2 + px * 2, y0 - uy * 2 + py * 2, 1, o.fletch || '#f2efe6');
    cv.line(x0, y0, x0 - ux * 2 - px * 2, y0 - uy * 2 - py * 2, 1, o.fletch || '#f2efe6');
  }

  function leaf(cv, x, y, ang, len, c = '#4f9a3a') {
    const ux = Math.cos(ang); const uy = Math.sin(ang);
    const px = -uy; const py = ux;
    cv.poly([[x, y], [x + ux * len * 0.5 + px * len * 0.28, y + uy * len * 0.5 + py * len * 0.28], [x + ux * len, y + uy * len], [x + ux * len * 0.5 - px * len * 0.28, y + uy * len * 0.5 - py * len * 0.28]], c);
    cv.line(x, y, x + ux * len * 0.85, y + uy * len * 0.85, 1, shade(c, -0.3));
  }

  function peach(cv, cx, cy, r) {
    cv.circle(cx, cy, r, '#e8606a');
    cv.circle(cx - r * 0.18, cy - r * 0.15, r * 0.78, '#f6897e');
    cv.circle(cx - r * 0.35, cy - r * 0.35, r * 0.38, '#ffc9a8');
    cv.path([[cx + r * 0.1, cy - r], [cx + r * 0.25, cy - r * 0.2], [cx + r * 0.1, cy + r * 0.6]], 1, '#c2404e');
    leaf(cv, cx + 1, cy - r + 1, -2.2, r * 1.2, '#4f9a3a');
    leaf(cv, cx + 1, cy - r + 1, -0.6, r * 1.0, '#6cb84a');
  }

  function cloud(cv, cx, cy, s, c, a = 1) {
    cv.ellipse(cx, cy, s * 1.6, s * 0.8, c, a);
    cv.circle(cx - s * 0.8, cy - s * 0.3, s * 0.75, c, a);
    cv.circle(cx + s * 0.3, cy - s * 0.6, s * 0.95, c, a);
    cv.circle(cx + s * 1.1, cy - s * 0.1, s * 0.6, c, a);
  }

  function figure(cv, x, y, c, a = 1) {
    cv.circle(x, y, 3.6, c, a);
    cv.poly([[x - 3, y + 4], [x + 3, y + 4], [x + 5, y + 14], [x - 2, y + 15]], c, a);
    cv.line(x + 3, y + 6, x + 10, y + 3, 2, c, a);
    cv.line(x - 2, y + 6, x - 8, y + 11, 2, c, a);
    cv.line(x + 3, y + 14, x + 9, y + 21, 2.4, c, a);
    cv.line(x - 1, y + 14, x - 7, y + 19, 2.4, c, a);
  }

  const HORSE = [[30, 40], [35, 22], [33, 11], [29, 5], [27, 0], [25, 5], [22, 3], [20, 6], [12, 12], [4, 20], [1, 25], [3, 29], [8, 30], [14, 27], [18, 26], [15, 40]];
  const MANE = [[29, 5], [35, 9], [40, 20], [39, 36], [34, 38], [35, 22], [33, 11]];
  function horse(cv, ox, oy, s, body, mane, mark) {
    const t = (pts) => pts.map(([x, y]) => [ox + x * s, oy + y * s]);
    cv.poly(t(MANE), mane);
    cv.poly(t(HORSE), body);
    cv.poly(t([[20, 6], [12, 12], [4, 20], [6, 21], [14, 14], [22, 9]]), shade(body, 0.25));
    if (mark) cv.poly(t([[13, 13], [9, 18], [11, 19], [15, 15]]), mark);
    const [ex, ey] = [ox + 18 * s, oy + 11 * s];
    cv.circle(ex, ey, 1.4 * s * 0.8, '#ffffff').circle(ex, ey, 0.9 * s * 0.8, INK);
    cv.circle(ox + 4.5 * s, oy + 25 * s, 0.8 * s, shade(body, -0.5));
    cv.path(t([[26, 7], [21, 15], [8, 22]]), Math.max(1, s * 0.7), '#7a3a1c');
    cv.circle(ox + 21 * s, oy + 15 * s, s * 0.9, '#e0b040');
  }

  function flames(cv, seed, y0, h, w, a = 0.85) {
    const r = rng(seed);
    for (let x = -2; x < w + 2; x += 3) {
      const fh = h * (0.5 + r() * 0.6);
      cv.poly([[x - 2, y0], [x + 1 + r() * 2, y0 - fh], [x + 4, y0]], '#e8541c', a);
      cv.poly([[x - 0.5, y0], [x + 1.5, y0 - fh * 0.6], [x + 3, y0]], '#ffc23a', a);
    }
  }

  // ───────────────────────── cards ─────────────────────────
  const C = SPECS.cards;
  const CARD = {};
  const card = (key, bg, draw) => { CARD[key] = { bg, draw }; };

  card('attack', ['#b3261e', '#2a0605', '#ff9d5c'], (L) => {
    for (let i = 0; i < 3; i++) L.line(6, 30 + i * 9, 60, 58 + i * 9, 1, '#ffe7c2', 0.55);
    sword(L, 15, 72, 52, 18, { w: 2.6, tassel: '#d4302a' });
  });
  card('dodge', ['#2d6f8e', '#08202b', '#9fe3ff'], (L) => {
    figure(L, 20, 30, '#1c3f52', 0.3);
    figure(L, 27, 29, '#2a5a74', 0.5);
    figure(L, 35, 28, '#dfeef5');
    for (let i = 0; i < 4; i++) L.line(8, 34 + i * 4, 22, 34 + i * 4, 1, '#bfefff', 0.6);
    arrow(L, 6, 58, 58, 52, { w: 1.4 });
  });
  card('peach', ['#e27a8a', '#3a0f1a', '#ffe0a0'], (L) => {
    peach(L, 25, 46, 11);
    peach(L, 42, 51, 12);
    sparkles(L, 11, 6, [10, 20, 46, 20]);
  });
  card('dismantle', ['#6a4a8a', '#1a1026', '#f0a060'], (L) => {
    L.rect(0, 60, 66, 18, '#2f5f8f');
    for (let i = 0; i < 4; i++) L.line(4 + i * 16, 64 + (i % 2) * 5, 12 + i * 16, 64 + (i % 2) * 5, 1, '#9ccbee');
    L.line(2, 44, 27, 38, 4, '#8a5a30').line(39, 38, 64, 44, 4, '#8a5a30');
    L.rect(6, 44, 4, 17, '#6f4424').rect(56, 44, 4, 17, '#6f4424');
    L.line(29, 44, 33, 52, 2.5, '#8a5a30').line(36, 47, 34, 57, 2.5, '#8a5a30');
    for (let i = 0; i < 5; i++) L.circle(30 + i * 2, 61 - (i % 2) * 2, 1.4, '#dff4ff');
    L.line(26, 30, 40, 20, 2, '#cfd8de').line(38, 18, 44, 24, 3, '#6f4424');
  });
  card('steal', ['#3c5a2a', '#0d170a', '#ffd35c'], (L) => {
    L.circle(30, 56, 12, '#8a5a30').circle(27, 52, 7, '#a8733f');
    L.rect(24, 42, 12, 4, '#6f4424').line(30, 43, 36, 38, 1.5, '#d8a23c');
    for (const [x, y] of [[44, 66], [49, 63], [14, 68]]) { L.circle(x, y, 3.2, '#f0c040'); L.rect(x - 0.5, y - 0.5, 1, 1, '#9a6a10'); }
    L.poly([[66, 12], [66, 24], [48, 36], [42, 34], [44, 28]], '#e9b98c');
    for (let i = 0; i < 4; i++) L.line(44 - i, 30 + i * 1.5, 36 - i, 34 + i * 2, 2, '#e9b98c');
    L.poly([[66, 10], [66, 20], [58, 22], [56, 14]], '#3a2a5a');
  });
  card('duel', ['#c0561e', '#2a0c05', '#ffe08a'], (L) => {
    sword(L, 12, 74, 50, 18, { w: 2.2 });
    sword(L, 54, 74, 16, 18, { w: 2.2, blade: '#e8d9b0' });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; L.line(33, 40, 33 + Math.cos(a) * 9, 40 + Math.sin(a) * 9, 1, '#fff3b0'); }
    L.circle(33, 40, 3, '#ffffff');
  });
  card('barbarian', ['#4a7a2a', '#101c08', '#e8c050'], (L) => {
    L.rect(0, 70, 66, 8, '#3a2a14');
    L.ellipse(36, 50, 18, 12, '#8d8a86');
    L.circle(18, 44, 9, '#9a9793');
    L.ellipse(22, 42, 6, 8, '#7a7672');
    L.path([[11, 46], [8, 54], [9, 62], [12, 66]], 3.4, '#9a9793');
    L.path([[13, 50], [6, 50], [4, 47]], 1.6, '#f4efe0');
    for (const x of [24, 32, 44, 50]) L.rect(x, 56, 5, 14, '#7f7c78');
    L.circle(15, 42, 1.1, INK);
    L.rect(32, 34, 12, 5, '#b8302a').line(38, 34, 40, 14, 1.2, '#6f4424');
    L.poly([[40, 14], [52, 17], [40, 21]], '#d8a23c');
  });
  card('arrows', ['#5a6a8a', '#10141f', '#d0d8ff'], (L) => {
    const r = rng(hash('arrows'));
    for (let i = 0; i < 13; i++) {
      const x = -6 + r() * 60; const y = -4 + r() * 58;
      arrow(L, x, y, x + 14, y + 18);
    }
  });
  card('peachgarden', ['#f0a0b8', '#3a1a2a', '#fff0c0'], (L) => {
    L.rect(0, 70, 66, 8, '#5a8a3a');
    L.poly([[30, 72], [36, 72], [35, 48], [31, 48]], '#6f4424');
    L.path([[33, 50], [20, 38], [12, 34]], 2.4, '#6f4424').path([[33, 48], [46, 36], [54, 33]], 2.4, '#6f4424').line(33, 46, 34, 30, 2, '#6f4424');
    const r = rng(hash('garden'));
    for (let i = 0; i < 26; i++) L.circle(8 + r() * 50, 20 + r() * 26, 2 + r() * 2, r() < 0.3 ? '#fff0f4' : '#f48fb1');
    for (const x of [18, 33, 48]) { L.poly([[x - 3, 64], [x + 3, 64], [x + 2, 69], [x - 2, 69]], '#d8a23c'); L.rect(x - 1, 69, 2, 2, '#b8862c'); }
  });
  card('harvest', ['#e0a830', '#3a2206', '#fff2a0'], (L) => {
    L.circle(33, 30, 14, '#ffe28a', 0.6);
    for (let i = -4; i <= 4; i++) {
      const tx = 33 + i * 4; const ty = 22 + Math.abs(i) * 2;
      L.line(33 + i * 0.6, 72, tx, ty, 1, '#b8862c');
      for (let k = 0; k < 4; k++) L.ellipse(tx + (k % 2 ? 1.2 : -1.2), ty + k * 2.2, 1.3, 1.8, '#f2c94c');
    }
    L.rect(26, 56, 14, 4, '#b8302a');
  });
  card('exnihilo', ['#7a3ab0', '#150626', '#ffd0ff'], (L) => {
    L.rect(12, 56, 42, 10, '#f2e6c4').rect(12, 56, 42, 2, '#d8c89c');
    L.rect(9, 54, 4, 14, '#8a5a30').rect(53, 54, 4, 14, '#8a5a30');
    for (let i = 0; i < 4; i++) L.line(17, 60 + i * 1.5, 48 - i * 3, 60 + i * 1.5, 1, '#8a6a4a', 0.6);
    L.circle(22, 36, 4, '#f0c040');
    peach(L, 42, 32, 5);
    sword(L, 30, 48, 34, 18, { w: 1.4, guard: 3 });
    sparkles(L, 5, 9, [8, 12, 50, 40], '#ffe6ff');
  });
  card('borrowsword', ['#5a5a66', '#111118', '#c0c8ff'], (L) => {
    sword(L, 18, 46, 62, 46, { w: 2.2 });
    L.ellipse(13, 47, 6, 5, '#e9b98c');
    L.rect(0, 44, 9, 7, '#8a2a2a');
    L.ellipse(44, 54, 5, 4, '#b8a8e0', 0.75);
    L.rect(47, 52, 19, 7, '#4a3a7a', 0.75);
    L.line(38, 52, 40, 48, 2, '#b8a8e0', 0.75);
  });
  card('negate', ['#3a7ac0', '#08162a', '#e0f4ff'], (L) => {
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; L.line(33 + Math.cos(a) * 20, 42 + Math.sin(a) * 20, 33 + Math.cos(a) * 27, 42 + Math.sin(a) * 27, 1, '#d8f0ff', 0.7); }
    L.circle(33, 42, 18, '#bfe6ff', 0.5).circle(33, 42, 15, '#2b5f9a');
    L.poly([[33, 28], [44, 32], [42, 48], [33, 56], [24, 48], [22, 32]], '#e8f6ff');
    L.poly([[33, 32], [40, 35], [38, 47], [33, 52], [28, 47], [26, 35]], '#6fb4e8');
    L.line(33, 34, 33, 50, 1, '#ffffff').line(28, 41, 38, 41, 1, '#ffffff');
  });
  card('indulgence', ['#c07a3a', '#2a1206', '#ffd890'], (L) => {
    L.ellipse(26, 54, 11, 13, '#6f4424').rect(21, 38, 10, 6, '#6f4424');
    L.ellipse(26, 37, 7, 3, '#b8302a').ellipse(22, 52, 4, 6, '#8a5a30');
    L.poly([[40, 58], [50, 58], [48, 66], [42, 66]], '#d8a23c').rect(44, 66, 2, 3, '#b8862c');
    for (const [x, y] of [[44, 24], [52, 34], [36, 18]]) { L.circle(x, y, 2, '#fff3d0'); L.line(x + 1.5, y, x + 1.5, y - 7, 1, '#fff3d0').line(x + 1.5, y - 7, x + 4, y - 5, 1, '#fff3d0'); }
  });
  card('lightning', ['#3a3a5a', '#0a0a14', '#fff7b0'], (L) => {
    cloud(L, 33, 20, 9, '#4a4a66');
    cloud(L, 22, 22, 6, '#5a5a78');
    L.poly([[36, 24], [24, 46], [32, 46], [22, 72], [44, 40], [35, 40], [42, 24]], '#ffe14a');
    L.poly([[36, 28], [28, 44], [33, 44], [27, 62], [39, 42], [33, 42], [38, 28]], '#fffbe0');
    for (let i = 0; i < 5; i++) L.line(22, 72, 14 + i * 4, 76, 1, '#ffe14a');
  });

  // อาวุธ
  const STEEL = ['#6a7a8a', '#12161c'];
  card('crossbow', [...STEEL, '#ffd28a'], (L) => {
    L.line(33, 26, 33, 76, 4, '#7a4a24');
    L.path([[10, 38], [18, 30], [33, 27], [48, 30], [56, 38]], 3, '#5a3418');
    L.line(10, 38, 33, 46, 1, '#e8e0c8').line(56, 38, 33, 46, 1, '#e8e0c8');
    L.rect(28, 16, 10, 12, '#8a5a30').rect(29, 17, 8, 2, '#d8a23c');
    arrow(L, 33, 44, 33, 12);
  });
  card('double_swords', [...STEEL, '#ffe3a0'], (L) => {
    sword(L, 18, 74, 44, 14, { w: 2.2, blade: '#f2d98a', edge: '#b8962c', tassel: '#d4302a' });
    sword(L, 48, 74, 22, 14, { w: 2.2, tassel: '#3a6ad4' });
  });
  card('blue_steel', ['#3a5a8a', '#0a1426', '#8fd0ff'], (L) => {
    L.ellipse(33, 38, 7, 26, '#8fd0ff', 0.35);
    sword(L, 33, 76, 33, 10, { w: 3, blade: '#a8dcff', edge: '#4a8ac8', shine: '#ffffff' });
  });
  card('frost_blade', ['#7ab8d8', '#0c2230', '#ffffff'], (L) => {
    sword(L, 16, 74, 50, 14, { w: 2.8, blade: '#e8fbff', edge: '#7ac8e8' });
    for (const [x, y, s] of [[40, 24, 4], [22, 40, 3], [48, 46, 3], [30, 58, 2.5], [14, 24, 2.5]]) {
      L.poly([[x, y - s], [x + s * 0.6, y], [x, y + s], [x - s * 0.6, y]], '#c8f4ff');
      L.px(x, y, '#ffffff');
    }
  });
  card('green_dragon', ['#2a6a4a', '#08180f', '#b0ffc8'], (L) => {
    L.line(18, 82, 44, 22, 2.6, '#8a3a1c');
    L.poly([[40, 26], [44, 8], [52, 6], [58, 14], [54, 26], [47, 30]], '#cfe0d6');
    L.poly([[44, 22], [47, 10], [52, 9], [55, 15], [52, 24]], '#5fbf7f');
    L.circle(43, 28, 3.5, '#2e9c55').px(42, 27, '#ffe14a');
    L.path([[41, 32], [36, 38], [38, 44]], 1.6, '#d4302a');
  });
  card('serpent_spear', ['#5a3a6a', '#130b18', '#ffc0a0'], (L) => {
    L.line(24, 84, 40, 30, 2.4, '#5a3418');
    L.path([[40, 30], [44, 24], [39, 19], [44, 13], [40, 8], [43, 3]], 2.6, '#d9e2ea');
    L.path([[40, 30], [44, 24], [39, 19], [44, 13], [40, 8], [43, 3]], 1, '#8ea3b5');
    L.circle(39, 33, 3.4, '#d4302a');
  });
  card('axe', ['#7a5a3a', '#1a1008', '#ffd8a0'], (L) => {
    L.line(24, 82, 40, 20, 2.8, '#6f4424');
    L.poly([[34, 18], [26, 10], [22, 22], [26, 34], [36, 28]], '#cfd8de');
    L.poly([[42, 22], [54, 16], [58, 30], [50, 40], [40, 32]], '#cfd8de');
    L.line(26, 12, 23, 22, 1, '#ffffff').line(55, 18, 57, 30, 1, '#ffffff');
    L.circle(39, 25, 3, '#d8a23c');
  });
  card('halberd', ['#8a3a2a', '#1c0806', '#ffd080'], (L) => {
    L.line(22, 84, 42, 16, 2.4, '#5a3418');
    L.poly([[42, 16], [44, 3], [47, 15]], '#dfe7ee');
    L.poly([[36, 30], [28, 22], [30, 34]], '#dfe7ee').poly([[46, 34], [56, 28], [50, 40]], '#dfe7ee');
    L.path([[36, 30], [30, 28], [28, 22]], 1, '#8ea3b5').path([[46, 34], [52, 34], [56, 28]], 1, '#8ea3b5');
    L.circle(40, 22, 2.8, '#d8a23c');
    L.path([[38, 36], [34, 42], [36, 48]], 1.6, '#d4302a');
  });
  card('kylin_bow', ['#8a6a2a', '#1a1206', '#fff0a0'], (L) => {
    L.path([[22, 10], [16, 22], [14, 40], [16, 58], [22, 72]], 3, '#8a3a1c');
    L.line(22, 10, 22, 72, 1, '#f2efe6');
    L.circle(15, 40, 3.6, '#d8a23c').px(14, 39, '#ffffff');
    arrow(L, 22, 40, 60, 40, { w: 1.2 });
  });
  card('eight_trigrams', ['#5a4a2a', '#120e06', '#ffe6a0'], (L) => {
    const oct = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; oct.push([33 + Math.cos(a) * 24, 42 + Math.sin(a) * 24]); }
    L.poly(oct, '#2a1a10');
    const TRI = ['111', '011', '101', '001', '110', '010', '100', '000'];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const ux = Math.cos(a); const uy = Math.sin(a); const px = -uy; const py = ux;
      for (let k = 0; k < 3; k++) {
        const d = 13 + k * 3.2; const cx = 33 + ux * d; const cy = 42 + uy * d; const hl = 4;
        if (TRI[i][k] === '1') L.line(cx - px * hl, cy - py * hl, cx + px * hl, cy + py * hl, 1.6, '#e0b040');
        else { L.line(cx - px * hl, cy - py * hl, cx - px * 1.2, cy - py * 1.2, 1.6, '#e0b040'); L.line(cx + px * 1.2, cy + py * 1.2, cx + px * hl, cy + py * hl, 1.6, '#e0b040'); }
      }
    }
    L.circle(33, 42, 8, '#f4efe0');
    L.poly([[33, 34], [36, 36], [37, 40], [33, 42], [29, 44], [29, 48], [33, 50], [39, 47], [41, 42], [39, 37]], '#1a1a1a');
    L.circle(33, 38, 1.4, '#1a1a1a').circle(33, 46, 1.4, '#f4efe0');
  });
  card('renwang', ['#6a4a2a', '#140c06', '#ffe0a0'], (L) => {
    L.circle(33, 42, 23, '#8a5a24').circle(33, 42, 20, '#c9953f').circle(33, 42, 13, '#8a5a24').circle(33, 42, 10, '#e0b04a');
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; L.circle(33 + Math.cos(a) * 16.5, 42 + Math.sin(a) * 16.5, 1.1, '#fff0b0'); }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; L.line(33, 42, 33 + Math.cos(a) * 8, 42 + Math.sin(a) * 8, 1.4, '#8a5a24'); }
    L.circle(33, 42, 4, '#fff0b0').circle(33, 42, 2, '#c9953f');
  });
  // ม้า
  const HORSES = {
    jueying: ['#2a2a30', '#111116', null, 'def'], dilu: ['#eeeae2', '#9a9a9a', '#ffffff', 'def'], zhuahuang: ['#e0b848', '#8a6a1a', '#fff2c0', 'def'],
    chitu: ['#c0301e', '#5a0e06', null, 'off'], dawan: ['#8a5a30', '#3a2210', '#e8d0a0', 'off'], zixing: ['#7a4a9a', '#2e1640', null, 'off'],
  };
  for (const [key, [body, mane, mark, kind]] of Object.entries(HORSES)) {
    card(key, kind === 'def' ? ['#3a5a8a', '#0a1426', '#b0d0ff'] : ['#8a3a3a', '#1c0808', '#ffc0a0'], (L) => {
      horse(L, 6, 18, 1.35, body, mane, mark);
      if (kind === 'off') for (let i = 0; i < 4; i++) L.line(50, 26 + i * 8, 64, 26 + i * 8, 1, '#ffd0b0', 0.6);
    });
  }

  function renderCard(key) {
    const d = CARD[key];
    if (!d) throw new Error(`no design for card ${key}`);
    const [top, bottom, glow] = d.bg;
    return compose(background(C.w, C.h, hash(`card:${key}`), top, bottom, glow), d.draw);
  }

  // ───────────────────────── heroes ─────────────────────────
  const KINGDOM = {
    shu: ['#d0483a', '#2a0806'], wei: ['#3f7fe0', '#081630'], wu: ['#34a860', '#062512'], qun: ['#9a88aa', '#141019'],
  };
  const SKIN = '#e9b98c';
  const HERO = {
    liubei: { k: 'shu', beard: 'goatee', brow: 'calm', hat: 'crown', cloth: '#b8302a', trim: '#e0b040', back: 'twinswords' },
    guanyu: { k: 'shu', skin: '#c0402e', beard: 'long', brow: 'angry', eyes: 'narrow', hat: 'hood', hatColor: '#2e8a4a', cloth: '#2e8a4a', trim: '#e0b040', back: 'guandao' },
    zhangfei: { k: 'shu', skin: '#b07a52', beard: 'wild', brow: 'angry', hat: 'band', hatColor: '#3a3a3a', cloth: '#3a3a3a', armor: '#6a6a70', back: 'spear' },
    zhugeliang: { k: 'shu', beard: 'thin', brow: 'calm', eyes: 'narrow', hat: 'scholar', hatColor: '#2c3a4a', cloth: '#ece6d6', trim: '#2c3a4a', front: 'fan', bg: 'stars' },
    zhaoyun: { k: 'shu', brow: 'calm', hat: 'helmet', metal: '#d8dee6', plume: '#d4302a', cloth: '#f0f0f0', armor: '#c8d0da', back: 'spear' },
    machao: { k: 'shu', brow: 'angry', hat: 'helmet', metal: '#e6e6ea', plume: '#ffffff', cloth: '#dcdcdc', armor: '#b8bcc4', back: 'spear' },
    huangyueying: { k: 'shu', female: true, brow: 'soft', hat: 'bun', hair: '#3a2a1a', flower: '#e0b040', cloth: '#6a8a3a', trim: '#e0b040', front: 'gear' },
    caocao: { k: 'wei', beard: 'goatee', brow: 'angry', eyes: 'narrow', hat: 'futou', cloth: '#2a3a6a', trim: '#e0b040', back: 'sword' },
    simayi: { k: 'wei', beard: 'thin', brow: 'angry', eyes: 'narrow', hat: 'scholar', hatColor: '#1a1a26', cloth: '#3a2a5a', trim: '#8a8aa0' },
    xiahoudun: { k: 'wei', beard: 'short', brow: 'angry', eyes: 'patch', hat: 'helmet', metal: '#5a6a8a', plume: '#2a4a9a', cloth: '#2a4a8a', armor: '#6a7a9a' },
    zhangliao: { k: 'wei', beard: 'mustache', brow: 'angry', hat: 'helmet', metal: '#7a8aa8', plume: '#1a2a6a', cloth: '#1f3a7a', armor: '#8a9ab8', back: 'halberd' },
    xuchu: { k: 'wei', beard: 'stubble', brow: 'angry', hat: 'bald', cloth: 'skin', front: 'belt' },
    guojia: { k: 'wei', skin: '#f2d4b8', brow: 'soft', hat: 'topknot', cloth: '#dcd6e8', trim: '#5a6aa0', front: 'cup' },
    zhenji: { k: 'wei', female: true, brow: 'soft', hat: 'bun', hair: '#1a1a2a', flower: '#9ad0ff', cloth: '#8aa0d8', trim: '#e8f0ff', bg: 'water' },
    sunquan: { k: 'wu', beard: 'short', beardColor: '#5a2a5a', hair: '#3a1a3a', brow: 'calm', hat: 'crown', cloth: '#2e7a44', trim: '#e0b040' },
    ganning: { k: 'wu', brow: 'angry', hat: 'band', hatColor: '#d4302a', hair: '#2a1a10', cloth: '#6a3a1a', trim: '#e0b040', front: 'bells' },
    lumeng: { k: 'wu', beard: 'short', brow: 'calm', hat: 'helmet', metal: '#6a8a6a', plume: '#2e9c55', cloth: '#2e6a3a', armor: '#7a9a7a', front: 'book' },
    huanggai: { k: 'wu', hair: '#a8a8a8', beard: 'full', brow: 'angry', hat: 'topknot', cloth: '#5a4a2a', armor: '#7a6a4a', front: 'whip' },
    zhouyu: { k: 'wu', skin: '#f0c8a0', brow: 'calm', hat: 'topknot', pin: '#6fd08a', cloth: '#2e9c55', trim: '#ffe08a', bg: 'flames' },
    daqiao: { k: 'wu', female: true, brow: 'soft', hat: 'bun', hair: '#2a1a1a', flower: '#f48fb1', cloth: '#e88aa8', trim: '#fff0f4', back: 'parasol' },
    luxun: { k: 'wu', skin: '#f0c8a0', brow: 'calm', hat: 'scholar', hatColor: '#2e5a3a', cloth: '#3aa060', trim: '#e8f6ea', bg: 'flames' },
    sunshangxiang: { k: 'wu', female: true, brow: 'angry', hat: 'bun', hair: '#3a1a10', flower: '#d4302a', cloth: '#c0392b', armor: '#e0b040', back: 'bow' },
    huatuo: { k: 'qun', hair: '#eeeeee', beard: 'long', beardColor: '#eeeeee', brow: 'calm', eyes: 'narrow', hat: 'topknot', cloth: '#7a7a6a', trim: '#e0d8b0', front: 'gourd' },
    lvbu: { k: 'qun', brow: 'angry', hat: 'feathers', metal: '#d8a23c', plume: '#d8452a', cloth: '#8a1a1a', armor: '#c9953f', back: 'halberd' },
    diaochan: { k: 'qun', female: true, brow: 'soft', hat: 'bun', hair: '#1a1020', flower: '#c8a0ff', cloth: '#a05ab0', trim: '#ffe0ff', bg: 'moon' },
  };

  function heroBackdrop(cv, h, seed) {
    if (h.bg === 'moon') { cv.circle(35, 12, 9, '#fff6c8', 0.9); cv.circle(38, 10, 8, '#fff6c8', 0.35); }
    if (h.bg === 'stars') sparkles(cv, seed, 10, [2, 2, 44, 24], '#e8f0ff');
    if (h.bg === 'flames') flames(cv, seed, 48, 20, 48, 0.7);
    if (h.bg === 'water') for (let i = 0; i < 4; i++) for (let x = 0; x < 48; x += 8) cv.path([[x, 42 - i * 4], [x + 2, 40 - i * 4], [x + 4, 42 - i * 4], [x + 6, 44 - i * 4], [x + 8, 42 - i * 4]], 1, '#bfe6ff', 0.5);
  }

  function heroBack(L, h) {
    switch (h.back) {
      case 'twinswords':
        sword(L, 12, 12, 4, 44, { w: 1.6, guard: 3 });
        sword(L, 36, 12, 44, 44, { w: 1.6, guard: 3 });
        break;
      case 'guandao':
        L.line(41, 48, 43, 8, 1.8, '#8a3a1c');
        L.poly([[42, 10], [44, 1], [47, 2], [47, 12], [44, 14]], '#cfe0d6').poly([[44, 10], [45, 3], [46, 4], [46, 11]], '#5fbf7f');
        break;
      case 'spear':
        L.line(7, 48, 9, 6, 1.5, '#6f4424');
        L.poly([[9, 6], [7.5, 0], [11, 5]], '#dfe7ee').circle(9, 8, 1.8, '#d4302a');
        break;
      case 'halberd':
        L.line(41, 48, 43, 6, 1.6, '#5a3418');
        L.poly([[43, 6], [44, 0], [45, 6]], '#dfe7ee').poly([[42, 12], [38, 8], [39, 14]], '#dfe7ee').poly([[44, 13], [48, 9], [47, 15]], '#dfe7ee');
        break;
      case 'sword':
        sword(L, 38, 14, 45, 44, { w: 1.6, guard: 3 });
        break;
      case 'bow':
        L.path([[40, 6], [45, 18], [46, 30], [43, 44]], 1.8, '#8a3a1c').line(40, 6, 43, 44, 1, '#f2efe6');
        break;
      case 'parasol':
        L.line(30, 4, 42, 46, 1.2, '#8a5a30');
        L.poly([[12, 8], [20, 2], [30, 0], [40, 2], [48, 8]], '#f8c0d0');
        for (const x of [20, 30, 40]) L.line(30, 1, x, 7, 1, '#e88aa8');
        break;
      default: break;
    }
  }

  function heroFront(L, h) {
    switch (h.front) {
      case 'fan':
        L.poly([[33, 47], [30, 38], [33, 31], [39, 29], [45, 32], [46, 39], [41, 45], [36, 47]], '#f4f4f0');
        for (const [x, y] of [[31, 36], [35, 31], [41, 30], [45, 35], [44, 41]]) L.line(34, 46, x, y, 1, '#b8b8b0');
        L.line(34, 46, 36, 48, 2, '#8a5a30');
        break;
      case 'gear':
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; L.circle(38 + Math.cos(a) * 5.5, 41 + Math.sin(a) * 5.5, 1.4, '#b8862c'); }
        L.circle(38, 41, 5, '#d8a23c').circle(38, 41, 1.6, '#5a3a14');
        break;
      case 'cup':
        L.ellipse(37, 43, 4, 3, SKIN);
        L.poly([[33, 36], [41, 36], [40, 41], [34, 41]], '#d8a23c').rect(33, 36, 8, 1, '#fff0b0');
        break;
      case 'book':
        L.rect(31, 38, 13, 9, '#2a4a8a').rect(32, 39, 11, 1, '#f2e6c4').rect(37, 38, 1, 9, '#1a2a5a');
        break;
      case 'bells':
        for (const [x, y] of [[11, 40], [14, 43], [34, 42], [37, 45]]) { L.circle(x, y, 1.8, '#f0c040'); L.px(x, y + 1, '#8a6a10'); }
        break;
      case 'whip':
        for (let i = 0; i < 6; i++) L.circle(37 + i * 1.2, 47 - i * 3, 1.5, i % 2 ? '#6a6a70' : '#9a9aa2');
        break;
      case 'gourd':
        L.circle(38, 42, 4, '#c8762a').circle(38, 36.5, 2.6, '#c8762a').rect(37.5, 33, 1, 2, '#6f4424').line(36, 39, 40, 39, 1, '#d4302a');
        break;
      case 'belt':
        L.rect(10, 44, 28, 3, '#6f4424').rect(22, 43.5, 4, 4, '#d8a23c');
        break;
      default: break;
    }
  }

  function renderHero(id) {
    const h = HERO[id];
    if (!h) throw new Error(`no design for hero ${id}`);
    const H = SPECS.heroes;
    const seed = hash(`hero:${id}`);
    const [light, dark] = KINGDOM[h.k];
    const r = rng(seed);
    const bg = new Canvas(H.w, H.h).fill((x, y) => {
      const d = Math.min(1, Math.hypot(x - 24, y - 18) / 32);
      const c = mix(light, dark, d);
      const n = (r() - 0.5) * 10;
      return [c[0] + n, c[1] + n, c[2] + n];
    });
    heroBackdrop(bg, h, seed);

    const skin = h.skin || (h.female ? '#f2c9a4' : SKIN);
    const hair = h.hair || '#1b1410';
    const beardC = h.beardColor || hair;
    const cloth = h.cloth === 'skin' ? skin : h.cloth;
    const L = new Canvas(H.w, H.h);

    heroBack(L, h);
    if (h.female) L.poly([[14, 16], [34, 16], [36, 40], [12, 40]], hair);

    // ลำตัวและไหล่
    L.poly([[3, 48], [7, 38], [16, 33], [32, 33], [41, 38], [45, 48]], cloth);
    if (h.cloth === 'skin') {
      L.line(18, 38, 22, 42, 1, shade(skin, -0.25)).line(30, 38, 26, 42, 1, shade(skin, -0.25));
      L.line(24, 40, 24, 46, 1, shade(skin, -0.25));
    } else {
      L.poly([[20, 33], [28, 33], [24, 40]], shade(skin, -0.08));
      if (h.trim) L.path([[18, 33], [24, 42], [30, 33]], 1.4, h.trim);
    }
    if (h.armor) {
      L.ellipse(9, 39, 6, 4, h.armor).ellipse(39, 39, 6, 4, h.armor);
      L.line(4, 40, 14, 38, 1, shade(h.armor, 0.35)).line(34, 38, 44, 40, 1, shade(h.armor, 0.35));
      L.rect(15, 42, 18, 1, shade(h.armor, -0.3));
    }

    // คอและหน้า
    L.rect(21, 29, 6, 5, shade(skin, -0.15));
    if (!['helmet', 'feathers', 'hood'].includes(h.hat) && !h.female) L.ellipse(15.5, 23, 1.6, 2.4, shade(skin, -0.1)).ellipse(32.5, 23, 1.6, 2.4, shade(skin, -0.1));
    L.ellipse(24, 22, 8.5, 10, skin);
    L.ellipse(19, 26, 1.8, 1, shade(skin, h.female ? 0.15 : -0.04), 0.6);
    L.ellipse(29, 26, 1.8, 1, shade(skin, h.female ? 0.15 : -0.04), 0.6);
    L.rect(16, 25, 1, 4, shade(skin, -0.12)).rect(31, 25, 1, 4, shade(skin, -0.12));

    // ผมด้านบน
    if (h.hat !== 'bald') {
      L.poly([[15, 21], [15.5, 15], [19, 11], [24, 10], [29, 11], [32.5, 15], [33, 21], [31, 17], [27, 14.5], [21, 14.5], [17, 17]], hair);
    } else {
      L.rect(15, 18, 2, 5, hair).rect(31, 18, 2, 5, hair);
      L.px(21, 14, shade(skin, 0.4)).px(22, 14, shade(skin, 0.4));
    }

    // ตาและคิ้ว
    const eye = (x, flip) => {
      if (h.eyes === 'narrow') { L.rect(x, 22, 3, 1, INK); return; }
      L.rect(x, 22, 3, 1.4, '#ffffff');
      L.rect(flip ? x : x + 1, 22, 2, 1.4, INK);
      if (h.female) L.rect(x - 0.5, 21, 3.5, 1, INK);
    };
    eye(19, false);
    if (h.eyes === 'patch') {
      L.ellipse(28.5, 22.5, 3, 2.4, '#111111');
      L.line(15, 18, 33, 21, 1, '#111111');
    } else eye(26, true);
    const bc = h.hat === 'bald' ? '#3a2a20' : hair;
    if (h.brow === 'angry') L.line(18, 18.5, 22.5, 20.5, 1.3, bc).line(25.5, 20.5, 30, 18.5, 1.3, bc);
    else if (h.brow === 'soft') L.line(18.5, 19.5, 22, 19, 1, bc).line(26, 19, 29.5, 19.5, 1, bc);
    else L.line(18, 19.5, 22.5, 19.5, 1.2, bc).line(25.5, 19.5, 30, 19.5, 1.2, bc);

    // จมูก ปาก
    L.rect(24, 24, 1, 2, shade(skin, -0.22));
    if (h.female) L.ellipse(24.5, 28.6, 1.8, 0.9, '#c8404a');
    else L.rect(22.5, 28, 4, 1, shade(skin, -0.45));

    // หนวดเครา
    const must = (w = 1) => L.line(20, 27.5, 23.5, 26.8, w, beardC).line(25.5, 26.8, 29, 27.5, w, beardC);
    switch (h.beard) {
      case 'long':
        L.poly([[17, 25], [20, 29], [24, 30], [28, 29], [31, 25], [31, 30], [28, 38], [24, 47], [20, 38], [17, 30]], beardC);
        must(1.4);
        break;
      case 'wild':
        L.poly([[15, 20], [17, 27], [20, 30], [24, 31], [28, 30], [31, 27], [33, 20], [34, 28], [32, 34], [30, 33], [28, 37], [26, 35], [24, 39], [22, 35], [20, 37], [18, 33], [16, 34], [14, 28]], beardC);
        must(1.6);
        break;
      case 'full':
        L.poly([[16, 23], [19, 29], [24, 31], [29, 29], [32, 23], [32, 30], [28, 36], [24, 38], [20, 36], [16, 30]], beardC);
        must(1.4);
        break;
      case 'short':
        L.poly([[17, 25], [19, 30], [24, 32], [29, 30], [31, 25], [31, 28], [28, 33], [24, 34], [20, 33], [17, 28]], beardC);
        must(1.2);
        break;
      case 'goatee':
        must(1);
        L.poly([[22.5, 29.5], [25.5, 29.5], [24.6, 35], [23.4, 35]], beardC);
        break;
      case 'thin':
        must(1);
        L.poly([[22.8, 29.5], [25.2, 29.5], [24.8, 39], [23.2, 39]], beardC);
        break;
      case 'mustache':
        must(1.3);
        break;
      case 'stubble':
        for (let y = 26; y < 32; y++) for (let x = 17; x < 32; x++) if ((x + y) % 2 === 0 && Math.hypot((x - 24) / 8, (y - 22) / 10) < 1) L.px(x, y, INK, 0.3);
        break;
      default: break;
    }

    // หมวก/ทรงผม
    const metal = h.metal || '#b8bcc4';
    switch (h.hat) {
      case 'crown':
        L.rect(15, 11, 18, 3, '#e0b040');
        L.poly([[11, 8], [37, 8], [36, 5.5], [12, 5.5]], '#1a1a1a').rect(11, 8, 26, 1, '#e0b040');
        for (const x of [13, 16, 32, 35]) { L.line(x, 9, x, 14, 1, '#e8d070'); L.px(x, 14, '#d4302a'); }
        break;
      case 'futou':
        L.ellipse(24, 13, 10, 6.5, '#15151a').rect(14, 13, 20, 2, '#15151a');
        L.rect(4, 13, 10, 1.6, '#15151a').rect(34, 13, 10, 1.6, '#15151a');
        break;
      case 'scholar':
        L.poly([[15.5, 16], [16.5, 6], [24, 3.5], [31.5, 6], [32.5, 16]], h.hatColor || '#2c3a4a');
        L.rect(15.5, 14, 17, 1.4, '#f2efe6');
        break;
      case 'helmet':
      case 'feathers':
        L.poly([[13, 16], [14, 10], [18, 6], [24, 5], [30, 6], [34, 10], [35, 16]], metal);
        L.rect(13, 15, 22, 2, shade(metal, -0.35)).rect(13, 16, 3, 9, metal).rect(32, 16, 3, 9, metal);
        L.line(17, 9, 22, 6.5, 1, shade(metal, 0.5));
        if (h.hat === 'helmet') { L.line(24, 5, 24, 1.5, 1.4, shade(metal, -0.2)); L.ellipse(24, 1.5, 2.5, 2, h.plume); }
        else {
          L.path([[20, 7], [16, 3], [10, 1], [4, 2], [0, 6]], 1.6, h.plume);
          L.path([[28, 7], [32, 3], [38, 1], [44, 2], [48, 6]], 1.6, h.plume);
          L.circle(24, 5, 2.4, '#d4302a');
        }
        break;
      case 'hood':
        L.poly([[14, 25], [14, 14], [18, 8], [24, 6], [30, 8], [34, 14], [34, 25], [32, 25], [32, 16], [28, 12.5], [20, 12.5], [16, 16], [16, 25]], h.hatColor);
        L.line(34, 14, 40, 20, 1.6, h.hatColor).line(34, 15, 38, 24, 1.6, h.hatColor);
        break;
      case 'band':
        L.rect(15.5, 13.5, 17, 2, h.hatColor);
        L.line(32, 14, 38, 19, 1.4, h.hatColor).line(32, 15, 36, 22, 1.4, h.hatColor);
        break;
      case 'topknot':
        L.circle(24, 8.5, 3.6, hair);
        L.rect(21, 9.5, 6, 1.4, h.pin || '#d8a23c');
        break;
      case 'bun':
        L.circle(24, 7, 4.5, hair).circle(16, 11, 3.2, hair).circle(32, 11, 3.2, hair);
        L.line(18, 5, 30, 8, 1, '#e0b040');
        L.circle(30, 9, 1.8, h.flower).px(30, 9, '#ffffff');
        break;
      default: break;
    }
    heroFront(L, h);
    return bg.draw(L.outline(INK));
  }

  // ───────────────────────── misc ─────────────────────────
  function renderBack() {
    const B = SPECS.back;
    const r = rng(hash('back'));
    const cv = new Canvas(B.w, B.h).fill((x, y) => {
      const lattice = (x + y) % 6 === 0 || (x - y + 600) % 6 === 0;
      const c = lattice ? [150, 34, 24] : [118, 22, 16];
      const n = (r() - 0.5) * 8;
      return [c[0] + n, c[1] + n, c[2] + n];
    });
    const L = new Canvas(B.w, B.h);
    L.rect(2, 2, 62, 1, '#e0b040').rect(2, 91, 62, 1, '#e0b040').rect(2, 2, 1, 90, '#e0b040').rect(63, 2, 1, 90, '#e0b040');
    L.rect(5, 5, 56, 1, '#b8862c').rect(5, 88, 56, 1, '#b8862c').rect(5, 5, 1, 84, '#b8862c').rect(60, 5, 1, 84, '#b8862c');
    for (const [x, y] of [[9, 9], [57, 9], [9, 85], [57, 85]]) { L.circle(x, y, 2.6, '#e0b040'); L.circle(x, y, 1.2, '#7a1810'); }
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; L.line(33 + Math.cos(a) * 13, 47 + Math.sin(a) * 13, 33 + Math.cos(a) * 19, 47 + Math.sin(a) * 19, 1, '#e0b040', 0.8); }
    L.circle(33, 47, 13, '#e0b040').circle(33, 47, 11, '#6a120c');
    for (let k = 0; k < 3; k++) L.rect(26, 42 + k * 4, 14, 2, '#e0b040');
    cloud(L, 33, 20, 4, '#e0b040', 0.9);
    cloud(L, 33, 78, 4, '#e0b040', 0.9);
    return cv.draw(L);
  }

  function renderFelt() {
    const F = SPECS.felt;
    const r = rng(hash('felt'));
    const cv = new Canvas(F.w, F.h).fill((x, y) => {
      const d = Math.hypot((x - F.w / 2) / (F.w / 2), (y - F.h / 2) / (F.h / 2));
      const c = mix('#2f6b45', '#12321f', Math.min(1, d * 0.9));
      const n = (r() - 0.5) * 10;
      return [c[0] + n, c[1] + n * 1.2, c[2] + n];
    });
    for (let ty = 8; ty < F.h; ty += 24) {
      for (let tx = (ty / 24) % 2 ? 20 : 8; tx < F.w; tx += 26) {
        cv.circle(tx, ty, 5, '#f0d080', 0.05);
        cv.path([[tx - 5, ty + 2], [tx - 2, ty - 1], [tx + 1, ty + 2], [tx + 4, ty - 1]], 1, '#f0d080', 0.1);
      }
    }
    return cv;
  }

  /** เรนเดอร์ภาพตามประเภท คืน Canvas ขนาดขยายพร้อมบันทึก */
  function render(kind, id) {
    if (kind === 'cards') return renderCard(id).scale(SPECS.cards.scale);
    if (kind === 'heroes') return renderHero(id).scale(SPECS.heroes.scale);
    if (kind === 'misc' && id === 'back') return renderBack().scale(SPECS.back.scale);
    if (kind === 'misc' && id === 'felt') return renderFelt().scale(SPECS.felt.scale);
    throw new Error(`unknown art ${kind}/${id}`);
  }

  return { VERSION, SPECS, CARD_KEYS: Object.keys(CARD), HERO_IDS: Object.keys(HERO), render, renderCard, renderHero, renderBack, renderFelt };
}));
