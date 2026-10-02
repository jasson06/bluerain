/* Shared recurring-maintenance history and QC UI for property and portfolio views. */
(() => {
  const schedules = new Map();
  const selections = new Map();
  const entries = new WeakMap();
  const expanded = new Set();
  let controlId = 0;
  const labels = { 'awaiting-qc': 'Awaiting QC', approved: 'Approved', rework: 'Rework Required', legacy: 'QC not recorded' };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const date = value => value ? new Date(value).toLocaleString() : 'Not recorded';
  const key = schedule => String(schedule._id);
  const property = schedule => String(schedule.projectId?._id || schedule.projectId || '');
  const status = entry => labels[entry.qcStatus] || labels.legacy;
  const safePhoto = value => {
    if (typeof value !== 'string' || !value) return '';
    try { const url = new URL(value, location.origin); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
  };
  function summary(schedule) {
    const pending = (schedule.history || []).filter(entry => entry.qcStatus === 'awaiting-qc').length;
    const rework = (schedule.history || []).filter(entry => entry.qcStatus === 'rework').length;
    return [pending ? `${pending} Awaiting QC` : '', rework ? `${rework} Rework Required` : ''].filter(Boolean).join(' · ');
  }
  function qcBadge(schedule) {
    const count = (schedule?.history || []).filter(entry => entry.qcStatus === 'awaiting-qc').length;
    if (!count) return '';
    const label = `${count} visit${count === 1 ? '' : 's'} awaiting QC`;
    return `<span class="rm-qc-badge" title="${escape(label)}" aria-label="${escape(label)}"><i class="fas fa-clipboard-check" aria-hidden="true"></i><span>${count}</span></span>`;
  }
  function render(schedule) {
    schedules.set(key(schedule), schedule);
    const history = [...(schedule.history || [])].sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    const selected = history.find(entry => String(entry._id) === selections.get(key(schedule))) || history[0];
    if (selected) selections.set(key(schedule), String(selected._id));
    return `<section class="rm-history" data-schedule="${escape(key(schedule))}" data-selected="${escape(selected?._id || '')}" aria-label="Completion History">
      <strong>Completion History</strong>
      ${summary(schedule) ? `<div class="rm-attention">${escape(summary(schedule))}</div>` : ''}
      ${history.length ? `
        <ul class="rm-date-list">${history.map(entry => `<li><button type="button" class="rm-date" data-entry="${escape(entry._id)}" aria-pressed="${entry === selected}">
          <span class="rm-date-title">${escape(date(entry.completedAt))}</span><span class="rm-date-status">${escape(status(entry))}</span>
        </button></li>`).join('')}</ul>` : '<p>No completion history yet.</p>'}
    </section>`;
  }
  function historyButton(schedule, source = 'portfolio') {
    schedules.set(key(schedule), schedule);
    const isExpanded = expanded.has(`${source}:${key(schedule)}`);
    const id = `rm-expanded-${++controlId}`;
    return `<button type="button" class="btn-secondary rm-open-history" data-schedule="${escape(key(schedule))}" data-source="${source}" aria-expanded="${isExpanded}" aria-controls="${id}"><span class="rm-toggle-label">${isExpanded ? 'Collapse maintenance' : 'Expand maintenance'}</span>${summary(schedule) ? `<span class="rm-attention">${escape(summary(schedule))}</span>` : ''}</button>`;
  }
  function detailsTarget(panel) {
    const card = panel.closest('.maintenance-card');
    const side = card?.querySelector('.compact-maintenance-panel');
    if (side) {
      card.classList.add('rm-maintenance-card');
      let target = side.querySelector('.rm-details');
      if (!target) {
        target = document.createElement('section');
        target.className = 'rm-details';
        target.setAttribute('aria-label', 'Selected completion photos and QC');
        target.setAttribute('aria-live', 'polite');
        side.append(target);
      }
      target.historyPanel = panel;
      return target;
    }
    // Also supports a standalone history panel in tests or other maintenance surfaces.
    let target = panel.querySelector('.rm-details');
    if (!target) { target = document.createElement('div'); target.className = 'rm-details'; panel.append(target); }
    target.historyPanel = panel;
    return target;
  }
  function gallery(photos, type) {
    return `<div><strong>${type === 'before' ? 'Before' : 'After'}</strong><div class="rm-photos">${(photos || []).map(safePhoto).filter(Boolean).map((url, index) => `<button type="button" class="rm-photo" data-photo="${escape(url)}" aria-label="Enlarge ${type} photo ${index + 1}"><img src="${escape(url)}" alt="${type} photo ${index + 1}" loading="lazy"></button>`).join('') || '<span class="rm-muted">Photos unavailable</span>'}</div></div>`;
  }
  function details(entry, schedule) {
    const canReview = entry.qcStatus === 'awaiting-qc';
    const canResubmit = entry.qcStatus === 'rework';
    return `<h3 class="rm-visit-heading">Completed visit</h3><div class="rm-status"><label class="rm-qc-status-control">QC status<select class="rm-qc-status" ${canReview || canResubmit ? '' : 'disabled'}>
      ${canReview ? '<option value="awaiting-qc">Awaiting QC</option><option value="approved">Approved</option><option value="rework">Rework Required</option>' : canResubmit ? '<option value="rework">Rework Required</option><option value="resubmit">Awaiting QC — resubmit</option>' : `<option value="${escape(entry.qcStatus)}">${escape(status(entry))}</option>`}
      </select></label></div>
      <div>Completed: ${escape(date(entry.completedAt))}${entry.completedBy ? `<br>By: ${escape(entry.completedBy)}` : ''}<br>Cost: ${escape(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(entry.cost) || 0))}</div>
      ${entry.notes ? `<p class="rm-notes">${escape(entry.notes)}</p>` : ''}
      <div class="rm-galleries">${gallery(entry.photos?.before, 'before')}${gallery(entry.photos?.after, 'after')}</div>
      ${entry.photoSource === 'unavailable' ? '<p class="rm-muted">No photos could be matched to this completed visit in the linked estimate.</p>' : ''}
      ${(entry.reviews || []).length ? `<details><summary>Review history (${entry.reviews.length})</summary>${entry.reviews.map(review => `<p class="rm-notes"><strong>${escape(labels[review.status] || (review.status === 'submitted' ? 'Submitted for QC' : 'Resubmitted for QC'))}</strong> · ${escape(date(review.reviewedAt))}${review.reviewerName ? ` · ${escape(review.reviewerName)}` : ''}${review.notes ? `<br>${escape(review.notes)}` : ''}</p>`).join('')}</details>` : ''}
      ${canReview || canResubmit ? `<fieldset class="rm-qc-controls"><legend>Review notes</legend><label class="rm-selector">QC notes (required for rework)<textarea class="rm-review-notes" rows="2" maxlength="4000"></textarea></label>
      <div class="rm-actions"><button type="button" class="btn-primary" data-review="selected">Save QC status</button></div>` : ''}
      ${canReview || canResubmit ? '</fieldset>' : ''}
      <div class="rm-error" role="alert"></div>`;
  }
  function managerAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const storages = [window.localStorage, window.sessionStorage];
    let token = '';
    for (const storage of storages) {
      for (const key of ['token', 'managerToken', 'authToken', 'accessToken']) {
        const value = storage?.getItem(key)?.trim();
        if (value) { token = value.replace(/^Bearer\s+/i, ''); break; }
      }
      if (token) break;
    }
    if (token) headers.Authorization = `Bearer ${token}`;
    const managerId = storages.map(storage => storage?.getItem('managerId')?.trim()).find(Boolean);
    if (managerId) headers['X-Manager-Id'] = managerId;
    return { headers, managerId };
  }
  const endpoint = (schedule, entryId) => `/api/properties/${encodeURIComponent(property(schedule))}/maintenance-schedules/${encodeURIComponent(key(schedule))}/history/${encodeURIComponent(entryId)}`;
  async function load(panel) {
    const schedule = schedules.get(panel.dataset.schedule);
    const selectedId = panel.dataset.selected;
    if (!schedule || !selectedId) return;
    selections.set(key(schedule), selectedId);
    const requestId = String((Number(panel.dataset.request) || 0) + 1);
    panel.dataset.request = requestId;
    const target = detailsTarget(panel);
    entries.delete(panel);
    delete panel.dataset.loadedEntry;
    target.textContent = 'Loading completion…';
    try {
      const response = await fetch(endpoint(schedule, selectedId), { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to load completion');
      if (!panel.isConnected || panel.dataset.request !== requestId) return;
      entries.set(panel, data);
      panel.dataset.loadedEntry = selectedId;
      target.innerHTML = details(data, schedule);
    } catch (error) {
      if (panel.dataset.request === requestId) target.innerHTML = `<p role="alert">${escape(error.message)}</p><button type="button" class="btn-secondary rm-retry">Retry</button>`;
    }
  }
  async function review(panel, action) {
    const schedule = schedules.get(panel.dataset.schedule);
    const entry = entries.get(panel);
    if (!entry || panel.dataset.saving) return;
    const target = detailsTarget(panel);
    const notes = target.querySelector('.rm-review-notes')?.value.trim() || '';
    const errorBox = target.querySelector('.rm-error');
    if (action === 'selected') action = target.querySelector('.rm-qc-status')?.value;
    if (!action || action === entry.qcStatus) { errorBox.textContent = 'Select a different QC status to save.'; return; }
    if (action === 'rework' && !notes) { errorBox.textContent = 'Explain what needs to be corrected.'; target.querySelector('textarea').focus(); return; }
    panel.dataset.saving = 'true';
    [...panel.querySelectorAll('button'), ...target.querySelectorAll('button, textarea, select')].forEach(el => el.disabled = true);
    errorBox.textContent = '';
    try {
      const auth = managerAuthHeaders();
      const response = await fetch(`${endpoint(schedule, entry._id)}/review`, { method: 'PATCH',
        headers: auth.headers,
        body: JSON.stringify({ status: action, notes, managerId: auth.managerId, expectedReviewCount: (entry.reviews || []).length }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to save review');
      // Preserve populated display metadata when the write API returns raw IDs.
      const updated = { ...schedule, ...result.schedule, projectId: schedule.projectId, assignedVendor: schedule.assignedVendor, unitId: schedule.unitId };
      schedules.set(key(updated), updated);
      window.syncRecurringHistorySchedule?.(updated);
      document.querySelectorAll('.rm-history').forEach(other => {
        if (other.dataset.schedule === key(updated)) other.outerHTML = render(updated);
      });
      document.querySelectorAll('.rm-open-history').forEach(button => {
        if (button.dataset.schedule === key(updated)) button.outerHTML = historyButton(updated, button.dataset.source);
      });
      window.showNotification?.(action === 'approved' ? 'Maintenance approved' : action === 'rework' ? 'Rework requested' : 'Submitted for QC', 'success');
    } catch (error) { errorBox.textContent = error.message; }
    finally { delete panel.dataset.saving; [...panel.querySelectorAll('button'), ...target.querySelectorAll('button, textarea, select')].forEach(el => el.disabled = false); }
  }
  function expansionKey(button) { return `${button.dataset.source}:${button.dataset.schedule}`; }
  function expandRow(button) {
    const row = button.closest('tr');
    const schedule = schedules.get(button.dataset.schedule);
    if (!row || !schedule || document.getElementById(button.getAttribute('aria-controls'))) return;
    const detailRow = document.createElement('tr');
    detailRow.className = 'rm-expanded-row';
    detailRow.id = button.getAttribute('aria-controls');
    detailRow.historyOwner = button;
    const cell = document.createElement('td');
    cell.colSpan = row.cells.length;
    const cardHTML = window.renderRecurringMaintenanceExpandedCard?.(schedule, button.dataset.source);
    cell.innerHTML = cardHTML || `<div class="maintenance-card"><div class="compact-maintenance-grid"><div class="compact-maintenance-panel"><h3>${escape(schedule.title || 'Maintenance')}</h3></div><div>${render(schedule)}</div></div></div>`;
    const layout = cell.querySelector('.compact-maintenance-grid');
    if (layout) layout.classList.add('rm-expanded-maintenance-layout');
    const detailsSide = cell.querySelector('.compact-maintenance-panel');
    const historySide = cell.querySelector('.maintenance-thread');
    detailsSide?.classList.add('rm-expanded-maintenance-details');
    historySide?.classList.add('rm-expanded-maintenance-history');
    // Only the summary row participates in list filtering and pagination.
    cell.querySelectorAll('[data-portfolio-filter-item]').forEach(card => card.removeAttribute('data-portfolio-filter-item'));
    detailRow.append(cell);
    row.after(detailRow);
    button.setAttribute('aria-expanded', 'true');
    button.querySelector('.rm-toggle-label').textContent = 'Collapse maintenance';
    expanded.add(expansionKey(button));
    detailRow.hidden = row.hidden || row.style.display === 'none';
  }
  function toggleRow(button) {
    const detail = document.getElementById(button.getAttribute('aria-controls'));
    if (detail) {
      expanded.delete(expansionKey(button));
      detail.remove();
      button.setAttribute('aria-expanded', 'false');
      button.querySelector('.rm-toggle-label').textContent = 'Expand maintenance';
    } else expandRow(button);
  }
  function openPhoto(button) {
    const buttons = [...button.closest('.rm-photos').querySelectorAll('[data-photo]')];
    let index = buttons.indexOf(button);
    const dialog = document.createElement('dialog');
    dialog.className = 'rm-photo-dialog';
    const photoKind = button.closest('.rm-photos')?.parentElement?.querySelector('strong')?.textContent || 'Maintenance evidence';
    dialog.setAttribute('aria-label', `${photoKind} photo viewer`);
    dialog.innerHTML = `<div class="rm-photo-dialog__header"><div><span class="rm-photo-dialog__eyebrow">Maintenance evidence</span><strong class="rm-photo-dialog__title">${escape(photoKind)} photo</strong></div><form method="dialog"><button type="submit" class="rm-photo-dialog__close" aria-label="Close photo viewer">&times;</button></form></div><div class="rm-photo-dialog__body"><div class="rm-photo-dialog__image-frame"><img alt="${escape(photoKind)} maintenance evidence"></div></div><div class="rm-photo-dialog__footer"><span class="rm-photo-dialog__counter" aria-live="polite"></span><div class="rm-actions"><button type="button" class="btn-secondary" data-prev><i class="fas fa-arrow-left"></i> Previous</button><button type="button" class="btn-secondary" data-next>Next <i class="fas fa-arrow-right"></i></button></div></div>`;
    const update = () => { const current = buttons[index]; dialog.querySelector('img').src = current.dataset.photo; dialog.querySelector('img').alt = `${photoKind} maintenance evidence ${index + 1}`; dialog.querySelector('.rm-photo-dialog__counter').textContent = `${photoKind} · ${index + 1} of ${buttons.length}`; dialog.querySelector('[data-prev]').disabled = index === 0; dialog.querySelector('[data-next]').disabled = index === buttons.length - 1; };
    dialog.querySelector('[data-prev]').onclick = () => { index--; update(); };
    dialog.querySelector('[data-next]').onclick = () => { index++; update(); };
    dialog.addEventListener('keydown', event => { if (event.key === 'ArrowLeft' && index > 0) { index--; update(); } if (event.key === 'ArrowRight' && index < buttons.length - 1) { index++; update(); } });
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog); update(); dialog.showModal();
  }
  // Capture row clicks before the legacy inline-row edit handlers.
  document.addEventListener('click', event => {
    const open = event.target.closest('.rm-open-history');
    if (open) { event.preventDefault(); event.stopPropagation(); toggleRow(open); return; }
    const row = event.target.closest('tr[data-maint-source="recurring"]');
    if (row && !event.target.closest('button, select, input, a, textarea, label, [contenteditable="true"]')) {
      const trigger = row.querySelector('.rm-open-history');
      if (trigger) { event.preventDefault(); event.stopPropagation(); toggleRow(trigger); }
    }
  }, true);
  document.addEventListener('click', event => {
    const panel = event.target.closest('.rm-history') || event.target.closest('.rm-details')?.historyPanel;
    if (!panel || !panel.isConnected) return;
    const button = event.target.closest('button');
    if (button?.dataset.entry && !panel.dataset.saving) {
      panel.dataset.selected = button.dataset.entry;
      panel.querySelectorAll('.rm-date').forEach(dateButton => dateButton.setAttribute('aria-pressed', String(dateButton === button)));
      load(panel);
    } else if (button?.dataset.review) review(panel, button.dataset.review);
    else if (button?.matches('.rm-retry')) load(panel);
    else if (button?.matches('.rm-photo')) openPhoto(button);
  });
  const hydrate = () => {
    document.querySelectorAll('.rm-expanded-row').forEach(row => {
      const button = row.historyOwner;
      if (!button?.isConnected || button.closest('tr') !== row.previousElementSibling) { row.remove(); return; }
      const parent = button.closest('tr');
      const hidden = parent.hidden || parent.style.display === 'none';
      if (row.hidden !== hidden) row.hidden = hidden;
    });
    document.querySelectorAll('.rm-open-history').forEach(button => {
      if (expanded.has(expansionKey(button))) expandRow(button);
    });
    document.querySelectorAll('.rm-history:not([data-hydrated])').forEach(panel => {
      panel.dataset.hydrated = 'true';
      if (panel.dataset.selected) load(panel);
    });
  };
  const observer = new MutationObserver(hydrate);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden'] });
  window.RecurringMaintenanceHistory = { render, historyButton, summary, qcBadge };
})();
