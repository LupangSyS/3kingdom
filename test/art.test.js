'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildAll, manifestFor, allSlots, ART_DIR } = require('../scripts/build-art');
const { createServer } = require('../server');

test('every hero, card type, card back and felt has saved artwork', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ART_DIR, 'manifest.json'), 'utf8'));
  for (const [kind, id] of allSlots()) {
    const rel = `${kind}/${id}.png`;
    assert.ok(manifest.items[`${kind}/${id}`], `manifest lists ${rel}`);
    const buf = fs.readFileSync(path.join(ART_DIR, rel));
    assert.deepStrictEqual([...buf.subarray(1, 4)].map((b) => String.fromCharCode(b)).join(''), 'PNG');
    assert.strictEqual(crypto.createHash('sha256').update(buf).digest('hex'), manifest.sha256[rel], `${rel} fingerprint`);
  }
});

test('saved artwork is exactly what the generator draws (tamper check)', () => {
  const a = buildAll();
  const b = buildAll();
  for (const rel of Object.keys(a)) assert.ok(a[rel].equals(b[rel]), `${rel} renders deterministically`);
  for (const [rel, buf] of Object.entries(a)) {
    assert.ok(fs.readFileSync(path.join(ART_DIR, rel)).equals(buf), `${rel} was modified — run npm run build:art`);
  }
  const expected = JSON.stringify(manifestFor(a), null, 2) + '\n';
  assert.strictEqual(fs.readFileSync(path.join(ART_DIR, 'manifest.json'), 'utf8'), expected, 'manifest.json is generated');
  const onDisk = fs.readdirSync(ART_DIR, { recursive: true }).filter((f) => f.endsWith('.png')).map((f) => f.split(path.sep).join('/'));
  assert.deepStrictEqual(onDisk.sort(), Object.keys(a).sort(), 'no extra images in public/art');
});

test('art and card database are read-only over HTTP', async () => {
  const { server, rooms } = createServer({});
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const db = await (await fetch(`${base}/api/cards`)).json();
    assert.strictEqual(Object.values(db.deck).reduce((s, l) => s + l.length, 0), 108);
    const img = await fetch(`${base}/art/heroes/guanyu.png`);
    assert.strictEqual(img.status, 200);
    assert.strictEqual(img.headers.get('content-type'), 'image/png');
    for (const [method, url] of [['PUT', '/art/heroes/guanyu.png'], ['POST', '/art/heroes/guanyu.png'], ['DELETE', '/art/heroes/guanyu.png'], ['POST', '/api/cards'], ['POST', '/api/studio/save']]) {
      const r = await fetch(base + url, { method, body: method === 'DELETE' ? undefined : 'x' });
      assert.strictEqual(r.status, 404, `${method} ${url} is not writable`);
    }
    const after = fs.readFileSync(path.join(ART_DIR, 'heroes', 'guanyu.png'));
    assert.ok(after.equals(Buffer.from(await img.arrayBuffer())));
  } finally {
    for (const r of rooms.rooms.values()) rooms.destroy(r);
    await new Promise((r) => server.close(r));
  }
});
