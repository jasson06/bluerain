const fs = require('fs');
const path = require('path');
const vm = require('vm');
const createStorage = require('../server/production-storage');

function storage(env = {}, failPersistent = false) {
  const fakeFs = { mkdirSync: jest.fn(), accessSync: jest.fn(() => { if (failPersistent) throw Error('read-only mount'); }), constants: { W_OK: 2 } };
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try { return { ...createStorage({ fs: fakeFs, path: path.posix, rootDir: '/srv/app', env }), fs: fakeFs }; }
  finally { warn.mockRestore(); }
}

test('default production mount, public upload URLs and absolute stored paths are preserved', () => {
  const result = storage();
  expect(result.uploadDir).toBe('/mnt/data/uploads');
  expect(result.resolveStoredUploadPath('/uploads/maintenance/a.jpg')).toBe('/mnt/data/uploads/maintenance/a.jpg');
  expect(result.resolveStoredUploadPath('uploads/vendors/w9/a.pdf')).toBe('/mnt/data/uploads/vendors/w9/a.pdf');
  expect(result.resolveStoredUploadPath('/mnt/data/uploads/a.pdf')).toBe('/mnt/data/uploads/a.pdf');
  expect(result.resolveStoredUploadPath('uploads\\a.pdf')).toBe('/mnt/data/uploads/a.pdf');
});

test('UPLOAD_DIR override and live writable-local fallback are retained', () => {
  const custom = storage({ UPLOAD_DIR: '/custom/files' });
  expect(custom.resolveStoredUploadPath('/uploads/a.pdf')).toBe('/custom/files/a.pdf');
  expect(storage({}, true).uploadDir).toBe('/srv/app/uploads');
});

test('download headers retain non-ASCII filenames without CR/LF header injection', () => {
  const result = storage();
  const header = result.getContentDispositionHeader('attachment', '租約 "lease"\r\n.pdf');
  expect(header).not.toMatch(/[\r\n]/);
  expect(header).toContain("filename*=UTF-8''");
  expect(header).toContain('%E7%A7%9F');
  expect(result.sanitizeFilename('résumé document.pdf')).toBe('resume_document.pdf');
});

function boot(overrides = {}) {
  const root = path.join(__dirname, '..');
  const mongoose = new (require('mongoose').Mongoose)();
  mongoose.connect = jest.fn(() => new Promise(() => {}));
  const layers = [];
  const app = { use: (...args) => layers.push({ type: 'use', args }), listen: jest.fn() };
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) app[method] = (...args) => layers.push({ type: method, args });
  const middleware = () => function middleware(req, res, next) { if (next) next(); };
  const express = () => app;
  express.json = middleware; express.urlencoded = middleware;
  express.static = location => Object.assign(middleware(), { location });
  const multer = () => ({ single: middleware, array: middleware, fields: middleware });
  multer.diskStorage = options => options; multer.memoryStorage = () => ({});
  const never = () => { throw Error('Unexpected external service request'); };
  const mockFs = { existsSync: () => true, mkdirSync: jest.fn(), accessSync: jest.fn(), constants: { W_OK: 2 } };
  const visionConstructor = jest.fn(function () {});
  const mocks = {
    express, path: path.posix, fs: mockFs, mongoose, multer,
    dotenv: { config() {} }, cors: middleware, morgan: middleware,
    '@google-cloud/vision': { ImageAnnotatorClient: visionConstructor },
    bcrypt: {}, jsonwebtoken: {}, crypto: require('crypto'),
    nodemailer: { createTransport: () => ({ sendMail: never }) },
    'node-fetch': never, 'date-fns-tz': {}, axios: never,
    imap: function () { throw Error('Inbox unexpectedly started'); }, mailparser: { simpleParser: never }
  };
  const context = vm.createContext({
    process: { env: { NODE_ENV: 'production', MONGO_URI: 'mongodb://test.invalid/mock', JWT_SECRET: 'test-only-secret', PORT: '5500', ...overrides }, exit: never },
    console: { log() {}, warn() {}, error() {} }, Buffer, URL, URLSearchParams,
    setInterval: jest.fn(), setTimeout: jest.fn(), clearInterval: jest.fn(), clearTimeout: jest.fn()
  });
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const req = specifier => {
      if (specifier.startsWith('.')) return load(path.resolve(path.dirname(filename), specifier) + '.js');
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      throw Error('Unexpected dependency: ' + specifier);
    };
    let code = fs.readFileSync(filename, 'utf8');
    if (filename === path.join(root, 'server.js')) code += '\n;globalThis.probe={serverContext,storage,w9Storage,maintenancePhotoStorage,maintenanceTempStorage,qcReworkStorage,invitationSchema,estimateSchema};';
    const fn = vm.runInContext('(function(require,module,exports,__dirname,__filename){\n' + code + '\n})', context, { filename });
    fn(req, mod, mod.exports, '/srv/app', '/srv/app/server.js');
    return mod.exports;
  }
  load(path.join(root, 'server.js'));
  return { context, probe: context.probe, layers, app, mongoose, visionConstructor };
}

test('whole server boot keeps production credentials, storage paths, schema fields, and live endpoints', () => {
  const b = boot();
  expect(b.visionConstructor.mock.calls[0]).toEqual([]);
  expect(b.probe.serverContext.JWT_SECRET).toBe('test-only-secret');
  expect(b.context.setInterval).not.toHaveBeenCalled(); // IMAP remains opt-in.
  const stores = [['storage', '/mnt/data/uploads'], ['w9Storage', '/mnt/data/uploads/vendors/w9'], ['maintenancePhotoStorage', '/mnt/data/uploads/maintenance'], ['maintenanceTempStorage', '/mnt/data/uploads/maintenance/temp'], ['qcReworkStorage', '/mnt/data/uploads/qc-rework']];
  for (const [name, expected] of stores) {
    const callback = jest.fn(); b.probe[name].destination({}, {}, callback);
    expect(callback).toHaveBeenCalledWith(null, expected);
  }
  const urls = b.layers.filter(x => x.type === 'get').map(x => x.args[0]);
  expect(urls).toContain('/healthz'); expect(urls).toContain('/api/list-uploads');
  expect(urls).toContain('/api/properties/:propertyId/quickbooks/status');
  expect(b.probe.invitationSchema.path('expiresAt')).toBeDefined();
  expect(b.probe.invitationSchema.path('deleted')).toBeDefined();
  expect(b.probe.invitationSchema.path('status').enumValues).toContain('declined');
  expect(b.app.listen).toHaveBeenCalledWith('5500', expect.any(Function));
  const staticLayers = b.layers.filter(x => x.type === 'use' && x.args[0]?.location).map(x => x.args[0].location);
  expect(staticLayers.slice(0, 3)).toEqual(['/srv/app/dist', '/srv/app/public', '/srv/app/dist']);
  const uploads = b.layers.find(x => x.type === 'use' && x.args[0] === '/uploads');
  expect(uploads.args[1].location).toBe('/mnt/data/uploads');
});

test('custom upload mount reaches every new upload flow and preserves HTTPS redirect', () => {
  const b = boot({ UPLOAD_DIR: '/custom/files' });
  for (const key of ['storage', 'w9Storage', 'maintenancePhotoStorage', 'maintenanceTempStorage', 'qcReworkStorage']) {
    const callback = jest.fn(); b.probe[key].destination({}, {}, callback);
    expect(callback.mock.calls[0][1]).toMatch(/^\/custom\/files(?:\/|$)/);
  }
  const redirect = b.layers.find(x => x.type === 'use' && typeof x.args[0] === 'function' && x.args[0].toString().includes('x-forwarded-proto')).args[0];
  const res = { redirect: jest.fn() }, next = jest.fn();
  redirect({ headers: { host: 'example.test', 'x-forwarded-proto': 'http' }, url: '/page' }, res, next);
  expect(res.redirect).toHaveBeenCalledWith('https://example.test/page'); expect(next).not.toHaveBeenCalled();
});

test('explicit receipt-ingestion enablement preserves the new job without changing its default', () => {
  const b = boot({ ENABLE_EMAIL_RECEIPT_INGESTION: 'true' });
  expect(b.context.setInterval).toHaveBeenCalledWith(expect.any(Function), 60000);
});
