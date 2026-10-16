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
  async function upload(url, options = {}) {
    const form = options.body;
    const files = typeof form?.getAll === 'function' ? form.getAll('photos').filter(file => typeof file !== 'string') : [];
    if (!files.length) return fetch(url, options);
    validate(files);
    if (busy) throw Error('Finish the current photo upload before starting another.');
    busy = true;
    const controller = new AbortController();
    const dialog = document.createElement('dialog');
    dialog.style.cssText = 'width:min(520px,90vw);max-height:85vh;border:0;border-radius:12px;padding:24px;overflow:auto';
    dialog.setAttribute('aria-label', 'Photo upload queue');
    dialog.innerHTML = '<h2 style="margin-top:0">Uploading photos</h2><p>Up to 3 photos upload at once. Others wait their turn.</p><ol></ol><p role="status" aria-live="polite"></p><button type="button" data-retry hidden>Retry failed photos</button> <button type="button" data-cancel>Cancel upload</button>';
    const items = files.map(file => {
      const row = document.createElement('li'); row.style.marginBottom = '8px'; dialog.querySelector('ol').appendChild(row);
      return { file, row, status: 'Waiting' };
    });
    let canceled = false, resolveRetry;
    const cancel = () => { canceled = true; controller.abort(); if (resolveRetry) resolveRetry(false); };
    dialog.querySelector('[data-cancel]').onclick = cancel;
    dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
    document.body.appendChild(dialog); dialog.showModal();
    const update = item => { item.row.textContent = `${item.file.name} — ${item.status}${item.error ? ': ' + item.error : ''}`; };
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
        dialog.querySelector('[role=status]').textContent = 'Some photos failed. Retry only those photos, or cancel. Uploaded photos will not be sent again.';
        const retry = dialog.querySelector('[data-retry]'); retry.hidden = false;
        const again = await new Promise(resolve => { resolveRetry = resolve; retry.onclick = () => resolve(true); });
        resolveRetry = null; retry.hidden = true;
        if (!again) throw Error('Upload canceled.');
      }
      if (canceled) throw Error('Upload canceled.');
      dialog.querySelector('[role=status]').textContent = 'Saving photos…';
      dialog.querySelector('[data-cancel]').disabled = true;
      const body = new FormData();
      for (const [key, value] of form.entries()) if (key !== 'photos' && key !== 'mediaTokens') body.append(key, value);
      body.append('mediaTokens', JSON.stringify(items.map(item => item.token)));
      // Save the record once: parallel record updates could lose photo references.
      return await fetch(url, { ...options, body });
    } finally { controller.abort(); dialog.close(); dialog.remove(); busy = false; }
  }
  root.MaintenanceMedia = { preview, upload, runQueue, validate, isBusy: () => busy };
  if (typeof document !== 'undefined') document.addEventListener('submit', event => {
    if (busy) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  if (typeof module !== 'undefined') module.exports = root.MaintenanceMedia;
})(typeof window !== 'undefined' ? window : globalThis);
