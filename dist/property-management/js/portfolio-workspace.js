// Property management: portfolio workspace.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// Portfolio applications share the property-tab workflow and existing portfolio styles.
function portfolioApplicationFields(app) {
    let notes = {};
    try { const parsed = JSON.parse(app.notes || '{}'); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) notes = parsed; } catch {}
    return { notes, address: notes.propertyAddress || '', unit: notes.unitNumber || app.unit || '' };
}

function portfolioApplicationProperty(app) {
    const properties = state.properties || [], fields = portfolioApplicationFields(app);
    const explicit = portfolioPropertyId(app) || portfolioPropertyId(fields.notes);
    if (explicit) return properties.find(p => String(p._id) === explicit) || null;
    const normalize = value => String(value || '').toLowerCase().replace(/<br\s*\/?\s*>/gi, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\b(street|avenue|road|drive|boulevard|lane|court|place|parkway|north|south|east|west)\b/g, word => ({street:'st',avenue:'ave',road:'rd',drive:'dr',boulevard:'blvd',lane:'ln',court:'ct',place:'pl',parkway:'pkwy',north:'n',south:'s',east:'e',west:'w'})[word]).replace(/\s+/g, ' ').trim();
    const address = normalize(fields.address);
    if (address) {
        const candidates = properties.map(property => {
            const a = property.address || {};
            const street = normalize(typeof a === 'string' ? a.split(',')[0] : a.line1 || a.addressLine1 || '');
            const full = normalize(typeof a === 'string' ? a : [a.line1 || a.addressLine1, a.line2 || a.addressLine2, a.city, a.state, a.zip || a.zipCode || a.postalCode].filter(Boolean).join(' '));
            const score = full && address === full ? 3 : street && address === street ? 2 : street && address.startsWith(street + ' ') && (address === full || full.startsWith(address + ' ')) ? 1 : 0;
            return { property, score };
        });
        const best = Math.max(0, ...candidates.map(candidate => candidate.score));
        const matches = candidates.filter(candidate => best && candidate.score === best).map(candidate => candidate.property);
        if (matches.length === 1) return matches[0];
        if (matches.length > 1 && fields.unit) {
            const ids = new Set((state.allUnits || []).filter(u => String(u.number).trim().toLowerCase() === String(fields.unit).trim().toLowerCase()).map(portfolioPropertyId));
            const withUnit = matches.filter(p => ids.has(String(p._id)));
            if (withUnit.length === 1) return withUnit[0];
        }
        return null;
    }
    if (!fields.unit) return null;
    const ids = new Set((state.allUnits || []).filter(u => String(u.number).trim().toLowerCase() === String(fields.unit).trim().toLowerCase()).map(portfolioPropertyId).filter(Boolean));
    return ids.size === 1 ? properties.find(p => ids.has(String(p._id))) : null;
}

function choosePortfolioApplicationProperty(app) {
    return new Promise(resolve => {
        const modal = document.createElement('div');
        modal.className = 'modal property-drawer-open';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'applicationPropertyTitle');
        const safe = value => escapeHtml(String(value || ''));
        modal.innerHTML = `<div class="modal-content"><div class="modal-header"><h2 id="applicationPropertyTitle">Select the applicant’s property</h2></div><form><div class="form-group"><p>${safe(app.name)} is approved. Choose the property to continue to the prefilled tenant form.</p><label for="approvedApplicationProperty">Property</label><select id="approvedApplicationProperty" required><option value="">Select a property</option>${(state.properties || []).map(p => `<option value="${safe(p._id)}">${safe(p.name)} — ${safe(typeof p.address === 'string' ? p.address : [p.address?.line1 || p.address?.addressLine1, p.address?.city, p.address?.state].filter(Boolean).join(', '))}</option>`).join('')}</select></div><div class="modal-footer"><button type="button" class="btn-secondary" data-cancel>Cancel</button><button type="submit" class="btn-primary">Continue to new tenant</button></div></form></div>`;
        const finish = property => { modal.remove(); if (!document.querySelector('.modal.property-drawer-open')) document.body.classList.remove('property-drawer-lock'); resolve(property); };
        modal.querySelector('[data-cancel]').onclick = () => finish(null);
        modal.querySelector('form').onsubmit = event => {
            event.preventDefault();
            const property = (state.properties || []).find(p => String(p._id) === modal.querySelector('select').value);
            if (property) finish(property);
        };
        modal.onkeydown = event => { if (event.key === 'Escape') { event.stopPropagation(); finish(null); } };
        document.body.appendChild(modal);
        document.body.classList.add('property-drawer-lock');
        modal.style.display = 'flex';
        modal.querySelector('select').focus();
    });
}

function refreshPortfolioApplicationWorkspace() {
    if (state.portfolioWorkspaceMode === 'applications' && (state.portfolioApplicationType || 'application') === 'application') renderUnifiedPortfolioWorkspace(false);
}

function renderPortfolioApplicationsWorkspace() {
    const root = document.getElementById('portfolioComparisonTable'), pager = document.getElementById('portfolioComparisonPagination');
    if (!root || !pager) return;
    const query = String(document.getElementById('portfolioComparisonSearch')?.value || '').trim().toLowerCase();
    const filter = document.getElementById('portfolioWorkspaceFilter')?.value || 'all';
    const apps = (state.applications || []).filter(app => {
        const fields = portfolioApplicationFields(app);
        return (filter === 'all' || filter === (app.status || 'pending')) && (!query || [app.name, app.email, app.phone, fields.address, fields.unit].join(' ').toLowerCase().includes(query));
    });
    const size = Number(state.portfolioRowsPerPage || 15), pages = Math.max(1, Math.ceil(apps.length / size));
    const page = Math.max(1, Math.min(state.portfolioComparisonPage || 1, pages));
    state.portfolioComparisonPage = page;
    const visible = apps.slice((page - 1) * size, page * size);
    const columns = ['', 'Applicant', 'Email', 'Phone', 'Property Address', 'Unit', 'Move-In', 'Submitted', 'Notes', 'Status', 'Actions'];
    const safe = value => escapeHtml(String(value ?? ''));
    const date = (value, submitted) => {
        if (!value || isNaN(new Date(value).getTime())) return '—';
        return submitted ? new Date(value).toLocaleString('en-US') : new Date(value).toLocaleDateString('en-US', { timeZone: 'UTC', month: '2-digit', day: '2-digit', year: 'numeric' });
    };
    root.innerHTML = visible.length ? `<table class="portfolio-performance-table"><thead><tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${visible.map(app => {
        const fields = portfolioApplicationFields(app), status = app.status || 'pending';
        return `<tr data-portfolio-application-id="${safe(app._id)}">
            <td><input type="radio" name="portfolioSelectedApplication" data-application-select aria-label="Select ${safe(app.name || 'application')}" ${String(state.portfolioSelectedApplicationId) === String(app._id) ? 'checked' : ''}></td>
            <td><button type="button" class="overview-row-action portfolio-record-primary" data-application-notes>${safe(app.name)}</button></td>
            <td>${safe(app.email)}</td><td>${safe(app.phone)}</td><td>${safe(fields.address || '—')}</td><td>${safe(fields.unit || '—')}</td>
            <td>${date(app.moveIn, false)}</td><td>${date(app.submitted, true)}</td>
            <td><button type="button" class="portfolio-note-count" data-application-notes aria-label="Open application notes"><i class="fas fa-note-sticky"></i> ${Array.isArray(app.notesHistory) ? app.notesHistory.length : 0}</button></td>
            <td><select data-application-status aria-label="Application status">${['pending', 'approved', 'rejected'].map(s => `<option value="${s}" ${status === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></td>
            <td><a class="overview-row-action" href="/applications/review/${encodeURIComponent(app._id)}" target="_blank" rel="noopener">View</a></td>
        </tr>`;
    }).join('')}</tbody></table>` : '<div class="empty-compact">No applications match the current portfolio filters.</div>';
    // Reuse the property tab's Actions menu markup and styling without duplicate IDs.
    const original = document.getElementById('applicationsActionsWrapper');
    if (original && visible.length) {
        const actions = original.cloneNode(true);
        actions.id = 'portfolioApplicationsActionsWrapper';
        actions.querySelectorAll('[id]').forEach(el => { el.id = 'portfolio-' + el.id; });
        const menu = actions.querySelector('#portfolio-applicationsActionsMenu');
        const toggle = actions.querySelector('#portfolio-applicationsActionsBtn');
        actions.style.display = visible.some(a => String(a._id) === String(state.portfolioSelectedApplicationId)) ? 'flex' : 'none';
        menu.style.display = 'none';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.onclick = () => { const open = menu.style.display === 'none'; menu.style.display = open ? 'block' : 'none'; toggle.setAttribute('aria-expanded', String(open)); };
        const selected = () => Array.from(root.querySelectorAll('[data-portfolio-application-id]')).find(row => row.dataset.portfolioApplicationId === String(state.portfolioSelectedApplicationId));
        actions.querySelector('#portfolio-editApplicationBtn').onclick = () => {
            menu.style.display = 'none'; toggle.setAttribute('aria-expanded', 'false');
            const row = selected(), app = (state.applications || []).find(a => String(a._id) === String(state.portfolioSelectedApplicationId));
            editPortfolioWorkspaceApplication(row, app);
        };
        actions.querySelector('#portfolio-deleteApplicationBtn').onclick = async () => {
            const id = state.portfolioSelectedApplicationId;
            if (!id || !confirm('Delete this application? This cannot be undone.')) return;
            try {
                const res = await fetch(`/api/rental-applications/${encodeURIComponent(id)}`, { method: 'DELETE' });
                if (!res.ok) throw new Error('Delete failed');
                state.applications = (state.applications || []).filter(a => String(a._id) !== String(id));
                state.portfolioSelectedApplicationId = null;
                refreshPortfolioApplicationWorkspace(); updateTabCounts();
                showNotification('Application deleted', 'success');
            } catch { showNotification('Could not delete application', 'error'); }
        };
        root.prepend(actions);
    }
    root.querySelectorAll('[data-portfolio-application-id]').forEach(row => {
        const app = (state.applications || []).find(a => String(a._id) === row.dataset.portfolioApplicationId);
        row.querySelector('[data-application-select]').onclick = event => {
            state.portfolioSelectedApplicationId = String(state.portfolioSelectedApplicationId) === String(app._id) ? null : app._id;
            event.currentTarget.checked = !!state.portfolioSelectedApplicationId;
            const actions = document.getElementById('portfolioApplicationsActionsWrapper');
            if (actions) actions.style.display = state.portfolioSelectedApplicationId ? 'flex' : 'none';
        };
        row.querySelectorAll('[data-application-notes]').forEach(button => button.onclick = () => openNotesDrawerForApplication(app._id));
        row.querySelector('[data-application-status]').onchange = event => updatePortfolioWorkspaceApplicationStatus(app, event.currentTarget);
        row.onclick = event => { if (!event.target.closest('button,a,input,select,textarea')) editPortfolioWorkspaceApplication(row, app); };
    });
    pager.innerHTML = `<button ${page <= 1 ? 'disabled' : ''} onclick="state.portfolioComparisonPage--;renderUnifiedPortfolioWorkspace(false)"><i class="fas fa-chevron-left"></i></button><span class="task-meta">Page ${page} of ${pages} · ${apps.length} records</span><button ${page >= pages ? 'disabled' : ''} onclick="state.portfolioComparisonPage++;renderUnifiedPortfolioWorkspace(false)"><i class="fas fa-chevron-right"></i></button>`;
}

async function updatePortfolioWorkspaceApplicationStatus(app, select) {
    const status = select.value, previous = app.status || 'pending';
    select.disabled = true;
    try {
        const res = await fetch(`/api/rental-applications/${encodeURIComponent(app._id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
        if (!res.ok) throw new Error('Status update failed');
        const saved = await res.json();
        Object.assign(app, saved.application || {}, { status });
        const current = (state.applications || []).find(item => String(item._id) === String(app._id));
        if (current) Object.assign(current, app);
        showNotification('Application status updated', 'success');
        if (status === 'approved') {
            const property = portfolioApplicationProperty(app) || await choosePortfolioApplicationProperty(app);
            if (property) {
                await selectProperty(property._id);
                if (String(state.currentProperty?._id) !== String(property._id)) throw new Error('Property could not be opened');
                prefillTenantFromApplication({ ...app, unit: portfolioApplicationFields(app).unit, notes: encodeURIComponent(JSON.stringify(portfolioApplicationFields(app).notes)) });
                openModal('addTenantModal');
            }
        }
        refreshPortfolioApplicationWorkspace();
    } catch {
        select.value = app.status || previous;
        showNotification(app.status === status ? 'Status saved, but the tenant form could not be opened.' : 'Could not update status', 'error');
    } finally { select.disabled = false; }
}

function editPortfolioWorkspaceApplication(row, app) {
    if (!row || !app || row.dataset.editing === 'true') return;
    row.dataset.editing = 'true';
    const fields = portfolioApplicationFields(app), cells = row.querySelectorAll('td');
    const values = [app.name, app.email, app.phone, fields.address, fields.unit, app.moveIn && !isNaN(new Date(app.moveIn)) ? new Date(app.moveIn).toISOString().slice(0, 10) : ''];
    const names = ['name', 'email', 'phone', 'property', 'unit', 'movein'];
    const inputs = values.map((value, index) => {
        const input = document.createElement('input');
        input.type = index === 1 ? 'email' : index === 5 ? 'date' : 'text';
        input.className = `app-inline-input app-inline-${names[index]}`;
        input.setAttribute('aria-label', ['Applicant', 'Email', 'Phone', 'Property Address', 'Unit', 'Move-In'][index]);
        input.value = value || ''; cells[index + 1].replaceChildren(input); return input;
    });
    let saving = false;
    const cleanup = () => document.removeEventListener('click', outside, true);
    const save = async () => {
        if (saving) return;
        if (!inputs.every(input => input.reportValidity())) return;
        saving = true;
        const [name, email, phone, address, unit, moveIn] = inputs.map(input => input.value.trim());
        const payload = { name, email, phone, unit, moveIn: moveIn || undefined, notes: JSON.stringify({ ...fields.notes, propertyAddress: address, unitNumber: unit }) };
        try {
            const res = await fetch(`/api/rental-applications/${encodeURIComponent(app._id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!res.ok) throw new Error('Update failed');
            const data = await res.json(), updated = data.application || data;
            state.applications = (state.applications || []).map(a => String(a._id) === String(app._id) ? { ...a, ...updated } : a);
            cleanup(); refreshPortfolioApplicationWorkspace();
            showNotification('Application updated', 'success');
        } catch { showNotification('Could not update application. Your edits are still available in this row.', 'error'); }
        finally { saving = false; }
    };
    const outside = event => { if (!row.isConnected) { cleanup(); return; } if (!row.contains(event.target)) save(); };
    document.addEventListener('click', outside, true);
    row.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); save(); }
        if (event.key === 'Escape' && !saving) { cleanup(); refreshPortfolioApplicationWorkspace(); }
    });
    inputs[0].focus();
}

function setupPortfolioInviteActions() {
    const root = document.getElementById('portfolioComparisonTable');
    const table = root?.querySelector('.portfolio-performance-table');
    if (!table) return;
    const head = table.querySelector('thead tr');
    head.lastElementChild?.remove();
    head.insertAdjacentHTML('afterbegin', '<th aria-label="Select invite"></th>');
    const source = document.getElementById('invitesActionsWrapper');
    if (!source) return;
    const actions = source.cloneNode(true);
    actions.id = 'portfolioInvitesActions';
    actions.style.justifyContent = 'flex-end';
    actions.querySelectorAll('[id]').forEach(el => el.id = 'portfolio-' + el.id);
    const menu = actions.querySelector('#portfolio-invitesActionsMenu');
    const toggle = actions.querySelector('#portfolio-invitesActionsBtn');
    menu.style.display = 'none';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.onclick = () => { const open = menu.style.display === 'none'; menu.style.display = open ? 'block' : 'none'; toggle.setAttribute('aria-expanded', String(open)); };
    let selectedRow = null;
    table.querySelectorAll('tbody tr').forEach(row => {
        const button = row.querySelector('button[onclick*="openPortfolioRecordDrawer"]');
        const match = button?.getAttribute('onclick')?.match(/openPortfolioRecordDrawer\('invite','([^']+)'\)/);
        if (!match) return;
        const id = match[1];
        row.dataset.portfolioInviteId = id;
        button.closest('td').remove();
        const cell = document.createElement('td'), radio = document.createElement('input');
        radio.type = 'radio'; radio.name = 'portfolioSelectedInvite';
        radio.setAttribute('aria-label', 'Select invite');
        radio.checked = String(state.portfolioSelectedInviteId) === id;
        if (radio.checked) selectedRow = row;
        radio.onclick = () => {
            state.portfolioSelectedInviteId = String(state.portfolioSelectedInviteId) === id ? null : id;
            radio.checked = !!state.portfolioSelectedInviteId;
            selectedRow = radio.checked ? row : null;
            actions.style.display = selectedRow ? 'flex' : 'none';
            menu.style.display = 'none'; toggle.setAttribute('aria-expanded', 'false');
        };
        cell.appendChild(radio); row.prepend(cell);
        row.tabIndex = 0;
        row.onclick = event => {
            if (row.dataset.editing === 'true' || event.target.closest('button,input,select,textarea,a')) return;
            openPortfolioRecordDrawer('invite', id);
        };
        row.onkeydown = event => {
            if (event.target !== row || !['Enter', ' '].includes(event.key) || row.dataset.editing === 'true') return;
            event.preventDefault(); openPortfolioRecordDrawer('invite', id);
        };
    });
    actions.style.display = selectedRow ? 'flex' : 'none';
    actions.querySelector('#portfolio-editInviteBtn').onclick = () => {
        menu.style.display = 'none'; toggle.setAttribute('aria-expanded', 'false');
        const invite = (state.invites || []).find(item => String(item._id) === String(state.portfolioSelectedInviteId));
        if (selectedRow && invite) editPortfolioWorkspaceInvite(selectedRow, invite);
    };
    actions.querySelector('#portfolio-deleteInviteBtn').onclick = async event => {
        const id = state.portfolioSelectedInviteId;
        if (!id || !confirm('Delete this invite? This cannot be undone.')) return;
        const button = event.currentTarget; button.disabled = true;
        try {
            const response = await fetch(`/api/application-invites/${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Delete failed');
            state.invites = (state.invites || []).filter(item => String(item._id) !== String(id));
            state.portfolioSelectedInviteId = null;
            refreshPortfolioInvites();
            showNotification('Invite deleted', 'success');
        } catch { showNotification('Could not delete invite', 'error'); }
        finally { button.disabled = false; }
    };
    root.prepend(actions);
}

function refreshPortfolioInvites() {
    if (state.portfolioWorkspaceMode === 'applications' && state.portfolioApplicationType === 'invite') renderUnifiedPortfolioWorkspace(false);
}

function editPortfolioWorkspaceInvite(row, invite) {
    if (row.dataset.editing === 'true') return;
    row.dataset.editing = 'true';
    const cells = row.querySelectorAll('td');
    const input = (type, value, label) => {
        const el = document.createElement('input'); el.type = type; el.value = value || '';
        el.className = 'app-inline-input'; el.setAttribute('aria-label', label); return el;
    };
    const name = input('text', invite.name, 'Invitee name'), email = input('email', invite.email, 'Invitee email');
    const property = input('text', invite.propertyName, 'Property'), unit = input('text', invite.unitNumber, 'Unit');
    const url = input('url', invite.applicationUrl, 'Application URL');
    const status = document.createElement('select'); status.className = 'app-inline-input'; status.setAttribute('aria-label', 'Invite status');
    Array.from(new Set(['sent','opened','completed','expired',invite.status || 'sent'])).forEach(value => {
        const option = document.createElement('option'); option.value = value; option.textContent = value;
        option.selected = value === (invite.status || 'sent'); status.appendChild(option);
    });
    cells[1].replaceChildren(name, email); cells[3].replaceChildren(property); cells[4].replaceChildren(unit); cells[5].replaceChildren(status);
    const save = document.createElement('button'), cancel = document.createElement('button');
    save.type = cancel.type = 'button'; save.className = cancel.className = 'overview-row-action';
    save.textContent = 'Save'; cancel.textContent = 'Cancel';
    cells[2].replaceChildren(url, save, cancel);
    cancel.onclick = () => refreshPortfolioInvites();
    save.onclick = async () => {
        if (![name,email,property,unit,url].every(el => el.reportValidity())) return;
        save.disabled = cancel.disabled = true;
        try {
            const payload = { name:name.value.trim(), email:email.value.trim(), propertyName:property.value.trim(), unitNumber:unit.value.trim(), status:status.value, applicationUrl:url.value.trim() };
            const response = await fetch(`/api/application-invites/${encodeURIComponent(invite._id)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
            if (!response.ok) throw new Error('Update failed');
            const data = await response.json();
            state.invites = (state.invites || []).map(item => String(item._id) === String(invite._id) ? { ...item, ...(data.invite || data) } : item);
            refreshPortfolioInvites(); showNotification('Invite updated', 'success');
        } catch { showNotification('Could not update invite. Your edits remain in the row.', 'error'); }
        finally { save.disabled = cancel.disabled = false; }
    };
    name.focus();
}

function addPortfolioApplicationNoteCounts(){
    const table=document.querySelector('#portfolioComparisonTable .portfolio-performance-table');if(!table)return;
    const head=table.querySelector('thead tr'),lastHead=head?.lastElementChild;if(lastHead&&!head.querySelector('[data-notes-column]'))lastHead.insertAdjacentHTML('beforebegin','<th data-notes-column>Notes</th>');
    table.querySelectorAll('tbody tr').forEach(row=>{if(row.querySelector('[data-note-count-cell]'))return;const action=row.querySelector('button[onclick*="openPortfolioRecordDrawer"]'),match=action?.getAttribute('onclick')?.match(/openPortfolioRecordDrawer\('(application|invite)','([^']+)'\)/);if(!match)return;const [,kind,id]=match,item=(kind==='invite'?state.invites:state.applications||[]).find(x=>String(x._id)===String(id)),count=Array.isArray(item?.notesHistory)?item.notesHistory.length:0,cell=document.createElement('td');cell.dataset.noteCountCell='true';cell.innerHTML=`<button class="portfolio-note-count" onclick="${kind==='invite'?'openNotesDrawerForInvite':'openNotesDrawerForApplication'}('${id}')" title="Open ${count} note${count===1?'':'s'}"><i class="fas fa-note-sticky"></i> ${count}</button>`;action.closest('td')?.insertAdjacentElement('beforebegin',cell);});
}

function copyPortfolioInviteUrl(url){if(!url)return;const done=()=>showNotification('Invite URL copied','success');if(navigator.clipboard?.writeText)navigator.clipboard.writeText(url).then(done).catch(()=>showNotification('Could not copy invite URL','error'));else{const input=document.createElement('textarea');input.value=url;document.body.appendChild(input);input.select();document.execCommand('copy');input.remove();done();}}

function getWorkspaceTenantRecord(tenantId){return(state.tenants||[]).find(t=>String(t._id)===String(tenantId))||(state.allTenants||[]).find(t=>String(t._id)===String(tenantId))||(state.portfolioTenantsWithBalance||[]).find(x=>String(x.tenant?._id)===String(tenantId))?.tenant||null;}

function getHydratedWorkspaceTenantRecord(tenantId){const tenant=getWorkspaceTenantRecord(tenantId);if(!tenant)return null;const record={...tenant};const unitId=tenant.unitId?._id||tenant.unitId;if(unitId&&typeof record.unitId!=='object'){const unit=(state.units||[]).find(u=>String(u._id)===String(unitId))||(state.allUnits||[]).find(u=>String(u._id)===String(unitId));if(unit)record.unitId=unit;}return record;}

function renderPortfolioTenantDrawerContent(tenantId){const tenant=getHydratedWorkspaceTenantRecord(tenantId);if(!tenant)return'';const rent=(state.portfolioTenantsWithBalance||[]).find(x=>String(x.tenant?._id)===String(tenantId)),name=tenant.name||tenant.fullName||`${tenant.firstName||''} ${tenant.lastName||''}`.trim()||'Tenant',initials=name.split(' ').map(part=>part[0]).join('').slice(0,2).toUpperCase()||'T',leaseStart=tenant.leaseStart?formatDateDisplay(tenant.leaseStart,'en-US'):'Not set',leaseEnd=tenant.leaseEnd?formatDateDisplay(tenant.leaseEnd,'en-US'):'Not set',leaseStatus=tenant.leaseStatus||tenant.status||'active',leaseStatusText=String(leaseStatus).charAt(0).toUpperCase()+String(leaseStatus).slice(1),propertyName=portfolioPropertyName(portfolioPropertyId(tenant)),unitLabel=tenant.unitId&&typeof tenant.unitId==='object'?`Unit ${tenant.unitId.number||'—'}`:`Unit ${portfolioUnitName(tenant.unitId?._id||tenant.unitId)}`,leaseHoldersHtml=(tenant.leaseHolders&&tenant.leaseHolders.length)?`<ul class="portfolio-tenant-detail-list">${tenant.leaseHolders.map(holder=>`<li><strong>${escapeHtml(holder.name||'Lease holder')}</strong>${holder.phone?`<div><i class="fas fa-phone"></i> ${escapeHtml(holder.phone)}</div>`:''}${holder.email?`<div><i class="fas fa-envelope"></i> ${escapeHtml(holder.email)}</div>`:''}</li>`).join('')}</ul>`:'<div class="task-meta">None listed</div>';let unitInfoHtml='<div class="task-meta">No unit assigned</div>';if(tenant.unitId&&typeof tenant.unitId==='object'){unitInfoHtml=`<div class="portfolio-tenant-detail-paragraphs"><p><i class="fas fa-home"></i> Unit ${escapeHtml(tenant.unitId.number||'—')}</p><p><i class="fas fa-bed"></i> ${escapeHtml(String(tenant.unitId.bedrooms??'N/A'))} Bedrooms, ${escapeHtml(String(tenant.unitId.bathrooms??'N/A'))} Bathrooms</p><p><i class="fas fa-ruler-combined"></i> ${escapeHtml(String(tenant.unitId.sqft||'N/A'))} sq ft</p><p><i class="fas fa-building"></i> Floor ${escapeHtml(String(tenant.unitId.floor||'1'))}</p></div>`;}let leaseTypeDetails='';if(tenant.leaseType==='fmr')leaseTypeDetails=`<p><i class="fas fa-sticky-note"></i> FMR Notes: ${escapeHtml(tenant.fmrNotes||'None')}</p>`;else if(tenant.leaseType==='section8')leaseTypeDetails=`<p><i class="fas fa-building"></i> HUB Contribution: $${Number(tenant.hubContribution||0).toFixed(2)}</p><p><i class="fas fa-user"></i> Tenant Contribution: $${Number(tenant.tenantContribution||0).toFixed(2)}</p>`;const petFees=tenant.pets?.hasPets?(Number(tenant.pets.monthlyRent)||0):0,additionalFees=(Number(tenant.waterFee)||0)+(Number(tenant.trashFee)||0)+(Number(tenant.adminFee)||0)+(tenant.additionalFee?.amount||0)+petFees,totalRent=(Number(tenant.baseRent)||0)+additionalFees,additionalFeeLabel=tenant.additionalFee?.type==='other'&&tenant.additionalFee?.label?tenant.additionalFee.label:tenant.additionalFee?.type==='parking'?'Parking Fee':tenant.additionalFee?.type==='storage'?'Storage Fee':tenant.additionalFee?.label||'Other Fee',occupantsHtml=(tenant.authorizedOccupants||[]).length?`<ul class="portfolio-tenant-detail-list">${tenant.authorizedOccupants.map(occupant=>`<li>${escapeHtml(String(occupant))}</li>`).join('')}</ul>`:'<div class="task-meta">None listed</div>';let petsHtml='<div class="task-meta">No pets listed</div>';if(tenant.pets?.hasPets){petsHtml=`<div class="portfolio-tenant-detail-paragraphs"><p><i class="fas fa-dog"></i> ${tenant.pets.count||1} pet${Number(tenant.pets.count||1)>1?'s':''}</p>${tenant.pets.fee?`<p><i class="fas fa-dollar-sign"></i> Fee: $${Number(tenant.pets.fee).toFixed(2)}</p>`:''}${tenant.pets.nonRefundableFee?`<p><i class="fas fa-receipt"></i> Non-refundable Fee: $${Number(tenant.pets.nonRefundableFee).toFixed(2)}</p>`:''}${tenant.pets.monthlyRent?`<p><i class="fas fa-calendar-dollar"></i> Monthly Pet Rent: $${Number(tenant.pets.monthlyRent).toFixed(2)}</p>`:''}${tenant.pets.depositIncrease?`<p><i class="fas fa-arrow-up"></i> Deposit Increase: $${Number(tenant.pets.depositIncrease).toFixed(2)}</p>`:''}</div>${Array.isArray(tenant.pets.details)&&tenant.pets.details.length?`<ul class="portfolio-tenant-detail-list">${tenant.pets.details.map((pet,index)=>`<li><strong>Pet #${index+1}</strong>${pet.type?`<div>Type: ${escapeHtml(pet.type)}</div>`:''}${pet.name?`<div>Name: ${escapeHtml(pet.name)}</div>`:''}${pet.breed?`<div>Breed: ${escapeHtml(pet.breed)}</div>`:''}${pet.weight?`<div>Weight/Size: ${escapeHtml(pet.weight)}</div>`:''}${pet.age?`<div>Age: ${escapeHtml(String(pet.age))}</div>`:''}${pet.gender?`<div>Gender: ${escapeHtml(pet.gender)}</div>`:''}${pet.vaccination?`<div>Vaccination/Licensing #: ${escapeHtml(pet.vaccination)}</div>`:''}</li>`).join('')}</ul>`:''}`;}const carsHtml=tenant.cars?.hasCar&&Array.isArray(tenant.cars.details)&&tenant.cars.details.length?`<ul class="portfolio-tenant-detail-list">${tenant.cars.details.map((car,index)=>`<li><strong>Car #${index+1}:</strong> ${escapeHtml([car.year,car.make,car.model].filter(Boolean).join(' ')||'Vehicle')} ${car.color?`(${escapeHtml(car.color)})`:''}${car.licensePlate?` - Plate: ${escapeHtml(car.licensePlate)}`:''}</li>`).join('')}</ul>`:'<div class="task-meta">No cars listed</div>',emergencyHtml=tenant.emergencyContact?`<div class="portfolio-tenant-detail-paragraphs"><p><i class="fas fa-user-shield"></i> ${escapeHtml(tenant.emergencyContact.name||'N/A')}</p><p><i class="fas fa-phone"></i> ${escapeHtml(tenant.emergencyContact.phone||'N/A')}</p><p><i class="fas fa-envelope"></i> ${escapeHtml(tenant.emergencyContact.email||'N/A')}</p><p><i class="fas fa-map-marker-alt"></i> ${escapeHtml(tenant.emergencyContact.address||'N/A')}</p><p><i class="fas fa-user-friends"></i> Relation: ${escapeHtml(tenant.emergencyContact.relation||'N/A')}</p></div>`:'<div class="task-meta">N/A</div>',createdAt=tenant.createdAt?new Date(tenant.createdAt).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}):'Not set',updatedAt=tenant.updatedAt?new Date(tenant.updatedAt).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}):'Not set',notes=Array.isArray(tenant.notesHistory)?tenant.notesHistory:[],notesHtml=notes.length?notes.slice().sort((a,b)=>new Date(a.createdAt||0)-new Date(b.createdAt||0)).map(note=>`<div class="portfolio-notes-bubble"><div>${escapeHtml(note.text||note.note||note.content||'')}</div><span class="portfolio-notes-timestamp">${escapeHtml(note.authorName||note.createdByName||note.managerName||note.createdBy||'Management')}${note.createdAt?` · ${escapeHtml(new Date(note.createdAt).toLocaleString())}`:''}</span></div>`).join(''):'<div class="empty-compact">No notes recorded.</div>';return `<div class="portfolio-tenant-drawer-shell"><section class="portfolio-tenant-drawer-header"><div class="portfolio-tenant-drawer-avatar">${escapeHtml(initials)}</div><div class="portfolio-tenant-drawer-heading"><h4>${escapeHtml(name)}</h4><p>${escapeHtml(propertyName)} · ${escapeHtml(unitLabel)}</p></div><div class="portfolio-tenant-drawer-badges"><span class="lease-badge ${escapeHtml(String(leaseStatus).toLowerCase())}">${escapeHtml(leaseStatusText)}</span><span class="portfolio-paid-status"><i class="fas fa-note-sticky"></i> ${notes.length} notes</span></div></section><div class="portfolio-inline-summary"><div><span>Base rent</span><strong>${portfolioMoney(tenant.baseRent)}</strong></div><div><span>Expected</span><strong>${portfolioMoney(rent?.expectedMonthly)}</strong></div><div><span>Collected</span><strong>${portfolioMoney(rent?.paidThisMonth)}</strong></div><div><span>Remaining</span><strong>${portfolioMoney(rent?.remainingRent)}</strong></div></div><div class="portfolio-tenant-actions"><button type="button" class="btn-secondary" data-eviction-tenant="${tenant._id}" onclick="closePortfolioRecordDrawer();openEvictionCases('${tenant._id}')">Eviction case</button><button type="button" class="btn-primary" onclick="closePortfolioRecordDrawer();editTenant('${tenant._id}')"><i class="fas fa-edit"></i> Edit Tenant</button><button type="button" class="btn-secondary" onclick="closePortfolioRecordDrawer();openPortfolioTenantLedger('${tenant._id}')"><i class="fas fa-book-open"></i> Open Ledger</button></div><div class="portfolio-tenant-drawer-grid"><section class="portfolio-drawer-section"><h4>Contact Information</h4><div class="portfolio-tenant-detail-paragraphs"><p><i class="fas fa-phone"></i> ${escapeHtml(tenant.phone||'N/A')}</p><p><i class="fas fa-envelope"></i> ${escapeHtml(tenant.email||'N/A')}</p></div></section><section class="portfolio-drawer-section"><h4>Additional Lease Holders</h4>${leaseHoldersHtml}</section><section class="portfolio-drawer-section"><h4>Unit Information</h4>${unitInfoHtml}</section><section class="portfolio-drawer-section"><h4>Lease Information</h4><div class="portfolio-tenant-detail-paragraphs"><p><i class="fas fa-calendar-alt"></i> Start Date: ${escapeHtml(leaseStart)}</p><p><i class="fas fa-calendar-check"></i> End Date: ${escapeHtml(leaseEnd)}</p><p><i class="fas fa-dollar-sign"></i> Deposit: $${Number(tenant.deposit||0).toFixed(2)}</p><p><i class="fas fa-dollar-sign"></i> Base Rent: $${Number(tenant.baseRent||0).toFixed(2)}</p><p><i class="fas fa-tint"></i> Water Fee: $${Number(tenant.waterFee||0).toFixed(2)}</p><p><i class="fas fa-trash"></i> Trash Fee: $${Number(tenant.trashFee||0).toFixed(2)}</p><p><i class="fas fa-user-cog"></i> Admin Fee: $${Number(tenant.adminFee||0).toFixed(2)}</p><p><i class="fas fa-square-parking"></i> Parking: ${escapeHtml(tenant.parking||'Unassigned')}</p><p><i class="fas fa-key"></i> Access Code: ${escapeHtml(tenant.accessCode||'Not set')}</p>${tenant.additionalFee?.amount?`<p><i class="fas fa-coins"></i> ${escapeHtml(additionalFeeLabel)}: $${Number(tenant.additionalFee.amount).toFixed(2)}</p>`:''}${tenant.pets?.hasPets&&tenant.pets.monthlyRent?`<p><i class="fas fa-dog"></i> Monthly Pet Rent: $${Number(tenant.pets.monthlyRent||0).toFixed(2)}</p>`:''}<p><span class="portfolio-tenant-rent-total"><i class="fas fa-calculator"></i> Total Rent: $${totalRent.toFixed(2)}</span></p><p><i class="fas fa-file-contract"></i> Lease Type: ${escapeHtml(tenant.leaseType==='fmr'?'Free Market Rent':tenant.leaseType==='section8'?'Section 8':'N/A')}</p>${leaseTypeDetails}<p><i class="fas fa-info-circle"></i> Lease Status: <span class="lease-badge ${escapeHtml(String(leaseStatus).toLowerCase())}">${escapeHtml(leaseStatusText)}</span></p><p><i class="fas fa-redo"></i> Renewal: ${escapeHtml(tenant.leaseRenewal==='renew'?'Will Renew':'Will Terminate')}</p></div></section><section class="portfolio-drawer-section"><h4>Emergency Contact</h4>${emergencyHtml}</section><section class="portfolio-drawer-section"><h4>Authorized Occupants</h4>${occupantsHtml}</section><section class="portfolio-drawer-section"><h4>Pets</h4>${petsHtml}</section><section class="portfolio-drawer-section"><h4>Cars</h4>${carsHtml}</section><section class="portfolio-drawer-section"><h4>Additional Information</h4><div class="portfolio-tenant-detail-paragraphs"><p><i class="fas fa-clock"></i> Added: ${escapeHtml(createdAt)}</p><p><i class="fas fa-sync"></i> Last Updated: ${escapeHtml(updatedAt)}</p></div></section></div><section class="portfolio-drawer-section portfolio-tenant-drawer-notes" data-portfolio-tenant-notes><h4><i class="fas fa-note-sticky"></i> Notes (${notes.length})</h4>${notesHtml}</section></div>`;}



async function ensureWorkspaceTenantEditContext(tenantId){const tenant=getWorkspaceTenantRecord(tenantId);if(!tenant)throw new Error('Tenant not found');const propertyId=portfolioPropertyId(tenant);if(!propertyId)return tenant;const property=(state.properties||[]).find(item=>String(item._id)===String(propertyId));if(property)state.currentProperty=property;const needsUnits=!Array.isArray(state.units)||!state.units.some(unit=>String(unit._id)===String(tenant.unitId?._id||tenant.unitId));const needsTenants=!Array.isArray(state.tenants)||!state.tenants.some(item=>String(item._id)===String(tenantId));if(needsUnits)await loadUnits(propertyId,true);if(needsTenants)await loadTenants(propertyId,true);return tenant;}
