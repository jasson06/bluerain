// Property management: units.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// Property Management Handlers
async function handleAddProperty(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const propertyData = {
        name: formData.get('name'),
        type: 'Multifamily',
        address: {
            line1: formData.get('addressLine1'),
            line2: formData.get('addressLine2'),
            city: formData.get('city'),
            state: formData.get('state'),
            zip: formData.get('zip')
        }
    };
showLoader();
    try {
        const response = await fetch(`${API_URL}/projects`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(propertyData)
        });

        if (!response.ok) throw new Error('Failed to add property');
        
        const newProperty = await response.json();
        state.properties.push(newProperty);
        renderPropertyList();
        closeModal('addPropertyModal');
        showNotification('Property added successfully', 'success');
        event.target.reset();
    } catch (error) {
        console.error('Error adding property:', error);
        showNotification('Error adding property', 'error');
            } finally {
        hideLoader();
    }
}

// Unit Management Handlers
async function editUnit(unitId) {
    try {
        const unit = state.units.find(u => u._id === unitId);
        if (!unit) throw new Error('Unit not found');

        // Populate the edit form
        document.getElementById('unitNumber').value = unit.number || '';
        document.getElementById('unitFloor').value = unit.floor || 1;
        document.getElementById('unitBedrooms').value = unit.bedrooms || '';
        document.getElementById('unitBathrooms').value = unit.bathrooms || '';
        document.getElementById('unitSqft').value = unit.sqft || '';
        const rentInput = document.getElementById('unitRent');
        if (rentInput) rentInput.value = typeof unit.rent === 'number' ? unit.rent : '';
        document.getElementById('unitStatus').value = unit.status || 'vacant';

        const profile = unit.profile || {};
        const profileInputs = {unitBuilding:'building',unitFloorPlan:'floorPlan',unitAvailableDate:'availableDate',unitLastRenovation:'lastRenovation',unitCondition:'condition',unitParking:'parking',unitStorage:'storage',unitSecurityDeposit:'securityDeposit',unitProfileNotes:'notes'};
        Object.entries(profileInputs).forEach(([id,key])=>{const el=document.getElementById(id);if(el)el.value=profile[key] == null ? '' : String(profile[key]).slice(0, el.type === 'date' ? 10 : 999);});
        const equipmentList = document.getElementById('unitEquipmentList');
        if (equipmentList) { equipmentList.innerHTML=''; (unit.equipment||[]).forEach(addUnitEquipment); }

        // Populate amenities/features checklist
        const amenities = unit.amenities || [];
        document.querySelectorAll('#unitAmenitiesChecklist input[type="checkbox"]').forEach(cb => {
            cb.checked = amenities.includes(cb.value);
        });

        // Populate utility account fields
        const acc = unit.utilityAccounts || {};
        const water = acc.water || {};
        const gas = acc.gas || {};
        const electricity = acc.electricity || {};

        document.getElementById('waterAccountNumber').value = water.accountNumber || '';
        document.getElementById('waterProvider').value = water.provider || '';
        document.getElementById('waterStatus').value = water.status || '';
        document.getElementById('waterUnder').value = water.under || '';

        document.getElementById('gasAccountNumber').value = gas.accountNumber || '';
        document.getElementById('gasProvider').value = gas.provider || '';
        document.getElementById('gasStatus').value = gas.status || '';
        document.getElementById('gasUnder').value = gas.under || '';

        document.getElementById('electricityAccountNumber').value = electricity.accountNumber || '';
        document.getElementById('electricityProvider').value = electricity.provider || '';
        document.getElementById('electricityStatus').value = electricity.status || '';
        document.getElementById('electricityUnder').value = electricity.under || '';

        // Open the modal in edit mode
        openModal('addUnitModal');

        // Set form to edit mode and store unitId
        const form = document.getElementById('addUnitForm');
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.textContent = 'Update Unit';
        form.dataset.editMode = 'true';
        form.dataset.unitId = unitId;

        // Remove any previous submit event listeners (if any)
        form.removeEventListener('submit', handleAddUnit);
        // Add a one-time submit handler for update
        form.onsubmit = async function(e) {
            e.preventDefault();
            await handleUpdateUnit(unitId);
        };
    } catch (error) {
        console.error('Error editing unit:', error);
        showNotification('Error editing unit', 'error');
    }
}

async function handleUpdateUnit(unitId) {
    if (!state.currentProperty) {
        showNotification('Please select a property first', 'error');
        return;
    }

    // Collect amenities/features from checklist
    const amenities = Array.from(document.querySelectorAll('#unitAmenitiesChecklist input[type="checkbox"]:checked'))
        .map(cb => cb.value);

    const unitData = {
        number: document.getElementById('unitNumber').value,
        floor: Number(document.getElementById('unitFloor').value),
        sqft: Number(document.getElementById('unitSqft').value),
        rent: Number(document.getElementById('unitRent')?.value) || 0,
        bedrooms: Number(document.getElementById('unitBedrooms').value),
        bathrooms: Number(document.getElementById('unitBathrooms').value),
        status: document.getElementById('unitStatus').value,
        profile: getUnitProfileFormData(),
        equipment: collectUnitEquipment(),
        amenities, // <-- Add amenities array
        utilityAccounts: {
            water: {
                accountNumber: document.getElementById('waterAccountNumber').value,
                provider: document.getElementById('waterProvider').value,
                status: document.getElementById('waterStatus').value,
                under: document.getElementById('waterUnder').value
            },
            gas: {
                accountNumber: document.getElementById('gasAccountNumber').value,
                provider: document.getElementById('gasProvider').value,
                status: document.getElementById('gasStatus').value,
                under: document.getElementById('gasUnder').value
            },
            electricity: {
                accountNumber: document.getElementById('electricityAccountNumber').value,
                provider: document.getElementById('electricityProvider').value,
                status: document.getElementById('electricityStatus').value,
                under: document.getElementById('electricityUnder').value
            }
        }
    };

    // Validate required fields
    if (!unitData.number || !Number.isFinite(unitData.bedrooms) || unitData.bedrooms < 0 || !Number.isFinite(unitData.bathrooms) || unitData.bathrooms < 0) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    showLoader();

    try {
        const response = await fetch(`${API_URL}/properties/${state.currentProperty._id}/units/${unitId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(unitData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to update unit');
        }

        // Reset form and close modal
        const form = document.getElementById('addUnitForm');
        form.reset();
        form.dataset.editMode = 'false';
        form.dataset.unitId = '';
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.textContent = 'Add Unit';

        // Restore the add handler and remove the custom update handler
        form.onsubmit = handleAddUnit;

    invalidateCache('units');
    await refreshContent('units');
        closeModal('addUnitModal');
        showNotification('Unit updated successfully', 'success');
    } catch (error) {
        console.error('Error updating unit:', error);
        showNotification(error.message || 'Error updating unit', 'error');
    } finally {
        hideLoader();
    }
}

function viewUnitDetails(unitId) {
    const unit = state.units.find(u => u._id === unitId);
    if (!unit) {
        showNotification('Unit not found', 'error');
        return;
    }

    // Set the current unit ID for export
    state.currentUnitId = unitId;

    // Utility account info and bills
    const utilities = [
        { type: 'Water', key: 'water' },
        { type: 'Gas', key: 'gas' },
        { type: 'Electricity', key: 'electricity' }
    ];

    // Amenities/features checklist
    const amenitiesList = [
        { key: 'washerDryer', label: 'Washer & Dryer' },
        { key: 'washerDryerHookup', label: 'Washer/Dryer Hookup' },
        { key: 'centralAC', label: 'Central AC/Heat' },
        { key: 'miniSplit', label: 'Mini Split AC' },
        { key: 'windowUnit', label: 'Window AC Unit' },
        { key: 'dishwasher', label: 'Dishwasher' },
        { key: 'refrigerator', label: 'Refrigerator' },
        { key: 'stoveOven', label: 'Stove/Oven' },
        { key: 'microwave', label: 'Microwave' },
        { key: 'garbageDisposal', label: 'Garbage Disposal' },
        { key: 'balcony', label: 'Balcony/Patio' },
        { key: 'walkInCloset', label: 'Walk-in Closet' },
        { key: 'ceilingFan', label: 'Ceiling Fan' },
        { key: 'hardwoodFloor', label: 'Hardwood Floor' },
        { key: 'tileFloor', label: 'Tile Floor' },
        { key: 'carpetFloor', label: 'Carpet Floor' },
        { key: 'fireplace', label: 'Fireplace' },
        { key: 'privateEntrance', label: 'Private Entrance' },
        { key: 'storageUnit', label: 'Storage Unit' },
        { key: 'garage', label: 'Garage' },
        { key: 'coveredParking', label: 'Covered Parking' },
        { key: 'securitySystem', label: 'Security System' },
        { key: 'internetReady', label: 'Internet Ready' },
        { key: 'cableReady', label: 'Cable Ready' },
        { key: 'furnished', label: 'Furnished' },
        { key: 'petFriendly', label: 'Pet Friendly' },
        { key: 'smokeFree', label: 'Smoke Free' },
        { key: 'wheelchairAccessible', label: 'Wheelchair Accessible' }
    ];

    // Amenities HTML
    const amenitiesHtml = unit.amenities && unit.amenities.length
        ? `<ul style="margin:0 0 0 18px; padding:0;">
            ${amenitiesList.filter(a => unit.amenities.includes(a.key)).map(a => `<li>${a.label}</li>`).join('')}
           </ul>`
        : '<span class="tenant-detail-value">No amenities listed</span>';

    // Utility accounts HTML
    const utilitiesHtml = utilities.map(util => {
        const acc = unit.utilityAccounts?.[util.key] || {};
        return `
            <div class="utility-block">
                <h4>${util.type}</h4>
                <div><strong>Account #:</strong> ${acc.accountNumber || 'N/A'}</div>
                <div><strong>Provider:</strong> ${acc.provider || 'N/A'}</div>
                <div><strong>Status:</strong> ${acc.status || 'N/A'}</div>
                <div><strong>Bill Under:</strong> ${acc.under || 'N/A'}</div>
            </div>
        `;
    }).join('');

    // Main HTML
    let html = `
      <div class="unit-section">
        <h3>Unit: ${unit.number || ''}</h3>
        <p><strong>Status:</strong> ${unit.status || 'N/A'}</p>
        <p><strong>Bedrooms:</strong> ${unit.bedrooms || 'N/A'} | <strong>Bathrooms:</strong> ${unit.bathrooms || 'N/A'}</p>
        <p><strong>Floor:</strong> ${unit.floor || 'N/A'} | <strong>Square Feet:</strong> ${unit.sqft || 'N/A'}</p>
      </div>
      <div class="unit-section">
        <h3>Amenities & Features</h3>
        ${amenitiesHtml}
      </div>
      <div class="unit-section">
        <h3>Unit Profile</h3>
        <p><strong>Building:</strong> ${escapeHtml(unit.profile?.building || 'N/A')} | <strong>Floor plan:</strong> ${escapeHtml(unit.profile?.floorPlan || 'N/A')}</p>
        <p><strong>Condition:</strong> ${escapeHtml(unit.profile?.condition || 'Not rated')} | <strong>Available:</strong> ${escapeHtml(unit.profile?.availableDate || 'N/A')}</p>
        <p><strong>Parking:</strong> ${escapeHtml(unit.profile?.parking || 'N/A')} | <strong>Storage:</strong> ${escapeHtml(unit.profile?.storage || 'N/A')}</p>
        <p><strong>Notes:</strong> ${escapeHtml(unit.profile?.notes || 'N/A')}</p>
      </div>
      <div class="unit-section">
        <h3>Equipment & Appliances (${(unit.equipment||[]).length})</h3>
        ${(unit.equipment||[]).length ? (unit.equipment||[]).map(eq=>`<div class="equipment-summary"><strong>${escapeHtml(eq.category||eq.name||'Equipment')}</strong> — ${escapeHtml([eq.brand,eq.model].filter(Boolean).join(' ')||'Brand/model not provided')}<br><span>Serial: ${escapeHtml(eq.serialNumber||'N/A')} · Installed: ${escapeHtml(eq.installedDate?String(eq.installedDate).slice(0,10):'N/A')} · Condition: ${escapeHtml(eq.condition||'Not rated')} · Next service: ${escapeHtml(eq.nextServiceDate?String(eq.nextServiceDate).slice(0,10):'N/A')}</span></div>`).join('') : '<span class="tenant-detail-value">No equipment recorded</span>'}
      </div>
      <div class="unit-section">
        <h3>Utilities</h3>
        ${utilitiesHtml}
      </div>
    `;

    document.getElementById('unitDetailsBody').innerHTML = html;
    openModal('viewUnitModal');
}

function exportUtilityReport() {
    const unit = state.units.find(u => u._id === state.currentUnitId);
    if (!unit) {
        showNotification('Unit not found', 'error');
        return;
    }

    // Prepare CSV header
    let csv = 'Utility,Account Number,Provider,Status,Bill Under\n';

    // List of utilities
    const utilities = [
        { type: 'Water', key: 'water' },
        { type: 'Gas', key: 'gas' },
        { type: 'Electricity', key: 'electricity' }
    ];

    // Add each utility's account info
    utilities.forEach(util => {
        const acc = unit.utilityAccounts?.[util.key] || {};
        csv += [
            util.type,
            acc.accountNumber || '',
            acc.provider || '',
            acc.status || '',
            acc.under || ''
        ].join(',') + '\n';
    });

    // Download as CSV
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `utility_accounts_unit_${unit.number || unit._id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Update the handleAddUnit function
async function handleAddUnit(event) {
    event.preventDefault();

    const form = event.target;

    // If in edit mode, don't proceed with add
    if (form.dataset.editMode === 'true') {
        return;
    }

    if (!state.currentProperty) {
        showNotification('Please select a property first', 'error');
        return;
    }

    // Collect amenities/features from checklist
    const amenities = Array.from(document.querySelectorAll('#unitAmenitiesChecklist input[type="checkbox"]:checked'))
        .map(cb => cb.value);

    const unitData = {
        number: document.getElementById('unitNumber').value,
        floor: Number(document.getElementById('unitFloor').value),
        sqft: Number(document.getElementById('unitSqft').value),
        rent: Number(document.getElementById('unitRent')?.value) || 0,
        bedrooms: Number(document.getElementById('unitBedrooms').value),
        bathrooms: Number(document.getElementById('unitBathrooms').value),
        status: document.getElementById('unitStatus').value,
        profile: getUnitProfileFormData(),
        equipment: collectUnitEquipment(),
        amenities, // <-- Add amenities array
        utilityAccounts: {
            water: {
                accountNumber: document.getElementById('waterAccountNumber').value,
                provider: document.getElementById('waterProvider').value,
                status: document.getElementById('waterStatus').value,
                under: document.getElementById('waterUnder').value
            },
            gas: {
                accountNumber: document.getElementById('gasAccountNumber').value,
                provider: document.getElementById('gasProvider').value,
                status: document.getElementById('gasStatus').value,
                under: document.getElementById('gasUnder').value
            },
            electricity: {
                accountNumber: document.getElementById('electricityAccountNumber').value,
                provider: document.getElementById('electricityProvider').value,
                status: document.getElementById('electricityStatus').value,
                under: document.getElementById('electricityUnder').value
            }
        }
    };

    // Validate required fields
    if (!unitData.number || !Number.isFinite(unitData.bedrooms) || unitData.bedrooms < 0 || !Number.isFinite(unitData.bathrooms) || unitData.bathrooms < 0) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    showLoader();
    try {
        const response = await fetch(`${API_URL}/properties/${state.currentProperty._id}/units`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(unitData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to add unit');
        }

        await loadUnits(state.currentProperty._id);
        closeModal('addUnitModal');
        showNotification('Unit added successfully', 'success');
        event.target.reset();
    } catch (error) {
        console.error('Error adding unit:', error);
        showNotification(error.message || 'Error adding unit', 'error');
    } finally {
        hideLoader();
    }
}

function resetUnitForm() {
    const form = document.getElementById('addUnitForm');
    if (form) {
        form.reset();
        // Uncheck all amenities checkboxes
        document.querySelectorAll('#unitAmenitiesChecklist input[type="checkbox"]').forEach(cb => cb.checked = false);
        // Clear rent explicitly
        const rentInput = document.getElementById('unitRent');
        if (rentInput) rentInput.value = '';
        // Reset submit button text
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) submitButton.textContent = 'Add Unit';
        // Remove edit mode flags
        form.dataset.editMode = 'false';
        form.dataset.unitId = '';
        const equipmentList = document.getElementById('unitEquipmentList');
        if (equipmentList) equipmentList.innerHTML = '';
    }
}

async function deleteUnit(unitId) {
    if (!confirm('Are you sure you want to delete this unit?')) {
        return;
    }
    showLoader();
    try {
        const response = await fetch(`${API_URL}/properties/${state.currentProperty._id}/units/${unitId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to delete unit');
        }

    invalidateCache('units');
    await refreshContent('units');
        showNotification('Unit deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting unit:', error);
        showNotification('Error deleting unit', 'error');
            } finally {
        hideLoader();
    }
}

function addLeaseHolderField(holder = {}) {
    const list = document.getElementById('leaseHoldersList');
    const holderDiv = document.createElement('div');
    holderDiv.className = 'lease-holder-row';
    holderDiv.innerHTML = `
        <input type="text" class="lease-holder-name" placeholder="Full Name" value="${holder.name || ''}" required>
        <input type="tel" class="lease-holder-phone" placeholder="Phone" value="${holder.phone || ''}">
        <input type="email" class="lease-holder-email" placeholder="Email" value="${holder.email || ''}">
        <button type="button" class="btn-icon lease-holder-remove" title="Remove" onclick="removeLeaseHolderField(this)">
            <i class="fas fa-times"></i>
        </button>
    `;
    list.appendChild(holderDiv);
}

function removeLeaseHolderField(btn) {
    btn.parentElement.remove();
}

function getLeaseHoldersFromForm() {
    return Array.from(document.querySelectorAll('#leaseHoldersList .lease-holder-row')).map(row => ({
        name: row.querySelector('.lease-holder-name').value.trim(),
        phone: row.querySelector('.lease-holder-phone').value.trim(),
        email: row.querySelector('.lease-holder-email').value.trim()
    })).filter(holder => holder.name); // Only keep if name is filled
}

function populateLeaseHolders(holders = []) {
    const list = document.getElementById('leaseHoldersList');
    list.innerHTML = '';
    holders.forEach(holder => addLeaseHolderField(holder));
}
