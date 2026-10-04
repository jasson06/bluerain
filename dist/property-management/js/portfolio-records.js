// Property management: portfolio records.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// ===== Portfolio Tenants Search =====
function initializePortfolioTenantsSearch() {
    const search = document.getElementById('portfolioTenantsSearchBar');
    if (!search) return;
    if (search.dataset._inited === '1') return;
    search.dataset._inited = '1';
    const debouncedRender = debounce(renderFilteredPortfolioTenants, 200);
    search.addEventListener('input', () => {
        positionPortfolioTenantsSearchSuggestions();
        autoSuggestPortfolioTenants();
        showPortfolioTenantsSearchSuggestions(true);
        debouncedRender();
    });
    search.addEventListener('change', () => {
        positionPortfolioTenantsSearchSuggestions();
        debouncedRender();
    });
    search.addEventListener('focus', () => {
        positionPortfolioTenantsSearchSuggestions();
        showPortfolioTenantsSearchSuggestions(true);
    });
    search.addEventListener('blur', () => setTimeout(() => showPortfolioTenantsSearchSuggestions(false), 120));

    const clr = document.getElementById('clearPortfolioTenantsFiltersBtn');
    if (clr) clr.onclick = () => {
        search.value = '';
        window.__portfolioTenantsAccumulatedQuery = '';
        renderFilteredPortfolioTenants();
        showPortfolioTenantsSearchSuggestions(false);
    };

    const sug = document.getElementById('portfolioTenantsSearchSuggestions');
    if (sug) {
        renderPortfolioTenantsSuggestionTokens();
        sug.addEventListener('mousedown', (e) => {
            const tokenEl = e.target.closest('.suggest-item');
            const valEl = e.target.closest('.suggest-value');
            e.preventDefault();
            if (tokenEl) {
                const token = tokenEl.getAttribute('data-token') || '';
                showPortfolioTenantsValueSuggestions(token);
            } else if (valEl) {
                const token = valEl.getAttribute('data-token') || '';
                const value = valEl.getAttribute('data-value') || '';
                const acc = (window.__portfolioTenantsAccumulatedQuery || '').trim();
                const sep = acc ? ' ' : '';
                window.__portfolioTenantsAccumulatedQuery = `${acc}${sep}${token}${value}`;
                const input = document.getElementById('portfolioTenantsSearchBar');
                if (input) input.value = '';
                renderFilteredPortfolioTenants();
                showPortfolioTenantsSearchSuggestions(false);
            }
        });
        const backBtn = document.getElementById('portfolioTenantsSuggestBack');
        if (backBtn) backBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            renderPortfolioTenantsSuggestionTokens();
        });
    }
}

function parsePortfolioTenantsSearch(queryStr) {
    const tokens = { nameList: [], emailList: [], phoneList: [], propertyList: [], unitList: [], statusList: [], text: '' };
    const parts = (queryStr || '').trim().split(/\s+/).filter(Boolean);
    const rest = [];
    for (const part of parts) {
        const low = part.toLowerCase();
        const take = (pfx) => part.slice(pfx.length);
        if (low.startsWith('name:')) tokens.nameList.push(...take('name:').split(',').filter(Boolean));
        else if (low.startsWith('email:')) tokens.emailList.push(...take('email:').split(',').filter(Boolean));
        else if (low.startsWith('phone:')) tokens.phoneList.push(...take('phone:').split(',').filter(Boolean));
        else if (low.startsWith('property:')) tokens.propertyList.push(...take('property:').split(',').filter(Boolean));
        else if (low.startsWith('unit:')) tokens.unitList.push(...take('unit:').split(',').filter(Boolean));
        else if (low.startsWith('status:')) tokens.statusList.push(...take('status:').split(',').filter(Boolean));
        else rest.push(part);
    }
    const norm = (arr) => Array.from(new Set(arr.map(v => String(v).trim().toLowerCase()).filter(Boolean)));
    tokens.nameList = norm(tokens.nameList);
    tokens.emailList = norm(tokens.emailList);
    tokens.phoneList = norm(tokens.phoneList);
    tokens.propertyList = norm(tokens.propertyList);
    tokens.unitList = norm(tokens.unitList);
    tokens.statusList = norm(tokens.statusList);
    tokens.text = rest.join(' ').toLowerCase();
    return { tokens, text: tokens.text };
}

function getPortfolioTenantsSearch() {
    const input = document.getElementById('portfolioTenantsSearchBar');
    const current = input ? input.value : '';
    const combined = `${(window.__portfolioTenantsAccumulatedQuery || '').trim()} ${current.trim()}`.trim();
    const query = parsePortfolioTenantsSearch(combined);
    renderPortfolioTenantsFilterChips(query.tokens);
    return query;
}

function renderPortfolioTenantsFilterChips(tokens) {
    const container = document.getElementById('portfolioTenantsActiveFilterChips');
    if (!container) return;
    const mkChip = (k, v, disp) =>
        `<span class="filter-chip" data-key="${k}" data-value="${v}" style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:#eef2f7;color:#374151;border:1px solid #e5e7eb;font-size:.85em;"><span style="color:#0b5cab;font-weight:600">${k}</span><span>${disp ?? v}</span><button class="chip-remove" style="background:transparent;border:none;color:#6b7280;cursor:pointer;font-weight:700;">×</button></span>`;
    const chips = [];
    tokens.nameList.forEach(v => chips.push(mkChip('name:', v)));
    tokens.emailList.forEach(v => chips.push(mkChip('email:', v)));
    tokens.phoneList.forEach(v => chips.push(mkChip('phone:', v)));
    tokens.propertyList.forEach(v => chips.push(mkChip('property:', v)));
    tokens.unitList.forEach(v => chips.push(mkChip('unit:', v)));
    tokens.statusList.forEach(v => chips.push(mkChip('status:', v)));
    container.innerHTML = chips.join('');
    container.querySelectorAll('.chip-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const chip = e.target.closest('.filter-chip');
            removePortfolioTenantsFilterToken(chip.getAttribute('data-key') || '', chip.getAttribute('data-value') || '');
        });
    });
}

function removePortfolioTenantsFilterToken(key, value) {
    const input = document.getElementById('portfolioTenantsSearchBar');
    const combined = `${(window.__portfolioTenantsAccumulatedQuery || '').trim()} ${(input?.value || '').trim()}`.trim();
    const { tokens } = parsePortfolioTenantsSearch(combined);
    const rem = (arr) => {
        const i = arr.findIndex(v => v === value.toLowerCase());
        if (i >= 0) arr.splice(i, 1);
    };
    switch (key) {
        case 'name:': rem(tokens.nameList); break;
        case 'email:': rem(tokens.emailList); break;
        case 'phone:': rem(tokens.phoneList); break;
        case 'property:': rem(tokens.propertyList); break;
        case 'unit:': rem(tokens.unitList); break;
        case 'status:': rem(tokens.statusList); break;
    }
    const parts = [];
    if (tokens.nameList.length) parts.push(`name:${tokens.nameList.join(',')}`);
    if (tokens.emailList.length) parts.push(`email:${tokens.emailList.join(',')}`);
    if (tokens.phoneList.length) parts.push(`phone:${tokens.phoneList.join(',')}`);
    if (tokens.propertyList.length) parts.push(`property:${tokens.propertyList.join(',')}`);
    if (tokens.unitList.length) parts.push(`unit:${tokens.unitList.join(',')}`);
    if (tokens.statusList.length) parts.push(`status:${tokens.statusList.join(',')}`);
    window.__portfolioTenantsAccumulatedQuery = parts.join(' ');
    if (input) input.value = '';
    renderFilteredPortfolioTenants();
}

function showPortfolioTenantsSearchSuggestions(show) {
    const box = document.getElementById('portfolioTenantsSearchSuggestions');
    if (!box) return;
    if (show) renderPortfolioTenantsSuggestionTokens();
    box.style.display = show ? 'block' : 'none';
}

function positionPortfolioTenantsSearchSuggestions() {
    const bar = document.getElementById('portfolioTenantsFilterBar');
    const input = document.getElementById('portfolioTenantsSearchBar');
    const box = document.getElementById('portfolioTenantsSearchSuggestions');
    if (!bar || !input || !box) return;
    const barRect = bar.getBoundingClientRect();
    const inRect = input.getBoundingClientRect();
    box.style.left = `${inRect.left - barRect.left}px`;
    box.style.top = `${inRect.bottom - barRect.top + 6}px`;
    box.style.minWidth = `${Math.max(inRect.width, 260)}px`;
}

function renderPortfolioTenantsSuggestionTokens() {
    const list = document.getElementById('portfolioTenantsSuggestList');
    const title = document.getElementById('portfolioTenantsSuggestTitle');
    const values = document.getElementById('portfolioTenantsSuggestValues');
    const backBtn = document.getElementById('portfolioTenantsSuggestBack');
    if (!list) return;
    const tokens = ['name:', 'email:', 'phone:', 'property:', 'unit:', 'status:'];
    list.innerHTML = tokens.map(k =>
        `<li class='suggest-item' data-token='${k}' style='padding:8px 12px;cursor:pointer;display:flex;gap:8px;align-items:center;'><span style='font-weight:600;color:#1f2937'>${k}</span><span style='font-size:.85em;color:#6b7280'>Add ${k} filter</span></li>`
    ).join('');
    if (title) title.textContent = 'Choose a filter';
    if (backBtn) backBtn.style.display = 'none';
    if (values) {
        values.style.display = 'none';
        values.innerHTML = '';
    }
    list.style.display = 'block';
}

function showPortfolioTenantsValueSuggestions(token) {
    const list = document.getElementById('portfolioTenantsSuggestList');
    const values = document.getElementById('portfolioTenantsSuggestValues');
    const title = document.getElementById('portfolioTenantsSuggestTitle');
    const backBtn = document.getElementById('portfolioTenantsSuggestBack');
    if (!list || !values || !title) return;
    let items = [];
    if (token === 'property:') {
        items = (state.properties || []).map(p => ({ label: p.name, value: (p.name || '').toLowerCase() }));
    } else if (token === 'unit:') {
        items = (state.allUnits || []).map(u => ({ label: `${u.number || u.unitNumber || ''}`, value: String(u.number || u.unitNumber || '').toLowerCase() }));
    } else if (token === 'status:') {
        items = ['active', 'pending', 'expired', 'terminated'].map(v => ({ label: v, value: v }));
    } else if (token === 'name:' || token === 'email:' || token === 'phone:') {
        items = (state.allTenants || []).slice(0, 12).map(t => {
            const base = token === 'name:'
                ? (t.fullName || t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim())
                : token === 'email:'
                    ? (t.email || t.tenantEmail || '')
                    : (t.phone || t.tenantPhone || '');
            return { label: base, value: base.toLowerCase() };
        }).filter(it => it.label);
    }
    title.textContent = `Choose a value for ${token}`;
    if (backBtn) backBtn.style.display = 'inline';
    list.style.display = 'none';
    values.innerHTML = items.map(it =>
        `<li class='suggest-value' data-token='${token}' data-value='${it.value}' style='padding:8px 12px;cursor:pointer;display:flex;gap:8px;align-items:center;'><span style='font-weight:600;color:#1f2937'>${it.label}</span></li>`
    ).join('');
    values.style.display = items.length ? 'block' : 'none';
}

function autoSuggestPortfolioTenants() {
    const input = document.getElementById('portfolioTenantsSearchBar');
    const val = (input?.value || '').trim();
    const m = val.match(/(name:|email:|phone:|property:|unit:|status:)([^\s]*)$/i);
    if (!m) {
        renderPortfolioTenantsSuggestionTokens();
        return;
    }
    const token = m[1].toLowerCase();
    const partial = (m[2] || '').toLowerCase();
    showPortfolioTenantsValueSuggestions(token);
    const values = document.getElementById('portfolioTenantsSuggestValues');
    if (values && partial) {
        Array.from(values.querySelectorAll('.suggest-value')).forEach(li => {
            const v = (li.getAttribute('data-value') || '').toLowerCase();
            li.style.display = v.includes(partial) ? 'flex' : 'none';
        });
    }
}

// Inline edit helper for portfolio tenants table
function enterPortfolioTenantEditMode(row, tenant) {
    if (!row || !tenant) return;
    const tenantIdStr = String(tenant._id || '');
    if (!tenantIdStr) return;
    if (state.currentEditingPortfolioTenantId && state.currentEditingPortfolioTenantId !== tenantIdStr) return;
    if (row.dataset.editing === 'true') return;
    state.currentEditingPortfolioTenantId = tenantIdStr;
    row.dataset.editing = 'true';

    const cells = row.querySelectorAll('td');
    const nameCell = cells[2];
    const phoneCell = cells[3];
    const emailCell = cells[4];
    const datesCell = cells[5];
    const statusCell = cells[6];

    const makeInput = (type, value) => {
        const input = document.createElement('input');
        input.type = type;
        input.className = 'app-inline-input';
        input.value = value || '';
        return input;
    };

    const name = tenant.fullName || tenant.name || `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim();
    const phoneVal = tenant.phone || tenant.tenantPhone || '';
    const emailVal = tenant.email || tenant.tenantEmail || '';
    const statusVal = tenant.leaseStatus || 'active';

    const leaseStartRaw = tenant.leaseStart || '';
    const leaseEndRaw = tenant.leaseEnd || '';
    const toInputDate = (val) => {
        if (!val) return '';
        const s = String(val);
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${m[1]}-${m[2]}-${m[3]}`;
        const d = new Date(val);
        if (isNaN(d.getTime())) return '';
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const da = String(d.getDate()).padStart(2, '0');
        return `${y}-${mo}-${da}`;
    };

    const nameInput = makeInput('text', name || '');
    const phoneInput = makeInput('text', phoneVal || '');
    const emailInput = makeInput('email', emailVal || '');

    const statusSelect = document.createElement('select');
    statusSelect.className = 'app-inline-input';
    ['active', 'pending', 'expired', 'terminated'].forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val.charAt(0).toUpperCase() + val.slice(1);
        if (String(statusVal || 'active').toLowerCase() === val) opt.selected = true;
        statusSelect.appendChild(opt);
    });

    if (nameCell) { nameCell.innerHTML = ''; nameCell.appendChild(nameInput); }
    if (phoneCell) { phoneCell.innerHTML = ''; phoneCell.appendChild(phoneInput); }
    if (emailCell) { emailCell.innerHTML = ''; emailCell.appendChild(emailInput); }
    if (datesCell) {
        datesCell.innerHTML = '';
        const startInput = makeInput('date', toInputDate(leaseStartRaw));
        const endInput = makeInput('date', toInputDate(leaseEndRaw));
        startInput.style.maxWidth = '140px';
        endInput.style.maxWidth = '140px';
        datesCell.appendChild(startInput);
        const sep = document.createElement('span');
        sep.textContent = ' – ';
        sep.style.margin = '0 4px';
        datesCell.appendChild(sep);
        datesCell.appendChild(endInput);
        row.__leaseStartInput = startInput;
        row.__leaseEndInput = endInput;
    }
    if (statusCell) { statusCell.innerHTML = ''; statusCell.appendChild(statusSelect); }

    const saveChanges = async () => {
        const propertyId = tenant.projectId || tenant.propertyId;
        if (!propertyId) {
            state.currentEditingPortfolioTenantId = null;
            showNotification('Cannot update tenant: missing property id', 'error');
            renderPortfolioDetails('tenants');
            return;
        }

        const leaseStartInput = row.__leaseStartInput;
        const leaseEndInput = row.__leaseEndInput;
        const leaseStartVal = leaseStartInput ? leaseStartInput.value : '';
        const leaseEndVal = leaseEndInput ? leaseEndInput.value : '';

        const payload = {
            name: nameInput.value.trim() || name || '',
            phone: phoneInput.value.trim(),
            email: emailInput.value.trim(),
            leaseStatus: statusSelect.value || statusVal || 'active',
            leaseStart: leaseStartVal ? dateInputToISOAtNoon(leaseStartVal) : tenant.leaseStart,
            leaseEnd: leaseEndVal ? dateInputToISOAtNoon(leaseEndVal) : tenant.leaseEnd
        };
        if (payload.leaseStatus === 'terminated' && tenant.leaseStatus !== 'terminated') {
            state.currentEditingPortfolioTenantId = null;
            showNotification('Use the guided termination workflow to review final rent and possession', 'info');
            await selectProperty(String(propertyId));
            switchTab('tenants');
            openTenantTermination(tenantIdStr);
            return;
        }
        
        try {
            const resp = await fetch(`${API_URL}/properties/${propertyId}/tenants/${tenantIdStr}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await resp.json();
            if (!resp.ok) throw new Error(result.message || 'Failed to update tenant');

            const updatedTenant = { ...tenant, ...payload };
            if (Array.isArray(state.tenants)) {
                state.tenants = state.tenants.map(t => String(t._id) === tenantIdStr ? updatedTenant : t);
            }
            if (Array.isArray(state.allTenants)) {
                state.allTenants = state.allTenants.map(t => String(t._id) === tenantIdStr ? updatedTenant : t);
            }
            state.currentEditingPortfolioTenantId = null;
            showNotification('Tenant updated', 'success');
            renderPortfolioDetails('tenants');
        } catch (err) {
            console.error('Inline portfolio tenant update error:', err);
            state.currentEditingPortfolioTenantId = null;
            showNotification(err.message || 'Could not update tenant', 'error');
            renderPortfolioDetails('tenants');
       
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

// Inline edit helper for portfolio maintenance table
function enterPortfolioMaintenanceEditMode(row, request) {
    enterMaintenanceRequestRowEditMode(row, request, {
        editingKey: 'currentEditingPortfolioMaintenanceId',
        refreshPortfolio: true,
        beforeSave: () => {
            state.keepPortfolioMaintenanceFiltersOnNextRender = true;
        },
        setSaving: (requestId, isSaving) => {
            setPortfolioMaintenanceItemSaving(requestId, 'request', isSaving);
        }
    });
}

// Inline edit helper for portfolio applications in portfolio overview
function enterPortfolioApplicationEditMode(row, app) {
    if (!row || !app) return;
    const appIdStr = String(app._id || '');
    if (!appIdStr) return;
    if (state.currentEditingPortfolioApplicationId && state.currentEditingPortfolioApplicationId !== appIdStr) return;
    if (row.dataset.editing === 'true') return;
    state.currentEditingPortfolioApplicationId = appIdStr;
    row.dataset.editing = 'true';

    const cells = row.querySelectorAll('td');
    const nameCell = cells[1];
    const emailCell = cells[2];
    const propertyCell = cells[3];
    const unitCell = cells[4];

    let propertyAddress = '';
    let unitNumber = app.unit || '';
    if (app.notes) {
        try {
            const n = JSON.parse(app.notes);
            propertyAddress = n.propertyAddress || '';
            unitNumber = n.unitNumber || unitNumber;
        } catch {}
    }

    const makeInput = (type, cls, value) => {
        const input = document.createElement('input');
        input.type = type;
        input.className = cls;
        input.value = value || '';
        return input;
    };

    const nameInput = makeInput('text', 'app-inline-input app-inline-name', app.name || '');
    const emailInput = makeInput('email', 'app-inline-input app-inline-email', app.email || '');
    const propertyInput = makeInput('text', 'app-inline-input app-inline-property', propertyAddress || '');
    const unitInput = makeInput('text', 'app-inline-input app-inline-unit', unitNumber || '');

    if (nameCell) { nameCell.innerHTML = ''; nameCell.appendChild(nameInput); }
    if (emailCell) { emailCell.innerHTML = ''; emailCell.appendChild(emailInput); }
    if (propertyCell) { propertyCell.innerHTML = ''; propertyCell.appendChild(propertyInput); }
    if (unitCell) { unitCell.innerHTML = ''; unitCell.appendChild(unitInput); }
    const saveChanges = async () => {
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

        const currentApp = (state.applications || []).find(a => String(a._id) === String(app._id));
        const effectiveStatus = currentApp ? (currentApp.status || 'pending') : (app.status || 'pending');

        const payload = {
            name: nameInput.value.trim(),
            email: emailInput.value.trim(),
            phone: app.phone || '',
            unit: unitInput.value.trim(),
            // Do not change status from inline text edits; keep latest value from state
            status: effectiveStatus,
            moveIn: app.moveIn || undefined,
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
            state.currentEditingPortfolioApplicationId = null;
            showNotification('Application updated', 'success');
            renderPortfolioDetails('applications');
        } catch (err) {
            console.error('Inline portfolio application update error:', err);
            state.currentEditingPortfolioApplicationId = null;
            showNotification('Could not update application', 'error');
            renderPortfolioDetails('applications');
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

// Inline edit helper for portfolio invites in portfolio overview
function enterPortfolioInviteEditMode(row, invite) {
    if (!row || !invite) return;
    const inviteIdStr = String(invite._id || '');
    if (!inviteIdStr) return;
    if (state.currentEditingPortfolioInviteId && state.currentEditingPortfolioInviteId !== inviteIdStr) return;
    if (row.dataset.editing === 'true') return;
    state.currentEditingPortfolioInviteId = inviteIdStr;
    row.dataset.editing = 'true';

    const cells = row.querySelectorAll('td');
    const nameCell = cells[1];
    const emailCell = cells[2];
    const propertyCell = cells[3];
    const unitCell = cells[4];
    const statusCell = cells[5];

    const makeInput = (type, cls, value) => {
        const input = document.createElement('input');
        input.type = type;
        input.className = cls;
        input.value = value || '';
        return input;
    };

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

    if (nameCell) { nameCell.innerHTML = ''; nameCell.appendChild(nameInput); }
    if (emailCell) { emailCell.innerHTML = ''; emailCell.appendChild(emailInput); }
    if (propertyCell) { propertyCell.innerHTML = ''; propertyCell.appendChild(propertyInput); }
    if (unitCell) { unitCell.innerHTML = ''; unitCell.appendChild(unitInput); }
    if (statusCell) { statusCell.innerHTML = ''; statusCell.appendChild(statusSelect); }

    const saveInviteChanges = async () => {
        const payload = {
            name: nameInput.value.trim(),
            email: emailInput.value.trim(),
            propertyName: propertyInput.value.trim(),
            unitNumber: unitInput.value.trim(),
            status: statusSelect.value || 'sent',
            applicationUrl: invite.applicationUrl || ''
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
            state.currentEditingPortfolioInviteId = null;
            showNotification('Invite updated', 'success');
            // Preserve current Applications vs Invites filter when re-rendering
            state.keepPortfolioTypeFilterOnNextRender = true;
            renderPortfolioDetails('applications');
        } catch (err) {
            console.error('Inline portfolio invite update error:', err);
            state.currentEditingPortfolioInviteId = null;
            showNotification('Could not update invite', 'error');
            // Also preserve filter on error-triggered re-render
            state.keepPortfolioTypeFilterOnNextRender = true;
            renderPortfolioDetails('applications');
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

function renderFilteredPortfolioTenants() {
    const tbody = document.getElementById('portfolioTenantsTbody');
    if (!tbody) return;
    const { tokens, text } = getPortfolioTenantsSearch();
    const propsById = (state.properties || []).reduce((map, p) => {
        map[String(p._id)] = p;
        return map;
    }, {});
    const unitsById = (state.allUnits || []).reduce((map, u) => {
        if (u && u._id) map[String(u._id)] = u;
        return map;
    }, {});

    const items = (state.allTenants || []).filter(t => {
        const name = (t.fullName || t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim()).toLowerCase();
        const phone = (t.phone || t.tenantPhone || '').toLowerCase();
        const email = (t.email || t.tenantEmail || '').toLowerCase();
        const unitId = t.unitId?._id || t.unitId;
        let unitLabel = t.unitNumber || t.unit || '';
        if (unitId && unitsById[String(unitId)]) {
            const u = unitsById[String(unitId)];
            unitLabel = (u.number || u.unitNumber || u.name || u.label || '').toString();
        }
        const unit = (unitLabel || '').toLowerCase();
        const pid = t.projectId || t.propertyId;
        const propName = pid && propsById[String(pid)] ? (propsById[String(pid)].name || '') : '';
        const prop = propName.toLowerCase();
        const status = (t.leaseStatus || '').toLowerCase();

        const hitText = !text || name.includes(text) || phone.includes(text) || email.includes(text) || unit.includes(text) || prop.includes(text) || status.includes(text);
        const hitName = !tokens.nameList.length || tokens.nameList.some(v => name.includes(v));
        const hitEmail = !tokens.emailList.length || tokens.emailList.some(v => email.includes(v));
        const hitPhone = !tokens.phoneList.length || tokens.phoneList.some(v => phone.includes(v));
        const hitProp = !tokens.propertyList.length || tokens.propertyList.some(v => prop.includes(v));
        const hitUnit = !tokens.unitList.length || tokens.unitList.some(v => unit.includes(v));
        const hitStatus = !tokens.statusList.length || tokens.statusList.includes(status);
        return hitText && hitName && hitEmail && hitPhone && hitProp && hitUnit && hitStatus;
    });

    const rowsHtml = items.map(t => {
        const name = t.fullName || t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim() || 'Tenant';
        const unitId = t.unitId?._id || t.unitId;
        let unitLabel = '—';
        if (unitId && unitsById[String(unitId)]) {
            const u = unitsById[String(unitId)];
            unitLabel = u.number || u.unitNumber || u.name || u.label || '—';
        } else {
            unitLabel = t.unitNumber || t.unit || '—';
        }
        const pid = t.projectId || t.propertyId;
        const propName = pid && propsById[String(pid)] ? propsById[String(pid)].name : '—';
        const phone = t.phone || t.tenantPhone || '—';
        const email = t.email || t.tenantEmail || '—';
        const leaseStart = t.leaseStart ? new Date(t.leaseStart).toLocaleDateString() : '—';
        const leaseEnd = t.leaseEnd ? new Date(t.leaseEnd).toLocaleDateString() : '—';
        const status = t.leaseStatus || 'unknown';
        const notesCount = Array.isArray(t.notesHistory) ? t.notesHistory.length : 0;
        const notesBadge = `<button class="portfolio-tenant-notes-link" data-tenant-id="${t._id}" style="background:none;border:none;padding:0;margin:0;font:inherit;cursor:pointer;">
                <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:#eef2ff;color:#4f46e5;font-size:0.8rem;">
                    <i class=\"fas fa-sticky-note\"></i>
                    ${notesCount}
                </span>
            </button>`;
        return `
            <tr data-tenant-id="${t._id}">
                <td>${propName}</td>
                <td>${unitLabel}</td>
                <td>${name}</td>
                <td>${phone}</td>
                <td>${email}</td>
                <td>${leaseStart} - ${leaseEnd}</td>
                <td>${status}</td>
                <td>${notesBadge}</td>
            </tr>`;
    }).join('');

    tbody.innerHTML = rowsHtml || '<tr><td colspan="8" style="font-size:0.86rem;color:#6b7280;">No tenants match your filters.</td></tr>';

    // Wire row click to open inline edit mode for portfolio tenants
    Array.from(tbody.querySelectorAll('tr[data-tenant-id]')).forEach(row => {
        row.addEventListener('click', (e) => {
            const target = e.target;
            if (target.closest('a') || target.closest('.portfolio-tenant-notes-link') || target.closest('input') || target.closest('select')) return;
            if (row.dataset.editing === 'true') return;
            const id = row.getAttribute('data-tenant-id');
            if (!id) return;
            const tenant = (state.allTenants || []).find(t => String(t._id) === String(id));
            if (!tenant) return;
            enterPortfolioTenantEditMode(row, tenant);
        });
    });

    // Wire tenant notes badge clicks to open shared notes drawer (if backend supports tenant notes)
    tbody.querySelectorAll('.portfolio-tenant-notes-link').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const id = btn.getAttribute('data-tenant-id');
            if (!id) return;
            // Reuse application notes drawer context pattern if tenant notes endpoints exist in the API
            if (typeof openNotesDrawerForTenant === 'function') {
                openNotesDrawerForTenant(id);
            } else {
                const tenant = (state.allTenants || []).find(t => String(t._id) === String(id));
                if (!tenant) return;
                const { root, overlay, closeBtn, titleEl, subtitleEl, inputEl } = getNotesDrawerElements();
                if (!root) return;
                state.notesDrawerContext = { type: 'tenant', id };
                if (titleEl) titleEl.textContent = 'Tenant Notes';
                if (subtitleEl) subtitleEl.textContent = `${tenant.fullName || tenant.name || ''} • ${tenant.email || tenant.tenantEmail || ''}`.trim();
                renderNotesDrawerMessages(tenant.notesHistory || []);
                root.classList.add('open');
                if (inputEl) {
                    inputEl.value = '';
                    setTimeout(() => inputEl.focus(), 50);
                }
                if (overlay) overlay.onclick = () => closeNotesDrawer();
                if (closeBtn) closeBtn.onclick = () => closeNotesDrawer();
            }
        });
    });
}
