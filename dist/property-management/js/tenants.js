// Property management: tenants.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// Reset car fields on form reset
function resetTenantForm() {
    document.getElementById('addTenantForm').reset();
    // Clear dynamic lease holders
    populateLeaseHolders([]);
    // Hide pets section
    document.getElementById('petDetails').style.display = 'none';
    // Hide car section
    document.getElementById('carDetails').style.display = 'none';
    document.getElementById('carFieldsContainer').innerHTML = '';
    // Hide lease type sections
    document.getElementById('fmrSection').style.display = 'none';
    document.getElementById('section8Section').style.display = 'none';
    // Reset submit button text
    const submitButton = document.getElementById('addTenantForm').querySelector('button[type="submit"]');
    if (submitButton) submitButton.textContent = 'Add Tenant';
    // Remove edit mode flags
    const form = document.getElementById('addTenantForm');
    form.dataset.editMode = 'false';
    form.dataset.tenantId = '';

    // Reset fallback property selector to current property (if any)
    const propSelect = document.getElementById('tenantProperty');
    if (propSelect) {
        propSelect.innerHTML = '<option value="">Current property</option>' +
            (state.properties || []).map(p => `<option value="${p._id}">${p.name}</option>`).join('');
        if (state.currentProperty?._id) {
            propSelect.value = state.currentProperty._id;
        }
    }
}

function openAddTenantModal() {
    if (!state.currentProperty) {
        showNotification('Please select a property first', 'error');
        return;
    }

    resetTenantForm();
    populateUnitSelect();
    openModal('addTenantModal');
}

// Tenant Management
async function handleAddTenant(event) {
    event.preventDefault();

    // Check if we're in edit mode - if so, don't proceed
    const form = event.target;
    if (form.dataset.editMode === 'true') {
        return;
    }

    if (!state.currentProperty) {
        showNotification('Please select a property first', 'error');
        return;
    }

    // Gather car info if "Has Car(s)" is checked
    let cars = [];
    if (document.getElementById('hasCar').checked) {
        const carCount = parseInt(document.getElementById('carCount').value) || 0;
        for (let i = 0; i < carCount; i++) {
            cars.push({
                make: document.querySelector(`.car-make[data-index="${i}"]`)?.value || '',
                model: document.querySelector(`.car-model[data-index="${i}"]`)?.value || '',
                color: document.querySelector(`.car-color[data-index="${i}"]`)?.value || '',
                licensePlate: document.querySelector(`.car-plate[data-index="${i}"]`)?.value || '',
                year: document.querySelector(`.car-year[data-index="${i}"]`).value || ''
            });
        }
    }

    // Gather pet info if "Has Pets" is checked
    let pets = {
        hasPets: document.getElementById('hasPets').checked,
        count: document.getElementById('hasPets').checked ? Number(document.getElementById('petCount').value) : 0,
        fee: document.getElementById('hasPets').checked ? Number(document.getElementById('petFee')?.value) || 0 : 0,
        nonRefundableFee: document.getElementById('hasPets').checked ? Number(document.getElementById('petNonRefundableFee')?.value) || 0 : 0,
        monthlyRent: document.getElementById('hasPets').checked ? Number(document.getElementById('petMonthlyRent')?.value) || 0 : 0,
        depositIncrease: document.getElementById('hasPets').checked ? Number(document.getElementById('petDepositIncrease')?.value) || 0 : 0,
        details: []
    };
    if (pets.hasPets) {
        pets.details = Array.from(document.querySelectorAll('.pet-field-group')).map((group, i) => ({
            type: group.querySelector('.pet-type')?.value || '',
            name: group.querySelector('.pet-name')?.value || '',
            breed: group.querySelector('.pet-breed')?.value || '',
            weight: group.querySelector('.pet-weight')?.value || '',
            age: group.querySelector('.pet-age')?.value || '',
            gender: group.querySelector('.pet-gender')?.value || '',
            vaccination: group.querySelector('.pet-vaccination')?.value || ''
        }));
    }

    const tenantData = {
        name: document.getElementById('tenantName').value,
        phone: document.getElementById('tenantPhone').value,
        email: document.getElementById('tenantEmail').value,
        parking: document.getElementById('tenantParking').value.trim(),
        accessCode: document.getElementById('tenantAccessCode').value.trim(),
        leaseHolders: getLeaseHoldersFromForm(),
        emergencyContact: {
            name: document.getElementById('emergencyContactName').value,
            phone: document.getElementById('emergencyContactPhone').value,
            email: document.getElementById('emergencyContactEmail').value,
            address: document.getElementById('emergencyContactAddress').value,
            relation: document.getElementById('emergencyContactRelation').value
        },
        authorizedOccupants: document.getElementById('authorizedOccupants').value
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean),
        pets,
        cars: {
            hasCar: document.getElementById('hasCar').checked,
            count: document.getElementById('hasCar').checked ? (parseInt(document.getElementById('carCount').value) || 0) : 0,
            details: cars
        },
        additionalFee: {
            type: document.getElementById('additionalFeeType').value,
            label: document.getElementById('additionalFeeLabel').value,
            amount: Number(document.getElementById('additionalFeeAmount').value) || 0
        },
        leaseRenewal: document.getElementById('leaseRenewal').value,
        unitId: document.getElementById('tenantUnit').value,
    // Send ISO at local noon to avoid timezone shifting
    leaseStart: dateInputToISOAtNoon(document.getElementById('leaseStart').value),
    leaseEnd: dateInputToISOAtNoon(document.getElementById('leaseEnd').value),
        baseRent: Number(document.getElementById('baseRent').value),
        deposit: Number(document.getElementById('deposit').value) || 0,
        waterFee: Number(document.getElementById('waterFee').value) || 0,
        trashFee: Number(document.getElementById('trashFee').value) || 0,
        adminFee: Number(document.getElementById('adminFee').value) || 0,
        leaseType: document.getElementById('leaseType').value,
        fmrNotes: document.getElementById('leaseType').value === 'fmr' ? document.getElementById('fmrNotes').value : '',
        hubContribution: document.getElementById('leaseType').value === 'section8' ? Number(document.getElementById('hubContribution').value) : 0,
        tenantContribution: document.getElementById('leaseType').value === 'section8' ? Number(document.getElementById('tenantContribution').value) : 0,
        leaseStatus: document.getElementById('leaseStatus').value
    };

    // Validate lease dates
    if (new Date(tenantData.leaseStart) > new Date(tenantData.leaseEnd)) {
        showNotification('Lease end date must be after start date', 'error');
        return;
    }
    showLoader();
    try {
        const response = await fetch(`${API_URL}/properties/${state.currentProperty._id}/tenants`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(tenantData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to add tenant');
        }

        // Update unit status to occupied if a unit was assigned
        if (tenantData.unitId) {
            await fetch(`${API_URL}/properties/${state.currentProperty._id}/units/${tenantData.unitId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status: 'occupied' })
            });
        }

        // Bust caches and refresh tenants and units to reflect changes instantly
        invalidateCache('tenants', 'units');
        await Promise.all([
            refreshContent('tenants'),
            refreshContent('units')
        ]);
        
        closeModal('addTenantModal');
        showNotification('Tenant added successfully', 'success');
        event.target.reset();
    // Optional: refresh global summary lazily
    runWhenIdle(() => loadAllUnitsAndTenants());
    } catch (error) {
        console.error('Error adding tenant:', error);
        showNotification(error.message || 'Error adding tenant', 'error');
    } finally {
        hideLoader();
    }
}

function updateCarFields() {
    const count = parseInt(document.getElementById('carCount').value) || 0;
    const container = document.getElementById('carFieldsContainer');
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        container.innerHTML += `
            <div class="car-field-group" style="margin-bottom:10px; padding:8px; background:#f6fafd00; border-radius:6px;">
                <label>Car #${i + 1} Make</label>
                <input type="text" class="car-make" data-index="${i}">
                <label>Model</label>
                <input type="text" class="car-model" data-index="${i}">
                <label>Color</label>
                <input type="text" class="car-color" data-index="${i}">
                <label>License Plate</label>
                <input type="text" class="car-plate" data-index="${i}">
                <label>Year</label>
                <input type="number" class="car-year" data-index="${i}" min="1900" max="2100">
            </div>
        `;
    }
}

function updatePetFields() {
    const count = parseInt(document.getElementById('petCount').value) || 0;
    const container = document.getElementById('petFieldsContainer');
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        container.innerHTML += `
            <div class="pet-field-group" style="margin-bottom:10px; padding:8px; background:#f6fafd00; border-radius:6px;">
                <label>Pet #${i + 1} Type</label>
                <input type="text" class="pet-type" data-index="${i}" placeholder="e.g. Dog, Cat">
                <label>Name</label>
                <input type="text" class="pet-name" data-index="${i}">
                <label>Breed</label>
                <input type="text" class="pet-breed" data-index="${i}">
                <label>Weight/Size</label>
                <input type="text" class="pet-weight" data-index="${i}" placeholder="e.g. 25 lbs, Medium">
                <label>Age</label>
                <input type="text" class="pet-age" data-index="${i}">
                <label>Gender</label>
                <select class="pet-gender" data-index="${i}">
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                </select>
                <label>Vaccination/Licensing #</label>
                <input type="text" class="pet-vaccination" data-index="${i}">
            </div>
        `;
    }
}

// Update the loadTenants function
async function loadTenants(propertyId, force = false) {
    
    try {
        if (!force && shouldUseCache('tenants', propertyId)) {
            renderTenants();
            updateTabCounts();
            return;
        }
        const response = await fetch(`${API_URL}/properties/${propertyId}/tenants`);
        if (!response.ok) throw new Error('Failed to fetch tenants');
        
        const tenants = await response.json();
        // Update state with tenant data
        state.tenants = tenants;
        console.log('Loaded tenants:', state.tenants); // Debug log
        renderTenants();
        updateTabCounts(); 
        touchCache('tenants', propertyId);
    } catch (error) {
        console.error('Error loading tenants:', error);
        showNotification('Error loading tenants', 'error');

    }
}

// Update the renderTenants function
function renderTenants() {
    const tenantsList = document.getElementById('tenantsList');
    const unifiedPropertyPayments = getUnifiedCurrentPropertyPayments();
    let tenantsToShow = [];
    if (currentTenantTab === 'active') {
        tenantsToShow = (state.tenants || []).filter(t => t.leaseStatus !== 'terminated' && t.leaseStatus !== 'expired');
    } else {
        tenantsToShow = (state.tenants || []).filter(t => t.leaseStatus === 'terminated' || t.leaseStatus === 'expired');
    }
    tenantsToShow = propertyRecordPage('tenantsList', tenantsToShow, renderTenants);
    if (!tenantsToShow.length) {
        tenantsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <p>No ${currentTenantTab === 'active' ? 'active' : 'inactive'} tenants found</p>
                ${currentTenantTab === 'active' ? `<button onclick="openAddTenantModal()" class="btn-primary">Add Your First Tenant</button>` : ''}
            </div>`;
        return;
    }

    tenantsList.innerHTML = tenantsToShow.map(tenant => {
        // Get tenant initials for avatar
        const initials = tenant.name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase();

        // Find the associated unit
        const assignedUnit = typeof tenant.unitId === 'object' ? tenant.unitId : 
            state.units.find(u => u._id === tenant.unitId || u._id?.toString() === tenant.unitId?.toString());
        const parkingAssignment = tenant.parking ? String(tenant.parking).trim() : '';

        // Format lease dates
        const leaseStart = tenant.leaseStart ? formatDateDisplay(tenant.leaseStart, 'en-US') : 'Not set';
        const leaseEnd = tenant.leaseEnd ? formatDateDisplay(tenant.leaseEnd, 'en-US') : 'Not set';

        // Only sum monthly pet rent for totals
        const petFees = (tenant.pets?.hasPets ? (Number(tenant.pets.monthlyRent) || 0) : 0);

        // Calculate additional fees (including custom "Other" fee)
        const additionalFees = 
            (Number(tenant.waterFee) || 0) +
            (Number(tenant.trashFee) || 0) +
            (Number(tenant.adminFee) || 0) +
            (tenant.additionalFee?.amount || 0) +
            petFees;

        // Total rent calculation (base rent + additional fees)
        const totalRent = (Number(tenant.baseRent) || 0) + additionalFees;

        // --- Rent payment status for current month ---
        const now = new Date();
        const periodMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
        // Collect this month's rent payments (applyTo rent) for the tenant
        const monthPayments = unifiedPropertyPayments.filter(p => p.tenantId === tenant._id && (!p.applyTo || p.applyTo === 'rent') && (p.periodMonth ? p.periodMonth === periodMonth : p.date && new Date(p.date).getMonth() === now.getMonth() && new Date(p.date).getFullYear() === now.getFullYear()));
        // Only count positive amounts toward payment; credits (negative) should not increase paid
        const totalPaidThisMonth = monthPayments.reduce((sum,p)=>{
            const amt = Number(p.amount) || 0;
            const appliedCred = Number(p.appliedCredit) || 0;
            return sum + (amt > 0 ? amt : 0);
        },0);
    // Expected rent using same logic as server, but respect monthly overrides immediately
    // First check for override on this month:
    const overrideMap = tenant?.monthlyOverrides || null;
    const monthOverride = overrideMap
        ? (typeof overrideMap.get === 'function' ? overrideMap.get(periodMonth) : overrideMap[periodMonth])
        : null;
    // Apply first-month proration to BASE RENT only; add recurring monthly fees un-prorated
    const expectedBase = computeExpectedBaseRentForMonth(tenant, now);
    let expectedMonthly = expectedBase + additionalFees;
    if (monthOverride) {
        const ovExpected = Number(monthOverride.expectedRent);
        const ovLate = Number(monthOverride.lateFee);
        const ovMode = (monthOverride.lateFeeMode === 'percent') ? 'percent' : 'amount';
        // Determine base amount before late fee
        const baseBeforeLate = Number.isFinite(ovExpected) ? ovExpected : (expectedBase + additionalFees);
        if (ovMode === 'percent' && Number.isFinite(ovLate)) {
            expectedMonthly = baseBeforeLate + (baseBeforeLate * (ovLate / 100));
        } else {
            expectedMonthly = baseBeforeLate + (Number.isFinite(ovLate) ? ovLate : 0);
        }
    }
        const remainingRent = Math.max(0, expectedMonthly - totalPaidThisMonth);
        // Assume due date = 1st of month (can be extended later with tenant.rentDueDay)
        const dueDate = new Date(now.getFullYear(), now.getMonth(), 1);
        const daysUntilDue = Math.floor((dueDate - now) / (1000*60*60*24));
        let rentStatusBadge = '';
        if (remainingRent > 0) {
            if (daysUntilDue < 0) {
                rentStatusBadge = `<span class="rent-badge overdue" title="Rent overdue${monthOverride && monthOverride.expectedRent!=null ? ' • override active' : ''}"><i class="fas fa-exclamation-circle"></i> OVERDUE • $${remainingRent.toFixed(2)}</span>`;
            } else if (daysUntilDue <= 3) {
                rentStatusBadge = `<span class="rent-badge due-soon" title="Rent due soon${monthOverride && monthOverride.expectedRent!=null ? ' • override active' : ''}"><i class="fas fa-clock"></i> DUE IN ${daysUntilDue}d • $${remainingRent.toFixed(2)}</span>`;
            } else if (totalPaidThisMonth > 0 && remainingRent > 0) {
                rentStatusBadge = `<span class="rent-badge partial" title="Partial rent paid${monthOverride && monthOverride.expectedRent!=null ? ' • override active' : ''}"><i class="fas fa-adjust"></i> PARTIAL • ${((totalPaidThisMonth/expectedMonthly)*100).toFixed(0)}%</span>`;
            }
        }
        // If fully paid (or credit making it negative), optional badge skipped for cleanliness

        // Emergency contact (just name and phone)
        const emergency = tenant.emergencyContact
            ? `<div class="tenant-detail-row" style="overflow-x:auto; white-space:nowrap; gap:18px;">
                    <span><i class="fas fa-user-shield"></i> ${tenant.emergencyContact.name || 'N/A'}</span>
                    <span><i class="fas fa-phone"></i> ${tenant.emergencyContact.phone || 'N/A'}</span>
                </div>`
            : '<span class="tenant-detail-value">N/A</span>';

    // Lease countdown logic
    let leaseCountdownHtml = '';
    if (tenant.leaseEnd) {
        const today = new Date();
        const leaseEndDate = new Date(tenant.leaseEnd);
        const diffMs = leaseEndDate - today;
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays <= 60 && diffDays > 0 && (tenant.leaseStatus === 'active' || tenant.leaseStatus === 'pending')) {
            leaseCountdownHtml = `
                <div class="tenant-detail-row" style="margin-top:8px;">
                    <span style="color:#f39c12; font-weight:600;">
                        <i class="fas fa-hourglass-half"></i>
                        Lease expires in <span style="font-size:1.08em; color:#d35400;">${diffDays} day${diffDays !== 1 ? 's' : ''}</span>
                    </span>
                </div>
            `;
        }
    }

    // Tenant notes badge (shared style with portfolio tenants table)
    const notesHistory = Array.isArray(tenant.notesHistory) ? tenant.notesHistory : [];
    const notesCount = notesHistory.length;
    const notesBadge = `<button class="portfolio-tenant-notes-link" data-tenant-id="${tenant._id}" style="background:none;border:none;padding:0;margin:0;font:inherit;cursor:pointer;">
                <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:#eef2ff;color:#4f46e5;font-size:0.8rem;">
                    <i class=\"fas fa-sticky-note\"></i>
                    ${notesCount}
                </span>
            </button>`;
    const tenantNotesMessages = notesHistory.length
        ? notesHistory
            .slice()
            .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
            .slice(-8)
            .map(note => {
                const noteId = note._id || '';
                const managerFallback = note.authorRole === 'tenant'
                    ? 'Tenant'
                    : (localStorage.getItem('managerName') || localStorage.getItem('userName') || localStorage.getItem('managerId') || 'Management');
                const authorLabel = escapeHtml(note.authorName || note.createdByName || note.managerName || note.createdBy || note.managerId || managerFallback);
                const timestamp = note.createdAt ? new Date(note.createdAt).toLocaleString('en-US') : '';
                const bubbleBackground = note.authorRole === 'tenant' ? '#eff6ff' : '#ecfdf5';
                const bubbleBorder = note.authorRole === 'tenant' ? '#bfdbfe' : '#bbf7d0';
                const deleteButton = noteId ? `<button type="button" class="tenant-card-note-delete" data-tenant-id="${tenant._id}" data-note-id="${noteId}" title="Delete note"><i class="fas fa-trash"></i></button>` : '';
                return `<div class="tenant-card-note" data-note-id="${noteId}"><div class="tenant-card-note-bubble" style="border:1px solid ${bubbleBorder};background:${bubbleBackground};">
                            ${deleteButton}
                            <div style="font-weight:700;font-size:0.8rem;color:#0f172a;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;">
                                <span>${authorLabel}</span>
                                <span style="font-weight:500;color:#64748b;">${escapeHtml(timestamp)}</span>
                            </div>
                            <div style="font-size:0.84rem;color:#475569;margin-top:3px;white-space:pre-line;">${escapeHtml(note.text || '')}</div>
                        </div></div>`;
            }).join('')
        : '<div style="font-size:0.84rem;color:#64748b;padding:8px;border:1px dashed #cbd5e1;border-radius:8px;background:#fff;">No notes yet. Start the conversation below.</div>';

    return `
        <div class="tenant-card">
            <div class="tenant-header">
                <div class="tenant-avatar-small">${initials}</div>
                <h3>${tenant.name}</h3>
            </div>
            <div class="tenant-card-scroll">
                <div class="tenant-card-layout">
                    <div class="tenant-card-main">
                        <div class="tenant-info">
                            <div class="tenant-section">
                                <div class="tenant-section-title"><i class="fas fa-home"></i> Unit</div>
                                <div class="tenant-detail-row">
                                    ${assignedUnit ? 
                                        `Unit ${assignedUnit.number} (${assignedUnit.bedrooms} bed, ${assignedUnit.bathrooms} bath)` : 
                                        'No unit assigned'}
                                </div>
                                <div class="tenant-detail-row"><span>Parking:</span> <span>${parkingAssignment || 'Unassigned'}</span></div>
                                <div class="tenant-detail-row"><span>Access Code:</span> <span>${tenant.accessCode || 'Not set'}</span></div>
                            </div>
                            <div class="tenant-section">
                                <div class="tenant-section-title"><i class="fas fa-calendar-alt"></i> Lease</div>
                                <div class="tenant-detail-row"><span>Lease:</span> <span>${leaseStart} - ${leaseEnd}</span></div>
                                ${leaseCountdownHtml}
                                ${rentStatusBadge ? `<div class="tenant-detail-row">${rentStatusBadge}</div>` : ''}
                                <div class="tenant-detail-row"><span>Deposit:</span> <span>$${(tenant.deposit ?? 0).toFixed(2)}</span></div>
                                <div class="tenant-detail-row"><span>Base Rent:</span> <span>$${(Number(tenant.baseRent) || 0).toFixed(2)}</span></div>
                                <div class="tenant-detail-row"><span>Total Fees:</span> <span style="font-weight:600; color:#2980b9;">$${additionalFees.toFixed(2)}</span></div>
                                <div class="tenant-detail-row">
                                    <span>Total Rent:</span>
                                    <span style="font-weight:700; color:#217dbb; font-size:1.08em; letter-spacing:0.5px; background:#eaf6ff; padding:3px 12px; border-radius:12px;">
                                        $${totalRent.toFixed(2)}
                                    </span>
                                </div>
                                <div class="tenant-detail-row">
                                    <span>Status:</span>
                                    <span class="lease-badge ${tenant.leaseStatus || 'active'}">
                                        <i class="fas fa-circle"></i>
                                        ${(tenant.leaseStatus || 'active').charAt(0).toUpperCase() + (tenant.leaseStatus || 'active').slice(1)}
                                    </span>
                                </div>
                            </div>
                            <div class="tenant-section">
                                <div class="tenant-section-title"><i class="fas fa-user-shield"></i> Emergency</div>
                                ${emergency}
                            </div>
                        </div>
                        <div class="tenant-actions">
                            <button type="button" class="btn-secondary" data-eviction-tenant="${tenant._id}" onclick="openEvictionCases('${tenant._id}')">Eviction case</button>
                            <button onclick="viewTenantDetails('${tenant._id}')" class="btn-secondary">
                                <i class="fas fa-eye"></i> Details
                            </button>
                            <button onclick="editTenant('${tenant._id}')" class="btn-secondary">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button onclick="deleteTenant('${tenant._id}')" class="btn-icon delete-btn" title="Delete Tenant">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="maintenance-thread compact-maintenance-thread tenant-card-thread">
                        <div class="tenant-card-thread-header">
                            <span><i class="fas fa-comments" style="color:#2563eb;margin-right:6px;"></i>Tenant Notes</span>
                            
                        </div>
                        <div class="maintenance-thread-messages" style="display:grid;gap:6px;margin-bottom:6px;max-height:220px;overflow-y:auto;padding-right:4px;align-content:start;scrollbar-width:none;">
                            ${tenantNotesMessages}
                        </div>
                        <form onsubmit="sendTenantCardNote(event, '${tenant._id}')" class="tenant-card-thread-form">
                            <input name="message" type="text" maxlength="1200" placeholder="Add tenant note or reply" style="border:1px solid #cbd5e1;border-radius:8px;padding:7px 9px;background:#fff;">
                            <button type="submit" class="btn-secondary"><i class="fas fa-paper-plane"></i> Send</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;

    }).join('');

    // Wire tenant notes badge clicks to open shared notes drawer
    tenantsList.querySelectorAll('.portfolio-tenant-notes-link').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const id = btn.getAttribute('data-tenant-id');
            if (!id) return;
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

    tenantsList.querySelectorAll('.tenant-card-note-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const tenantId = btn.getAttribute('data-tenant-id');
            const noteId = btn.getAttribute('data-note-id');
            if (!tenantId || !noteId) return;
            deleteTenantCardNote(tenantId, noteId);
        });
    });
}

async function sendTenantCardNote(event, tenantId) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form?.querySelector('input[name="message"]');
    const text = (input?.value || '').trim();
    if (!tenantId || !input || !text) return;
    if (form.dataset.isSaving === 'true') return;

    try {
        form.dataset.isSaving = 'true';
        input.disabled = true;
        const button = form.querySelector('button[type="submit"]');
        if (button) button.disabled = true;
        const managerId = localStorage.getItem('managerId') || '';
        const managerName = localStorage.getItem('managerName') || localStorage.getItem('userName') || '';

        const res = await fetch(`/api/tenants/${tenantId}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                managerId,
                authorName: managerName,
                createdBy: managerName || managerId
            })
        });
        if (!res.ok) throw new Error('Failed to add note');

        const data = await res.json();
        const notes = data.notes || [];
        state.tenants = (state.tenants || []).map(t =>
            String(t._id) === String(tenantId) ? { ...t, notesHistory: notes } : t
        );
        state.allTenants = (state.allTenants || []).map(t =>
            String(t._id) === String(tenantId) ? { ...t, notesHistory: notes } : t
        );

        if (state.portfolioWorkspaceMode === 'tenants' && state.portfolioTenantView === 'grid') {
            renderUnifiedPortfolioWorkspace(false);
        } else {
            renderTenants();
        }
    } catch (error) {
        console.error('Error adding tenant note from card:', error);
        showNotification('Could not add tenant note', 'error');
    } finally {
        delete form.dataset.isSaving;
        input.disabled = false;
        const button = form.querySelector('button[type="submit"]');
        if (button) button.disabled = false;
    }
}

async function deleteTenantCardNote(tenantId, noteId) {
    if (!tenantId || !noteId) return;
    if (!confirm('Delete this note? This cannot be undone.')) return;

    try {
        const res = await fetch(`/api/tenants/${tenantId}/notes/${noteId}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Failed to delete note');

        const data = await res.json();
        const notes = data.notes || [];
        state.tenants = (state.tenants || []).map(t =>
            String(t._id) === String(tenantId) ? { ...t, notesHistory: notes } : t
        );
        state.allTenants = (state.allTenants || []).map(t =>
            String(t._id) === String(tenantId) ? { ...t, notesHistory: notes } : t
        );

        if (state.portfolioWorkspaceMode === 'tenants' && state.portfolioTenantView === 'grid') {
            renderUnifiedPortfolioWorkspace(false);
        } else {
            renderTenants();
        }
    } catch (error) {
        console.error('Error deleting tenant note from card:', error);
        showNotification('Could not delete tenant note', 'error');
    }
}

async function viewTenantDetails(tenantId) {
    try {
        const tenant = state.tenants.find(t => t._id === tenantId);
        if (!tenant) throw new Error('Tenant not found');

        // Get tenant initials for avatar
        const initials = tenant.name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase();

        // Lease holders
        const leaseHoldersHtml = (tenant.leaseHolders && tenant.leaseHolders.length)
            ? `<ul>
                ${tenant.leaseHolders.map(holder => `
                    <li>
                        <strong>${holder.name}</strong>
                        ${holder.phone ? ` | <i class="fas fa-phone"></i> ${holder.phone}` : ''}
                        ${holder.email ? ` | <i class="fas fa-envelope"></i> ${holder.email}` : ''}
                    </li>
                `).join('')}
              </ul>`
            : '<span class="tenant-detail-value">None listed</span>';

        // Format dates
        const leaseStart = tenant.leaseStart ? formatDateDisplay(tenant.leaseStart, 'en-US') : 'Not set';
        const leaseEnd = tenant.leaseEnd ? formatDateDisplay(tenant.leaseEnd, 'en-US') : 'Not set';

        // Unit info
        let unitInfoHtml = '<p>No unit assigned</p>';
        if (tenant.unitId && typeof tenant.unitId === 'object') {
            unitInfoHtml = `
                <p><i class="fas fa-home"></i> Unit ${tenant.unitId.number}</p>
                <p><i class="fas fa-bed"></i> ${tenant.unitId.bedrooms} Bedrooms, ${tenant.unitId.bathrooms} Bathrooms</p>
                <p><i class="fas fa-ruler-combined"></i> ${tenant.unitId.sqft || 'N/A'} sq ft</p>
                <p><i class="fas fa-building"></i> Floor ${tenant.unitId.floor || '1'}</p>
            `;
        }

        // Lease type details
        let leaseTypeDetails = '';
        if (tenant.leaseType === 'fmr') {
            leaseTypeDetails = `<p><i class="fas fa-sticky-note"></i> FMR Notes: ${tenant.fmrNotes || 'None'}</p>`;
        } else if (tenant.leaseType === 'section8') {
            leaseTypeDetails = `
                <p><i class="fas fa-building"></i> HUB Contribution: $${tenant.hubContribution?.toFixed(2) || '0.00'}</p>
                <p><i class="fas fa-user"></i> Tenant Contribution: $${tenant.tenantContribution?.toFixed(2) || '0.00'}</p>
            `;
        }

        // Only sum monthly pet rent for totals
        const petFees = (tenant.pets?.hasPets ? (Number(tenant.pets.monthlyRent) || 0) : 0);

        // Calculate additional fees (including custom "Other" fee)
        const additionalFees = 
            (Number(tenant.waterFee) || 0) +
            (Number(tenant.trashFee) || 0) +
            (Number(tenant.adminFee) || 0) +
            (tenant.additionalFee?.amount || 0) +
            petFees;

        // Additional fees HTML
        const additionalFeesHtml = `
            <p><i class="fas fa-tint"></i> Water Fee: $${tenant.waterFee?.toFixed(2) || '0.00'}</p>
            <p><i class="fas fa-trash"></i> Trash Fee: $${tenant.trashFee?.toFixed(2) || '0.00'}</p>
            <p><i class="fas fa-user-cog"></i> Admin Fee: $${tenant.adminFee?.toFixed(2) || '0.00'}</p>
            <p><i class="fas fa-square-parking"></i> Parking: ${tenant.parking || 'Unassigned'}</p>
            <p><i class="fas fa-key"></i> Access Code: ${tenant.accessCode || 'Not set'}</p>
            ${
                tenant.additionalFee?.amount
                    ? `<p><i class="fas fa-coins"></i> ${
                        tenant.additionalFee.type === 'other' && tenant.additionalFee.label
                            ? tenant.additionalFee.label
                            : tenant.additionalFee.type === 'parking'
                                ? 'Parking Fee'
                                : tenant.additionalFee.type === 'storage'
                                    ? 'Storage Fee'
                                    : (tenant.additionalFee.label || 'Other Fee')
                    }: $${Number(tenant.additionalFee.amount).toFixed(2)}</p>`
                    : ''
            }
            ${tenant.pets?.hasPets && tenant.pets.monthlyRent ? `<p><i class="fas fa-dog"></i> Monthly Pet Rent: $${(Number(tenant.pets.monthlyRent) || 0).toFixed(2)}</p>` : ''}
            <p style="margin-top:8px; font-weight:600; color:#2980b9;">
              <i class="fas fa-plus-circle"></i> Total Fees: $${additionalFees.toFixed(2)}
            </p>
        `;

        // Total rent calculation (base rent + all additional fees)
        const totalRent =
            (Number(tenant.baseRent) || 0) +
            additionalFees;

        // Authorized occupants
        const occupantsHtml = (tenant.authorizedOccupants || []).length
            ? `<ul>${tenant.authorizedOccupants.map(o => `<li>${o}</li>`).join('')}</ul>`
            : '<li>None listed</li>';

        // Pets
        let petsHtml = 'No';
        if (tenant.pets?.hasPets) {
            petsHtml = `<div>
                Yes (${tenant.pets.count} pet${tenant.pets.count > 1 ? 's' : ''})
                ${tenant.pets.fee ? `, Fee: $${tenant.pets.fee}` : ''}
                ${tenant.pets.nonRefundableFee ? `<br>Non-refundable Fee: $${tenant.pets.nonRefundableFee}` : ''}
                ${tenant.pets.monthlyRent ? `<br>Monthly Pet Rent: $${tenant.pets.monthlyRent}` : ''}
                ${tenant.pets.depositIncrease ? `<br>Deposit Increase: $${tenant.pets.depositIncrease}` : ''}
                ${Array.isArray(tenant.pets.details) && tenant.pets.details.length ? `
                    <ul>
                        ${tenant.pets.details.map((pet, idx) => `
                            <li>
                                <strong>Pet #${idx + 1}:</strong>
                                ${pet.type ? `Type: ${pet.type}, ` : ''}
                                ${pet.name ? `Name: ${pet.name}, ` : ''}
                                ${pet.breed ? `Breed: ${pet.breed}, ` : ''}
                                ${pet.weight ? `Weight/Size: ${pet.weight}, ` : ''}
                                ${pet.age ? `Age: ${pet.age}, ` : ''}
                                ${pet.gender ? `Gender: ${pet.gender}, ` : ''}
                                ${pet.vaccination ? `Vaccination/Licensing #: ${pet.vaccination}` : ''}
                            </li>
                        `).join('')}
                    </ul>
                ` : ''}
            </div>`;
        }

        // Cars
        let carsHtml = '<span class="tenant-detail-value">No cars listed</span>';
        if (tenant.cars?.hasCar && Array.isArray(tenant.cars.details) && tenant.cars.details.length) {
            carsHtml = `<ul class="tenant-list">${tenant.cars.details.map((car, idx) => `
                <li>
                    <strong>Car #${idx + 1}:</strong>
                    ${car.year || ''} ${car.make || ''} ${car.model || ''} (${car.color || ''}) - Plate: ${car.licensePlate || ''}
                </li>
            `).join('')}</ul>`;
        }

        // Emergency contact
        const emergencyHtml = tenant.emergencyContact
            ? `
                <p><i class="fas fa-user-shield"></i> ${tenant.emergencyContact.name || 'N/A'}</p>
                <p><i class="fas fa-phone"></i> ${tenant.emergencyContact.phone || 'N/A'}</p>
                <p><i class="fas fa-envelope"></i> ${tenant.emergencyContact.email || 'N/A'}</p>
                <p><i class="fas fa-map-marker-alt"></i> ${tenant.emergencyContact.address || 'N/A'}</p>
                <p><i class="fas fa-user-friends"></i> Relation: ${tenant.emergencyContact.relation || 'N/A'}</p>
            `
            : '<span class="tenant-detail-value">N/A</span>';

        // Lease status badge
        const leaseStatus = tenant.leaseStatus || 'active';
        const leaseStatusText = leaseStatus.charAt(0).toUpperCase() + leaseStatus.slice(1);

        // Dates for created/updated
        const createdAt = tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        }) : '';
        const updatedAt = tenant.updatedAt ? new Date(tenant.updatedAt).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        }) : '';

        const detailsHtml = `
            <div class="modal-content tenant-details-modal">
                <div class="tenant-details-header">
                    <div class="tenant-avatar">${initials}</div>
                    <h2>${tenant.name}</h2>
                </div>
                <div class="tenant-details-content">
                    <div class="detail-group">
                        <label>Contact Information</label>
                        <p><i class="fas fa-phone"></i> ${tenant.phone}</p>
                        <p><i class="fas fa-envelope"></i> ${tenant.email}</p>
                    </div>
                    <div class="detail-group">
                        <label>Additional Lease Holders</label>
                        ${leaseHoldersHtml}
                    </div>
                    <div class="detail-group">
                        <label>Unit Information</label>
                        ${unitInfoHtml}
                    </div>
                    <div class="detail-group">
                        <label>Lease Information</label>
                        <p><i class="fas fa-calendar-alt"></i> Start Date: ${leaseStart}</p>
                        <p><i class="fas fa-calendar-check"></i> End Date: ${leaseEnd}</p>
                        <p><i class="fas fa-dollar-sign"></i> Deposit: $${tenant.deposit?.toFixed(2) || '0.00'}</p>
                        <p><i class="fas fa-dollar-sign"></i> Base Rent: $${tenant.baseRent?.toFixed(2) || '0.00'}</p>
                        ${additionalFeesHtml}
                        <p style="margin-top:10px;">
                          <strong><i class="fas fa-calculator"></i> Total Rent:</strong>
                          <span style="font-weight:700; color:#217dbb; font-size:1.08em; letter-spacing:0.5px; background:#eaf6ff; padding:3px 12px; border-radius:12px;">
                            $${totalRent.toFixed(2)}
                          </span>
                        </p>
                        <p><i class="fas fa-file-contract"></i> Lease Type: 
                            ${tenant.leaseType === 'fmr' ? 'Free Market Rent' : tenant.leaseType === 'section8' ? 'Section 8' : 'N/A'}
                        </p>
                        ${leaseTypeDetails}
                        <p>
                          <i class="fas fa-info-circle"></i> Lease Status:
                          <span class="lease-badge ${leaseStatus}">
                            ${leaseStatusText}
                          </span>
                        </p>
                        <p><i class="fas fa-redo"></i> Renewal: ${tenant.leaseRenewal === 'renew' ? 'Will Renew' : 'Will Terminate'}</p>
                    </div>
                    <div class="detail-group">
                        <label>Emergency Contact</label>
                        ${emergencyHtml}
                    </div>
                    <div class="detail-group">
                        <label>Authorized Occupants</label>
                        <ul>
                            ${occupantsHtml}
                        </ul>
                    </div>
                    <div class="detail-group">
                        <label>Pets</label>
                        <p>${petsHtml}</p>
                    </div>
                    <div class="detail-group">
                        <label>Cars</label>
                        ${carsHtml}
                    </div>
                    <div class="detail-group">
                        <label>Additional Information</label>
                        <p><i class="fas fa-clock"></i> Added: ${createdAt}</p>
                        <p><i class="fas fa-sync"></i> Last Updated: ${updatedAt}</p>
                    </div>
                </div>
                <div class="modal-footer">
                    <button onclick="editTenant('${tenant._id}')" class="btn-primary">
                        <i class="fas fa-edit"></i> Edit Tenant
                    </button>
                    <button onclick="closeModal('tenantDetailsModal')" class="btn-secondary">
                        <i class="fas fa-times"></i> Close
                    </button>
                </div>
            </div>
        `;

        let modal = document.getElementById('tenantDetailsModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'tenantDetailsModal';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        modal.innerHTML = detailsHtml;
        openModal('tenantDetailsModal');

    } catch (error) {
        console.error('Error viewing tenant details:', error);
        showNotification('Error loading tenant details', 'error');
    }
}

async function editTenant(tenantId) {
    try {
        const tenant = state.tenants.find(t => t._id === tenantId);
        if (!tenant) throw new Error('Tenant not found');

        // Populate form fields (defensive: check if element exists before setting value)
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val ?? '';
        };

        setVal('tenantName', tenant.name);
        setVal('tenantPhone', tenant.phone);
        setVal('tenantEmail', tenant.email);
        setVal('tenantParking', tenant.parking || '');
        setVal('tenantAccessCode', tenant.accessCode || '');

        populateLeaseHolders(tenant.leaseHolders || []);

        setVal('leaseStart', tenant.leaseStart ? new Date(tenant.leaseStart).toISOString().split('T')[0] : '');
        setVal('leaseEnd', tenant.leaseEnd ? new Date(tenant.leaseEnd).toISOString().split('T')[0] : '');
        setVal('baseRent', tenant.baseRent);
        setVal('deposit', tenant.deposit);
        setVal('waterFee', tenant.waterFee);
        setVal('trashFee', tenant.trashFee);
        setVal('adminFee', tenant.adminFee);
        setVal('leaseType', tenant.leaseType);
        setVal('leaseStatus', tenant.leaseStatus || 'active');

        // Additional Fee fields
        setVal('additionalFeeType', tenant.additionalFee?.type || '');
        setVal('additionalFeeLabel', tenant.additionalFee?.label || '');
        setVal('additionalFeeAmount', tenant.additionalFee?.amount || '');
        document.getElementById('additionalFeeType')?.dispatchEvent(new Event('change'));

        // Lease type sections
        if (tenant.leaseType === 'fmr') {
            document.getElementById('fmrSection').style.display = 'block';
            document.getElementById('section8Section').style.display = 'none';
            setVal('fmrNotes', tenant.fmrNotes);
        } else if (tenant.leaseType === 'section8') {
            document.getElementById('fmrSection').style.display = 'none';
            document.getElementById('section8Section').style.display = 'flex';
            setVal('hubContribution', tenant.hubContribution);
            setVal('tenantContribution', tenant.tenantContribution);
        } else {
            document.getElementById('fmrSection').style.display = 'none';
            document.getElementById('section8Section').style.display = 'none';
            setVal('fmrNotes', '');
            setVal('hubContribution', '');
            setVal('tenantContribution', '');
        }

        // Emergency contact
        setVal('emergencyContactName', tenant.emergencyContact?.name || '');
        setVal('emergencyContactPhone', tenant.emergencyContact?.phone || '');
        setVal('emergencyContactEmail', tenant.emergencyContact?.email || '');
        setVal('emergencyContactAddress', tenant.emergencyContact?.address || '');
        setVal('emergencyContactRelation', tenant.emergencyContact?.relation || '');

        // Authorized occupants
        setVal('authorizedOccupants', (tenant.authorizedOccupants || []).join('\n'));

        // Pets
        const hasPets = !!(tenant.pets && tenant.pets.hasPets);
        const petsCheckbox = document.getElementById('hasPets');
        if (petsCheckbox) petsCheckbox.checked = hasPets;
        const petDetailsDiv = document.getElementById('petDetails');
        if (petDetailsDiv) petDetailsDiv.style.display = hasPets ? 'block' : 'none';
        setVal('petCount', tenant.pets?.count || '');
        setVal('petFee', tenant.pets?.fee || '');
        setVal('petNonRefundableFee', tenant.pets?.nonRefundableFee || '');
        setVal('petMonthlyRent', tenant.pets?.monthlyRent || '');
        setVal('petDepositIncrease', tenant.pets?.depositIncrease || '');
        updatePetFields();
        if (tenant.pets && Array.isArray(tenant.pets.details)) {
            tenant.pets.details.forEach((pet, i) => {
                const setPetVal = (cls, val) => {
                    const el = document.querySelector(`.${cls}[data-index="${i}"]`);
                    if (el) el.value = val ?? '';
                };
                setPetVal('pet-type', pet.type);
                setPetVal('pet-name', pet.name);
                setPetVal('pet-breed', pet.breed);
                setPetVal('pet-weight', pet.weight);
                setPetVal('pet-age', pet.age);
                setPetVal('pet-gender', pet.gender);
                setPetVal('pet-vaccination', pet.vaccination);
            });
        }

        // Lease renewal
        setVal('leaseRenewal', tenant.leaseRenewal || 'renew');

        // Cars
        const hasCar = !!(tenant.cars && tenant.cars.hasCar);
        const hasCarCheckbox = document.getElementById('hasCar');
        if (hasCarCheckbox) hasCarCheckbox.checked = hasCar;
        const carDetailsDiv = document.getElementById('carDetails');
        if (carDetailsDiv) carDetailsDiv.style.display = hasCar ? 'block' : 'none';
        setVal('carCount', tenant.cars?.count || 1);
        updateCarFields();
        if (tenant.cars && Array.isArray(tenant.cars.details)) {
            tenant.cars.details.forEach((car, i) => {
                const setCarVal = (cls, val) => {
                    const el = document.querySelector(`.${cls}[data-index="${i}"]`);
                    if (el) el.value = val ?? '';
                };
                setCarVal('car-make', car.make);
                setCarVal('car-model', car.model);
                setCarVal('car-color', car.color);
                setCarVal('car-plate', car.licensePlate);
                setCarVal('car-year', car.year);
            });
        }

        renderTenantUnitOptions(state.units || [], tenant.unitId);

        // Open modal in edit mode
        openModal('addTenantModal');

        // Update form handler for edit mode
        const form = document.getElementById('addTenantForm');
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) submitButton.textContent = 'Update Tenant';

        // Store the tenantId for update and mark as edit mode
        form.dataset.editMode = 'true';
        form.dataset.tenantId = tenantId;

        // Remove the previous event listener and add new one
        form.onsubmit = null;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleUpdateTenant(tenantId);

            // After update, handle unit status based on leaseStatus
            const leaseStatus = document.getElementById('leaseStatus').value;
            const unitId = document.getElementById('tenantUnit').value;
            if (unitId) {
                if (leaseStatus === 'terminated' || leaseStatus === 'expired') {
                    await fetch(`${API_URL}/properties/${state.currentProperty._id}/units/${unitId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'vacant' })
                    });
                    await loadUnits(state.currentProperty._id);
                } else if (leaseStatus === 'active') {
                    await fetch(`${API_URL}/properties/${state.currentProperty._id}/units/${unitId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'occupied' })
                    });
                    await loadUnits(state.currentProperty._id);
                }
            }
        }, { once: true }); // Use once: true to auto-remove after submission
    } catch (error) {
        console.error('Error editing tenant:', error);
        showNotification('Error editing tenant', 'error');
    }
}

async function handleUpdateTenant(tenantId) {
    const tenant = state.tenants.find(t => t._id === tenantId);
    if (!tenant) {
        showNotification('Tenant not found', 'error');
        return;
    }

    const newUnitId = document.getElementById('tenantUnit').value;
    const oldUnitId = tenant.unitId?._id || tenant.unitId;

    // Gather car info if "Has Car(s)" is checked
    let cars = [];
    if (document.getElementById('hasCar').checked) {
        const carCount = parseInt(document.getElementById('carCount').value) || 0;
        for (let i = 0; i < carCount; i++) {
            cars.push({
                make: document.querySelector(`.car-make[data-index="${i}"]`)?.value || '',
                model: document.querySelector(`.car-model[data-index="${i}"]`)?.value || '',
                color: document.querySelector(`.car-color[data-index="${i}"]`)?.value || '',
                licensePlate: document.querySelector(`.car-plate[data-index="${i}"]`)?.value || '',
                year: document.querySelector(`.car-year[data-index="${i}"]`).value || ''
            });
        }
    }

    // Gather pet info if "Has Pets" is checked
    let pets = {
        hasPets: document.getElementById('hasPets').checked,
        count: document.getElementById('hasPets').checked ? Number(document.getElementById('petCount').value) : 0,
        fee: document.getElementById('hasPets').checked ? Number(document.getElementById('petFee')?.value) || 0 : 0,
        nonRefundableFee: document.getElementById('hasPets').checked ? Number(document.getElementById('petNonRefundableFee')?.value) || 0 : 0,
        monthlyRent: document.getElementById('hasPets').checked ? Number(document.getElementById('petMonthlyRent')?.value) || 0 : 0,
        depositIncrease: document.getElementById('hasPets').checked ? Number(document.getElementById('petDepositIncrease')?.value) || 0 : 0,
        details: []
    };
    if (pets.hasPets) {
        pets.details = Array.from(document.querySelectorAll('.pet-field-group')).map((group, i) => ({
            type: group.querySelector('.pet-type')?.value || '',
            name: group.querySelector('.pet-name')?.value || '',
            breed: group.querySelector('.pet-breed')?.value || '',
            weight: group.querySelector('.pet-weight')?.value || '',
            age: group.querySelector('.pet-age')?.value || '',
            gender: group.querySelector('.pet-gender')?.value || '',
            vaccination: group.querySelector('.pet-vaccination')?.value || ''
        }));
    }

    const tenantData = {
        name: document.getElementById('tenantName').value,
        phone: document.getElementById('tenantPhone').value,
        email: document.getElementById('tenantEmail').value,
        parking: document.getElementById('tenantParking').value.trim(),
        accessCode: document.getElementById('tenantAccessCode').value.trim(),
        leaseHolders: getLeaseHoldersFromForm(),
        emergencyContact: {
            name: document.getElementById('emergencyContactName').value,
            phone: document.getElementById('emergencyContactPhone').value,
            email: document.getElementById('emergencyContactEmail').value,
            address: document.getElementById('emergencyContactAddress').value, 
            relation: document.getElementById('emergencyContactRelation').value
        },
        authorizedOccupants: document.getElementById('authorizedOccupants').value
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean),
        pets,
        cars: {
            hasCar: document.getElementById('hasCar').checked,
            count: document.getElementById('hasCar').checked ? (parseInt(document.getElementById('carCount').value) || 0) : 0,
            details: cars
        },
        additionalFee: {
            type: document.getElementById('additionalFeeType').value,
            label: document.getElementById('additionalFeeLabel').value,
            amount: Number(document.getElementById('additionalFeeAmount').value) || 0
        },
        leaseRenewal: document.getElementById('leaseRenewal').value,
        unitId: newUnitId,
    leaseStart: dateInputToISOAtNoon(document.getElementById('leaseStart').value),
    leaseEnd: dateInputToISOAtNoon(document.getElementById('leaseEnd').value),
        baseRent: Number(document.getElementById('baseRent').value),
        deposit: Number(document.getElementById('deposit').value) || 0,
        waterFee: Number(document.getElementById('waterFee').value) || 0,
        trashFee: Number(document.getElementById('trashFee').value) || 0,
        adminFee: Number(document.getElementById('adminFee').value) || 0,
        leaseType: document.getElementById('leaseType').value,
        fmrNotes: document.getElementById('leaseType').value === 'fmr' ? document.getElementById('fmrNotes').value : '',
        hubContribution: document.getElementById('leaseType').value === 'section8' ? Number(document.getElementById('hubContribution').value) : 0,
        tenantContribution: document.getElementById('leaseType').value === 'section8' ? Number(document.getElementById('tenantContribution').value) : 0,
        leaseStatus: document.getElementById('leaseStatus').value,
        status: tenant.status || 'active'
    };

    // Validate lease dates
    if (new Date(tenantData.leaseStart) > new Date(tenantData.leaseEnd)) {
        showNotification('Lease end date must be after start date', 'error');
        return;
    }
    showLoader();
    try {
        // Update tenant
        const response = await fetch(`${API_URL}/properties/${state.currentProperty._id}/tenants/${tenantId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tenantData)
        });

        if (!response.ok) throw new Error('Failed to update tenant');

        // Handle unit status changes
        if (oldUnitId !== newUnitId) {
            // Set old unit to vacant if exists
            if (oldUnitId) {
                await fetch(`${API_URL}/properties/${state.currentProperty._id}/units/${oldUnitId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'vacant' })
                });
            }

            // Set new unit to occupied if selected
            if (newUnitId) {
                await fetch(`${API_URL}/properties/${state.currentProperty._id}/units/${newUnitId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'occupied' })
                });
            }
        }

        // If leaseStatus is 'terminated' or 'expired', set the unit to vacant
        if (
            (tenantData.leaseStatus === 'terminated' || tenantData.leaseStatus === 'expired') &&
            newUnitId
        ) {
            await fetch(`${API_URL}/properties/${state.currentProperty._id}/units/${newUnitId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'vacant' })
            });
        }

        // If leaseStatus is 'active', set the unit to occupied
        if (
            tenantData.leaseStatus === 'active' &&
            newUnitId
        ) {
            await fetch(`${API_URL}/properties/${state.currentProperty._id}/units/${newUnitId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'occupied' })
            });
        }

        invalidateCache('tenants','units');
        await Promise.all([
            refreshContent('tenants'),
            refreshContent('units')
        ]);
        
        // Reset form and close modal
        const form = document.getElementById('addTenantForm');
        form.reset();
        form.dataset.editMode = 'false';
        form.dataset.tenantId = '';
        
        // Reset the submit button text
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.textContent = 'Add Tenant';
        
    // The original global addEventListener('submit', handleAddTenant) remains.
    // Avoid assigning form.onsubmit here to prevent duplicate submission handlers
    // which caused double tenant creation.
        
        closeModal('addTenantModal');
        showNotification('Tenant updated successfully', 'success');
    runWhenIdle(() => loadAllUnitsAndTenants());
    } catch (error) {
        console.error('Error updating tenant:', error);
        showNotification('Error updating tenant', 'error');
    } finally {
        hideLoader();
    }
}

// Add this function to populate unit select when opening the tenant modal
function renderTenantUnitOptions(unitsSource = [], selectedUnitId = '') {
    const unitSelect = document.getElementById('tenantUnit');
    const statusHint = document.getElementById('tenantUnitStatusHint');
    if (!unitSelect) return;

    const selectedId = selectedUnitId ? String(selectedUnitId._id || selectedUnitId) : '';
    const relevantUnits = unitsSource.filter(unit => {
        const unitId = String(unit._id || '');
        return ['vacant', 'maintenance', 'occupied'].includes(unit.status) || (selectedId && unitId === selectedId);
    });

    unitSelect.innerHTML = `
        <option value="">Select a unit</option>
        ${relevantUnits.map(unit => {
            const unitId = String(unit._id || '');
            const isSelected = selectedId && unitId === selectedId;
            const isMaintenance = unit.status === 'maintenance';
            const isOccupied = unit.status === 'occupied';
            const isDisabled = (isMaintenance || isOccupied) && !isSelected;
            const statusLabel = isMaintenance
                ? ' - Unit in Maintenance'
                : (isOccupied ? ' - Unit Occupied' : '');
            return `
                <option value="${unit._id}" ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}>
                    Unit ${unit.number} - ${unit.bedrooms} bed, ${unit.bathrooms} bath${statusLabel}
                </option>
            `;
        }).join('')}
    `;

    if (statusHint) {
        statusHint.style.display = relevantUnits.some(unit => unit.status === 'maintenance' || unit.status === 'occupied') ? 'block' : 'none';
    }
}

function populateUnitSelect() {
    const propSelect = document.getElementById('tenantProperty');

    // Determine which property's units to show: selected fallback property, else current property
    let unitsSource = state.units || [];
    const allUnits = state.allUnits || [];
    const selectedPropId = propSelect?.value || '';
    if (selectedPropId && Array.isArray(allUnits) && allUnits.length) {
        const pid = selectedPropId;
        unitsSource = allUnits.filter(u => {
            const upid = u.projectId || u.propertyId || u.project;
            return upid && String(upid) === String(pid);
        });
    }

    renderTenantUnitOptions(unitsSource);
}

//  deleteTenant function
async function deleteTenant(tenantId) {
    if (!confirm('Are you sure you want to delete this tenant?')) {
        return;
    }
   showLoader();
    try {
        const tenant = state.tenants.find(t => t._id === tenantId);
        if (!tenant) throw new Error('Tenant not found');

        const response = await fetch(`${API_URL}/properties/${state.currentProperty._id}/tenants/${tenantId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete tenant');

        // If tenant was assigned to a unit, update unit status to vacant
        if (tenant.unitId) {
            await fetch(`${API_URL}/properties/${state.currentProperty._id}/units/${tenant.unitId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'vacant' })
            });
        }

        // Reload both tenants and units using universal refresh
        invalidateCache('tenants', 'units');
        await Promise.all([
            refreshContent('tenants'),
            refreshContent('units')
        ]);

        showNotification('Tenant deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting tenant:', error);
        showNotification('Error deleting tenant', 'error');
           } finally {
        hideLoader(); 
    }
}
