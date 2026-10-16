const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const sharp = require('sharp');
const create = require('../server/maintenance-media');
const client = require('../dist/maintenance-media');
let root, app, media, jpeg;
beforeAll(async () => { jpeg = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#438d92' } }).jpeg().toBuffer(); });
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'bluerain-media-'));
  media = create({ uploadDir: root }); app = express(); app.use(express.json()); media.register(app);
  app.post('/attach', media.upload('maintenance'), (req, res) => res.json({ photos: req.files.map(file => '/uploads/maintenance/' + file.filename) }));
});
afterEach(async () => { await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
test('ten queued photos are attached together and originals are byte-for-byte preserved', async () => {
  const tokens = [];
  for (let i = 0; i < 10; i++) {
    const result = await request(app).post('/api/maintenance-media/stage').attach('photos', jpeg, 'camera.jpg');
    expect(result.status).toBe(201); tokens.push(result.body.token);
  }
  const attached = await request(app).post('/attach').field('mediaTokens', JSON.stringify(tokens));
  expect(attached.status).toBe(200); expect(attached.body.photos).toHaveLength(10);
  expect(await fs.readFile(path.join(root, attached.body.photos[0].slice(9)))).toEqual(jpeg);
  const replay = await request(app).post('/attach').field('mediaTokens', JSON.stringify(tokens));
  expect(replay.status).toBe(400);
});
test('legacy photos get cached 320px and 1600px previews without changing original', async () => {
  await fs.writeFile(path.join(root, 'legacy.jpg'), jpeg);
  const thumb = await media.derivative('/uploads/legacy.jpg', 'thumb');
  expect((await sharp(thumb).metadata()).width).toBe(320);
  expect((await sharp(await media.derivative('/uploads/legacy.jpg', 'view')).metadata()).width).toBe(1600);
  expect(await media.derivative('/uploads/legacy.jpg', 'thumb')).toBe(thumb);
  expect(await fs.readFile(path.join(root, 'legacy.jpg'))).toEqual(jpeg);
});
test('simultaneous preview requests reuse one output', async () => {
  await fs.writeFile(path.join(root, 'legacy.jpg'), jpeg);
  const results = await Promise.all(Array.from({ length: 8 }, () => media.derivative('/uploads/legacy.jpg', 'thumb')));
  expect(new Set(results).size).toBe(1); expect(await fs.readdir(path.join(root, '.maintenance-previews'))).toHaveLength(1);
});
test('decoder rejects spoofed and corrupt images and removes temporary files', async () => {
  const result = await request(app).post('/api/maintenance-media/stage').attach('photos', Buffer.from('not a photo'), { filename:'bad.png', contentType:'image/png' });
  expect(result.status).toBe(422); expect(await fs.readdir(path.join(root, '.maintenance-staging'))).toEqual([]);
});
test('server rejects more than ten files and files over 20 MB', async () => {
  let batch = request(app).post('/attach');
  for (let i = 0; i < 11; i++) batch = batch.attach('photos', jpeg, 'photo.jpg');
  expect((await batch).status).toBe(400);
  const large = await request(app).post('/attach').attach('photos', Buffer.alloc(create.MAX_BYTES + 1), 'large.jpg');
  expect(large.status).toBe(413);
});
test.each(['https://example.com/photo.jpg','/uploads/../server.js','/uploads/.maintenance-staging/token','/uploads/maintenance/../../secret.jpg'])('rejects unsafe preview source %s', async url => {
  await expect(media.derivative(url, 'thumb')).rejects.toThrow();
});
test('rejects forged tokens and temporary paths outside the maintenance temp folder', async () => {
  expect((await request(app).post('/attach').field('mediaTokens', '["../../server.js"]')).status).toBe(400);
  expect((await request(app).post('/attach').field('tempPhotosPaths', '["/uploads/other.jpg"]')).status).toBe(400);
});
test('queued tokens expire after 24 hours', async () => {
  const staged = await request(app).post('/api/maintenance-media/stage').attach('photos', jpeg, 'photo.jpg');
  await fs.utimes(path.join(root, '.maintenance-staging', staged.body.token), new Date(0), new Date(0));
  expect((await request(app).post('/attach').field('mediaTokens', JSON.stringify([staged.body.token]))).status).toBe(400);
});
test('browser queue never exceeds three uploads; retry skips successes', async () => {
  let active = 0, maximum = 0, failOnce = true;
  const calls = [];
  const items = Array.from({ length:10 }, (_, file) => ({ file }));
  const send = async file => {
    calls.push(file); maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setImmediate(resolve)); active--;
    if (file === 4 && failOnce) { failOnce = false; throw Error('Network error'); }
    return 'token-' + file;
  };
  expect(await client.runQueue(items, send)).toBe(false); expect(maximum).toBe(3);
  expect(await client.runQueue(items, send)).toBe(true); expect(calls).toHaveLength(11); expect(calls[10]).toBe(4);
});
test('server processing is bounded to two jobs and rejects excess work', async () => {
  const run = create.limiter(2, 1); const releases = [];
  const task = () => new Promise(resolve => releases.push(resolve));
  const a = run(task), b = run(task), c = run(task);
  await expect(run(task)).rejects.toMatchObject({ status:503 });
  expect(releases).toHaveLength(2); releases[0](); await a;
  expect(releases).toHaveLength(3); releases[1](); releases[2](); await Promise.all([b,c]);
});
test('client rejects oversize batches and files before uploading', () => {
  expect(() => client.validate(Array.from({length:11},()=>({size:10,type:'image/jpeg'})))).toThrow('1–10');
  expect(() => client.validate([{size:create.MAX_BYTES+1,type:'image/jpeg'}])).toThrow('20 MB');
});
