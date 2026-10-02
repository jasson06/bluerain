// Property management: portfolio search.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// ===== Shared Portfolio Details Search (rent, maintenance, leases, vacancy) =====
function initializePortfolioDetailsSearch() {
    const search = document.getElementById('portfolioDetailsSearchBar');
    if (!search) return;
    if (search.dataset._inited === '1') return;
    search.dataset._inited = '1';

    const debouncedRender = debounce(renderFilteredPortfolioDetailsRows, 200);

    search.addEventListener('input', () => {
        positionPortfolioDetailsSearchSuggestions();
        autoSuggestPortfolioDetails();
        showPortfolioDetailsSearchSuggestions(true);
        debouncedRender();
    });
    search.addEventListener('change', () => {
        positionPortfolioDetailsSearchSuggestions();
        debouncedRender();
    });
    search.addEventListener('focus', () => {
        positionPortfolioDetailsSearchSuggestions();
        showPortfolioDetailsSearchSuggestions(true);
    });
    search.addEventListener('blur', () => setTimeout(() => showPortfolioDetailsSearchSuggestions(false), 120));

    const clr = document.getElementById('clearPortfolioDetailsFiltersBtn');
    if (clr) clr.onclick = () => {
        search.value = '';
        window.__portfolioDetailsAccumulatedQuery = '';
        renderFilteredPortfolioDetailsRows();
        showPortfolioDetailsSearchSuggestions(false);
    };

    const sug = document.getElementById('portfolioDetailsSearchSuggestions');
    if (sug) {
        renderPortfolioDetailsSuggestionTokens();
        sug.addEventListener('mousedown', (e) => {
            const tokenEl = e.target.closest('.suggest-item');
            const valEl = e.target.closest('.suggest-value');
            e.preventDefault();
            if (tokenEl) {
                const token = tokenEl.getAttribute('data-token') || '';
                showPortfolioDetailsValueSuggestions(token);
            } else if (valEl) {
                const token = valEl.getAttribute('data-token') || '';
                const value = valEl.getAttribute('data-value') || '';
                const acc = (window.__portfolioDetailsAccumulatedQuery || '').trim();
                const sep = acc ? ' ' : '';
                window.__portfolioDetailsAccumulatedQuery = `${acc}${sep}${token}${value}`;
                const input = document.getElementById('portfolioDetailsSearchBar');
                if (input) input.value = '';
                renderFilteredPortfolioDetailsRows();
                showPortfolioDetailsSearchSuggestions(false);
            }
        });
        const backBtn = document.getElementById('portfolioDetailsSuggestBack');
        if (backBtn) backBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            renderPortfolioDetailsSuggestionTokens();
        });
    }
}

function parsePortfolioDetailsSearch(queryStr) {
    const tokens = { nameList: [], propertyList: [], unitList: [], statusList: [], typeList: [], balanceFlags: [], text: '' };
    const parts = (queryStr || '').trim().split(/\s+/).filter(Boolean);
    const rest = [];
    for (const part of parts) {
        const low = part.toLowerCase();
        const take = (pfx) => part.slice(pfx.length);
        if (low.startsWith('name:')) tokens.nameList.push(...take('name:').split(',').filter(Boolean));
        else if (low.startsWith('property:')) tokens.propertyList.push(...take('property:').split(',').filter(Boolean));
        else if (low.startsWith('unit:')) tokens.unitList.push(...take('unit:').split(',').filter(Boolean));
        else if (low.startsWith('status:')) tokens.statusList.push(...take('status:').split(',').filter(Boolean));
        else if (low.startsWith('type:')) tokens.typeList.push(...take('type:').split(',').filter(Boolean));
        else if (low.startsWith('balance:')) tokens.balanceFlags.push(...take('balance:').split(',').filter(Boolean));
        else rest.push(part);
    }
    const norm = (arr) => Array.from(new Set(arr.map(v => String(v).trim().toLowerCase()).filter(Boolean)));
    tokens.nameList = norm(tokens.nameList);
    tokens.propertyList = norm(tokens.propertyList);
    tokens.unitList = norm(tokens.unitList);
    tokens.statusList = norm(tokens.statusList);
    tokens.typeList = norm(tokens.typeList);
    tokens.balanceFlags = norm(tokens.balanceFlags);
    tokens.text = rest.join(' ').toLowerCase();
    return { tokens, text: tokens.text };
}

function getPortfolioDetailsSearch() {
    const input = document.getElementById('portfolioDetailsSearchBar');
    const current = input ? input.value : '';
    const combined = `${(window.__portfolioDetailsAccumulatedQuery || '').trim()} ${current.trim()}`.trim();
    const query = parsePortfolioDetailsSearch(combined);
    renderPortfolioDetailsFilterChips(query.tokens);
    return query;
}

function renderPortfolioDetailsFilterChips(tokens) {
    const container = document.getElementById('portfolioDetailsActiveFilterChips');
    if (!container) return;
    const isRentDetails = state.currentPortfolioDetailsType === 'rent';
    const mkChip = (k, v, disp) =>
        `<span class="filter-chip" data-key="${k}" data-value="${v}" style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:#eef2f7;color:#374151;border:1px solid #e5e7eb;font-size:.85em;"><span style="color:#0b5cab;font-weight:600">${k}</span><span>${disp ?? v}</span><button class="chip-remove" style="background:transparent;border:none;color:#6b7280;cursor:pointer;font-weight:700;">×</button></span>`;
    const chips = [];
    tokens.nameList.forEach(v => chips.push(mkChip('name:', v)));
    tokens.propertyList.forEach(v => chips.push(mkChip('property:', v)));
    tokens.unitList.forEach(v => chips.push(mkChip('unit:', v)));
    tokens.statusList.forEach(v => chips.push(mkChip('status:', v)));
    tokens.typeList.forEach(v => chips.push(mkChip('type:', v)));
    if (isRentDetails) {
        tokens.balanceFlags.forEach(v => {
            const label = v === 'with-balance' ? 'with balance only' : v;
            chips.push(mkChip('balance:', v, label));
        });
    }
    container.innerHTML = chips.join('');
    container.querySelectorAll('.chip-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const chip = e.target.closest('.filter-chip');
            removePortfolioDetailsFilterToken(chip.getAttribute('data-key') || '', chip.getAttribute('data-value') || '');
        });
    });
}

function removePortfolioDetailsFilterToken(key, value) {
    const input = document.getElementById('portfolioDetailsSearchBar');
    const combined = `${(window.__portfolioDetailsAccumulatedQuery || '').trim()} ${(input?.value || '').trim()}`.trim();
    const { tokens } = parsePortfolioDetailsSearch(combined);
    const rem = (arr) => {
        const i = arr.findIndex(v => v === value.toLowerCase());
        if (i >= 0) arr.splice(i, 1);
    };
    switch (key) {
        case 'name:': rem(tokens.nameList); break;
        case 'property:': rem(tokens.propertyList); break;
        case 'unit:': rem(tokens.unitList); break;
        case 'status:': rem(tokens.statusList); break;
        case 'type:': rem(tokens.typeList); break;
        case 'balance:': rem(tokens.balanceFlags); break;
    }
    const parts = [];
    if (tokens.nameList.length) parts.push(`name:${tokens.nameList.join(',')}`);
    if (tokens.propertyList.length) parts.push(`property:${tokens.propertyList.join(',')}`);
    if (tokens.unitList.length) parts.push(`unit:${tokens.unitList.join(',')}`);
    if (tokens.statusList.length) parts.push(`status:${tokens.statusList.join(',')}`);
    if (tokens.typeList.length) parts.push(`type:${tokens.typeList.join(',')}`);
    if (tokens.balanceFlags.length) parts.push(`balance:${tokens.balanceFlags.join(',')}`);
    window.__portfolioDetailsAccumulatedQuery = parts.join(' ');
    if (input) input.value = '';
    renderFilteredPortfolioDetailsRows();
}

function showPortfolioDetailsSearchSuggestions(show) {
    const box = document.getElementById('portfolioDetailsSearchSuggestions');
    if (!box) return;
    if (show) renderPortfolioDetailsSuggestionTokens();
    box.style.display = show ? 'block' : 'none';
}

function positionPortfolioDetailsSearchSuggestions() {
    const bar = document.getElementById('portfolioDetailsFilterBar');
    const input = document.getElementById('portfolioDetailsSearchBar');
    const box = document.getElementById('portfolioDetailsSearchSuggestions');
    if (!bar || !input || !box) return;
    const barRect = bar.getBoundingClientRect();
    const inRect = input.getBoundingClientRect();
    box.style.left = `${inRect.left - barRect.left}px`;
    box.style.top = `${inRect.bottom - barRect.top + 6}px`;
    box.style.minWidth = `${Math.max(inRect.width, 260)}px`;
}

function renderPortfolioDetailsSuggestionTokens() {
    const list = document.getElementById('portfolioDetailsSuggestList');
    const title = document.getElementById('portfolioDetailsSuggestTitle');
    const values = document.getElementById('portfolioDetailsSuggestValues');
    const backBtn = document.getElementById('portfolioDetailsSuggestBack');
    if (!list) return;
    const isRentDetails = state.currentPortfolioDetailsType === 'rent';
    const tokens = isRentDetails
        ? ['name:', 'property:', 'unit:', 'status:', 'type:', 'balance:']
        : ['name:', 'property:', 'unit:', 'status:', 'type:'];
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

function showPortfolioDetailsValueSuggestions(token) {
    const list = document.getElementById('portfolioDetailsSuggestList');
    const values = document.getElementById('portfolioDetailsSuggestValues');
    const title = document.getElementById('portfolioDetailsSuggestTitle');
    const backBtn = document.getElementById('portfolioDetailsSuggestBack');
    if (!list || !values || !title) return;
    let items = [];
    if (token === 'property:') {
        // For Applications & Invites (Portfolio), derive property values from the
        // current table rows so filters use the actual address text that is shown
        // in the "Property" column instead of the internal property name.
        if (state.currentPortfolioDetailsType === 'applications') {
            const bodyRows = Array.from(document.querySelectorAll('#portfolioDetailsTbody tr'));
            const seen = new Set();
            items = bodyRows.map(r => {
                const label = (r.children[3]?.textContent || '').trim();
                const value = (r.dataset.property || '').toLowerCase();
                return { label, value };
            }).filter(it => {
                if (!it.label || !it.value) return false;
                if (seen.has(it.value)) return false;
                seen.add(it.value);
                return true;
            });
        } else {
            items = (state.properties || []).map(p => ({ label: p.name, value: (p.name || '').toLowerCase() }));
        }
    } else if (token === 'unit:') {
        items = (state.allUnits || []).map(u => ({ label: `${u.number || u.unitNumber || ''}`, value: String(u.number || u.unitNumber || '').toLowerCase() }));
    } else if (token === 'status:') {
        // Gather statuses from current rows if possible, otherwise fall back to common set
        const bodyRows = Array.from(document.querySelectorAll('#portfolioDetailsTbody tr'));
        const set = new Set();
        bodyRows.forEach(r => { if (r.dataset.status) set.add(r.dataset.status.toLowerCase()); });
        if (!set.size) ['active','pending','expired','terminated','vacant','in-progress','completed'].forEach(v => set.add(v));
        // Ensure lease/move-in specific statuses are always available in the
        // Leases & Upcoming Move-ins (Next 60 Days) portfolio view, even if
        // no current rows happen to have that status.
        if (state.currentPortfolioDetailsType === 'leases') {
            ['lease-expiring','upcoming-movein','past-movein'].forEach(v => set.add(v));
        }
        const mapStatusLabel = (v) => {
            if (v === 'past-movein') return 'Moved-in (already)';
            if (v === 'upcoming-movein') return 'Upcoming move-in';
            if (v === 'lease-expiring') return 'Lease expiring';
            return v;
        };
        items = Array.from(set).map(v => ({ label: mapStatusLabel(v), value: v }));
    } else if (token === 'name:') {
        items = (state.allTenants || []).slice(0, 12).map(t => {
            const base = t.fullName || t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim();
            return { label: base, value: (base || '').toLowerCase() };
        }).filter(it => it.label);
    } else if (token === 'type:') {
        const bodyRows = Array.from(document.querySelectorAll('#portfolioDetailsTbody tr'));
        const set = new Set();
        bodyRows.forEach(r => { if (r.dataset.type) set.add(r.dataset.type.toLowerCase()); });
        if (!set.size) ['rent','maintenance','lease expiring','upcoming move-in','vacancy'].forEach(v => set.add(v));
        items = Array.from(set).map(v => ({ label: v, value: v }));
    } else if (token === 'balance:') {
        // Simple static options for rent view only
        if (state.currentPortfolioDetailsType === 'rent') {
            items = [
                { label: 'With balance only', value: 'with-balance' },
                { label: 'No balance', value: 'no-balance' }
            ];
        } else {
            items = [];
        }
    }
    title.textContent = `Choose a value for ${token}`;
    if (backBtn) backBtn.style.display = 'inline';
    list.style.display = 'none';
    values.innerHTML = items.map(it =>
        `<li class='suggest-value' data-token='${token}' data-value='${it.value}' style='padding:8px 12px;cursor:pointer;display:flex;gap:8px;align-items:center;'><span style='font-weight:600;color:#1f2937'>${it.label}</span></li>`
    ).join('');
    values.style.display = items.length ? 'block' : 'none';
}

function autoSuggestPortfolioDetails() {
    const input = document.getElementById('portfolioDetailsSearchBar');
    const val = (input?.value || '').trim();
    const m = val.match(/(name:|property:|unit:|status:|type:|balance:)([^\s]*)$/i);
    if (!m) {
        renderPortfolioDetailsSuggestionTokens();
        return;
    }
    const token = m[1].toLowerCase();
    const partial = (m[2] || '').toLowerCase();
    showPortfolioDetailsValueSuggestions(token);
    const values = document.getElementById('portfolioDetailsSuggestValues');
    if (values && partial) {
        Array.from(values.querySelectorAll('.suggest-value')).forEach(li => {
            const v = (li.getAttribute('data-value') || '').toLowerCase();
            li.style.display = v.includes(partial) ? 'flex' : 'none';
        });
    }
}

function renderFilteredPortfolioDetailsRows() {
    const tbody = document.getElementById('portfolioDetailsTbody');
    if (!tbody) return;
    const { tokens, text } = getPortfolioDetailsSearch();
    const isRentDetails = state.currentPortfolioDetailsType === 'rent';
    let anyVisible = false;
    const rows = Array.from(tbody.querySelectorAll('[data-portfolio-filter-item="true"], tr')).filter(row => !row.closest('.rm-expanded-row'));
    Array.from(rows).forEach(row => {
        const prop = (row.dataset.property || '').toLowerCase();
        const unit = (row.dataset.unit || '').toLowerCase();
        const name = (row.dataset.name || '').toLowerCase();
        const status = (row.dataset.status || '').toLowerCase();
        const legacyStatus = (row.dataset.legacyStatus || '').toLowerCase();
        const type = (row.dataset.type || '').toLowerCase();
        const balance = (row.dataset.balance || '').toLowerCase();
        const textContent = (row.textContent || '').toLowerCase();

        const hitText = !text || textContent.includes(text) || prop.includes(text) || unit.includes(text) || name.includes(text) || status.includes(text) || legacyStatus.includes(text) || type.includes(text);
        const hitName = !tokens.nameList.length || tokens.nameList.some(v => name.includes(v));
        const hitProp = !tokens.propertyList.length || tokens.propertyList.some(v => prop.includes(v));
        const hitUnit = !tokens.unitList.length || tokens.unitList.some(v => unit.includes(v));
        const hitStatus = !tokens.statusList.length || tokens.statusList.some(v => v === status || v === legacyStatus);
        const hitType = !tokens.typeList.length || tokens.typeList.some(v => type.includes(v));
        // Only apply balance filters on the rent (Tenants with Outstanding Balance) view
        const hitBalance = !isRentDetails || !tokens.balanceFlags.length || tokens.balanceFlags.includes(balance);

        const show = hitText && hitName && hitProp && hitUnit && hitStatus && hitType && hitBalance;
        row.style.display = show ? '' : 'none';
        if (show) anyVisible = true;
    });

    // If this is the vacancy view, update the total rent footer based on visible rows
    const tfoot = document.getElementById('portfolioDetailsTfoot');
    const totalCell = document.getElementById('portfolioVacancyTotalRent');
    if (tfoot && totalCell) {
        let total = 0;
        rows.forEach(row => {
            if (row.style.display === 'none') return;
            const rentCell = row.children[4];
            if (!rentCell) return;
            const text = rentCell.textContent.replace(/[^0-9.\-]/g,'');
            const val = Number(text) || 0;
            total += val;
        });
        totalCell.textContent = `$${total.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})}`;
    }

    // Optional: could display a "no results" message row if none visible.
}
