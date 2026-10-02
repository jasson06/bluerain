// Property management: applications invites.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// Applications: fetch and render
async function loadApplications(force = false) {
    try {
        if (!force && Array.isArray(state.applications) && state.applications.length) {
            renderFilteredApplications();
            updateTabCounts();
            return;
        }
        const res = await fetch('/api/rental-applications?limit=200');
        if (!res.ok) throw new Error('Failed to fetch applications');
        const all = await res.json();
        // Keep all applications (Pending, Approved, Rejected) in state for the Applications tab
        state.applications = Array.isArray(all) ? all : [];
        renderFilteredApplications();
        updateTabCounts();
    } catch (err) {
        console.error('Error loading applications:', err);
        showNotification('Error loading applications', 'error');
    }
}

// Invites: fetch and render
async function loadInvites(force = false) {
    try {
        if (!force && Array.isArray(state.invites) && state.invites.length) {
            renderFilteredInvites();
            return;
        }
        const res = await fetch('/api/application-invites?limit=200');
        if (!res.ok) throw new Error('Failed to fetch invites');
        state.invites = await res.json();
        renderFilteredInvites();
    } catch (err) {
        console.error('Error loading invites:', err);
        showNotification('Error loading invites', 'error');
    }
}

function renderInvites(items) {
    const list = document.getElementById('invitesList');
    if (!list) return;
    const invites = propertyRecordPage('invitesList', items || state.invites || [], renderFilteredInvites);
    if (!invites.length) {
        list.innerHTML = `
            <div class="empty-state" style="text-align:center;padding:24px;">
                <i class="fas fa-paper-plane" style="font-size:2em;color:#3498db;margin-bottom:8px;"></i>
                <p>No invites sent</p>
            </div>`;
        return;
    }
    const currentSelectedInviteId = state.selectedInviteId || null;
    const rows = invites.map(inv => {
        const sentAt = inv.sentAt ? new Date(inv.sentAt).toLocaleString('en-US') : '';
        const openedAt = inv.openedAt ? new Date(inv.openedAt).toLocaleString('en-US') : '';
        const status = inv.status || 'sent';
        const statusBadge = `<span class="status-badge ${status}" style="padding:4px 10px;border-radius:12px;font-size:.85em;">${status.charAt(0).toUpperCase() + status.slice(1)}</span>`;
        const link = inv.applicationUrl || '';
        const safeLink = link.replace(/"/g, '&quot;');
        const notesCount = Array.isArray(inv.notesHistory) ? inv.notesHistory.length : 0;
        const isSelected = currentSelectedInviteId && String(currentSelectedInviteId) === String(inv._id);
        return `
            <tr style="border-bottom:1px solid #e1e8ed;" data-invite-id="${inv._id}">
                <td style="padding:10px 8px;width:36px;text-align:center;">
                    <input type="radio" name="selectedInvite" class="invite-select" value="${inv._id}" ${isSelected ? 'checked' : ''} style="cursor:pointer;" />
                </td>
                <td style="padding:10px 8px;font-weight:600;color:#2c3e50;">
                    <button class="invite-notes-link" data-invite-id="${inv._id}" style="background:none;border:none;padding:0;margin:0;font:inherit;color:#2563eb;cursor:pointer;">
                        ${inv.name || ''}
                    </button>
                </td>
                <td style="padding:10px 8px;">${inv.email || ''}</td>
                <td style="padding:10px 8px;">${inv.propertyName || '—'}</td>
                <td style="padding:10px 8px;">${inv.unitNumber || '—'}</td>
                <td style="padding:10px 8px;">${sentAt || '—'}</td>
                <td style="padding:10px 8px;">${openedAt || '—'}</td>
                <td style="padding:10px 8px;">${typeof inv.openCount === 'number' ? inv.openCount : 0}</td>
                <td style="padding:10px 8px;">
                    <button class="invite-notes-link" data-invite-id="${inv._id}" style="background:none;border:none;padding:0;margin:0;font:inherit;cursor:pointer;">
                        <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:#eef2ff;color:#4f46e5;font-size:0.8rem;">
                            <i class="fas fa-sticky-note"></i>
                            ${notesCount}
                        </span>
                    </button>
                </td>
                <td style="padding:10px 8px;">${statusBadge}</td>
                <td style="padding:10px 8px;">${link ? `
                    <div style="display:flex;gap:6px;align-items:center;">
                        <a href="${safeLink}" target="_blank" rel="noopener" class="icon-copy-btn" title="Open invite link" style="text-decoration:none;">
                            <i class="fas fa-up-right-from-square"></i>
                        </a>
                        <button type="button" class="icon-copy-btn invite-copy-link" data-link="${safeLink}" title="Copy invite URL">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                ` : '—'}</td>
            </tr>`;
    }).join('');
    list.innerHTML = `
      <div style="overflow-x:auto;">
                <table id="applicationsTable" class="maintenance-table" style="width:100%;border-collapse:collapse;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(44,62,80,0.07);">
          <thead>
            <tr style="background:#f6fafd;">
                            <th style="padding:12px 8px;font-weight:600;color:#2980b9;width:36px;"></th>
              <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Name</th>
              <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Email</th>
              <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Property</th>
              <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Unit</th>
              <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Sent</th>
              <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Opened</th>
              <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Open Count</th>
              <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Notes</th>
              <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Status</th>
              <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;

    // Wire invite selection to Actions dropdown
    const invitesWrapper = document.getElementById('invitesActionsWrapper');
    const invitesMenu = document.getElementById('invitesActionsMenu');
    const invitesBtn = document.getElementById('invitesActionsBtn');
    const editInviteBtn = document.getElementById('editInviteBtn');
    const deleteInviteBtn = document.getElementById('deleteInviteBtn');

    // Helper to enter inline edit mode for invites
    function enterInviteEditMode(row, invite) {
        if (!row || !invite) return;
        const inviteIdStr = String(invite._id || '');
        if (!inviteIdStr) return;
        if (state.currentEditingInviteId && state.currentEditingInviteId !== inviteIdStr) return;
        if (row.dataset.editing === 'true') return;
        state.currentEditingInviteId = inviteIdStr;
        row.dataset.editing = 'true';

        const cells = row.querySelectorAll('td');
        const nameCell = cells[1];
        const emailCell = cells[2];
        const propertyCell = cells[3];
        const unitCell = cells[4];
        const statusCell = cells[9];
        const actionsCell = cells[10];

        function makeInput(type, className, value) {
            const input = document.createElement('input');
            input.type = type;
            input.className = className;
            input.value = value || '';
            return input;
        }

        const nameInput = makeInput('text', 'app-inline-input', invite.name || '');
        const emailInput = makeInput('email', 'app-inline-input', invite.email || '');
        const propertyInput = makeInput('text', 'app-inline-input', invite.propertyName || '');
        const unitInput = makeInput('text', 'app-inline-input', invite.unitNumber || '');

        const statusSelect = document.createElement('select');
        statusSelect.className = 'app-inline-input';
        ['sent', 'opened', 'completed', 'expired'].forEach(val => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val.charAt(0).toUpperCase() + val.slice(1);
            if ((invite.status || 'sent') === val) opt.selected = true;
            statusSelect.appendChild(opt);
        });

        const urlInput = makeInput('url', 'app-inline-input', invite.applicationUrl || '');

        if (nameCell) { nameCell.innerHTML = ''; nameCell.appendChild(nameInput); }
        if (emailCell) { emailCell.innerHTML = ''; emailCell.appendChild(emailInput); }
        if (propertyCell) { propertyCell.innerHTML = ''; propertyCell.appendChild(propertyInput); }
        if (unitCell) { unitCell.innerHTML = ''; unitCell.appendChild(unitInput); }
        if (statusCell) { statusCell.innerHTML = ''; statusCell.appendChild(statusSelect); }
        if (actionsCell) { actionsCell.innerHTML = ''; actionsCell.appendChild(urlInput); }

        const saveInviteChanges = async () => {
            const payload = {
                name: nameInput.value.trim(),
                email: emailInput.value.trim(),
                propertyName: propertyInput.value.trim(),
                unitNumber: unitInput.value.trim(),
                status: statusSelect.value || 'sent',
                applicationUrl: urlInput.value.trim() || ''
            };

            try {
                const res = await fetch(`/api/application-invites/${invite._id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error('Failed to update invite');
                const updated = await res.json();
                const invData = updated.invite || updated;
                state.invites = (state.invites || []).map(x => String(x._id) === String(invite._id) ? invData : x);
                state.currentEditingInviteId = null;
                renderInvites();
                showNotification('Invite updated', 'success');
            } catch (err) {
                console.error('Inline invite update error:', err);
                state.currentEditingInviteId = null;
                showNotification('Could not update invite', 'error');
                renderInvites();
            }
        };

        const handleDocClick = (ev) => {
            const target = ev.target;
            if (row.contains(target)) return;
            if (!document.body.contains(row)) {
                document.removeEventListener('click', handleDocClick, true);
                return;
            }
            document.removeEventListener('click', handleDocClick, true);
            saveInviteChanges();
        };

        document.addEventListener('click', handleDocClick, true);
    }

    if (invitesWrapper) {
        invitesWrapper.style.display = state.selectedInviteId ? 'flex' : 'none';
    }

    document.querySelectorAll('.invite-select').forEach(input => {
        input.addEventListener('click', (e) => {
            const val = e.target.value || null;
            if (state.selectedInviteId && String(state.selectedInviteId) === String(val)) {
                // Toggle off when clicking the already selected invite
                e.target.checked = false;
                state.selectedInviteId = null;
                if (invitesWrapper) invitesWrapper.style.display = 'none';
                if (invitesMenu) invitesMenu.style.display = 'none';
            } else {
                state.selectedInviteId = val;
                if (invitesWrapper) invitesWrapper.style.display = val ? 'flex' : 'none';
                if (invitesMenu) invitesMenu.style.display = 'none';
            }
        });
    });

    if (invitesBtn && invitesMenu) {
        invitesBtn.onclick = (e) => {
            e.stopPropagation();
            if (!state.selectedInviteId) return;
            invitesMenu.style.display = invitesMenu.style.display === 'block' ? 'none' : 'block';
        };
    }

    // Simple outside-click handler to close the menu
    document.addEventListener('click', (e) => {
        if (invitesMenu && invitesMenu.style.display === 'block' && !invitesMenu.contains(e.target) && e.target !== invitesBtn) {
            invitesMenu.style.display = 'none';
        }
    });

    if (editInviteBtn) {
        editInviteBtn.onclick = () => {
            const id = state.selectedInviteId;
            if (!id) return;
            const invite = (state.invites || []).find(x => String(x._id) === String(id));
            if (!invite) return;
            const row = list.querySelector(`tr[data-invite-id="${id}"]`);
            enterInviteEditMode(row, invite);
            if (invitesMenu) invitesMenu.style.display = 'none';
        };
    }

    if (deleteInviteBtn) {
        deleteInviteBtn.onclick = async () => {
            const id = state.selectedInviteId;
            if (!id) return;
            if (!confirm('Delete this invite? This cannot be undone.')) return;
            try {
                showLoader();
                const res = await fetch(`/api/application-invites/${id}`, { method: 'DELETE' });
                if (!res.ok) throw new Error('Failed to delete invite');
                state.invites = (state.invites || []).filter(x => String(x._id) !== String(id));
                state.selectedInviteId = null;
                renderInvites();
                showNotification('Invite deleted', 'success');
            } catch (err) {
                console.error('Delete invite error:', err);
                showNotification('Could not delete invite', 'error');
            } finally {
                hideLoader();
            }
        };
    }

                        renderFilteredApplications();
    list.querySelectorAll('.invite-notes-link').forEach(btn => {
        btn.addEventListener('click', (e) => {
                        renderFilteredInvites();
            const id = btn.getAttribute('data-invite-id');
            if (!id) return;
            openNotesDrawerForInvite(id);
        });
    });

    // Wire copy invite URL buttons
    list.querySelectorAll('.invite-copy-link').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const url = btn.getAttribute('data-link');
            if (!url) return;
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(url);
                } else {
                    const tempInput = document.createElement('input');
                    tempInput.value = url;
                    document.body.appendChild(tempInput);
                    tempInput.select();
                    document.execCommand('copy');
                    document.body.removeChild(tempInput);
                }
                if (typeof showNotification === 'function') {
                    showNotification('Invite link copied', 'success');
                }
            } catch (err) {
                console.error('Copy invite link failed', err);
                if (typeof showNotification === 'function') {
                    showNotification('Could not copy link', 'error');
                }
            }
        });
    });

    // Wire row click (excluding controls) to open inline edit mode for invites
    list.querySelectorAll('tr[data-invite-id]').forEach(row => {
        row.addEventListener('click', (e) => {
            const target = e.target;
            if (target.closest('input[type="radio"]') ||
                target.closest('.invite-notes-link') ||
                target.closest('a')) {
                return;
            }
            if (row.dataset.editing === 'true') return;
            const inviteId = row.getAttribute('data-invite-id');
            if (!inviteId) return;
            const invite = (state.invites || []).find(x => String(x._id) === String(inviteId));
            if (!invite) return;
            enterInviteEditMode(row, invite);
        });
    });
}

function renderApplications(items) {
    const list = document.getElementById('applicationsList');
    if (!list) return;
    const apps = propertyRecordPage('applicationsList', items || getFilteredApplicationsList(), renderFilteredApplications, state.highlightApplicationId);
    if (!apps.length) {
        list.innerHTML = `
            <div class="empty-state" style="text-align:center;padding:24px;">
                <i class="fas fa-file-alt" style="font-size:2em;color:#3498db;margin-bottom:8px;"></i>
                <p>No rental applications found</p>
            </div>`;
        return;
    }

    const currentSelectedAppId = state.selectedApplicationId || null;
    const rows = apps.map(a => {
        // Safely parse notes for propertyAddress and unitNumber
        let propertyAddress = '';
        let unitNumber = a.unit || '';
        if (a.notes) {
            try {
                const n = JSON.parse(a.notes);
                propertyAddress = n.propertyAddress || '';
                unitNumber = n.unitNumber || unitNumber;
            } catch {}
        }
        let moveIn = '';
        if (a.moveIn) {
            try {
                const d = new Date(a.moveIn);
                if (!isNaN(d.getTime())) {
                    const y = d.getUTCFullYear();
                    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
                    const day = String(d.getUTCDate()).padStart(2, '0');
                    moveIn = `${m}/${day}/${y}`;
                }
            } catch {}
        }
        const submitted = a.submitted ? new Date(a.submitted).toLocaleString('en-US') : '';
        const status = (a.status || 'pending');
        let notesJson = '';
        if (a.notes) {
            try { notesJson = encodeURIComponent(a.notes); } catch {}
        }
        const notesCount = Array.isArray(a.notesHistory) ? a.notesHistory.length : 0;
                const statusSelect = `
                    <select class="app-status-select"
                                    data-app-id="${a._id}"
                                    data-name="${(a.name||'').replace(/\"/g,'&quot;')}"
                                    data-email="${(a.email||'').replace(/\"/g,'&quot;')}"
                                    data-phone="${(a.phone||'').replace(/\"/g,'&quot;')}"
                                    data-unit="${(unitNumber||'').toString().replace(/\"/g,'&quot;')}"
                                    data-movein="${a.moveIn ? new Date(a.moveIn).toISOString() : ''}"
                                    data-notes="${notesJson}"
                                    style="padding:6px 8px;border-radius:8px;border:1px solid #d1d5db;background:#fff;">
                        <option value="pending" ${status==='pending'?'selected':''}>Pending</option>
                        <option value="approved" ${status==='approved'?'selected':''}>Approved</option>
                        <option value="rejected" ${status==='rejected'?'selected':''}>Rejected</option>
                    </select>`;
        const viewLink = `/applications/review/${a._id}`;
        const isSelected = currentSelectedAppId && String(currentSelectedAppId) === String(a._id);
        return `
            <tr style="border-bottom:1px solid #e1e8ed;" data-app-id="${a._id}">
                <td style="padding:10px 8px;width:36px;text-align:center;">
                    <input type="radio" name="selectedApplication" class="application-select" value="${a._id}" ${isSelected ? 'checked' : ''} style="cursor:pointer;" />
                </td>
                <td style="padding:10px 8px;font-weight:600;color:#2563eb;">
                    <button class="application-jump-link" data-app-id="${a._id}" style="background:none;border:none;color:#2563eb;padding:0;margin:0;font:inherit;text-align:left;cursor:pointer;">
                        ${a.name || ''}
                    </button>
                </td>
                <td style="padding:10px 8px;">${a.email || ''}</td>
                <td style="padding:10px 8px;">${a.phone || ''}</td>
                <td style="padding:10px 8px;">${propertyAddress || '—'}</td>
                <td style="padding:10px 8px;">${unitNumber || '—'}</td>
                <td style="padding:10px 8px;">${moveIn || '—'}</td>
                <td style="padding:10px 8px;">${submitted || '—'}</td>
                <td style="padding:10px 8px;">
                    <button class="application-jump-link" data-app-id="${a._id}" style="background:none;border:none;color:inherit;padding:0;margin:0;font:inherit;text-align:left;cursor:pointer;">
                        <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:#eef2ff;color:#4f46e5;font-size:0.8rem;">
                            <i class="fas fa-sticky-note"></i>
                            ${notesCount}
                        </span>
                    </button>
                </td>
                <td style="padding:10px 8px;">${statusSelect}</td>
                <td style="padding:10px 8px;">
                    <a class="btn-secondary" href="${viewLink}" target="_blank" rel="noopener" style="text-decoration:none;padding:6px 10px;border-radius:8px;display:inline-block;">
                         View
                    </a>
                </td>
            </tr>`;
    }).join('');

    list.innerHTML = `
      <div style="overflow-x:auto;">
                <table id="invitesTable" class="maintenance-table" style="width:100%;border-collapse:collapse;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(44,62,80,0.07);">
          <thead>
            <tr style="background:#f6fafd;">
                            <th style="padding:12px 8px;font-weight:600;color:#2980b9;width:36px;"></th>
              <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Applicant</th>
              <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Email</th>
              <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Phone</th>
              <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Property Address</th>
              <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Unit</th>
              <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Move-In</th>
              <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Submitted</th>
              <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Notes</th>
              <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Status</th>
              <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;

        focusApplication();

    // Attach change handlers for status dropdowns
    document.querySelectorAll('.app-status-select').forEach(sel => {
        sel.addEventListener('change', async (e) => {
            const el = e.currentTarget;
            const appId = el.dataset.appId;
            const newStatus = el.value;
            try {
                showLoader();
                const res = await fetch(`/api/rental-applications/${appId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus })
                });
                if (!res.ok) throw new Error('Failed to update application status');
                // Update local state
                const idx = (state.applications||[]).findIndex(a => a._id === appId);
                if (idx >= 0) state.applications[idx].status = newStatus;
                showNotification('Application status updated', 'success');

                if (newStatus === 'approved') {
                    const appData = {
                        name: el.dataset.name || '',
                        phone: el.dataset.phone || '',
                        email: el.dataset.email || '',
                        unit: el.dataset.unit || '',
                        moveIn: el.dataset.movein || '',
                        // Encoded JSON string of full application data (from Blue Rain form)
                        notes: el.dataset.notes || ''
                    };
                    prefillTenantFromApplication(appData);
                    openModal('addTenantModal');
                }
            } catch (err) {
                console.error('Update status error:', err);
                showNotification('Could not update status', 'error');
                renderApplications();
            } finally {
                hideLoader();
            }
        });
    });

    // Wire application selection to Actions dropdown
    const appsWrapper = document.getElementById('applicationsActionsWrapper');
    const appsMenu = document.getElementById('applicationsActionsMenu');
    const appsBtn = document.getElementById('applicationsActionsBtn');
    const editAppBtn = document.getElementById('editApplicationBtn');
    const deleteAppBtn = document.getElementById('deleteApplicationBtn');

    // Helper to enter inline edit mode for a given row/application
    function enterApplicationEditMode(row, app) {
        if (!row || !app) return;
        const appIdStr = String(app._id || '');
        if (!appIdStr) return;
        // Prevent multiple rows from being edited at once
        if (state.currentEditingApplicationId && state.currentEditingApplicationId !== appIdStr) return;
        if (row.dataset.editing === 'true') return;
        state.currentEditingApplicationId = appIdStr;
        row.dataset.editing = 'true';

        const cells = row.querySelectorAll('td');
        const nameCell = cells[1];
        const emailCell = cells[2];
        const phoneCell = cells[3];
        const propertyCell = cells[4];
        const unitCell = cells[5];
        const moveInCell = cells[6];

        // Derive property address and unit number from notes JSON when available
        let propertyAddress = '';
        let unitNumber = app.unit || '';
        if (app.notes) {
            try {
                const n = JSON.parse(app.notes);
                propertyAddress = n.propertyAddress || '';
                unitNumber = n.unitNumber || unitNumber;
            } catch {}
        }

        function makeInput(type, className, value) {
            const input = document.createElement('input');
            input.type = type;
            input.className = className;
            input.value = value || '';
            return input;
        }

        const nameInput = makeInput('text', 'app-inline-input app-inline-name', app.name || '');
        const emailInput = makeInput('email', 'app-inline-input app-inline-email', app.email || '');
        const phoneInput = makeInput('text', 'app-inline-input app-inline-phone', app.phone || '');
        const propertyInput = makeInput('text', 'app-inline-input app-inline-property', propertyAddress || '');
        const unitInput = makeInput('text', 'app-inline-input app-inline-unit', unitNumber || '');

        const moveInInput = makeInput('date', 'app-inline-input app-inline-movein', '');
        if (app.moveIn) {
            try {
                const d = new Date(app.moveIn);
                if (!isNaN(d.getTime())) {
                    moveInInput.value = d.toISOString().slice(0, 10);
                }
            } catch {}
        }

        if (nameCell) {
            nameCell.innerHTML = '';
            nameCell.appendChild(nameInput);
        }
        if (emailCell) {
            emailCell.innerHTML = '';
            emailCell.appendChild(emailInput);
        }
        if (phoneCell) {
            phoneCell.innerHTML = '';
            phoneCell.appendChild(phoneInput);
        }
        if (propertyCell) {
            propertyCell.innerHTML = '';
            propertyCell.appendChild(propertyInput);
        }
        if (unitCell) {
            unitCell.innerHTML = '';
            unitCell.appendChild(unitInput);
        }
        if (moveInCell) {
            moveInCell.innerHTML = '';
            moveInCell.appendChild(moveInInput);
        }

        // Auto-save when clicking away from the row
        const saveChanges = async () => {
            const statusSelect = row.querySelector('.app-status-select');
            const newStatus = statusSelect ? statusSelect.value : (app.status || 'pending');

            // Build notes JSON with updated property address and unit number, preserving other keys
            let notesObj = {};
            if (app.notes) {
                try {
                    const existing = JSON.parse(app.notes);
                    if (existing && typeof existing === 'object') notesObj = existing;
                } catch {}
            }
            notesObj.propertyAddress = propertyInput.value.trim();
            notesObj.unitNumber = unitInput.value.trim();
            const notesString = JSON.stringify(notesObj);

            const payload = {
                name: nameInput.value.trim(),
                email: emailInput.value.trim(),
                phone: phoneInput.value.trim(),
                unit: unitInput.value.trim(),
                status: newStatus,
                moveIn: moveInInput.value || undefined,
                notes: notesString
            };

            try {
                
                const res = await fetch(`/api/rental-applications/${app._id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error('Failed to update application');
                const updated = await res.json();
                const appData = updated.application || updated;
                state.applications = (state.applications || []).map(a => String(a._id) === String(app._id) ? appData : a);
                state.currentEditingApplicationId = null;
                renderApplications();
                showNotification('Application updated', 'success');
            } catch (err) {
                console.error('Inline application update error:', err);
                showNotification('Could not update application', 'error');
                state.currentEditingApplicationId = null;
                renderApplications();

            }
        };

        const handleDocClick = (ev) => {
            const target = ev.target;
            if (row.contains(target)) return;
            if (!document.body.contains(row)) {
                document.removeEventListener('click', handleDocClick, true);
                return;
            }
            document.removeEventListener('click', handleDocClick, true);
            saveChanges();
        };

        document.addEventListener('click', handleDocClick, true);
    }

    if (appsWrapper) {
        appsWrapper.style.display = state.selectedApplicationId ? 'flex' : 'none';
    }

    document.querySelectorAll('.application-select').forEach(input => {
        input.addEventListener('click', (e) => {
            const val = e.target.value || null;
            if (state.selectedApplicationId && String(state.selectedApplicationId) === String(val)) {
                // Toggle off when clicking the already selected application
                e.target.checked = false;
                state.selectedApplicationId = null;
                if (appsWrapper) appsWrapper.style.display = 'none';
                if (appsMenu) appsMenu.style.display = 'none';
            } else {
                state.selectedApplicationId = val;
                if (appsWrapper) appsWrapper.style.display = val ? 'flex' : 'none';
                if (appsMenu) appsMenu.style.display = 'none';
            }
        });
    });

    if (appsBtn && appsMenu) {
        appsBtn.onclick = (e) => {
            e.stopPropagation();
            if (!state.selectedApplicationId) return;
            appsMenu.style.display = appsMenu.style.display === 'block' ? 'none' : 'block';
        };
    }

    document.addEventListener('click', (e) => {
        if (appsMenu && appsMenu.style.display === 'block' && !appsMenu.contains(e.target) && e.target !== appsBtn) {
            appsMenu.style.display = 'none';
        }
    });

    if (editAppBtn) {
        editAppBtn.onclick = () => {
            const id = state.selectedApplicationId;
            if (!id) return;
            const apps = state.applications || [];
            const app = apps.find(a => String(a._id) === String(id));
            if (!app) return;
            const row = list.querySelector(`tr[data-app-id="${id}"]`);
            enterApplicationEditMode(row, app);
        };
    }

    if (deleteAppBtn) {
        deleteAppBtn.onclick = async () => {
            const id = state.selectedApplicationId;
            if (!id) return;
            if (!confirm('Delete this application? This cannot be undone.')) return;
            try {
                showLoader();
                const res = await fetch(`/api/rental-applications/${id}`, { method: 'DELETE' });
                if (!res.ok) throw new Error('Failed to delete application');
                state.applications = (state.applications || []).filter(a => String(a._id) !== String(id));
                state.selectedApplicationId = null;
                renderApplications();
                updateTabCounts();
                showNotification('Application deleted', 'success');
            } catch (err) {
                console.error('Delete application error:', err);
                showNotification('Could not delete application', 'error');
            } finally {
                hideLoader();
            }
        };
    }

    // Wire application name and notes click to open notes drawer
    list.querySelectorAll('.application-jump-link').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const id = btn.getAttribute('data-app-id');
            if (!id) return;
            openNotesDrawerForApplication(id);
        });
    });

    // Wire row click (excluding controls) to open inline edit mode
    list.querySelectorAll('tr[data-app-id]').forEach(row => {
        row.addEventListener('click', (e) => {
            const target = e.target;
            // Ignore clicks on controls: radio, status select, links, notes/name buttons
            if (target.closest('input[type="radio"]') ||
                target.closest('.app-status-select') ||
                target.closest('a') ||
                target.closest('.application-jump-link')) {
                return;
            }
            if (row.dataset.editing === 'true') return;
            const appId = row.getAttribute('data-app-id');
            if (!appId) return;
            const apps = state.applications || [];
            const app = apps.find(a => String(a._id) === String(appId));
            if (!app) return;
            enterApplicationEditMode(row, app);
        });
    });
}
