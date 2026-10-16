'use strict';
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
// Avoid retained file handles (especially during Windows temp-file promotion).
sharp.cache({ memory: 16, files: 0, items: 50 });
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 60 * 1000 * 1000;
const MAX_FILES = 10;
const TTL = 24 * 60 * 60 * 1000;
const formats = new Set(['jpeg', 'png', 'webp', 'gif']);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

function limiter(max = 2, capacity = 32) {
  let active = 0;
  const waiting = [];
  return async function run(task) {
    if (active >= max) {
      if (waiting.length >= capacity) throw fail('Photo processing is busy. Please retry.', 503);
      await new Promise(resolve => waiting.push(resolve));
    } else active++;
    try { return await task(); }
    finally { const next = waiting.shift(); if (next) next(); else active--; }
  };
}

module.exports = function createMaintenanceMedia({ uploadDir }) {
  const root = path.resolve(uploadDir);
  const staging = path.join(root, '.maintenance-staging');
  const cache = path.join(root, '.maintenance-previews');
  const processImage = limiter(1);
  const pending = new Map();
  const claimed = new Set();
  let lastCleanup = 0;
  const parser = multer({
    storage: multer.diskStorage({
      destination(req, file, cb) { fs.mkdir(staging, { recursive: true }).then(() => cb(null, staging), cb); },
      filename(req, file, cb) { cb(null, crypto.randomUUID()); }
    }),
    limits: { fileSize: MAX_BYTES, files: MAX_FILES, fields: 50, fieldSize: 1024 * 1024 },
    fileFilter(req, file, cb) {
      cb(null, true); // The decoder validates actual file contents below, not the client MIME type.
    }
  }).array('photos', MAX_FILES);
  const sendError = (res, error) => res.status(error.status || (error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)).json({
    message: error.code === 'LIMIT_FILE_SIZE' ? 'Each photo must be 20 MB or smaller.' : error.code?.startsWith('LIMIT_') ? 'Select up to 10 photos; the upload exceeded its limits.' : error.message
  });
  async function validate(file) {
    if (file.size > MAX_BYTES) throw fail('Each photo must be 20 MB or smaller.', 413);
    return processImage(async () => {
      try {
        // Upload byte limit is checked before this read; buffers avoid retaining a
        // native file handle while the validated temporary file is promoted.
        const image = sharp(await fs.readFile(file.path), { limitInputPixels: MAX_PIXELS, failOn: 'error', animated: false });
        const meta = await image.metadata();
        if (!formats.has(meta.format)) throw fail('Use JPEG, PNG, WebP or GIF photos.');
        await image.rotate().resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true }).webp().toBuffer();
        return meta.format === 'jpeg' ? 'jpg' : meta.format;
      } catch (error) { throw fail(error.status ? error.message : 'Photo could not be decoded. Use a valid image up to 60 megapixels.', 422); }
    });
  }
  async function cleanup() {
    if (Date.now() - lastCleanup < 3600000) return;
    lastCleanup = Date.now();
    for (const name of await fs.readdir(staging).catch(() => [])) {
      if (claimed.has(name)) continue;
      const file = path.join(staging, name);
      const stat = await fs.stat(file).catch(() => null);
      if (stat?.isFile() && Date.now() - stat.mtimeMs > TTL) await fs.unlink(file).catch(() => {});
    }
  }
  function receive(handler) {
    return (req, res) => parser(req, res, async error => {
      const files = req.files || [];
      try {
        if (error) throw error;
        for (const file of files) file.extension = await validate(file);
        await handler(req, res, files);
      } catch (error) {
        await Promise.all(files.map(file => fs.unlink(file.path).catch(() => {})));
        sendError(res, error);
      }
    });
  }
  // Direct/older clients can still send multipart photos. Queued clients send opaque staged tokens.
  function upload(directory = '') {
    const middleware = receive(async (req, res, files) => {
      req.body = req.body || {};
      let tokens;
      try { tokens = JSON.parse(req.body.mediaTokens || '[]'); } catch { throw fail('Invalid photo upload tokens.'); }
      if (!Array.isArray(tokens) || files.length + tokens.length > MAX_FILES || new Set(tokens).size !== tokens.length) throw fail('Select up to 10 photos per batch.');
      if (req.body.tempPhotosPaths) {
        let paths;
        try { paths = JSON.parse(req.body.tempPhotosPaths); } catch { throw fail('Invalid temporary photos.'); }
        if (!Array.isArray(paths) || paths.length + files.length + tokens.length > MAX_FILES || new Set(paths).size !== paths.length) throw fail('Select up to 10 photos per batch.');
        for (const url of paths) {
          if (typeof url !== 'string' || !/^\/uploads\/maintenance\/temp\/[^/\\]+$/.test(url)) throw fail('Invalid temporary photo path.');
          const { file, stat } = await original(url);
          await validate({ path: file, size: stat.size });
        }
      }
      const tokenFiles = [];
      const locks = [];
      const moved = [];
      try {
        for (const token of tokens) {
          if (typeof token !== 'string' || !/^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/.test(token) || claimed.has(token)) throw fail('Photo upload is invalid or already in use.');
          claimed.add(token); locks.push(token);
          const filename = path.join(staging, token);
          const stat = await fs.stat(filename).catch(() => null);
          if (!stat?.isFile() || Date.now() - stat.mtimeMs > TTL) throw fail('A temporary photo expired. Select it again.');
          tokenFiles.push({ path: filename, filename: token, size: stat.size });
        }
        await fs.mkdir(path.join(root, directory), { recursive: true });
        for (const file of [...files, ...tokenFiles]) {
          const filename = file.extension ? `${file.filename}.${file.extension}` : file.filename;
          const destination = path.join(root, directory, filename);
          await fs.rename(file.path, destination);
          moved.push({ ...file, path: destination, filename });
        }
        req.files = moved;
      } catch (error) {
        await Promise.all(moved.map(file => fs.unlink(file.path).catch(() => {})));
        throw error;
      } finally { for (const token of locks) claimed.delete(token); }
      req.maintenanceMediaNext();
    });
    return (req, res, next) => { req.maintenanceMediaNext = next; middleware(req, res); };
  }
  async function original(value) {
    if (typeof value !== 'string' || !value.startsWith('/uploads/') || value.includes('\\')) throw fail('Invalid photo path.');
    const relative = value.slice('/uploads/'.length);
    if (relative.split('/').some(part => !part || part.startsWith('.'))) throw fail('Invalid photo path.');
    const realRoot = await fs.realpath(root);
    const file = await fs.realpath(path.join(root, relative)).catch(() => { throw fail('Photo not found.', 404); });
    if (!file.startsWith(realRoot + path.sep)) throw fail('Invalid photo path.');
    const stat = await fs.stat(file);
    if (!stat.isFile()) throw fail('Photo not found.', 404);
    return { file, stat };
  }
  async function derivative(value, size) {
    if (!['thumb', 'view'].includes(size)) throw fail('Invalid preview size.');
    const { file, stat } = await original(value);
    const key = crypto.createHash('sha256').update(`${file}:${stat.size}:${stat.mtimeMs}:${size}:v1`).digest('hex');
    const output = path.join(cache, key + '.webp');
    if (await fs.stat(output).catch(() => null)) return output;
    if (!pending.has(key)) {
      const task = processImage(async () => {
        await fs.mkdir(cache, { recursive: true });
        const image = sharp(file, { limitInputPixels: MAX_PIXELS, failOn: 'error', animated: false });
        if (!formats.has((await image.metadata()).format)) throw fail('Unsupported photo format.', 415);
        const temporary = output + '.' + crypto.randomUUID() + '.tmp';
        try {
          await image.rotate().resize({ width: size === 'thumb' ? 320 : 1600, height: size === 'thumb' ? 320 : 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: size === 'thumb' ? 75 : 85 }).toFile(temporary);
          await fs.rename(temporary, output);
        } finally { await fs.unlink(temporary).catch(() => {}); }
        return output;
      });
      pending.set(key, task);
    }
    try { return await pending.get(key); } finally { pending.delete(key); }
  }
  function register(app) {
    app.post('/api/maintenance-media/stage', receive(async (req, res, files) => {
      if (files.length !== 1) throw fail('Upload one queued photo at a time.');
      const file = files[0], token = `${file.filename}.${file.extension}`;
      await fs.rename(file.path, path.join(staging, token));
      cleanup().catch(() => {});
      res.status(201).json({ token });
    }));
    app.get('/api/maintenance-media/image', async (req, res) => {
      try {
        const file = await derivative(req.query.path, req.query.size || 'thumb');
        res.setHeader('Cache-Control', 'private, max-age=86400');
        res.sendFile(file);
      } catch (error) { sendError(res, error.status ? error : fail('Photo preview is unavailable.', 422)); }
    });
  }
  return { upload, register, derivative, validate };
};
module.exports.limiter = limiter;
module.exports.MAX_BYTES = MAX_BYTES;
