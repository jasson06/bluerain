// Property management: tenant balances reports.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// -------- Tenant Balance Sheet Helpers & Modal --------
// Currency formatter with sign handling used in balance sheet cards
function tenantCurrency(value) {
    const v = Number(value) || 0;
    const sign = v < 0 ? '-' : '';
    return `${sign}$${Math.abs(v).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
}

function computeTenantRentBalance(tenantId) {
    const tenant = (state.tenants || []).find(t => String(t._id) === String(tenantId));
    if (!tenant) return 0;
    const relevant = getUnifiedCurrentPropertyPayments().filter(p => String(p.tenantId) === String(tenantId) && (p.applyTo === 'rent' || p.applyTo === undefined));
    const asOf = new Date();
    const leaseStart = tenant.leaseStart ? new Date(tenant.leaseStart) : new Date(asOf.getFullYear(), asOf.getMonth(), 1);
    const leaseEnd = tenant.leaseEnd ? new Date(tenant.leaseEnd) : null;
    if (Number.isNaN(leaseStart.getTime()) || leaseStart > asOf) return 0;

    const paidByPeriod = relevant.reduce((map, payment) => {
        const paymentDate = payment?.date ? new Date(payment.date) : null;
        const period = payment.periodMonth || (paymentDate && !Number.isNaN(paymentDate.getTime())
            ? `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`
            : '');
        if (!period) return map;
        map[period] = (map[period] || 0) + Math.max(0, Number(payment.amount) || 0) + Math.max(0, Number(payment.appliedCredit) || 0);
        return map;
    }, {});

    let totalBalance = 0;
    let cursor = new Date(leaseStart.getFullYear(), leaseStart.getMonth(), 1);
    while (cursor <= asOf && (!leaseEnd || cursor <= leaseEnd)) {
        const period = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
        const expected = computeExpectedRentForMonth(tenant, cursor, 'rent') || 0;
        totalBalance += Math.max(0, expected - (paidByPeriod[period] || 0));
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    return Number(totalBalance.toFixed(2));
}

function computeTenantDepositStatus(tenantId) {
    const tenant = state.tenants.find(t => t._id === tenantId);
    // Required deposit: base tenant.deposit plus any pet deposit increase (if present)
    const baseRequired = Number(tenant?.deposit) || 0;
    const petIncrease = Number(tenant?.pets?.depositIncrease) || Number(tenant?.depositIncrease) || 0;
    const required = baseRequired + petIncrease;
    // Paid: prefer server-maintained depositPaid if present, else sum deposit payments
    let paid = Number(tenant?.depositPaid);
    if (!Number.isFinite(paid)) {
        const deposits = getUnifiedCurrentPropertyPayments().filter(p => String(p.tenantId) === String(tenantId) && p.applyTo === 'deposit');
        paid = deposits.reduce((s,p) => s + (Number(p.amount) || 0), 0);
    }
    const remaining = Math.max(0, required - paid);
    return { required, paid, remaining };
}

function computeTenantCreditRemaining(tenantId) {
    const list = getUnifiedCurrentPropertyPayments().filter(p => String(p.tenantId) === String(tenantId));
    let credits = 0, applied = 0;
    for (const p of list) {
        const amt = Number(p.amount) || 0;
        if (amt < 0) credits += Math.abs(amt);
        applied += Math.abs(Number(p.appliedCredit) || 0);
    }
    return Math.max(0, credits - applied);
}

function openTenantBalanceModal(tenantId) {
    try {
        const tenant = state.tenants.find(t => t._id === tenantId);
        if (!tenant) return;
        const modal = document.getElementById('tenantBalanceModal');
        if (!modal) return;
        // Store tenantId on modal for export usage
        modal.dataset.tenantId = tenantId;
        const headerEl = document.getElementById('tenantBalanceHeader');
        // Show unit number instead of property address next to tenant name
        const unit = state.units.find(u => (u._id === (tenant.unitId?._id || tenant.unitId))) || tenant.unitId || null;
        const unitLabel = unit ? `Unit ${unit.number}` : '';
        headerEl.innerHTML = `<strong>${tenant.name || tenant.tenantName || 'Tenant'}</strong>${unitLabel ? ` · <span style="color:#6b7280">${unitLabel}</span>` : ''}`;

        const rentBal = computeTenantRentBalance(tenantId);
        const dep = computeTenantDepositStatus(tenantId);
        const creditRemaining = computeTenantCreditRemaining(tenantId);
        const summary = document.getElementById('tenantBalanceSummary');
        summary.innerHTML = '';
        const cards = [
            { key:'rent', label: 'Rent Balance', value: tenantCurrency(rentBal), accent: rentBal > 0 ? '#991b1b' : (rentBal < 0 ? '#065f46' : '#2563eb') },
            { key:'depositPaid', label: 'Deposit Paid', value: `${tenantCurrency(dep.paid)} / ${tenantCurrency(dep.required)}`, accent: '#2563eb' },
            { key:'depositRemaining', label: 'Deposit Remaining', value: tenantCurrency(dep.remaining), accent: dep.remaining > 0 ? '#92400e' : '#065f46' },
            { key:'creditRemaining', label: 'Credit Remaining', value: tenantCurrency(-creditRemaining), accent: creditRemaining > 0 ? '#065f46' : '#2563eb' }
        ];
        for (const c of cards) {
            const div = document.createElement('div');
            div.className = 'balance-card';
            div.style.border = '1px solid #e5e7eb';
            div.style.borderRadius = '8px';
            div.style.padding = '12px';
            div.style.background = '#f9fafb';
            if (c.key === 'depositPaid') {
                div.id = 'depositPaidCard';
                const paidNum = Number(dep.paid) || 0;
                const reqNum = Number(dep.required) || 0;
                div.innerHTML = `
                    <div style="font-size:0.75rem;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;display:flex;align-items:center;gap:6px;">
                        ${c.label}
                        <button title="Edit deposit paid" aria-label="Edit deposit paid" style="margin-left:6px;width:26px;height:26px;border-radius:6px;border:1px solid #d1d5db;background:#ffffff;color:#374151;display:inline-flex;align-items:center;justify-content:center;" onclick="event.stopPropagation();enterDepositPaidEdit('${tenantId}')"><i class="fas fa-pen"></i></button>
                    </div>
                    <div id="depositPaidDisplay" style="font-weight:600;color:${c.accent};font-size:1.05rem;margin-top:4px;">${tenantCurrency(paidNum)} / ${tenantCurrency(reqNum)}</div>
                    <div id="depositPaidEditor" style="display:none;margin-top:6px;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <input id="depositPaidInput" type="number" step="0.01" min="0" value="${paidNum.toFixed(2)}" style="padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;width:90px;" />
                            <span style="color:#6b7280; font-size:0.75rem;">/ ${tenantCurrency(reqNum)}</span>
                        </div>
                        <div style="margin-top:6px;display:flex;gap:6px;">
                            <button title="Save" aria-label="Save" style="width:28px;height:28px;border-radius:6px;border:1px solid #16a34a;background:#16a34a;color:#ffffff;display:inline-flex;align-items:center;justify-content:center;" onclick="saveDepositPaid('${tenantId}')"><i class="fas fa-check"></i></button>
                            <button title="Cancel" aria-label="Cancel" style="width:28px;height:28px;border-radius:6px;border:1px solid #d1d5db;background:#ffffff;color:#374151;display:inline-flex;align-items:center;justify-content:center;" onclick="cancelDepositPaidEdit('${tenantId}')"><i class="fas fa-times"></i></button>
                        </div>
                    </div>`;
            } else {
                div.innerHTML = `<div style="font-size:0.75rem;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">${c.label}</div><div style="font-weight:600;color:${c.accent};font-size:1.05rem;margin-top:4px;">${c.value}</div>`;
            }
            summary.appendChild(div);
        }

        const tbody = document.getElementById('tenantPaymentsTbody');
        tbody.innerHTML = '';
        const allTenantPayments = getUnifiedCurrentPropertyPayments().filter(p => String(p.tenantId) === String(tenantId)).sort((a,b) => String(b.periodMonth||String(b.date).slice(0,7)).localeCompare(String(a.periodMonth||String(a.date).slice(0,7))) || new Date(b.date) - new Date(a.date));

        // Helper: compute monthly override late fee for a period (YYYY-MM)
        function computeMonthlyOverrideLateFee(tenantObj, periodKey) {
            if (!tenantObj) return 0;
            let overrideMap = tenantObj.monthlyOverrides || null;
            if (overrideMap && typeof overrideMap.get === 'function') {
                const obj = {}; overrideMap.forEach((v,k)=>obj[k]=v); overrideMap = obj;
            }
            const ov = overrideMap ? overrideMap[periodKey] : null;
            if (!ov || (ov.lateFee == null && ov.lateFeeMode == null)) return 0;
            // Determine base-before-late: override expectedRent if present; else base proration + recurring fees for that month
            const [yy, mm] = (periodKey || '').split('-').map(Number);
            const periodDate = (yy && mm) ? new Date(yy, mm-1, 1) : new Date();
            const base = computeExpectedBaseRentForMonth(tenantObj, periodDate) || 0;
            const petFees = (tenantObj.pets?.hasPets ? (Number(tenantObj.pets.monthlyRent) || 0) : 0);
            const addl = (Number(tenantObj.waterFee) || 0) + (Number(tenantObj.trashFee) || 0) + (Number(tenantObj.adminFee) || 0) + (tenantObj.additionalFee?.amount || 0) + petFees;
            const beforeLate = Number.isFinite(Number(ov?.expectedRent)) ? Number(ov.expectedRent) : (base + addl);
            const lfVal = Number(ov.lateFee);
            const mode = (ov.lateFeeMode === 'percent') ? 'percent' : 'amount';
            if (!Number.isFinite(lfVal)) return 0;
            const applied = mode === 'percent' ? (beforeLate * (lfVal/100)) : lfVal;
            return Number(applied) || 0;
        }

        // Helper: compute monthly expected rent (including override late fee if any)
        function computeMonthlyExpectedTotal(tenantObj, periodKey) {
            const [yy, mm] = (periodKey || '').split('-').map(Number);
            const periodDate = (yy && mm) ? new Date(yy, mm-1, 1) : new Date();
            const base = computeExpectedBaseRentForMonth(tenantObj, periodDate) || 0;
            const petFees = (tenantObj.pets?.hasPets ? (Number(tenantObj.pets.monthlyRent) || 0) : 0);
            const addl = (Number(tenantObj.waterFee) || 0) + (Number(tenantObj.trashFee) || 0) + (Number(tenantObj.adminFee) || 0) + (tenantObj.additionalFee?.amount || 0) + petFees;
            // Prefer override expectedRent if present
            let beforeLate = base + addl;
            let overrideMap = tenantObj.monthlyOverrides || null;
            if (overrideMap && typeof overrideMap.get === 'function') {
                const obj = {}; overrideMap.forEach((v,k)=>obj[k]=v); overrideMap = obj;
            }
            const ov = overrideMap ? overrideMap[periodKey] : null;
            if (ov && Number.isFinite(Number(ov.expectedRent))) beforeLate = Number(ov.expectedRent);
            const late = computeMonthlyOverrideLateFee(tenantObj, periodKey);
            return beforeLate + late;
        }

    // Build monthly aggregation map:
    // { YYYY-MM: { rentBase, rentCollected, depositCash, depositCredit, feesCash, feesCredit, otherCash, otherCredit, rentCredit, credits, late, expected } }
    const monthlyMap = {};
        for (const p of allTenantPayments) {
            if (!p.date) continue;
            const d = new Date(p.date);
            const key = p.periodMonth || `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            if (!monthlyMap[key]) monthlyMap[key] = { rentBase:0, rentCollected:0, depositCash:0, depositCredit:0, feesCash:0, feesCredit:0, otherCash:0, otherCredit:0, rentCredit:0, credits:0, late:0 };
            const amt = Number(p.amount) || 0;
            const apply = p.applyTo || 'rent';
            const appliedCred = Number(p.appliedCredit) || 0;
            // Negative payments are issued credits
            if (amt < 0) {
                monthlyMap[key].credits += Math.abs(amt);
                continue;
            }
            // Pure credit allocation entries (amount === 0, appliedCredit > 0)
            if (amt === 0 && appliedCred > 0) {
                if (apply === 'rent') monthlyMap[key].rentCredit += appliedCred;
                else if (apply === 'deposit') monthlyMap[key].depositCredit += appliedCred;
                else if (apply === 'fee' || ['water','electric','trash','admin','late','other'].includes(apply)) monthlyMap[key].feesCredit += appliedCred;
                else monthlyMap[key].otherCredit += appliedCred;
                continue;
            }
            // Cash portion always counts toward collected totals
            if (apply === 'rent') monthlyMap[key].rentCollected += amt;
            else if (apply === 'deposit') monthlyMap[key].depositCash += amt;
            else if (apply === 'fee' || ['water','electric','trash','admin','late','other'].includes(apply)) monthlyMap[key].feesCash += amt;
            else monthlyMap[key].otherCash += amt;
            // If part of the payment consumed credit (appliedCredit > 0) track that separately too
            if (appliedCred > 0) {
                if (apply === 'rent') monthlyMap[key].rentCredit += appliedCred;
                else if (apply === 'deposit') monthlyMap[key].depositCredit += appliedCred;
                else if (apply === 'fee' || ['water','electric','trash','admin','late','other'].includes(apply)) monthlyMap[key].feesCredit += appliedCred;
                else monthlyMap[key].otherCredit += appliedCred;
            }
        }

        // Inject computed monthly override late fee values, expected totals, and base rent
        Object.keys(monthlyMap).forEach(k => {
            monthlyMap[k].late = computeMonthlyOverrideLateFee(tenant, k);
            monthlyMap[k].expected = computeMonthlyExpectedTotal(tenant, k);
            // Base rent (prorated when first month), excluding add-on fees and late
            const [yy, mm] = k.split('-').map(Number);
            const periodDate = (yy && mm) ? new Date(yy, mm-1, 1) : new Date();
            monthlyMap[k].rentBase = Number(computeExpectedBaseRentForMonth(tenant, periodDate)) || 0;
        });

    // Insert / update monthly summary section with toggle (Rent Due vs Paid removed per request)
        let monthlyContainer = document.getElementById('tenantMonthlyBreakdown');
        if (!monthlyContainer) {
            monthlyContainer = document.createElement('div');
            monthlyContainer.id = 'tenantMonthlyBreakdown';
            monthlyContainer.style.margin = '14px 0 10px';
            monthlyContainer.style.padding = '10px 12px';
            monthlyContainer.style.background = '#f1f5f9';
            monthlyContainer.style.border = '1px solid #e2e8f0';
            monthlyContainer.style.borderRadius = '8px';
            const summaryParent = document.getElementById('tenantBalanceSummary');
            summaryParent.parentNode.insertBefore(monthlyContainer, summaryParent.nextSibling);
        }
    // Removed expectedMonthlyRent / variance calculations
        const monthKeys = Object.keys(monthlyMap).sort().reverse();
        if (!monthKeys.length) {
            monthlyContainer.innerHTML = '<div style="color:#6b7280;font-size:0.9rem;">No payments recorded yet.</div>';
        } else {
            // Header with inline toggle button
            const bodyId = 'monthlyBreakdownBody';
            const collapsedAttr = monthlyContainer.getAttribute('data-collapsed') === 'true';
            const toggleIcon = collapsedAttr ? 'fa-chevron-down' : 'fa-chevron-up';
            const bodyDisplay = collapsedAttr ? 'none' : 'block';
            let html = `<div style="font-weight:600;margin-bottom:6px;color:#1f2937;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <span style="display:flex;align-items:center;gap:8px;"><i class=\"fas fa-calendar\"></i> Monthly Payment Breakdown</span>
                <button id="monthlyToggleBtn" style="background:#ffffff;border:1px solid #d1d5db;color:#374151;padding:4px 8px;font-size:0.7rem;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:4px;">
                    <i class="fas ${toggleIcon}"></i> ${collapsedAttr ? 'Show' : 'Hide'}
                </button>
            </div>`;
            html += `<div id="${bodyId}" style="display:${bodyDisplay};">`;
        html += monthKeys.map(mKey => {
        const m = monthlyMap[mKey];
        const depositDisplay = m.depositCash + m.depositCredit;
        const feesDisplay = m.feesCash + m.feesCredit;
        const otherDisplay = m.otherCash + m.otherCredit;
        const totalCollected = m.rentCollected + m.depositCash + m.feesCash + m.otherCash; // exclude applied credits
                const lateDisp = m.late && m.late > 0 ? `$${m.late.toFixed(2)}` : '$0.00';
                const expectedDisp = `$${(Number(m.expected)||0).toFixed(2)}`;
                // Variance removed per request; only display Collected amount
                return `<div class="tenant-monthly-row" style="display:grid;grid-template-columns:90px repeat(7,1fr);gap:4px;font-size:0.75rem;align-items:center;padding:6px 8px;border-radius:6px;background:#fff;margin-bottom:4px;border:1px solid #e5e7eb;">
                        <div style="font-weight:600;color:#374151;">${mKey}</div>
                        <div><span style="color:#6b7280;">Expected:</span> ${expectedDisp}</div>
                        <div><span style="color:#6b7280;">Rent:</span> $${m.rentBase.toFixed(2)}</div>
            <div><span style="color:#6b7280;">Deposit:</span> $${depositDisplay.toFixed(2)}${m.depositCredit>0?` <span style='color:#065f46'>(incl credit $${m.depositCredit.toFixed(2)})</span>`:''}</div>
            <div><span style="color:#6b7280;">Fees:</span> $${feesDisplay.toFixed(2)}${m.feesCredit>0?` <span style='color:#065f46'>(incl credit $${m.feesCredit.toFixed(2)})</span>`:''}</div>
            <div><span style="color:#6b7280;">Other:</span> $${otherDisplay.toFixed(2)}${m.otherCredit>0?` <span style='color:#065f46'>(incl credit $${m.otherCredit.toFixed(2)})</span>`:''}</div>
                        <div><span style="color:#6b7280;">Late Fee:</span> ${lateDisp}</div>
                        <div><span style="color:#065f46;">Credits:</span> $${m.credits.toFixed(2)}</div>
                <div style="grid-column:1 / -1; font-size:0.65rem; color:#475569; display:flex; justify-content:space-between; gap:10px;">
               <span>${m.late > 0 ? 'Override late fee applied this month' : ''}</span>
                                    <span>Collected: $${totalCollected.toFixed(2)}</span>
                        </div>
                    </div>`;
            }).join('');
            html += '</div>'; // close body
            monthlyContainer.innerHTML = html;
            // Attach toggle handler (re-attach safely each open)
            const toggleBtn = document.getElementById('monthlyToggleBtn');
            if (toggleBtn) {
                toggleBtn.onclick = () => {
                    const body = document.getElementById(bodyId);
                    if (!body) return;
                    const isHidden = body.style.display === 'none';
                    body.style.display = isHidden ? 'block' : 'none';
                    monthlyContainer.setAttribute('data-collapsed', isHidden ? 'false' : 'true');
                    toggleBtn.innerHTML = `<i class=\"fas ${isHidden ? 'fa-chevron-up' : 'fa-chevron-down'}\"></i> ${isHidden ? 'Hide' : 'Show'}`;
                };
            }
        }

        // Populate detailed payment rows grouped by month (descending)
        let lastMonthKey = null;
        // Determine column count once (fallback 7)
        const paymentsTable = document.getElementById('tenantPaymentsTable');
        let colCount = 7;
        if (paymentsTable) {
            const headerRow = paymentsTable.querySelector('thead tr');
            if (headerRow) colCount = headerRow.children.length || colCount;
        }
        for (const p of allTenantPayments) {
            const monthKey = p.periodMonth || (p.date ? (()=>{ const base = String(p.date).substring(0,10); const parts = base.split('-'); if(parts.length===3){return `${parts[0]}-${parts[1]}`;} const d=new Date(p.date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })() : 'Unknown');
            if (monthKey !== lastMonthKey) {
                const groupTr = document.createElement('tr');
                groupTr.className = 'month-group-row';
                const lateHere = monthlyMap[monthKey]?.late || 0;
                const lateBadge = lateHere > 0 ? `<span style="margin-left:10px;color:#9a3412;background:#fffbeb;border:1px solid #fde68a;border-radius:999px;padding:2px 8px;font-size:0.7rem;">Late Fee: $${lateHere.toFixed(2)}</span>` : '';
                groupTr.innerHTML = `<td colspan="${colCount}" style="background:#f1f5f9;color:#374151;font-weight:600;padding:6px 10px;border-top:1px solid #e2e8f0;">${monthKey}${lateBadge}</td>`;
                tbody.appendChild(groupTr);
                lastMonthKey = monthKey;
            }
            const tr = document.createElement('tr');
                        const typeLabel = p.type === 'custom' && p.customType ? p.customType : (p.type || '');
                        const amount = Number(p.amount) || 0;
                        const appliedCred = Number(p.appliedCredit) || 0;
            const bal = typeof p.balance === 'number' ? Number(p.balance) : undefined;
            const note = (p.note || '').toString().replace(/</g,'&lt;').replace(/>/g,'&gt;');
                        tr.innerHTML = `
              <td>${p.date ? formatDateDisplay(p.date) : ''}</td>
              <td>${typeLabel}</td>
              <td>${p.applyTo || ''}${p.feeType ? ` • ${p.feeType}` : ''}${p.feeLabel ? ` (${p.feeLabel})` : ''}</td>
                                                        <td style="${(amount < 0 || (amount === 0 && appliedCred > 0)) ? 'color:#065f46;font-weight:600;' : ''} max-width:160px; white-space:normal; word-break:break-word;">`
                            + `${(amount === 0 && appliedCred > 0)
                                        ? 'Applied credit ' + tenantCurrency(appliedCred)
                                        : ((amount < 0 ? '-' : '') + tenantCurrency(Math.abs(amount)))}`
                            + `</td>
              <td>${bal === undefined ? '' : (bal < 0 ? '-' : '') + tenantCurrency(Math.abs(bal))}${bal < 0 ? ' CR' : ''}</td>
              <td style="max-width:240px;white-space:normal;">${note}</td>`;
            tbody.appendChild(tr);
        }
        if (state.currentTab === 'payments') showTenantLedgerInline();
        else openModal('tenantBalanceModal');
    } catch (e) {
        console.error('Failed to open tenant balance modal', e);
    }
}

// Inline edit controls for Deposit Paid on Tenant Balance Sheet
function enterDepositPaidEdit(tenantId) {
    const card = document.getElementById('depositPaidCard');
    if (!card) return;
    const disp = card.querySelector('#depositPaidDisplay');
    const editor = card.querySelector('#depositPaidEditor');
    const input = card.querySelector('#depositPaidInput');
    if (disp && editor) {
        disp.style.display = 'none';
        editor.style.display = 'block';
        if (input) {
            input.focus();
            input.select();
            const keyHandler = (e) => {
                if (e.key === 'Enter') { saveDepositPaid(tenantId); }
                else if (e.key === 'Escape') { cancelDepositPaidEdit(tenantId); }
            };
            input.addEventListener('keydown', keyHandler, { once: true });
        }
    }
}

async function saveDepositPaid(tenantId) {
    try {
        const card = document.getElementById('depositPaidCard');
        if (!card) return;
        const input = card.querySelector('#depositPaidInput');
        const val = Number(input?.value);
        if (!Number.isFinite(val) || val < 0) { showNotification('Please enter a non-negative number', 'error'); return; }
        showLoader();
        const resp = await fetch(`${API_URL}/properties/${state.currentProperty._id}/tenants/${tenantId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ depositPaid: val })
        });
        if (!resp.ok) throw new Error('Failed to update deposit paid');
        invalidateCache('tenants');
        await refreshContent('tenants');
        showNotification('Deposit paid updated', 'success');
        openTenantBalanceModal(tenantId);
    } catch (e) {
        console.error('Error updating deposit paid:', e);
        showNotification('Error updating deposit paid', 'error');
    } finally {
        hideLoader();
    }
}

function cancelDepositPaidEdit(tenantId) {
    openTenantBalanceModal(tenantId);
}

// Export per-month detailed report for the tenant in the balance modal
function exportTenantPaymentsReportFromModal() {
    const modal = document.getElementById('tenantBalanceModal');
    if (!modal) return;
    const tenantId = modal.dataset.tenantId;
    if (!tenantId) { showNotification('No tenant loaded for report.', 'error'); return; }
    exportTenantPaymentsReport(tenantId);
}

// Generate a PDF summarizing all payments grouped by month with subtotals
function exportTenantPaymentsReport(tenantId) {
    const tenant = state.tenants.find(t => t._id === tenantId);
    if (!tenant) { showNotification('Tenant not found', 'error'); return; }
    const payments = getUnifiedCurrentPropertyPayments().filter(p => String(p.tenantId) === String(tenantId)).sort((a,b)=> new Date(a.date) - new Date(b.date));
    if (!payments.length) { showNotification('No payments to export.', 'info'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p','mm','a4');
    const pageW = 210;
    let y = 16;
    // Header
    doc.setFont('helvetica','bold');
    doc.setFontSize(16);
    doc.text(`Payment History Report`, 14, y);
    y += 6;
    doc.setFontSize(11);
    doc.setFont('helvetica','normal');
    doc.text(`Tenant: ${tenant.name}  •  Generated: ${new Date().toLocaleDateString()}`, 14, y);
    y += 8;
    doc.setDrawColor(200,200,200);
    doc.line(14,y,pageW-14,y); y += 6;

    // Group payments by month
    const groups = {};
    for (const p of payments) {
        if (!p.date) continue;
        const d = new Date(p.date);
        const key = p.periodMonth || `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
    }
    const monthKeys = Object.keys(groups).sort();

    const colDefs = [
        { h:'Date', w:26 },
        { h:'Type', w:22 },
        { h:'Applied', w:30 },
        { h:'Amount', w:22 },
        { h:'Balance', w:24 },
        { h:'Note', w:70 }
    ];
    const lineHeight = 5;

    function addPageIfNeeded(extra=0) {
        if (y + extra > 280) { doc.addPage(); y = 16; }
    }
    function drawHeaderRow(bg=true) {
        addPageIfNeeded(10);
        if (bg) { doc.setFillColor(240,244,248); doc.rect(14,y,pageW-28, lineHeight+2,'F'); }
        doc.setFont('helvetica','bold'); doc.setFontSize(9);
        let x = 16; const baseY = y+lineHeight; 
        for (const c of colDefs) { doc.text(c.h, x, baseY); x += c.w; }
        y += lineHeight + 3;
    }

    // Helper to compute monthly override late fee for a given month key
    function computeMonthlyOverrideLateFeeForReport(tenantObj, periodKey) {
        if (!tenantObj || !periodKey) return 0;
        let overrideMap = tenantObj.monthlyOverrides || null;
        if (overrideMap && typeof overrideMap.get === 'function') {
            const obj = {}; overrideMap.forEach((v,k)=>obj[k]=v); overrideMap = obj;
        }
        const ov = overrideMap ? overrideMap[periodKey] : null;
        if (!ov || (ov.lateFee == null && ov.lateFeeMode == null)) return 0;
        const [yy, mm] = periodKey.split('-').map(Number);
        const periodDate = (yy && mm) ? new Date(yy, mm-1, 1) : new Date();
        const base = computeExpectedBaseRentForMonth(tenantObj, periodDate) || 0;
        const petFees = (tenantObj.pets?.hasPets ? (Number(tenantObj.pets.monthlyRent) || 0) : 0);
        const addl = (Number(tenantObj.waterFee) || 0) + (Number(tenantObj.trashFee) || 0) + (Number(tenantObj.adminFee) || 0) + (tenantObj.additionalFee?.amount || 0) + petFees;
        const beforeLate = Number.isFinite(Number(ov?.expectedRent)) ? Number(ov.expectedRent) : (base + addl);
        const lfVal = Number(ov.lateFee);
        const mode = (ov.lateFeeMode === 'percent') ? 'percent' : 'amount';
        if (!Number.isFinite(lfVal)) return 0;
        const applied = mode === 'percent' ? (beforeLate * (lfVal/100)) : lfVal;
        return Number(applied) || 0;
    }

    // Compute monthly expected helper for report
    function computeMonthlyExpectedForReport(tenantObj, periodKey) {
        if (!tenantObj || !periodKey) return 0;
        let overrideMap = tenantObj.monthlyOverrides || null;
        if (overrideMap && typeof overrideMap.get === 'function') {
            const obj = {}; overrideMap.forEach((v,k)=>obj[k]=v); overrideMap = obj;
        }
        const [yy, mm] = periodKey.split('-').map(Number);
        const periodDate = (yy && mm) ? new Date(yy, mm-1, 1) : new Date();
        const base = computeExpectedBaseRentForMonth(tenantObj, periodDate) || 0;
        const petFees = (tenantObj.pets?.hasPets ? (Number(tenantObj.pets.monthlyRent) || 0) : 0);
        const addl = (Number(tenantObj.waterFee) || 0) + (Number(tenantObj.trashFee) || 0) + (Number(tenantObj.adminFee) || 0) + (tenantObj.additionalFee?.amount || 0) + petFees;
        const ov = overrideMap ? overrideMap[periodKey] : null;
        let beforeLate = Number.isFinite(Number(ov?.expectedRent)) ? Number(ov.expectedRent) : (base + addl);
        // Late fee override
        const lfVal = Number(ov?.lateFee);
        const mode = (ov?.lateFeeMode === 'percent') ? 'percent' : 'amount';
        if (Number.isFinite(lfVal)) beforeLate += (mode === 'percent') ? (beforeLate * (lfVal/100)) : lfVal;
        return beforeLate;
    }

    for (const mKey of monthKeys) {
        addPageIfNeeded(12);
        doc.setFont('helvetica','bold'); doc.setFontSize(11);
        doc.text(mKey, 14, y);
        y += 6;
        drawHeaderRow();
        let monthTotals = { rent:0, deposit:0, fees:0, other:0, credits:0, late:0 };
        for (const p of groups[mKey]) {
            const amt = Number(p.amount) || 0;
            const late = Number(p.lateFee) || 0; // will be overridden by monthly override if present
            const apply = p.applyTo || 'rent';
            const appliedCred = Number(p.appliedCredit) || 0; // ensure defined for PDF row rendering
            if (amt < 0) monthTotals.credits += Math.abs(amt); else if (apply === 'rent') monthTotals.rent += amt; else if (apply==='deposit') monthTotals.deposit += amt; else if (apply==='fee' || ['water','electric','trash','admin','late','other'].includes(apply)) monthTotals.fees += amt; else monthTotals.other += amt;
            const dateStr = p.date ? new Date(p.date).toLocaleDateString() : '';
            const typeLabel = p.type === 'custom' && p.customType ? p.customType : (p.type || '');
            const appliedLabel = apply + (p.feeType ? `/${p.feeType}` : '') + (p.feeLabel ? `(${p.feeLabel})` : '');
            const bal = typeof p.balance === 'number' ? p.balance : null;
            // Wrap note
            const noteRaw = (p.note || '').replace(/\r\n|\r|\n/g,' ');
            const noteLines = doc.splitTextToSize(noteRaw, colDefs[5].w - 2);
            // Amount text and wrapping for narrow column
            const amountText = (amt === 0 && appliedCred > 0)
                ? `Applied credit $${appliedCred.toFixed(2)}`
                : (amt<0?'-':'') + `$${Math.abs(amt).toFixed(2)}`;
            const amountLines = doc.splitTextToSize(amountText, colDefs[3].w - 2);
            const amountHeight = amountLines.length * 4;
            const rowHeight = Math.max(lineHeight, noteLines.length * 4, amountHeight);
            addPageIfNeeded(rowHeight + 2);
            doc.setFont('helvetica','normal'); doc.setFontSize(8);
            let x = 16; const textY = y + lineHeight; // base text line
            doc.text(dateStr, x, textY); x += colDefs[0].w;
            doc.text(typeLabel, x, textY); x += colDefs[1].w;
            doc.text(appliedLabel, x, textY); x += colDefs[2].w;
            // Amount (wrapped)
            if (amountLines.length > 0) {
                doc.text(amountLines[0], x, textY);
                for (let i = 1; i < amountLines.length; i++) {
                    // Place subsequent lines below the base line to avoid overlap
                    doc.text(amountLines[i], x, textY + (i * 4));
                }
            } else {
                doc.text('', x, textY);
            }
            x += colDefs[3].w;
            // Late column removed from PDF row output
            doc.text(bal===null?'':(bal<0?'-':'') + `$${Math.abs(bal).toFixed(2)}` + (bal<0?' CR':''), x, textY); x += colDefs[4].w;
            // Multi-line note
            for (let i=0;i<noteLines.length;i++) {
                doc.text(noteLines[i], x, y + 4 + (i*4));
            }
            y += rowHeight + 2;
        }
        // Replace per-payment late total with monthly override late when present
        const overrideLate = computeMonthlyOverrideLateFeeForReport(tenant, mKey);
        if (overrideLate > 0) monthTotals.late = overrideLate;
        // Month subtotal block (Variance removed to match modal)
        addPageIfNeeded(20);
        doc.setFont('helvetica','bold'); doc.setFontSize(9);
        const expectedThisMonth = computeMonthlyExpectedForReport(tenant, mKey);
        const subtotalLines = [
            `Expected: $${expectedThisMonth.toFixed(2)}`,
            `Rent (base): $${(function(){
                // Base/prorated rent for this month, excluding add-ons and late
                const [yy, mm] = mKey.split('-').map(Number);
                const periodDate = (yy && mm) ? new Date(yy, mm-1, 1) : new Date();
                const baseOnly = Number(computeExpectedBaseRentForMonth(tenant, periodDate)) || 0;
                return baseOnly.toFixed(2);
            })()}`,
            `Deposit: $${monthTotals.deposit.toFixed(2)}`,
            `Fees: $${monthTotals.fees.toFixed(2)}`,
            `Other: $${monthTotals.other.toFixed(2)}`,
            `Credits: $${monthTotals.credits.toFixed(2)}`,
            `Late Fees: $${monthTotals.late.toFixed(2)}`,
            // Collected = sum of positive payment amounts (cash) excluding credits and credit applications
            `Collected: $${(monthTotals.rent+monthTotals.deposit+monthTotals.fees+monthTotals.other).toFixed(2)}`
        ];
        if (overrideLate > 0) subtotalLines.push('Note: Monthly override late fee applied this month');
        const boxH = subtotalLines.length * 5 + 6;
        doc.setDrawColor(220,230,236); doc.setFillColor(245,249,252);
        doc.rect(14,y,pageW-28,boxH,'FD');
        let lineY = y + 6;
        subtotalLines.forEach(l=>{
            doc.text(l, 18, lineY);
            lineY += 5;
        });
        y += boxH + 8;
    }

    // Save file
    const filename = `tenant_payments_report_${tenant.name.replace(/\s+/g,'_')}.pdf`;
    doc.save(filename);
    showNotification('Monthly report exported', 'success');
}

function calculateOccupancyRate(units) {
    if (!units?.length) return '0%';
    const occupiedUnits = units.filter(u => u.status === 'occupied').length;
    return `${Math.round((occupiedUnits / units.length) * 100)}%`;
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}
