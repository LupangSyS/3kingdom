'use strict';

// Art Studio API: สร้าง/อัปโหลดภาพประกอบ บันทึกลงดิสก์ และเผยแพร่ (commit) ขึ้น GitHub

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { CARD_INFO } = require('./game/cards');
const { HEROES } = require('./game/heroes');

const MISC = ['back', 'felt'];
const MIME_EXT = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };
const MAX_BYTES = 3 * 1024 * 1024;

function validSlot(kind, id) {
  if (kind === 'heroes') return Object.hasOwn(HEROES, id);
  if (kind === 'cards') return Object.hasOwn(CARD_INFO, id);
  if (kind === 'misc') return MISC.includes(id);
  return false;
}

function isLoopback(req) {
  const ip = req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

async function gh(cfg, method, url, body) {
  const res = await fetch(`https://api.github.com/repos/${cfg.repo}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'samkok-art-studio',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GitHub ${method} ${url}: ${res.status} ${data.message || ''}`.trim());
  return data;
}

/**
 * @param {object} o
 * @param {string} o.artDir โฟลเดอร์เก็บภาพ (เสิร์ฟที่ /art)
 * @param {Function} [o.onChange] เรียกเมื่อภาพเปลี่ยน (แจ้งผู้เล่นให้โหลดใหม่)
 * @param {object} [o.env] ค่าตั้งค่า (ค่าเริ่มต้น process.env)
 */
function createStudio({ artDir, onChange = () => {}, env = process.env }) {
  const cfg = {
    password: env.STUDIO_PASSWORD || '',
    openaiKey: env.OPENAI_API_KEY || '',
    openaiModel: env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
    github: env.GITHUB_TOKEN && env.GITHUB_REPO
      ? { token: env.GITHUB_TOKEN, repo: env.GITHUB_REPO, branch: env.GITHUB_BRANCH || 'main', dir: env.GITHUB_ART_DIR || 'public/art' }
      : null,
  };
  const manifestPath = path.join(artDir, 'manifest.json');
  fs.mkdirSync(artDir, { recursive: true });

  const readManifest = () => {
    try { return JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { return { v: 0, items: {} }; }
  };
  let manifest = readManifest();
  if (!manifest.items) manifest = { v: 0, items: {} };
  const pending = new Map(); // relative path -> 'put' | 'delete'

  const writeManifest = () => {
    manifest.v = Date.now();
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    pending.set('manifest.json', 'put');
    onChange(manifest);
  };

  const router = express.Router();
  router.use(express.json({ limit: '8mb' }));

  const auth = (req, res, next) => {
    if (!cfg.password) {
      if (isLoopback(req)) return next();
      return res.status(403).json({ error: 'ยังไม่ได้ตั้งค่า STUDIO_PASSWORD บนเซิร์ฟเวอร์' });
    }
    if (safeEqual(req.get('x-studio-key') || '', cfg.password)) return next();
    return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  };

  router.get('/status', (req, res) => {
    res.json({
      needsPassword: !!cfg.password || !isLoopback(req),
      passwordConfigured: !!cfg.password,
      ai: !!cfg.openaiKey,
      github: cfg.github ? `${cfg.github.repo}@${cfg.github.branch}` : null,
    });
  });

  router.post('/login', auth, (req, res) => res.json({ ok: true }));

  router.get('/state', auth, (req, res) => {
    res.json({ manifest, pending: [...pending.entries()].filter(([p]) => p !== 'manifest.json').map(([p, op]) => ({ path: p, op })) });
  });

  router.post('/generate', auth, async (req, res) => {
    if (!cfg.openaiKey) return res.status(400).json({ error: 'ยังไม่ได้ตั้งค่า OPENAI_API_KEY บนเซิร์ฟเวอร์' });
    const prompt = String(req.body.prompt || '').trim().slice(0, 3000);
    if (!prompt) return res.status(400).json({ error: 'กรุณาใส่คำบรรยายภาพ' });
    const size = ['1024x1024', '1024x1536', '1536x1024'].includes(req.body.size) ? req.body.size : '1024x1024';
    try {
      const r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: cfg.openaiModel, prompt, size, n: 1 }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(502).json({ error: `สร้างภาพไม่สำเร็จ: ${(data.error && data.error.message) || r.status}` });
      const item = data.data && data.data[0];
      if (item && item.b64_json) return res.json({ image: `data:image/png;base64,${item.b64_json}` });
      if (item && item.url) {
        const img = await fetch(item.url);
        const buf = Buffer.from(await img.arrayBuffer());
        return res.json({ image: `data:${img.headers.get('content-type') || 'image/png'};base64,${buf.toString('base64')}` });
      }
      return res.status(502).json({ error: 'ไม่ได้รับภาพจากบริการ AI' });
    } catch (e) {
      return res.status(502).json({ error: `เชื่อมต่อบริการ AI ไม่ได้: ${e.message}` });
    }
  });

  router.post('/save', auth, (req, res) => {
    const { kind, id, data } = req.body || {};
    if (!validSlot(kind, id)) return res.status(400).json({ error: 'ช่องภาพไม่ถูกต้อง' });
    const m = /^data:(image\/(?:webp|png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ''));
    if (!m) return res.status(400).json({ error: 'รูปแบบไฟล์ไม่ถูกต้อง (รองรับ webp/png/jpeg)' });
    const buf = Buffer.from(m[2], 'base64');
    if (!buf.length || buf.length > MAX_BYTES) return res.status(400).json({ error: 'ไฟล์ใหญ่เกินไป (สูงสุด 3MB)' });
    const key = `${kind}/${id}`;
    const rel = `${key}.${MIME_EXT[m[1]]}`;
    const old = manifest.items[key];
    if (old && old.split('?')[0] !== rel) {
      fs.rmSync(path.join(artDir, old.split('?')[0]), { force: true });
      pending.set(old.split('?')[0], 'delete');
    }
    fs.mkdirSync(path.join(artDir, kind), { recursive: true });
    fs.writeFileSync(path.join(artDir, rel), buf);
    pending.set(rel, 'put');
    manifest.items[key] = `${rel}?v=${Date.now()}`;
    writeManifest();
    res.json({ ok: true, url: manifest.items[key] });
  });

  router.delete('/art/:kind/:id', auth, (req, res) => {
    const { kind, id } = req.params;
    if (!validSlot(kind, id)) return res.status(400).json({ error: 'ช่องภาพไม่ถูกต้อง' });
    const key = `${kind}/${id}`;
    const cur = manifest.items[key];
    if (cur) {
      const rel = cur.split('?')[0];
      fs.rmSync(path.join(artDir, rel), { force: true });
      pending.set(rel, 'delete');
      delete manifest.items[key];
      writeManifest();
    }
    res.json({ ok: true });
  });

  router.post('/publish', auth, async (req, res) => {
    if (!cfg.github) return res.status(400).json({ error: 'ยังไม่ได้ตั้งค่า GITHUB_TOKEN / GITHUB_REPO — ให้ commit โฟลเดอร์ public/art ด้วย git แทน' });
    const changes = [...pending.entries()];
    if (changes.length <= 1) return res.json({ ok: true, message: 'ไม่มีการเปลี่ยนแปลงที่ต้องเผยแพร่' });
    const g = cfg.github;
    try {
      const ref = await gh(g, 'GET', `/git/ref/heads/${encodeURIComponent(g.branch)}`);
      const parent = ref.object.sha;
      const commit = await gh(g, 'GET', `/git/commits/${parent}`);
      const tree = [];
      for (const [rel, op] of changes) {
        const repoPath = `${g.dir}/${rel}`;
        if (op === 'delete') { tree.push({ path: repoPath, mode: '100644', type: 'blob', sha: null }); continue; }
        const file = path.join(artDir, rel);
        if (!fs.existsSync(file)) continue;
        const blob = await gh(g, 'POST', '/git/blobs', { content: fs.readFileSync(file).toString('base64'), encoding: 'base64' });
        tree.push({ path: repoPath, mode: '100644', type: 'blob', sha: blob.sha });
      }
      const newTree = await gh(g, 'POST', '/git/trees', { base_tree: commit.tree.sha, tree });
      const n = changes.length - 1;
      const c = await gh(g, 'POST', '/git/commits', { message: `Update game artwork (${n} file${n > 1 ? 's' : ''}) via Art Studio`, tree: newTree.sha, parents: [parent] });
      await gh(g, 'PATCH', `/git/refs/heads/${encodeURIComponent(g.branch)}`, { sha: c.sha });
      pending.clear();
      return res.json({ ok: true, message: `เผยแพร่แล้ว ${n} ไฟล์ (commit ${c.sha.slice(0, 7)})` });
    } catch (e) {
      return res.status(502).json({ error: `เผยแพร่ไม่สำเร็จ: ${e.message}` });
    }
  });

  return { router, getManifest: () => manifest };
}

module.exports = { createStudio, validSlot };
