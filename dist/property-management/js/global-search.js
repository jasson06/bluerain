// Property management: global search.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// ===== Global Search (Top Toolbar) =====
function ensureGlobalSearchResultsBox() {
    const bar = document.getElementById('globalSearchBar');
    const boxes = Array.from(document.querySelectorAll('#globalSearchResults'));
    let box = boxes.shift() || null;
    boxes.forEach(extraBox => extraBox.remove());
    if (!box) {
        box = document.createElement('div');
        box.id = 'globalSearchResults';
        box.className = 'global-search-results';
        box.style.display = 'none';
    }
    if (bar && box.parentElement !== bar) bar.appendChild(box);
    return box;
}

function positionGlobalSearchResults() {
    const bar = document.getElementById('globalSearchBar');
    const box = ensureGlobalSearchResultsBox();
    if (!bar || !box) return;
    box.style.removeProperty('top');
    box.style.removeProperty('left');
    box.style.removeProperty('min-width');
}

function showGlobalSearchResults(show) {
    const box = document.getElementById('globalSearchResults');
    if (!box) return;
    box.style.display = show ? 'block' : 'none';
}

function getGlobalSearchMatches(queryStr) {
    const q = (queryStr || '').trim().toLowerCase();
    if (!q) return [];
    const results = [];
    const propsById = (state.properties || []).reduce((map, p) => {
        if (p && p._id) map[String(p._id)] = p;
        return map;
    }, {});

    // Tenants (portfolio-wide if available)
    const allTenants = (state.allTenants && state.allTenants.length ? state.allTenants : (state.tenants || []));
    for (const t of allTenants) {
        if (!t) continue;
        const statusRaw = (t.leaseStatus || '').toString();
        // Only include ACTIVE tenants in global tenant search
        if (statusRaw && statusRaw.toLowerCase() !== 'active') continue;
        const name = (t.fullName || t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim());
        const phone = (t.phone || t.tenantPhone || '');
        const email = (t.email || t.tenantEmail || '');
        const pid = t.projectId || t.propertyId;
        const propName = pid && propsById[String(pid)] ? (propsById[String(pid)].name || '') : '';
        const unitLabel = (t.unitNumber || t.unit || '').toString();
        const status = statusRaw;
        const haystack = [name, phone, email, propName, unitLabel, status].join(' ').toLowerCase();
        if (!haystack || !haystack.includes(q)) continue;
        results.push({
            kind: 'tenant',
            id: t._id ? String(t._id) : '',
            propId: pid ? String(pid) : '',
            type: 'Tenant',
            title: name || '(No name)',
            subtitle: [propName && `Property: ${propName}`, unitLabel && `Unit: ${unitLabel}`, status && `Status: ${status}`].filter(Boolean).join(' · ')
        });
    }

    // Units (all properties)
    for (const u of (state.allUnits || [])) {
        if (!u) continue;
        const label = (u.number || u.unitNumber || u.name || u.label || '').toString();
        const pid = u.projectId || u.propertyId || u.project;
        const propName = pid && propsById[String(pid)] ? (propsById[String(pid)].name || '') : '';
        const status = (u.status || '').toString();
        const haystack = [label, propName, status].join(' ').toLowerCase();
        if (!haystack || !haystack.includes(q)) continue;
        results.push({
            kind: 'unit',
            id: u._id ? String(u._id) : '',
            propId: pid ? String(pid) : '',
            type: 'Unit',
            title: label || '(No unit label)',
            subtitle: [propName && `Property: ${propName}`, status && `Status: ${status}`].filter(Boolean).join(' · ')
        });
    }

    // Properties
    for (const p of (state.properties || [])) {
        if (!p) continue;
        const name = (p.name || '').toString();
        const addr = (p.address || p.propertyAddress || p.location || '').toString();
        const haystack = [name, addr].join(' ').toLowerCase();
        if (!haystack || !haystack.includes(q)) continue;
        results.push({
            kind: 'property',
            id: p._id ? String(p._id) : '',
            propId: p._id ? String(p._id) : '',
            type: 'Property',
            title: name || '(Unnamed property)',
            subtitle: addr || ''
        });
    }

    // Applications (global)
    for (const a of (state.applications || [])) {
        if (!a) continue;
        const nm = (a.name || '').toString();
        const em = (a.email || '').toString();
        const ph = (a.phone || '').toString();
        let propertyName = '';
        let unitNumber = a.unit || '';
        if (a.notes) {
            try {
                const n = JSON.parse(a.notes);
                propertyName = (n.propertyAddress || propertyName || '').toString();
                unitNumber = (n.unitNumber || unitNumber || '').toString();
            } catch (_) {}
        }
        const status = (a.status || 'pending').toString();
        const haystack = [nm, em, ph, propertyName, unitNumber, status].join(' ').toLowerCase();
        if (!haystack || !haystack.includes(q)) continue;
        results.push({
            kind: 'application',
            id: a._id ? String(a._id) : '',
            propId: '',
            type: 'Application',
            title: nm || em || ph || '(Application)',
            subtitle: [propertyName && `Property: ${propertyName}`, unitNumber && `Unit: ${unitNumber}`, status && `Status: ${status}`].filter(Boolean).join(' · ')
        });
    }

    // Invites (global)
    for (const inv of (state.invites || [])) {
        if (!inv) continue;
        const nm = (inv.name || '').toString();
        const em = (inv.email || '').toString();
        const prop = (inv.propertyName || '').toString();
        const un = (inv.unitNumber || '').toString();
        const status = (inv.status || '').toString();
        const haystack = [nm, em, prop, un, status].join(' ').toLowerCase();
        if (!haystack || !haystack.includes(q)) continue;
        results.push({
            kind: 'invite',
            id: inv._id ? String(inv._id) : '',
            propId: '',
            type: 'Invite',
            title: nm || em || '(Invite)',
            subtitle: [prop && `Property: ${prop}`, un && `Unit: ${un}`, status && `Status: ${status}`].filter(Boolean).join(' · ')
        });
    }

    // Payments (current property + portfolio-wide if loaded)
    const paymentsCombined = [];
    if (Array.isArray(state.payments)) paymentsCombined.push(...state.payments);
    if (Array.isArray(state.portfolioPayments)) paymentsCombined.push(...state.portfolioPayments);
    if (paymentsCombined.length) {
        const seenPay = new Set();
        const allUnitsArr = (state.allUnits && state.allUnits.length ? state.allUnits : (state.units || []));
        for (const p of paymentsCombined) {
            if (!p) continue;
            const idKey = p._id ? String(p._id) : `${p.tenantId || ''}-${p.date || ''}-${p.amount || ''}`;
            if (seenPay.has(idKey)) continue;
            seenPay.add(idKey);

            const tenant = (state.allTenants && state.allTenants.length ? state.allTenants : (state.tenants || [])).find(t => String(t._id) === String(p.tenantId));
            const tName = (tenant?.fullName || tenant?.name || `${tenant?.firstName || ''} ${tenant?.lastName || ''}`.trim() || '').toString();
            const unit = allUnitsArr.find(u => String(u._id) === String(p.unitId));
            const unitLabel = (unit?.number != null ? String(unit.number) : (p.unitNumber || '')).toString();
            const pid = p.projectId || p.propertyId || tenant?.projectId || tenant?.propertyId;
            const propName = pid && propsById[String(pid)] ? (propsById[String(pid)].name || '') : '';
            const type = (p.type || '').toString();
            const method = (p.method || '').toString();
            const applyTo = (p.applyTo || '').toString();
            const amountNum = Number(p.amount) || 0;
            const amountLabel = amountNum ? `$${amountNum.toFixed(2)}` : '';
            const dateLabel = p.date ? formatDateDisplay(p.date, 'en-US') : '';
            const note = (p.note || '').toString();

            const haystack = [
                tName,
                propName,
                unitLabel,
                type,
                method,
                applyTo,
                String(p.amount || ''),
                dateLabel,
                note
            ].join(' ').toLowerCase();
            if (!haystack || !haystack.includes(q)) continue;

            results.push({
                kind: 'payment',
                id: p._id ? String(p._id) : '',
                propId: pid ? String(pid) : '',
                type: 'Payment',
                title: (tName || '(Payment)') + (amountLabel ? ` – ${amountLabel}` : ''),
                subtitle: [
                    propName && `Property: ${propName}`,
                    unitLabel && `Unit: ${unitLabel}`,
                    applyTo && `Applied: ${applyTo}`,
                    method && `Method: ${method}`,
                    dateLabel && `Date: ${dateLabel}`
                ].filter(Boolean).join(' · ')
            });
        }
    }

    return results.slice(0, 20);
}

function renderGlobalSearchResults() {
    const input = document.getElementById('globalSearchInput');
    if (!input) return;
    const q = (input.value || '').trim();
    const box = ensureGlobalSearchResultsBox();
    if (!q) {
        box.innerHTML = '';
        showGlobalSearchResults(false);
        return;
    }
    const matches = getGlobalSearchMatches(q);
    if (!matches.length) {
        box.innerHTML = '<div class="global-search-empty">No matches found</div>';
        showGlobalSearchResults(true);
        return;
    }
    box.innerHTML = matches.map(m => {
        const sub = m.subtitle ? `<div class="global-search-sub">${m.subtitle}</div>` : '';
        return `<div class="global-search-item" data-kind="${m.kind}" data-id="${m.id || ''}" data-prop="${m.propId || ''}"><div class="global-search-main"><span class="global-search-type">${m.type}</span><span>${m.title}</span></div>${sub}</div>`;
    }).join('');
    showGlobalSearchResults(true);
}

async function handleGlobalSearchSelection(item) {
    if (!item) return;
    const kind = item.getAttribute('data-kind');
    const id = item.getAttribute('data-id');
    const propId = item.getAttribute('data-prop');
    showGlobalSearchResults(false);
    const input = document.getElementById('globalSearchInput');
    if (input) input.blur();

    try {
        if (kind === 'property' && propId) {
            await selectProperty(propId);
            return;
        }
        if (kind === 'unit' && propId) {
            await selectProperty(propId);
            const unitsTabBtn = document.querySelector('.tab-btn[data-tab="units"]');
            unitsTabBtn?.click();
            return;
        }
        if (kind === 'tenant' && propId) {
            await selectProperty(propId);
            const tenantsTabBtn = document.querySelector('.tab-btn[data-tab="tenants"]');
            tenantsTabBtn?.click();
            return;
        }
        if (kind === 'payment') {
            if (propId) {
                await selectProperty(propId);
            }
            const paymentsTabBtn = document.querySelector('.tab-btn[data-tab="payments"]');
            paymentsTabBtn?.click();
            return;
        }
        if (kind === 'application' && id) {
            state.highlightApplicationId = id;
            const applicationsTabBtn = document.querySelector('.tab-btn[data-tab="applications"]');
            applicationsTabBtn?.click();
            return;
        }
        if (kind === 'invite') {
            const applicationsTabBtn = document.querySelector('.tab-btn[data-tab="applications"]');
            applicationsTabBtn?.click();
            const invitesSubtabBtn = document.querySelector('.applications-tab-btn[data-subtab="invites"]');
            invitesSubtabBtn?.click();
            return;
        }
    } catch (e) {
        console.error('Error handling global search selection:', e);
        showNotification('Could not open the selected item from search', 'error');
    }
}

function initializeGlobalSearch() {
    const input = document.getElementById('globalSearchInput');
    if (!input) return;
    if (input.dataset._inited === '1') return;
    input.dataset._inited = '1';
    ensureGlobalSearchResultsBox();
    const debounced = debounce(renderGlobalSearchResults, 180);
    input.addEventListener('input', () => {
        positionGlobalSearchResults();
        debounced();
    });
    input.addEventListener('focus', () => {
        positionGlobalSearchResults();
        renderGlobalSearchResults();
    });
    input.addEventListener('blur', () => {
        setTimeout(() => showGlobalSearchResults(false), 120);
    });
    const box = ensureGlobalSearchResultsBox();
    box.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.global-search-item');
        if (!item) return;
        e.preventDefault();
        handleGlobalSearchSelection(item);
    });
}
