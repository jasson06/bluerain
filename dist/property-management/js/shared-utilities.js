// Property management: shared utilities.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// Update the loadUnits function
async function loadUnits(propertyId, force = false) {
    
    try {
        if (!force && shouldUseCache('units', propertyId)) {
            renderUnits();
            populateUnitSelect();
            populateMaintenanceUnitSelect();
            updateTabCounts();
            return;
        }
        const response = await fetch(`${API_URL}/properties/${propertyId}/units`);
        if (!response.ok) throw new Error('Failed to fetch units');
        
        const data = await response.json();
        // Update this line to correctly access units from the response
        state.units = data.property.units || [];
        console.log('Loaded units:', state.units); // Debug log

        renderUnits();
        populateUnitSelect();
         populateMaintenanceUnitSelect();
         updateTabCounts(); 
        touchCache('units', propertyId);

    } catch (error) {
        console.error('Error loading units:', error);
        showNotification('Error loading units', 'error');

    }
}

// Update the renderUnits function
// Slice records before building cards/tables; keep the full state available to actions and summaries.
function propertyRecordPage(rootId, records, render, focusId) {
    const root = document.getElementById(rootId);
    if (!root) return records;
    state.propertyRecordPages = state.propertyRecordPages || {};
    const signature = String(state.currentProperty?._id || '') + ':' + records.map(item => String(item._id || item.id || '')).join(',');
    const paging = state.propertyRecordPages[rootId] || { page: 1, size: 15 };
    if (paging.signature !== signature) paging.page = 1;
    paging.signature = signature;
    const target = focusId ? records.findIndex(item => String(item._id) === String(focusId)) : -1;
    if (target >= 0) paging.page = Math.floor(target / paging.size) + 1;
    const pages = Math.max(1, Math.ceil(records.length / paging.size));
    paging.page = Math.max(1, Math.min(paging.page, pages));
    state.propertyRecordPages[rootId] = paging;
    root.classList.add('property-record-scroll');
    let pager = document.getElementById(rootId + 'Pagination');
    if (!pager) {
        pager = document.createElement('div');
        pager.id = rootId + 'Pagination';
        pager.className = 'portfolio-comparison-pagination property-record-pagination';
        pager.setAttribute('aria-label', 'Record pagination');
        root.insertAdjacentElement('afterend', pager);
    }
    pager.hidden = !records.length;
    const first = (paging.page - 1) * paging.size;
    pager.innerHTML = `<label class="portfolio-page-size">Rows per page <select class="pm-page-size" aria-label="Rows per page">${[10,15,25,50].map(size => `<option value="${size}" ${size === paging.size ? 'selected' : ''}>${size}</option>`).join('')}</select></label><button type="button" data-page-step="-1" aria-label="Previous page" ${paging.page === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button><span class="task-meta" aria-live="polite">Page ${paging.page} of ${pages} · ${records.length ? first + 1 : 0}–${Math.min(first + paging.size, records.length)} of ${records.length}</span><button type="button" data-page-step="1" aria-label="Next page" ${paging.page === pages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
    const update = () => { render(); root.scrollTop = 0; };
    pager.querySelector('select').onchange = event => { paging.size = Number(event.target.value); paging.page = 1; update(); };
    pager.querySelectorAll('[data-page-step]').forEach(button => button.onclick = () => { paging.page += Number(button.dataset.pageStep); update(); });
    return records.slice(first, first + paging.size);
}

function renderUnits() {
    const unitsGrid = document.getElementById('unitsGrid');
    const visibleUnits = propertyRecordPage('unitsGrid', state.units || [], renderUnits);
    if (!state.units || state.units.length === 0) {
        unitsGrid.innerHTML = `
            <div class="empty-state">
                <p>No units found. Add your first unit!</p>
            </div>`;
        return;
    }

    // Utility icons for visual clarity
    const utilityIcons = {
        water: '<i class="fas fa-tint" style="color:#3498db"></i>',
        gas: '<i class="fas fa-fire" style="color:#e67e22"></i>',
        electricity: '<i class="fas fa-bolt" style="color:#f1c40f"></i>'
    };

    unitsGrid.innerHTML = visibleUnits.map(unit => {
        // Utility account info
        const utilities = ['water', 'gas', 'electricity'].map(type => {
            const acc = unit.utilityAccounts?.[type] || {};
            let statusBadge = '';
            if (acc.status === 'active') {
                statusBadge = `<span class="badge badge-success">Active</span>`;
            } else if (acc.status === 'disconnected') {
                statusBadge = `<span class="badge badge-danger">Disconnected</span>`;
            } else {
                statusBadge = `<span class="badge badge-default">N/A</span>`;
            }
            return `
                <div class="unit-utility-row">
                    ${utilityIcons[type]}
                    <span class="utility-label">${type.charAt(0).toUpperCase() + type.slice(1)}</span>
                    <span class="utility-account">Acct: <strong>${acc.accountNumber || 'N/A'}</strong></span>
                    <span class="utility-provider">${acc.provider || 'N/A'}</span>
                    <span class="utility-under">Bill: <strong>${acc.under ? acc.under.charAt(0).toUpperCase() + acc.under.slice(1) : 'N/A'}</strong></span>
                    ${statusBadge}
                </div>
            `;
        }).join('');

        // Status badge
        let statusBadge = '';
        if (unit.status === 'occupied') {
            statusBadge = `<span class="badge badge-success">Occupied</span>`;
        } else if (unit.status === 'vacant') {
            statusBadge = `<span class="badge badge-warning">Vacant</span>`;
        } else if (unit.status === 'maintenance') {
            statusBadge = `<span class="badge badge-danger">Maintenance</span>`;
        } else {
            statusBadge = `<span class="badge badge-default">${unit.status || 'N/A'}</span>`;
        }

        return `
            <div class="unit-card-modern">
                <div class="unit-card-header">
                    <h3><i class="fas fa-building-circle-check"></i> Unit ${unit.number}</h3>
                    ${statusBadge}
                </div>
                <div class="unit-card-body">
                    <div class="unit-info-row">
                        <span><i class="fas fa-stairs"></i> Floor: <strong>${unit.floor || '1'}</strong></span>
                        <span><i class="fas fa-bed"></i> ${unit.bedrooms} Bed</span>
                        <span><i class="fas fa-bath"></i> ${unit.bathrooms} Bath</span>
                        <span><i class="fas fa-vector-square"></i> ${unit.sqft ? `${unit.sqft} sqft` : 'N/A'}</span>
                    </div>
                    <div class="equipment-summary"><i class="fas fa-microchip"></i> <strong>${(unit.equipment||[]).length}</strong> equipment items · Condition: <strong>${escapeHtml(unit.profile?.condition || 'Not rated')}</strong>${(unit.equipment||[]).some(eq=>eq.nextServiceDate&&new Date(eq.nextServiceDate)<=new Date(Date.now()+60*86400000))?' · <span class="badge badge-warning">Service due</span>':''}</div>
                    <div class="unit-utilities-section">
                        <div class="unit-utilities-title"><i class="fas fa-plug-circle-bolt"></i> Utilities</div>
                        ${utilities}
                    </div>
                </div>
                <div class="unit-card-actions">
                    <button onclick="editUnit('${unit._id}')" class="btn-secondary"><i class="fas fa-pen-to-square"></i> Edit</button>
                    <button onclick="viewUnitDetails('${unit._id}')" class="btn-secondary"><i class="fas fa-circle-info"></i> Details</button>
                    <button onclick="deleteUnit('${unit._id}')" class="btn-icon delete-btn" title="Delete Unit"><i class="fas fa-trash-can"></i></button>
                </div>
            </div>
        `;
    }).join('');
}

// --- Date Helpers to avoid off-by-one (timezone) issues ---
// Convert an <input type="date"> value (YYYY-MM-DD) to an ISO string at local noon
function dateInputToISOAtNoon(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const d = Number(parts[2]);
    const dt = new Date(y, m - 1, d, 12, 0, 0, 0); // local noon avoids day shifting
    return dt.toISOString();
}

// Safer display formatter: prefer YYYY-MM-DD prefix if present; else render in UTC to avoid shift
function formatDateDisplay(value, locale = 'en-US') {
    if (!value) return '';
    const s = String(value);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        return new Date(y, mo - 1, d).toLocaleDateString(locale);
    }
    try {
        const d = new Date(value);
        // Render using UTC so midnight UTC doesn't shift date in local TZ
        return d.toLocaleDateString(locale, { timeZone: 'UTC' });
    } catch {
        return s;
    }
}

// --- Rent proration helpers (frontend) ---
// Mirrors server-side behavior: only first month gets prorated, and only base rent is prorated.
// Additionally, no base rent is expected for months that fall completely outside the lease range
// (before leaseStart or after leaseEnd).


// Returns the expected base rent for the given month for a tenant,
// applying proration in the first lease month only. Does NOT include additional monthly fees.
function computeExpectedBaseRentForMonth(tenant, dateLike) {
    const baseRent = Number(tenant?.baseRent) || 0;
    const ref = dateLike ? new Date(dateLike) : new Date();
    const leaseStart = tenant?.leaseStart ? new Date(tenant.leaseStart) : null;
    const leaseEnd = tenant?.leaseEnd ? new Date(tenant.leaseEnd) : null;

    // If we have lease bounds, and this entire month falls outside of them,
    // do not expect any base rent for this month.
    if (leaseStart || leaseEnd) {
        const monthStart = new Date(ref.getFullYear(), ref.getMonth(), 1);
        const monthEnd = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);

        if (leaseStart && monthEnd < leaseStart) {
            return 0;
        }
        if (leaseEnd && monthStart > leaseEnd) {
            return 0;
        }
    }

    // If there's no leaseStart, but we're within (or we don't know) the lease range,
    // use the full base rent for the month (no proration info available).
    if (!leaseStart) return baseRent;

    const sameMonth =
        ref.getFullYear() === leaseStart.getFullYear() &&
        ref.getMonth() === leaseStart.getMonth();

    if (!sameMonth) return baseRent;

    // First lease month: prorate by days remaining in month starting on leaseStart day
    const totalDays = daysInMonth(leaseStart.getFullYear(), leaseStart.getMonth());
    const startDay = leaseStart.getDate();
    // Days remaining including the start day (e.g., start on 15th in 30-day month => 16 days: 15..30)
    const daysRemaining = Math.max(0, totalDays - startDay + 1);
    return +(baseRent * (daysRemaining / totalDays)).toFixed(2);
}

function computeExpectedRentForMonth(tenant, dateLike, paymentType = 'rent') {
    const ref = dateLike ? new Date(dateLike) : new Date();
    if (Number.isNaN(ref.getTime())) return 0;

    const period = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
    let overrideMap = tenant?.monthlyOverrides || null;
    if (overrideMap && typeof overrideMap.get === 'function') {
        const normalizedOverrides = {};
        overrideMap.forEach((value, key) => { normalizedOverrides[key] = value; });
        overrideMap = normalizedOverrides;
    }

    const monthOverride = overrideMap ? overrideMap[period] : null;
    if (monthOverride && paymentType === 'rent') {
        const overrideExpectedRent = Number(monthOverride.expectedRent);
        if (Number.isFinite(overrideExpectedRent) && overrideExpectedRent >= 0) {
            return overrideExpectedRent;
        }
    }

    const isRentType = paymentType === 'rent';
    const baseRent = isRentType
        ? computeExpectedBaseRentForMonth(tenant, ref)
        : (Number(tenant?.baseRent) || 0);
    const petFees = tenant?.pets?.hasPets ? (Number(tenant.pets.monthlyRent) || 0) : 0;
    const additionalFees =
        (Number(tenant?.waterFee) || 0) +
        (Number(tenant?.trashFee) || 0) +
        (Number(tenant?.adminFee) || 0) +
        (Number(tenant?.additionalFee?.amount) || 0) +
        petFees;

    return Number((baseRent + additionalFees).toFixed(2));
}

function daysInMonth(year, monthIndex) { // monthIndex 0-11
    return new Date(year, monthIndex + 1, 0).getDate();
}