// Persistent storage and filename/header compatibility from the live server.
module.exports = function createProductionStorage({ fs, path, rootDir, env }) {
  const __dirname = rootDir;
const persistentUploadDir = env.UPLOAD_DIR || '/mnt/data/uploads';
let uploadDir = persistentUploadDir;
try {
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.accessSync(uploadDir, fs.constants.W_OK);
} catch (error) {
  uploadDir = path.join(__dirname, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  console.warn(`Upload directory ${persistentUploadDir} is not writable; using ${uploadDir}.`);
}

function resolveStoredUploadPath(storedPath) {
  const value = String(storedPath || '').trim();
  if (!value) return '';

  const normalized = value.replace(/\\/g, '/');
  if (normalized.startsWith('/uploads/') || normalized.startsWith('uploads/')) {
    const relativePath = normalized.replace(/^\/?uploads\//, '');
    return path.join(uploadDir, relativePath);
  }

  return path.isAbsolute(value) ? value : path.join(__dirname, value);
}

function sanitizeHeaderFilename(filename) {
  const fallback = path.basename(String(filename || 'document')) || 'document';
  return fallback
    .replace(/[\r\n\0]/g, ' ')
    .replace(/["\\]/g, '_')
    .replace(/[^\x20-\x7E]/g, '_')
    .trim() || 'document';
}

function encodeRFC5987Value(value) {
  return Array.from(Buffer.from(String(value || 'document'), 'utf8'))
    .map(byte => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`)
    .join('');
}

function getContentDispositionHeader(disposition, filename) {
  const safeDisposition = disposition === 'attachment' ? 'attachment' : 'inline';
  const safeFilename = sanitizeHeaderFilename(filename);
  const encodedFilename = encodeRFC5987Value(String(filename || safeFilename).replace(/[\r\n\0]/g, ' '));
  return `${safeDisposition}; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`;
}

function sanitizeFilename(name) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}
return { uploadDir, resolveStoredUploadPath, sanitizeHeaderFilename, encodeRFC5987Value, getContentDispositionHeader, sanitizeFilename };
};
