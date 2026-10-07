// Property management: payments charges.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// Populate tenant select in payment modal
function populatePaymentTenantSelect() {
    const select = document.getElementById('paymentTenant');
    if (!select) return;
    const isActive = (t) => !['terminated','expired','inactive'].includes(String(t.leaseStatus||'').toLowerCase());
    const allTenants = (state.allTenants && state.allTenants.length ? state.allTenants : (state.tenants || []));
    const propertySelect = document.getElementById('paymentProperty');
    const portfolioEntry=document.getElementById('addPaymentForm')?.dataset.portfolioMode==='true';
    const selectedPropertyId = portfolioEntry ? (propertySelect?.value||'') : (propertySelect?.value || state.currentProperty?._id || '');
    let tenants = allTenants.filter(isActive);
    if (selectedPropertyId) {
        tenants = tenants.filter(t => {
            const pid = t.projectId || t.propertyId;
            return pid && String(pid) === String(selectedPropertyId);
        });
    }
    select.innerHTML = `<option value="">Select Tenant</option>` +
        tenants.map(t => `<option value="${t._id}">${t.name}</option>`).join('');
}

// --- Monthly Charges (Overrides) UI Logic ---
function populateEditChargesTenantSelect() {
    const sel = document.getElementById('editChargesTenant');
    if (!sel) return;
    const isActive = (t) => !['terminated','expired','inactive'].includes(String(t.leaseStatus||'').toLowerCase());
    const activeTenants = (state.tenants || []).filter(isActive);
    sel.innerHTML = `<option value="">Select Tenant</option>` +
        activeTenants.map(t => `<option value="${t._id}">${t.name}</option>`).join('');
}

function getMonthInputValueYYYYMM(inputId) {
    const v = document.getElementById(inputId)?.value || '';
    // input type=month returns YYYY-MM
    if (/^\d{4}-\d{2}$/.test(v)) return v;
    return '';
}

async function fetchMonthOverride(tenantId, period) {
    const resp = await fetch(`${API_URL}/tenants/${tenantId}/monthly-overrides/${period}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.override || null;
}

// Keep UI snappy: update local state immediately so badges reflect changes without waiting for network refresh
function upsertLocalTenantMonthlyOverride(tenantId, period, overrideObjOrNull) {
    if (!state.tenants) return;
    const t = state.tenants.find(tt => tt._id === tenantId);
    if (!t) return;
    // Normalize monthlyOverrides to a plain object for easy access
    if (!t.monthlyOverrides) {
        t.monthlyOverrides = {};
    } else if (typeof t.monthlyOverrides.get === 'function') {
        const obj = {};
        t.monthlyOverrides.forEach((v, k) => { obj[k] = v; });
        t.monthlyOverrides = obj;
    }
    if (overrideObjOrNull) {
        t.monthlyOverrides[period] = { ...t.monthlyOverrides[period], ...overrideObjOrNull };
    } else {
        delete t.monthlyOverrides[period];
    }
}

// Mirror override changes into the cross-portfolio tenant list as well
function upsertLocalAllTenantMonthlyOverride(tenantId, period, overrideObjOrNull) {
    if (!Array.isArray(state.allTenants)) return;
    const t = state.allTenants.find(tt => String(tt._id) === String(tenantId));
    if (!t) return;
    if (!t.monthlyOverrides) {
        t.monthlyOverrides = {};
    } else if (typeof t.monthlyOverrides.get === 'function') {
        const obj = {};
        t.monthlyOverrides.forEach((v, k) => { obj[k] = v; });
        t.monthlyOverrides = obj;
    }
    if (overrideObjOrNull) {
        t.monthlyOverrides[period] = { ...t.monthlyOverrides[period], ...overrideObjOrNull };
    } else {
        delete t.monthlyOverrides[period];
    }
}

async function openEditMonthChargesModal() {
    const modal = document.getElementById('editMonthChargesModal');
    if (!modal) return;
    populateEditChargesTenantSelect();
    // default month to current
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const monthInput = document.getElementById('editChargesMonth');
    if (monthInput) monthInput.value = ym;
    // Prefill tenant if only one
    const sel = document.getElementById('editChargesTenant');
    if (sel && sel.options.length === 2) sel.selectedIndex = 1;
    // Clear fields
    document.getElementById('editChargesExpected').value = '';
    document.getElementById('editChargesLateFee').value = '';
    const modeSel = document.getElementById('editChargesLateFeeMode');
    if (modeSel) modeSel.value = 'amount';
    // Try load if both available
    const tenantId = sel?.value;
    if (tenantId) {
        const ov = await fetchMonthOverride(tenantId, ym);
        if (ov) {
            document.getElementById('editChargesExpected').value = ov.expectedRent ?? '';
            document.getElementById('editChargesLateFee').value = ov.lateFee ?? '';
            if (modeSel) modeSel.value = (ov.lateFeeMode === 'percent') ? 'percent' : 'amount';
        }
    }
    openModal('editMonthChargesModal');
}

function populatePaymentUnitSelect() {
    const select = document.getElementById('paymentUnit');
    if (!select) return;
    const allUnits = (state.allUnits && state.allUnits.length ? state.allUnits : (state.units || []));
    const propertySelect = document.getElementById('paymentProperty');
    const portfolioEntry=document.getElementById('addPaymentForm')?.dataset.portfolioMode==='true';
    const selectedPropertyId = portfolioEntry ? (propertySelect?.value||'') : (propertySelect?.value || state.currentProperty?._id || '');
    let units = allUnits;
    if (selectedPropertyId) {
        units = units.filter(u => {
            const pid = u.projectId || u.propertyId || u.project;
            return pid && String(pid) === String(selectedPropertyId);
        });
    }
    select.innerHTML = `<option value="">Select Unit</option>` +
        units.map(u => `<option value="${u._id}">Unit ${u.number}</option>`).join('');
}

function populatePaymentPropertySelect(selectedPropertyId, lockSelection) {
    const sel = document.getElementById('paymentProperty');
    if (!sel) return;
    const props = state.properties || [];
    sel.innerHTML = '<option value="">Select Property</option>' +
        props.map(p => `<option value="${p._id}">${p.name}</option>`).join('');
    if (selectedPropertyId) {
        sel.value = selectedPropertyId;
    } else if (state.currentProperty?._id) {
        sel.value = state.currentProperty._id;
    }
    sel.disabled = !!lockSelection;
}

function openPaymentModalForTenantAndProperty(tenantId, propertyId, lockProperty) {
    const form = document.getElementById('addPaymentForm');
    if (!form) return;
    form.reset();
    form.dataset.editMode = 'false';
    form.dataset.paymentId = '';
    form.dataset.portfolioMode = propertyId === '__portfolio__' ? 'true' : 'false';
    form.querySelector('button[type="submit"]').textContent = 'Save Payment';

    const effectivePropertyId = propertyId === '__portfolio__' ? '' : (propertyId || state.currentProperty?._id || '');
    populatePaymentPropertySelect(effectivePropertyId, !!lockProperty);
    populatePaymentTenantSelect();
    populatePaymentUnitSelect();

    // Default payment date to today (YYYY-MM-DD)
    const dateInput = document.getElementById('paymentDate');
    if (dateInput && !dateInput.value) {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        dateInput.value = `${y}-${m}-${d}`;
    }
    const periodInput=document.getElementById('paymentPeriodMonth');
    if(periodInput&&!periodInput.value)periodInput.value=currentPaymentPeriod();

    if (tenantId) {
        const tenantSel = document.getElementById('paymentTenant');
        if (tenantSel) {
            tenantSel.value = tenantId;
            tenantSel.dispatchEvent(new Event('change'));
        }
    }

    document.getElementById('paymentApplyTo')?.dispatchEvent(new Event('change'));
    document.getElementById('paymentType')?.dispatchEvent(new Event('change'));
    updateCarryForwardVisibility();
    openModal('addPaymentModal');
}

// Normalize and validate payment type against server enum


function editPayment(paymentId) {
    const payment = state.payments.find(p => p._id === paymentId);
    if (!payment) return showNotification('Payment not found', 'error');
    const editLockReason = getPaymentEditLockReason(payment);
    if (editLockReason) return showNotification(editLockReason, 'info');

    // Populate selects before setting values
    const propertyId = payment.projectId || payment.propertyId || state.currentProperty?._id || '';
    populatePaymentPropertySelect(propertyId, true);
    populatePaymentTenantSelect();
    populatePaymentUnitSelect();

    // Populate modal fields
    document.getElementById('paymentTenant').value = payment.tenantId;
    document.getElementById('paymentUnit').value = payment.unitId;
    document.getElementById('paymentType').value = payment.type;
    document.getElementById('paymentCustomType').value = payment.customType || '';
    document.getElementById('paymentAmount').value = payment.amount;
    document.getElementById('paymentMethod').value = payment.method;
    document.getElementById('paymentDate').value = payment.date ? new Date(payment.date).toISOString().split('T')[0] : '';
    document.getElementById('paymentLateFee').value = payment.lateFee || 0;
    document.getElementById('paymentApplyTo').value = payment.applyTo || 'rent';
    document.getElementById('paymentFeeType').value = payment.feeType || '';
    document.getElementById('paymentFeeLabel').value = payment.feeLabel || '';
    if (payment.periodMonth) {
        // assume stored as YYYY-MM or full date
        const pm = payment.periodMonth;
        document.getElementById('paymentPeriodMonth').value = pm;
    } else {
        document.getElementById('paymentPeriodMonth').value = '';
    }
    document.getElementById('paymentNote').value = payment.note || '';
    document.getElementById('paymentCarryForward').checked = Boolean(payment.carryForward);
    // Show carry forward group only if this payment is a credit (negative amount)
    const carryGroup = document.getElementById('carryForwardGroup');
    if (carryGroup) carryGroup.style.display = (payment.amount < 0) ? 'flex' : 'none';

    // Store edit mode and paymentId
    const form = document.getElementById('addPaymentForm');
    form.dataset.editMode = 'true';
    form.dataset.paymentId = paymentId;
    form.querySelector('button[type="submit"]').textContent = 'Update Payment';

    // Sync visibility toggles
    document.getElementById('paymentApplyTo')?.dispatchEvent(new Event('change'));
    document.getElementById('paymentType')?.dispatchEvent(new Event('change'));
    updateCarryForwardVisibility();
    openModal('addPaymentModal');
}

// Carry-forward checkbox deprecated in favor of clickable balance apply-credit menu
function updateCarryForwardVisibility() {
    const group = document.getElementById('carryForwardGroup');
    if (group) group.style.display = 'none';
}

// Handle add payment
async function handleAddPayment(event) {
    event.preventDefault();
    const propertySelect = document.getElementById('paymentProperty');
    const selectedPropertyId = propertySelect?.value || state.currentProperty?._id || '';
    if (!selectedPropertyId) {
        showNotification('Please select a property first', 'error');
        return;
    }
    const amount = Number(document.getElementById('paymentAmount').value);
    const lateFeePercent = Number(document.getElementById('paymentLateFee').value) || 0;
    const lateFee = amount * (lateFeePercent / 100);

        // Validate/normalize type for server enum
    const normalizedType = document.getElementById('paymentType').value; // already enum
    const selectedApplyTo=document.getElementById('paymentApplyTo').value;
    const selectedPaymentPeriod=document.getElementById('paymentPeriodMonth').value;
    if(selectedApplyTo==='rent'&&!selectedPaymentPeriod){showNotification('Select the rent period this payment should pay','error');return;}

    const paymentData = {
        tenantId: document.getElementById('paymentTenant').value,
        unitId: document.getElementById('paymentUnit').value,
        type: normalizedType,
        amount: (amount || amount === 0) ? amount : undefined, // allow blank for deposit auto-calc, permit negatives
        method: document.getElementById('paymentMethod').value,
    // Normalize date to ISO at local noon to avoid off-by-one when stored/parsed as UTC
    date: dateInputToISOAtNoon(document.getElementById('paymentDate').value),
        lateFee,
        applyTo: selectedApplyTo,
        feeType: document.getElementById('paymentFeeType').value.trim() || undefined,
        feeLabel: document.getElementById('paymentFeeLabel').value.trim() || undefined,
        periodMonth: selectedPaymentPeriod || undefined,
        // Preserve empty string explicitly so clearing a note removes it server-side
        note: (() => { const v = document.getElementById('paymentNote').value; return v === '' ? '' : v.trim(); })(),
        customType: document.getElementById('paymentCustomType').value.trim() || undefined,
        carryForward: document.getElementById('paymentCarryForward').checked || undefined
    };

    const form = event.target;
    const isEdit = form.dataset.editMode === 'true';
    const paymentId = form.dataset.paymentId;
    showLoader();
    try {
        let response;
        if (isEdit && paymentId) {
            response = await fetch(`${API_URL}/properties/${selectedPropertyId}/payments/${paymentId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(paymentData)
            });
        } else {
            response = await fetch(`${API_URL}/properties/${selectedPropertyId}/payments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(paymentData)
            });
        }
        if (!response.ok) throw new Error('Failed to save payment');
    invalidateCache('payments');
    // Only refresh the payments tab list if we're currently on Payments
    if (state.currentTab === 'payments') {
        await refreshContent('payments');
    }
    // Also refresh portfolio rent metrics/table if portfolio is in use
    try {
        if (typeof renderPortfolioOverview === 'function') {
            // Invalidate cached portfolio-wide payments so fresh data is used
            if (Array.isArray(state.portfolioPayments)) {
                state.portfolioPayments = [];
            }
            await renderPortfolioOverview();
            if (state.currentPortfolioDetailsType === 'rent') {
                renderPortfolioDetails('rent');
            }
        }
    } catch (e) {
        console.warn('Error refreshing portfolio after payment:', e);
    }
        closeModal('addPaymentModal');
        showNotification(isEdit ? 'Payment updated successfully' : 'Payment recorded successfully', 'success');
        event.target.reset();
        // Reset form mode
        form.dataset.editMode = 'false';
        form.dataset.paymentId = '';
        form.querySelector('button[type="submit"]').textContent = 'Save Payment';
    } catch (error) {
        console.error('Error saving payment:', error);
        showNotification('Error saving payment', 'error');
            } finally {
        hideLoader();
    }
}

// --- Prorated First-Month Rent Utilities ---
function getTenantStartDateObj(tenant) {
    const raw = tenant?.leaseStart || tenant?.startDate || tenant?.moveInDate;
    if (!raw) return null;
    try { const d = new Date(raw); return isNaN(d.getTime()) ? null : d; } catch { return null; }
}

function computeProratedRent(tenant, targetDateStr) {
    const startDate = getTenantStartDateObj(tenant);
    if (!startDate) return null; // no start date => cannot prorate automatically
    const targetDate = targetDateStr ? new Date(targetDateStr) : new Date();
    if (isNaN(targetDate.getTime())) return null;
    // Only prorate if the target month is the SAME as the lease start month & year
    if (startDate.getFullYear() !== targetDate.getFullYear() || startDate.getMonth() !== targetDate.getMonth()) {
        return null; // not first month
    }
    // Use base rent from tenant schema (exclude add-ons like pet rent for first-month proration)
    const monthlyTotal = Number(tenant?.baseRent) || Number(tenant?.rent) || Number(tenant?.monthlyRent) || 0;
    if (monthlyTotal <= 0) return null;
    const totalDays = daysInMonth(targetDate.getFullYear(), targetDate.getMonth());
    const startDay = startDate.getDate();
    // Occupied days = totalDays - (startDay - 1)
    const occupiedDays = Math.max(1, totalDays - (startDay - 1));
    const dailyRate = monthlyTotal / totalDays;
    const prorated = occupiedDays * dailyRate;
    return { amount: Number(prorated.toFixed(2)), occupiedDays, totalDays, startDate, monthlyTotal };
}

// Helper: format YYYY-MM from a date string or Date instance
function getPeriodYYYYMM(dateLike) {
    try {
        const d = (typeof dateLike === 'string') ? new Date(dateLike) : (dateLike instanceof Date ? dateLike : null);
        if (!d || isNaN(d.getTime())) return '';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    } catch { return ''; }
}

function ensureProrateButton() {
    const modal = document.getElementById('addPaymentModal');
    if (!modal) return;
    const applyToSelect = document.getElementById('paymentApplyTo');
    const amountInput = document.getElementById('paymentAmount');
    if (!applyToSelect || !amountInput) return;
    // Place button next to amount input's parent container
    const container = amountInput.parentElement;
    if (!container) return;
    if (container.querySelector('#prorateRentBtn')) return; // already added
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'prorateRentBtn';
    btn.style.marginLeft = '8px';
    btn.style.padding = '6px 10px';
    btn.style.fontSize = '0.7rem';
    btn.style.borderRadius = '6px';
    btn.style.border = '1px solid #d1d5db';
    btn.style.background = '#ffffff';
    btn.style.cursor = 'pointer';
    btn.innerHTML = '<i class="fas fa-calculator" style="margin-right:4px;"></i>Prorate First Month';
    container.appendChild(btn);
    btn.addEventListener('click', () => {
        // Only active when Applies To is rent
        if ((applyToSelect.value || 'rent') !== 'rent') {
            showNotification('Proration only applies to rent payments', 'info');
            return;
        }
        const tenantId = document.getElementById('paymentTenant')?.value;
        if (!tenantId) { showNotification('Select a tenant first', 'error'); return; }
        const tenant = state.tenants.find(t => t._id === tenantId);
        if (!tenant) { showNotification('Tenant not found', 'error'); return; }
        const paymentDateStr = document.getElementById('paymentDate')?.value;
        // If no payment date chosen yet, prompt for month (default today) fallback
        let effectiveDateStr = paymentDateStr;
        if (!effectiveDateStr) {
            effectiveDateStr = new Date().toISOString().split('T')[0];
        }
        let result = computeProratedRent(tenant, effectiveDateStr);
        if (!result) {
            // Show inline proration panel within the modal instead of prompts
            ensureProrationInlinePanel(tenant, effectiveDateStr);
            return;
        }
        // Automatic proration path
        amountInput.value = result.amount;
        // Auto-set the period month to the payment date (or lease start month if no date)
        const pmInput = document.getElementById('paymentPeriodMonth');
        if (pmInput) {
            const pm = getPeriodYYYYMM(effectiveDateStr || result.startDate);
            if (pm) pmInput.value = pm;
        }
        const noteEl = document.getElementById('paymentNote');
        if (noteEl) {
            noteEl.value = `Prorated first-month rent (${result.occupiedDays}/${result.totalDays} days) from ${result.startDate.toLocaleDateString()} (@ ${ (result.monthlyTotal / daysInMonth(result.startDate.getFullYear(), result.startDate.getMonth())).toFixed(2) }/day)`;
        }
        showNotification('Prorated rent calculated', 'success');
    });
}

// Create an inline panel for manual proration inputs and calculation
function ensureProrationInlinePanel(tenant, effectiveDateStr) {
    const amountInput = document.getElementById('paymentAmount');
    const container = amountInput?.parentElement;
    if (!container) return;
    let panel = document.getElementById('prorationInlinePanel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'prorationInlinePanel';
        panel.style.marginTop = '8px';
        panel.style.padding = '10px';
        panel.style.background = '#f8fafc';
        panel.style.border = '1px solid #e5e7eb';
        panel.style.borderRadius = '8px';
        panel.innerHTML = `
            <div style="display:flex; align-items:flex-end; gap:10px; flex-wrap:wrap;">
                <div style="display:flex; flex-direction:column;">
                    <label style="font-size:0.8rem; color:#374151; margin-bottom:4px;">Lease Start (First Month)</label>
                    <input id="prorationStartDate" type="date" style="padding:6px 8px; border:1px solid #d1d5db; border-radius:6px;" />
                </div>
                <div style="display:flex; flex-direction:column;">
                    <label style="font-size:0.8rem; color:#374151; margin-bottom:4px;">Full Monthly Rent</label>
                    <input id="prorationMonthlyRent" type="number" step="0.01" min="0" placeholder="0.00" style="padding:6px 8px; border:1px solid #d1d5db; border-radius:6px; width:140px;" />
                </div>
                <div style="display:flex; gap:8px;">
                    <button type="button" id="prorationComputeBtn" style="padding:6px 10px; border:1px solid #d1d5db; background:#fff; border-radius:6px; cursor:pointer; font-size:0.8rem;">
                        <i class="fas fa-equals" style="margin-right:4px;"></i>Compute
                    </button>
                    <button type="button" id="prorationHideBtn" style="padding:6px 10px; border:1px solid #e5e7eb; background:#f3f4f6; border-radius:6px; cursor:pointer; font-size:0.8rem;">
                        Hide
                    </button>
                </div>
            </div>
            <div id="prorationHint" style="margin-top:6px; font-size:0.78rem; color:#6b7280;"></div>
        `;
        container.appendChild(panel);

        // Wire buttons
        panel.querySelector('#prorationHideBtn').onclick = () => { panel.remove(); };
        panel.querySelector('#prorationComputeBtn').onclick = () => {
            const startStr = document.getElementById('prorationStartDate').value;
            const rentVal = Number(document.getElementById('prorationMonthlyRent').value);
            const hint = document.getElementById('prorationHint');
            if (!startStr) { showNotification('Enter a lease start date', 'error'); return; }
            if (!rentVal || rentVal <= 0) { showNotification('Enter a valid monthly rent', 'error'); return; }
            const sd = new Date(startStr);
            const pd = new Date(effectiveDateStr);
            if (isNaN(sd.getTime()) || isNaN(pd.getTime())) { showNotification('Invalid dates', 'error'); return; }
            if (sd.getMonth() !== pd.getMonth() || sd.getFullYear() !== pd.getFullYear()) {
                showNotification('Start date must be within the payment month', 'error');
                return;
            }
            const totalDays = daysInMonth(pd.getFullYear(), pd.getMonth());
            const occupiedDays = Math.max(1, totalDays - (sd.getDate() - 1));
            const dailyRate = rentVal / totalDays;
            const prorated = Number((occupiedDays * dailyRate).toFixed(2));
            amountInput.value = prorated;
            // Ensure Applies To is rent
            const applyToSelect = document.getElementById('paymentApplyTo');
            if (applyToSelect && applyToSelect.value !== 'rent') {
                applyToSelect.value = 'rent';
                applyToSelect.dispatchEvent(new Event('change'));
            }
            // Auto-set the period month to the payment month
            const pmInput = document.getElementById('paymentPeriodMonth');
            if (pmInput) {
                const pm = getPeriodYYYYMM(pd);
                if (pm) pmInput.value = pm;
            }
            const noteEl = document.getElementById('paymentNote');
            if (noteEl) noteEl.value = `Prorated rent (${occupiedDays}/${totalDays} days) from ${sd.toLocaleDateString()} @ ${dailyRate.toFixed(2)}/day`;
            hint.textContent = `Calculated: $${prorated.toFixed(2)} (${occupiedDays}/${totalDays} days; $${dailyRate.toFixed(2)}/day)`;
            showNotification('Prorated rent calculated', 'success');
        };
    }

    // Prefill values if available
    const startInput = panel.querySelector('#prorationStartDate');
    const rentInput = panel.querySelector('#prorationMonthlyRent');
    const startObj = getTenantStartDateObj(tenant);
    if (startObj) startInput.value = startObj.toISOString().split('T')[0];
    const monthlyTotal = Number(tenant?.baseRent) || Number(tenant?.rent) || Number(tenant?.monthlyRent) || 0;
    if (monthlyTotal > 0) rentInput.value = monthlyTotal.toFixed(2);
}

async function deletePayment(paymentId) {
    if (!confirm('Are you sure you want to delete this payment?')) return;
    showLoader();
    try {
        const response = await fetch(`${API_URL}/properties/${state.currentProperty._id}/payments/${paymentId}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete payment');
        invalidateCache('payments','tenants');
        state.propertyOverviewData=null;
        await Promise.all([refreshContent('payments'),refreshContent('tenants')]);
        showNotification('Payment deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting payment:', error);
        showNotification('Error deleting payment', 'error');
            } finally {
        hideLoader();
    }
}

async function voidPayment(paymentId, quickBooksLinked=false) {
    const externalNote=quickBooksLinked
        ? '\n\nThis only voids the payment in Bluerain. Void or reverse the linked transaction separately in QuickBooks.'
        : '';
    if (!confirm(`Void this payment? It will remain in the ledger for audit and stop counting toward rent collected and tenant balances.${externalNote}`)) return;
    const reason=window.prompt('Why are you voiding this payment?','Returned / insufficient funds (NSF)');
    if(reason===null)return;
    const trimmedReason=reason.trim();
    if(!trimmedReason){showNotification('Enter a reason for voiding the payment.','error');return;}
    showLoader();
    try {
        const response=await fetch(`${API_URL}/properties/${state.currentProperty._id}/payments/${paymentId}/void`,{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({reason:trimmedReason})
        });
        const result=await response.json();
        if(!response.ok)throw new Error(result.message||'Unable to void payment');
        invalidateCache('payments','tenants');
        state.propertyOverviewData=null;
        await Promise.all([refreshContent('payments'),refreshContent('tenants')]);
        showNotification('Payment voided. Tenant balances were recalculated.','success');
    } catch(error) {
        console.error('Error voiding payment:',error);
        showNotification(error.message||'Unable to void payment','error');
    } finally {
        hideLoader();
    }
}
