(function (root) {
  'use strict';
  const MAX_BYTES = 20 * 1024 * 1024;
  let busy = false;
  function preview(url, size = 'thumb') {
    if (typeof location !== 'undefined') {
      try { const parsed = new URL(url, location.origin); if (parsed.origin === location.origin) url = parsed.pathname; } catch {}
    }
    return typeof url === 'string' && url.startsWith('/uploads/')
      ? '/api/maintenance-media/image?size=' + size + '&path=' + encodeURIComponent(url) : url;
  }
  function validate(files) {
    if (!files.length || files.length > 10) throw Error('Select 1–10 photos at a time.');
    if (files.some(file => file.size > MAX_BYTES)) throw Error('Each photo must be 20 MB or smaller.');
    if (files.some(file => file.type && !['image/jpeg','image/png','image/webp','image/gif'].includes(file.type))) throw Error('Use JPEG, PNG, WebP or GIF photos.');
  }
  async function runQueue(items, send, update = () => {}) {
    let cursor = 0;
    const waiting = items.filter(item => !item.token);
    waiting.forEach(item => { item.status = 'Waiting'; item.error = ''; update(item); });
    async function worker() {
      while (cursor < waiting.length) {
        const item = waiting[cursor++];
        item.status = 'Uploading'; update(item);
        try { item.token = await send(item.file); item.status = 'Ready'; item.error = ''; }
        catch (error) { item.status = 'Failed'; item.error = error.message; }
        update(item);
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, waiting.length) }, worker));
    return items.every(item => item.token);
  }
  async function upload(url, options = {}, target) {
    const form = options.body;
    const files = typeof form?.getAll === 'function' ? form.getAll('photos').filter(file => typeof file !== 'string') : [];
    if (!files.length) return fetch(url, options);
    validate(files);
    if (busy) throw Error('Finish the current photo upload before starting another.');
    if (!target?.appendChild || !target.isConnected) throw Error('Photo upload area is unavailable. Reopen the card and try again.');
    busy = true;
    const controller = new AbortController();
    const panel = document.createElement('div');
    panel.className = 'maintenance-upload-queue';
    panel.setAttribute('aria-label', 'Photo upload queue');
    panel.style.cssText = 'width:100%;min-width:0;grid-column:1/-1;margin:12px 0';
    panel.innerHTML = '<style>@keyframes maintenance-upload-spin{to{transform:rotate(360deg)}}.maintenance-upload-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:12px}.maintenance-upload-tile{position:relative;min-width:0;height:150px;border-radius:12px;overflow:hidden;background:#e7f0f6;color:#334155}.maintenance-upload-tile img{width:100%;height:100%;object-fit:cover;opacity:.3}.maintenance-upload-name{position:absolute;top:10px;left:10px;right:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:12px system-ui}.maintenance-upload-state{position:absolute;inset:42px 8px 8px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;font:13px system-ui;text-align:center}.maintenance-upload-ring{width:28px;height:28px;border:3px solid #cbd5e1;border-radius:50%;box-sizing:border-box}.maintenance-upload-tile[data-status="Uploading"] .maintenance-upload-ring,.maintenance-upload-tile[data-status="Saving"] .maintenance-upload-ring{border-top-color:#087e96;animation:maintenance-upload-spin 1s linear infinite}.maintenance-upload-tile[data-status="Ready"] .maintenance-upload-ring{border-color:#15803d}.maintenance-upload-tile[data-status="Failed"] .maintenance-upload-ring{border-color:#b91c1c}.maintenance-upload-tile[data-status="Failed"]{color:#991b1b}@media(prefers-reduced-motion:reduce){.maintenance-upload-ring{animation:none!important}}</style><div class="maintenance-upload-grid"></div><p role="status" aria-live="polite"></p><button type="button" data-retry hidden>Retry failed photos</button> <button type="button" data-cancel>Cancel upload</button>';
    const items = files.map(file => {
      const row = document.createElement('div'); row.className = 'maintenance-upload-tile';
      const objectUrl = URL.createObjectURL(file);
      const img = document.createElement('img'); img.src = objectUrl; img.alt = file.name;
      const name = document.createElement('span'); name.className = 'maintenance-upload-name'; name.textContent = file.name; name.title = file.name;
      const state = document.createElement('div'); state.className = 'maintenance-upload-state';
      const ring = document.createElement('span'); ring.className = 'maintenance-upload-ring'; ring.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      state.append(ring, label); row.append(img, name, state); panel.querySelector('.maintenance-upload-grid').appendChild(row);
      return { file, row, label, objectUrl, status: 'Waiting' };
    });
    let canceled = false, resolveRetry;
    const cancel = () => { canceled = true; controller.abort(); if (resolveRetry) resolveRetry(false); };
    panel.querySelector('[data-cancel]').onclick = cancel;
    target.appendChild(panel);
    const update = item => {
      item.row.dataset.status = item.status;
      item.label.textContent = item.status;
      item.row.title = item.error || item.file.name;
      item.row.setAttribute('aria-label', `${item.file.name}: ${item.status}${item.error ? '  -  ' + item.error : ''}`);
      panel.querySelector('[role=status]').textContent = `${items.filter(photo => photo.token).length} of ${items.length} photos uploaded`;
    };
    try {
      const send = async file => {
        if (canceled) throw Error('Upload canceled.');
        const body = new FormData(); body.append('photos', file);
        const response = await fetch('/api/maintenance-media/stage', { method: 'POST', body, signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.token) throw Error(data.message || 'Upload failed. Please retry.');
        return data.token;
      };
      while (!(await runQueue(items, send, update))) {
        if (canceled) throw Error('Upload canceled.');
        panel.querySelector('[role=status]').textContent = 'Some photos failed. Retry only those photos, or cancel. Uploaded photos will not be sent again.';
        const retry = panel.querySelector('[data-retry]'); retry.hidden = false;
        const again = await new Promise(resolve => { resolveRetry = resolve; retry.onclick = () => resolve(true); });
        resolveRetry = null; retry.hidden = true;
        if (!again) throw Error('Upload canceled.');
      }
      if (canceled) throw Error('Upload canceled.');
      items.forEach(item => { item.status = 'Saving'; update(item); });
      panel.querySelector('[role=status]').textContent = 'Saving photos…';
      panel.querySelector('[data-cancel]').disabled = true;
      const body = new FormData();
      for (const [key, value] of form.entries()) if (key !== 'photos' && key !== 'mediaTokens') body.append(key, value);
      body.append('mediaTokens', JSON.stringify(items.map(item => item.token)));
      // Save the record once: parallel record updates could lose photo references.
      return await fetch(url, { ...options, body });
    } finally { controller.abort(); panel.remove(); items.forEach(item => URL.revokeObjectURL(item.objectUrl)); busy = false; }
  }
  root.MaintenanceMedia = { preview, upload, runQueue, validate, isBusy: () => busy };
  if (typeof document !== 'undefined') document.addEventListener('submit', event => {
    if (busy) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  if (typeof module !== 'undefined') module.exports = root.MaintenanceMedia;
})(typeof window !== 'undefined' ? window : globalThis);
