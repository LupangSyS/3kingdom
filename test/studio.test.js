'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createServer } = require('../server');

// 1x1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function withServer(env, fn) {
  const artDir = fs.mkdtempSync(path.join(os.tmpdir(), 'art-'));
  const { server, rooms } = createServer({ artDir, env });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, url, body, key) => fetch(base + url, {
    method, headers: { 'Content-Type': 'application/json', ...(key ? { 'x-studio-key': key } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  try { await fn({ call, base, artDir }); } finally {
    for (const r of rooms.rooms.values()) rooms.destroy(r);
    await new Promise((r) => server.close(r));
    fs.rmSync(artDir, { recursive: true, force: true });
  }
}

test('studio: password required, save/delete art, manifest served to the game', async () => {
  await withServer({ STUDIO_PASSWORD: 'secret' }, async ({ call, base, artDir }) => {
    const st = await call('GET', '/api/studio/status');
    assert.deepStrictEqual(st.body, { needsPassword: true, passwordConfigured: true, ai: false, github: null });
    assert.strictEqual((await call('POST', '/api/studio/login', {}, 'wrong')).status, 401);
    assert.strictEqual((await call('POST', '/api/studio/save', { kind: 'heroes', id: 'guanyu', data: PNG })).status, 401);
    assert.strictEqual((await call('POST', '/api/studio/login', {}, 'secret')).status, 200);

    // invalid slot / path traversal / bad data are rejected
    assert.strictEqual((await call('POST', '/api/studio/save', { kind: 'heroes', id: '../../x', data: PNG }, 'secret')).status, 400);
    assert.strictEqual((await call('POST', '/api/studio/save', { kind: 'heroes', id: 'constructor', data: PNG }, 'secret')).status, 400);
    assert.strictEqual((await call('POST', '/api/studio/save', { kind: 'heroes', id: 'guanyu', data: 'data:text/html;base64,PGI+' }, 'secret')).status, 400);

    const saved = await call('POST', '/api/studio/save', { kind: 'heroes', id: 'guanyu', data: PNG }, 'secret');
    assert.strictEqual(saved.status, 200);
    assert.ok(fs.existsSync(path.join(artDir, 'heroes', 'guanyu.png')));
    const manifest = await (await fetch(`${base}/art/manifest.json`)).json();
    assert.match(manifest.items['heroes/guanyu'], /^heroes\/guanyu\.png\?v=\d+$/);
    const img = await fetch(`${base}/art/heroes/guanyu.png`);
    assert.strictEqual(img.status, 200);

    const state = await call('GET', '/api/studio/state', null, 'secret');
    assert.deepStrictEqual(state.body.pending, [{ path: 'heroes/guanyu.png', op: 'put' }]);

    assert.strictEqual((await call('DELETE', '/api/studio/art/heroes/guanyu', null, 'secret')).status, 200);
    assert.ok(!fs.existsSync(path.join(artDir, 'heroes', 'guanyu.png')));
    const m2 = await (await fetch(`${base}/art/manifest.json`)).json();
    assert.strictEqual(m2.items['heroes/guanyu'], undefined);

    // generation and publishing report missing configuration
    assert.match((await call('POST', '/api/studio/generate', { prompt: 'x' }, 'secret')).body.error, /OPENAI_API_KEY/);
    assert.match((await call('POST', '/api/studio/publish', {}, 'secret')).body.error, /GITHUB_TOKEN/);
  });
});

test('studio: without a password only localhost may use it', async () => {
  await withServer({}, async ({ call }) => {
    const st = await call('GET', '/api/studio/status');
    assert.strictEqual(st.body.needsPassword, false);
    assert.strictEqual((await call('POST', '/api/studio/login', {})).status, 200);
  });
});

test('studio: AI generate and GitHub publish call the right APIs (stubbed)', async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith('https://')) return realFetch(url, init);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method: init.method || 'GET', url: u, body, auth: init.headers && init.headers.Authorization });
    const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u === 'https://api.openai.com/v1/images/generations') return json({ data: [{ b64_json: PNG.split(',')[1] }] });
    if (u.endsWith('/git/ref/heads/main')) return json({ object: { sha: 'parent1' } });
    if (u.endsWith('/git/commits/parent1')) return json({ tree: { sha: 'tree1' } });
    if (u.endsWith('/git/blobs')) return json({ sha: `blob${calls.length}` });
    if (u.endsWith('/git/trees')) return json({ sha: 'tree2' });
    if (u.endsWith('/git/commits')) return json({ sha: 'abcdef1234567' });
    if (u.endsWith('/git/refs/heads/main')) return json({});
    return new Response('{}', { status: 404 });
  };
  try {
    const env = { STUDIO_PASSWORD: 'pw', OPENAI_API_KEY: 'sk-test', GITHUB_TOKEN: 'ghp_test', GITHUB_REPO: 'me/game' };
    await withServer(env, async ({ call }) => {
      const gen = await call('POST', '/api/studio/generate', { prompt: 'Guan Yu portrait', size: '1024x1024' }, 'pw');
      assert.strictEqual(gen.status, 200);
      assert.ok(gen.body.image.startsWith('data:image/png;base64,'));
      const oa = calls.find((c) => c.url.includes('openai'));
      assert.strictEqual(oa.auth, 'Bearer sk-test');
      assert.strictEqual(oa.body.prompt, 'Guan Yu portrait');

      await call('POST', '/api/studio/save', { kind: 'cards', id: 'attack', data: PNG }, 'pw');
      const pub = await call('POST', '/api/studio/publish', {}, 'pw');
      assert.strictEqual(pub.status, 200, JSON.stringify(pub.body));
      assert.match(pub.body.message, /abcdef1/);
      const tree = calls.find((c) => c.url.endsWith('/git/trees')).body;
      assert.strictEqual(tree.base_tree, 'tree1');
      assert.deepStrictEqual(tree.tree.map((t) => t.path).sort(), ['public/art/cards/attack.png', 'public/art/manifest.json']);
      const ref = calls.find((c) => c.method === 'PATCH');
      assert.ok(ref.url.startsWith('https://api.github.com/repos/me/game/'));
      assert.deepStrictEqual(ref.body, { sha: 'abcdef1234567' });
      assert.deepStrictEqual((await call('GET', '/api/studio/state', null, 'pw')).body.pending, []);
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});
