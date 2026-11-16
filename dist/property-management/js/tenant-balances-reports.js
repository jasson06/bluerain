// Property management: tenant balances reports.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// -------- Tenant Balance Sheet Helpers & Modal --------
// Currency formatter with sign handling used in balance sheet cards
function tenantCurrency(value) {
    const v = Number(value) || 0;
    const sign = v < 0 ? '-' : '';
    return `${sign}$${Math.abs(v).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
}

function tenantBalanceMonthLabel(period) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(period || ''));
    if (!match) return String(period || 'Unknown');
    const monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return `${match[1]}-${monthNames[Number(match[2])-1] || match[2]}`;
}

function tenantLeaseLedgerMonths(tenant, payments) {
    const start = tenant.leaseStart ? new Date(tenant.leaseStart) : null;
    const end = tenantLeaseChargeEnd(tenant);
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
        throw new Error('Set valid lease start and end dates before viewing the monthly lease ledger.');
    }
    const months = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const postedPayments = payments.filter(payment => payment.date && new Date(payment.date) <= new Date());
    while (cursor <= end) {
        const period = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
        const totals = computeTenantMonthTotals(tenant, cursor, postedPayments);
        const rent = computeExpectedRentForMonth(tenant, cursor, 'rent');
        const overrides = tenant.monthlyOverrides;
        const override = overrides && (typeof overrides.get === 'function' ? overrides.get(period) : overrides[period]);
        months.push({period, rent, late: totals.expected - rent, ...totals, overridden: override?.expectedRent != null});
        cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
}

function tenantBalancePaymentStatus(month, asOf = new Date()) {
    const outstanding = month.outstanding + (month.depositOutstanding || 0);
    if (outstanding <= 0.005) return {key:'paid',label:'Paid',icon:'fa-check-circle'};
    const [year,monthNumber] = month.period.split('-').map(Number);
    const dueDate = new Date(year,monthNumber-1,1);
    const currentMonth = new Date(asOf.getFullYear(),asOf.getMonth(),1);
    if (dueDate < currentMonth) return {key:'overdue',label:'Overdue',icon:'fa-exclamation-circle'};
    if (dueDate > currentMonth) return {key:'coming-soon',label:'Coming soon',icon:'fa-calendar-alt'};
    return asOf.getDate() === 1
        ? {key:'due-now',label:'Due now',icon:'fa-clock'}
        : {key:'overdue',label:'Overdue',icon:'fa-exclamation-circle'};
}

function tenantLateFeeSuggestion(month, asOf = new Date()) {
    const [year, monthNumber] = month.period.split('-').map(Number);
    if (asOf < new Date(year, monthNumber - 1, 4) || month.outstanding <= 0.005 || month.late > 0 || month.rent <= 0) return null;
    const amount = Math.round(month.rent * 12) / 100;
    return amount > 0 ? amount : null;
}

function useTenantLateFeeSuggestion(event) {
    const button = event.currentTarget;
    const amount = Number(button.dataset.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
        showNotification('Unable to suggest a late fee. Reload the tenant ledger.', 'error');
        return;
    }
    const input = button.form.elements.lateFee;
    input.value = amount.toFixed(2);
    input.focus();
    showNotification('Suggested late fee filled in. Select Save to apply it.', 'info');
}

function renderTenantLateFeeForm(month, target) {
    const suggestedLateFee = tenantLateFeeSuggestion(month);
    const suggestion = suggestedLateFee === null ? '' : `<button type="button" class="overview-row-action tenant-late-fee-suggestion" data-amount="${suggestedLateFee.toFixed(2)}" onclick="useTenantLateFeeSuggestion(event)" title="After the 3rd: 12% of expected rent / fees, excluding late fees. Select Save to apply.">Suggest 12% (${tenantCurrency(suggestedLateFee)})</button>`;
    return `<form class="tenant-ledger-charge-form tenant-ledger-late-fee-form" onsubmit="saveTenantLeaseLedgerExpected(event,'${escapeHtml(month.period)}','${target}','lateFee')"><input type="number" name="lateFee" min="0" step="0.01" required value="${month.late.toFixed(2)}" aria-label="Late fee amount for ${escapeHtml(month.period)}"><button type="submit" class="overview-row-action">Save</button>${suggestion}</form>`;
}

function tenantBalanceLeaseSchedule(tenant, payments) {
    const months = tenantLeaseLedgerMonths(tenant, payments);
    const depositExpected = Math.max(0,Number(tenant.deposit)||0)
        + Math.max(0,Number(tenant.pets?.depositIncrease)||Number(tenant.depositIncrease)||0);
    const depositPayments = payments.filter(payment => payment.postingStatus !== 'voided'
        && String(payment.tenantId?._id || payment.tenantId) === String(tenant._id)
        && payment.applyTo === 'deposit');
    const savedDepositPaid = Number(tenant.depositPaid);
    const depositPaid = Number.isFinite(savedDepositPaid)
        ? savedDepositPaid
        : depositPayments.reduce((sum,payment) => sum + paymentAppliedValue(payment),0);
    if (months.length) {
        months[0].depositExpected = depositExpected;
        months[0].depositPaid = depositPaid;
        months[0].depositOutstanding = Math.max(0,depositExpected-depositPaid);
    }
    const totals = months.reduce((sum, month) => ({
        rent:sum.rent+month.rent,late:sum.late+month.late,
        expected:sum.expected+month.expected,
        paid:sum.paid+month.paid,
        outstanding:sum.outstanding+month.outstanding,
        depositExpected:sum.depositExpected+(month.depositExpected||0),
        depositPaid:sum.depositPaid+(month.depositPaid||0),
        depositOutstanding:sum.depositOutstanding+(month.depositOutstanding||0)
    }),{rent:0,late:0,expected:0,paid:0,outstanding:0,depositExpected:0,depositPaid:0,depositOutstanding:0});
    const rows = months.map(month => {
        const depositCell = month.depositExpected || month.depositPaid || month.depositOutstanding
            ? `${tenantCurrency(month.depositExpected)} due<div class="task-meta">Paid: ${tenantCurrency(month.depositPaid)} · Remaining: ${tenantCurrency(month.depositOutstanding)}</div>`
            : '—';
        const status = tenantBalancePaymentStatus(month);
        const statusCell = `<span class="tenant-payment-status ${status.key}" title="${status.label}"><i class="fas ${status.icon}" aria-hidden="true"></i><span>${status.label}</span></span>`;
        return `<tr><td>${escapeHtml(month.period)}${month.overridden?'<div class="task-meta">Override</div>':''}</td><td>${statusCell}</td><td><form class="tenant-ledger-charge-form" onsubmit="saveTenantLeaseLedgerExpected(event,'${escapeHtml(month.period)}','balanceSheet')"><input type="number" name="expectedRent" min="0" step="0.01" required value="${month.rent.toFixed(2)}" aria-label="Expected rent for ${escapeHtml(month.period)}"><button type="submit" class="overview-row-action">Save</button></form></td><td>${depositCell}</td><td>${renderTenantLateFeeForm(month,'balanceSheet')}</td><td>${tenantCurrency(month.expected)}</td><td>${tenantCurrency(month.paid)}</td><td>${tenantCurrency(month.outstanding)}</td></tr>`;
    }).join('');
    const html = `<h3>Monthly rent schedule</h3><p class="task-meta">Every lease month is shown, including upcoming months. The security deposit is tracked separately and is due in the first lease month. Edit and save expected rent or the late-fee dollar amount for an individual month. Saving a late fee replaces that month's percentage or payment-level late fees. Future charges are scheduled, not overdue.</p><div class="overview-table-wrap" style="max-height:380px;overflow:auto"><table class="overview-table"><thead><tr><th>Rent month</th><th>Status</th><th>Expected rent / fees</th><th>Security deposit (due / paid / remaining)</th><th>Late fees</th><th>Total expected rent</th><th>Rent applied</th><th>Rent outstanding</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th>Rent totals</th><th></th><th>${tenantCurrency(totals.rent)}</th><th>${tenantCurrency(totals.depositExpected)} due<div class="task-meta">Paid: ${tenantCurrency(totals.depositPaid)} · Remaining: ${tenantCurrency(totals.depositOutstanding)}</div></th><th>${tenantCurrency(totals.late)}</th><th>${tenantCurrency(totals.expected)}</th><th>${tenantCurrency(totals.paid)}</th><th>${tenantCurrency(totals.outstanding)}</th></tr></tfoot></table></div>`;
    return {months,html};
}

let tenantLeaseLedgerSequence = 0;

async function openTenantLeaseLedger(tenantId) {
    const tenant = getWorkspaceTenantRecord(tenantId);
    const propertyId = tenant && portfolioPropertyId(tenant);
    if (!tenant || !propertyId) {
        showNotification('Tenant or property not found', 'error');
        return;
    }
    const sequence = ++tenantLeaseLedgerSequence;
    const drawer = document.getElementById('portfolioRecordDrawer');
    const previousContext = document.getElementById('tenantDetailsModal')?.leaseLedger;
    const origin = previousContext?.tenantId === String(tenantId) ? previousContext.origin
        : drawer?.classList.contains('open') ? 'portfolio' : 'details';
    closePortfolioRecordDrawer();
    let modal = document.getElementById('tenantDetailsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'tenantDetailsModal';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }
    modal.leaseLedger = {tenantId:String(tenantId),propertyId,origin,tenant,payments:[]};
    renderTenantLeaseLedger(true);
    openModal('tenantDetailsModal');
    try {
        const [tenantResponse,paymentResponse] = await Promise.all([
            fetch(`${API_URL}/properties/${propertyId}/tenants`),
            fetch(`${API_URL}/properties/${propertyId}/payments`)
        ]);
        if (!tenantResponse.ok || !paymentResponse.ok) throw new Error('Unable to load tenant ledger. Please try again.');
        const [tenants,payments] = await Promise.all([tenantResponse.json(),paymentResponse.json()]);
        if (!Array.isArray(tenants) || !Array.isArray(payments)) throw new Error('The tenant ledger response is invalid.');
        const currentTenant = tenants.find(item => String(item._id) === String(tenantId));
        if (!currentTenant) throw new Error('Tenant no longer exists in this property.');
        if (sequence !== tenantLeaseLedgerSequence || modal.leaseLedger?.tenantId !== String(tenantId)) return;
        modal.leaseLedger.tenant = currentTenant;
        modal.leaseLedger.payments = payments.filter(payment => String(payment.tenantId?._id || payment.tenantId) === String(tenantId));
        for (const list of [state.tenants,state.allTenants]) {
            const index = (list||[]).findIndex(item=>String(item._id)===String(tenantId));
            if (index >= 0) list[index] = currentTenant;
        }
        renderTenantLeaseLedger();
    } catch (error) {
        if (sequence !== tenantLeaseLedgerSequence) return;
        console.error('Tenant lease ledger error:',error);
        renderTenantLeaseLedger(false,error.message);
        showNotification(error.message,'error');
    }
}

function closeTenantLeaseLedger() {
    ++tenantLeaseLedgerSequence;
    const modal = document.getElementById('tenantDetailsModal');
    if (modal) delete modal.leaseLedger;
    closeModal('tenantDetailsModal');
}

function backToTenantDetailsFromLedger() {
    const modal = document.getElementById('tenantDetailsModal');
    const context = modal?.leaseLedger;
    if (!context) return;
    ++tenantLeaseLedgerSequence;
    delete modal.leaseLedger;
    if (context.origin === 'portfolio') {
        closeModal('tenantDetailsModal');
        openPortfolioRecordDrawer('tenant',context.tenantId);
    } else viewTenantDetails(context.tenantId);
}

function renderTenantLeaseLedger(loading = false, error = '') {
    const modal = document.getElementById('tenantDetailsModal');
    const context = modal?.leaseLedger;
    if (!context) return;
    const {tenant,tenantId,payments} = context;
    let content;
    if (loading) content = '<p role="status">Loading tenant ledger...</p>';
    else if (error) content = `<div class="overview-alert">${escapeHtml(error)} <button type="button" class="btn-secondary" onclick="openTenantLeaseLedger('${tenantId}')">Retry</button></div>`;
    else {
        try {
            const months = tenantLeaseLedgerMonths(tenant,payments);
            const totals = months.reduce((sum,month) => ({
                expected:sum.expected+month.expected,paid:sum.paid+month.paid,outstanding:sum.outstanding+month.outstanding
            }),{expected:0,paid:0,outstanding:0});
            content = `<p class="task-meta">Lease: ${formatDateDisplay(tenant.leaseStart)} to ${formatDateDisplay(tenantLeaseChargeEnd(tenant))}. Future months are scheduled charges, not overdue debt. Expected rent excludes late fees; saving it overrides only that month's rent and recurring fees. Late fees are editable dollar amounts; saving replaces that month's percentage or payment-level late fees. Suggestions fill the amount only; select Save to apply.</p>
                <div class="overview-metrics"><div class="overview-mini-stat"><span>Lease expected</span><strong>${tenantCurrency(totals.expected)}</strong></div><div class="overview-mini-stat"><span>Applied payments / credits</span><strong>${tenantCurrency(totals.paid)}</strong></div><div class="overview-mini-stat"><span>Unpaid lease charges (includes future)</span><strong>${tenantCurrency(totals.outstanding)}</strong></div></div>
                <div class="overview-table-wrap"><table class="overview-table"><thead><tr><th>Rent month</th><th>Expected rent / fees</th><th>Late fees</th><th>Total expected</th><th>Applied</th><th>Outstanding</th></tr></thead><tbody>${months.map(month=>`<tr><td>${escapeHtml(month.period)}${month.overridden?'<div class="task-meta">Override</div>':''}</td><td><form class="tenant-ledger-charge-form" onsubmit="saveTenantLeaseLedgerExpected(event,'${month.period}')"><input type="number" name="expectedRent" min="0" step="0.01" required value="${month.rent.toFixed(2)}" aria-label="Expected rent for ${month.period}"><button type="submit" class="overview-row-action">Save</button></form></td><td>${renderTenantLateFeeForm(month,'ledger')}</td><td>${tenantCurrency(month.expected)}</td><td>${tenantCurrency(month.paid)}</td><td>${tenantCurrency(month.outstanding)}</td></tr>`).join('')}</tbody></table></div>
                <h3>Payment history</h3>${payments.length?`<div class="overview-table-wrap"><table class="overview-table"><thead><tr><th>Received</th><th>Applied month</th><th>Apply to</th><th>Amount</th><th>Applied credit</th></tr></thead><tbody>${[...payments].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(payment=>`<tr><td>${formatDateDisplay(payment.date)}</td><td>${escapeHtml(payment.periodMonth||tenantPaymentPeriod(payment))}</td><td>${escapeHtml(payment.applyTo||'rent')}</td><td>${tenantCurrency(payment.amount)}</td><td>${tenantCurrency(payment.appliedCredit)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="task-meta">No payments recorded.</p>'}`;
        } catch (ledgerError) {
            console.error('Tenant ledger calculation error:',ledgerError);
            content = `<div class="overview-alert">${escapeHtml(ledgerError.message)}</div>`;
        }
    }
    modal.innerHTML = `<div class="modal-content tenant-details-modal tenant-drawer"><div class="portfolio-record-drawer-header"><h3>${escapeHtml(tenant.name||'Tenant')} ledger</h3><button type="button" aria-label="Close tenant ledger" onclick="closeTenantLeaseLedger()"><i class="fas fa-times"></i></button></div><div class="portfolio-record-drawer-body"><button type="button" class="btn-secondary" onclick="backToTenantDetailsFromLedger()"><i class="fas fa-arrow-left"></i> Back to tenant details</button><section class="tenant-lease-ledger">${content}</section></div></div>`;
}

async function saveTenantLeaseLedgerExpected(event, period, target = 'ledger', field = 'expectedRent') {
    event.preventDefault();
    const form = event.target;
    const isLateFee = field === 'lateFee';
    const label = isLateFee ? 'Late fee' : 'Expected rent';
    const input = form.elements[field];
    const amount = Number(input.value);
    const modal = document.getElementById(target === 'balanceSheet' ? 'tenantBalanceModal' : 'tenantDetailsModal');
    const context = target === 'balanceSheet' ? modal?.balanceSheet : modal?.leaseLedger;
    if (!context || input.value === '' || !Number.isFinite(amount) || amount < 0) {
        showNotification(`Enter a non-negative ${label.toLowerCase()} amount`,'error');
        return;
    }
    const sequence = tenantLeaseLedgerSequence;
    const button = form.querySelector('button');
    button.disabled = true;
    try {
        const response = await fetch(`${API_URL}/tenants/${context.tenantId}/monthly-overrides/${period}`,{
            method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(isLateFee ? {lateFee:amount,lateFeeMode:'amount'} : {expectedRent:amount})
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message||`Unable to save ${label.toLowerCase()}`);
        if (!data.override || typeof data.override[field] !== 'number' || !Number.isFinite(data.override[field]) || data.override[field] < 0 || (isLateFee && data.override.lateFeeMode !== 'amount')) throw new Error(`The saved ${label.toLowerCase()} response is invalid. Reload the ledger.`);
        upsertLocalTenantMonthlyOverride(context.tenantId,period,data.override);
        upsertLocalAllTenantMonthlyOverride(context.tenantId,period,data.override);
        context.tenant.monthlyOverrides = {...context.tenant.monthlyOverrides,[period]:data.override};
        if (data.termination) {
            context.tenant.termination = data.termination;
            for (const list of [state.tenants,state.allTenants]) {
                const tenant = (list||[]).find(item=>String(item._id)===context.tenantId);
                if (tenant) tenant.termination = data.termination;
            }
        }
        state.propertyOverviewData = null;
        invalidateCache('tenants','payments');
        if (sequence === tenantLeaseLedgerSequence && (target === 'balanceSheet' ? modal.balanceSheet === context : modal.leaseLedger === context)) {
            if (target === 'balanceSheet' && state.currentTab === 'payments') {
                const schedule = tenantBalanceLeaseSchedule(context.tenant,context.payments);
                const container = document.getElementById('tenantMonthlyBreakdown');
                if (container) container.innerHTML = schedule.html;
                const balance = document.getElementById('tenantRentBalanceValue');
                const rentBalance = computeTenantRentBalance(context.tenantId);
                if (balance) balance.textContent = rentBalance === null ? 'Needs end-date review' : tenantCurrency(rentBalance);
            } else if (target === 'balanceSheet') openTenantBalanceModal(context.tenantId);
            else renderTenantLeaseLedger();
        }
        showNotification(`${label} for ${period} saved`,'success');
    } catch (error) {
        console.error(`Tenant ${label.toLowerCase()} save error:`,error);
        showNotification(error.message,'error');
    } finally {
        button.disabled = false;
    }
}

function computeTenantRentBalance(tenantId) {
    const tenant = (state.tenants || []).find(t => String(t._id) === String(tenantId));
    if (!tenant) return 0;
    const relevant = getUnifiedCurrentPropertyPayments().filter(p => String(p.tenantId) === String(tenantId) && (p.applyTo === 'rent' || p.applyTo === undefined));
    const asOf = new Date();
    const leaseStart = tenant.leaseStart ? new Date(tenant.leaseStart) : new Date(asOf.getFullYear(), asOf.getMonth(), 1);
    const leaseEnd = tenantLeaseChargeEnd(tenant);
    if (['terminated', 'expired'].includes(tenant.leaseStatus) && (!leaseEnd || !tenant.leaseStart)) return null;
    if (Number.isNaN(leaseStart.getTime()) || leaseStart > asOf) return 0;

    let totalBalance = 0;
    let cursor = new Date(leaseStart.getFullYear(), leaseStart.getMonth(), 1);
    while (cursor <= asOf && (!leaseEnd || cursor <= leaseEnd)) {
        totalBalance += computeTenantMonthTotals(tenant, cursor, relevant.filter(payment => !payment.date || new Date(payment.date) <= asOf)).outstanding;
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
        const deposits = getUnifiedCurrentPropertyPayments().filter(p => p.postingStatus!=='voided' && String(p.tenantId) === String(tenantId) && p.applyTo === 'deposit');
        paid = deposits.reduce((s,p) => s + paymentAppliedValue(p), 0);
    }
    const remaining = Math.max(0, required - paid);
    return { required, paid, remaining };
}

function computeTenantCreditRemaining(tenantId) {
    const list = getUnifiedCurrentPropertyPayments().filter(p => p.postingStatus!=='voided' && String(p.tenantId) === String(tenantId));
    return list.reduce((total, payment) => total + availablePaymentCredit(payment), 0);
}

function openTenantBalanceModal(tenantId) {
    try {
        const tenant = state.tenants.find(t => t._id === tenantId);
        if (!tenant) return;
        const modal = document.getElementById('tenantBalanceModal');
        if (!modal) return;
        const drawer = document.getElementById('portfolioRecordDrawer');
        const detailsModal = document.getElementById('tenantDetailsModal');
        const previousOrigin = modal.dataset.tenantId === String(tenantId) ? modal.dataset.returnTo : null;
        const origin = drawer?.classList.contains('open') ? 'portfolio'
            : detailsModal?.getAttribute('aria-hidden') === 'false' && !detailsModal.leaseLedger ? 'details'
            : previousOrigin || (state.currentTab === 'payments' ? 'payments' : 'close');
        // Store tenantId on modal for export usage
        modal.dataset.tenantId = tenantId;
        modal.dataset.returnTo = origin;
        const backButton = document.getElementById('tenantBalanceBackButton');
        if (backButton) backButton.hidden = !['details','portfolio'].includes(origin);
        const paymentsBackButton = document.getElementById('tenantBalancePaymentsBackButton');
        if (paymentsBackButton) paymentsBackButton.hidden = origin !== 'payments';
        if (origin === 'portfolio') closePortfolioRecordDrawer();
        const headerEl = document.getElementById('tenantBalanceHeader');
        // Show unit number instead of property address next to tenant name
        const unit = state.units.find(u => (u._id === (tenant.unitId?._id || tenant.unitId))) || tenant.unitId || null;
        const unitLabel = unit ? `Unit ${unit.number}` : '';
        headerEl.textContent = ` - ${tenant.name || tenant.tenantName || 'Tenant'}${unitLabel ? ` · ${unitLabel}` : ''}`;

        const rentBal = computeTenantRentBalance(tenantId);
        const dep = computeTenantDepositStatus(tenantId);
        const creditRemaining = computeTenantCreditRemaining(tenantId);
        const summary = document.getElementById('tenantBalanceSummary');
        summary.innerHTML = '';
        const cards = [
            { key:'rent', label: 'Rent Balance', value: rentBal === null ? 'Needs end-date review' : tenantCurrency(rentBal), accent: rentBal > 0 ? '#991b1b' : (rentBal < 0 ? '#065f46' : '#2563eb') },
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
                div.innerHTML = `<div style="font-size:0.75rem;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">${c.label}</div><div ${c.key === 'rent' ? 'id="tenantRentBalanceValue"' : ''} style="font-weight:600;color:${c.accent};font-size:1.05rem;margin-top:4px;">${c.value}</div>`;
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
            if (!isTenantChargeableMonth(tenantObj, periodDate)) return 0;
            const beforeLate = computeExpectedRentForMonth(tenantObj, periodDate, 'rent');
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
            return computeTenantMonthTotals(tenantObj, periodDate, allTenantPayments).expected;
        }

    // Build monthly aggregation map:
    // { YYYY-MM: { rentBase, rentCollected, depositCash, depositCredit, feesCash, feesCredit, otherCash, otherCredit, rentCredit, credits, late, expected } }
    const monthlyMap = {};
        for (const p of allTenantPayments) {
        if (p.postingStatus==='voided') continue;
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
            summaryParent.parentNode.insertBefore(monthlyContainer,summaryParent.nextSibling);
        }
        modal.balanceSheet = {tenantId:String(tenantId),tenant,payments:allTenantPayments};
        try {
            monthlyContainer.innerHTML = tenantBalanceLeaseSchedule(tenant,allTenantPayments).html;
        } catch (error) {
            console.error('Failed to build tenant balance monthly rent schedule', error);
            monthlyContainer.innerHTML = '<div class="overview-alert" role="alert">The monthly rent schedule is unavailable. Review the tenant lease dates.</div>';
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
            const monthKey = p.date || p.periodMonth ? tenantPaymentPeriod(p) : 'Unknown';
            const appliedMonth = tenantBalanceMonthLabel(monthKey);
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
                          <td>${appliedMonth}</td>
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

function backToTenantDetailsFromBalanceSheet() {
    const modal = document.getElementById('tenantBalanceModal');
    const tenantId = modal?.dataset.tenantId;
    const origin = modal?.dataset.returnTo;
    if (!tenantId) {
        closeModal('tenantBalanceModal');
        return;
    }
    if (origin === 'portfolio') {
        closeModal('tenantBalanceModal');
        openPortfolioRecordDrawer('tenant', tenantId);
    } else if (origin === 'details') {
        viewTenantDetails(tenantId);
    } else closeModal('tenantBalanceModal');
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

// Export the monthly balance schedule followed by detailed payment history.
function exportTenantPaymentsReport(tenantId) {
    const tenant = state.tenants.find(t => String(t._id) === String(tenantId));
    if (!tenant) { showNotification('Tenant not found', 'error'); return; }
    const payments = getUnifiedCurrentPropertyPayments().filter(p => String(p.tenantId?._id || p.tenantId) === String(tenantId)).sort((a,b)=> new Date(a.date) - new Date(b.date));
    let schedule;
    try {
        schedule = tenantBalanceLeaseSchedule(tenant,payments);
    } catch (error) {
        console.error('Tenant balance report schedule error:',error);
        showNotification(error.message,'error');
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p','mm','a4');
    const pageW = 210;
    let y = 16;
    // Header
    doc.setFont('helvetica','bold');
    doc.setFontSize(16);
    doc.text(`Tenant Balance Sheet Report`, 14, y);
    y += 6;
    doc.setFontSize(11);
    doc.setFont('helvetica','normal');
    const reportUnit = (state.units||[]).find(unit => String(unit._id) === String(tenant.unitId?._id || tenant.unitId))
        || (typeof tenant.unitId === 'object' ? tenant.unitId : null);
    const unitLabel = reportUnit ? ` · Unit ${reportUnit.number}` : '';
    doc.text(`Tenant: ${tenant.name || tenant.tenantName || 'Tenant'}${unitLabel}  •  Generated: ${new Date().toLocaleDateString()}`, 14, y);
    y += 8;
    doc.setDrawColor(200,200,200);
    doc.line(14,y,pageW-14,y); y += 6;

    // Group payments by month
    const groups = {};
    for (const p of payments) {
        if (!p.date) continue;
        const key = tenantPaymentPeriod(p);
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
    }
    const monthKeys = Object.keys(groups).sort();
    const colDefs = [
        { h:'Date', w:22 },
        { h:'Applied month', w:24 },
        { h:'Details', w:42 },
        { h:'Amount', w:26 },
        { h:'Note', w:68 }
    ];
    const lineHeight = 5;

    function addPageIfNeeded(extra=0) {
        if (y + extra > 280) { doc.addPage(); y = 16; }
    }
    function drawHeaderRow(bg=true) {
        if (bg) { doc.setFillColor(240,244,248); doc.rect(14,y,pageW-28, lineHeight+2,'F'); }
        doc.setFont('helvetica','bold'); doc.setFontSize(9);
        let x = 15; const baseY = y+lineHeight;
        for (const c of colDefs) { doc.text(c.h, x, baseY); x += c.w; }
        y += lineHeight + 3;
    }

    doc.setFont('helvetica','bold'); doc.setFontSize(12);
    doc.text('Monthly rent schedule',14,y);
    y += 6;
    doc.setFont('helvetica','normal'); doc.setFontSize(8);
    const scheduleNote=doc.splitTextToSize('All lease months are included. Security deposit due, paid, and remaining are tracked separately from rent. Future charges are scheduled, not overdue.',pageW-28);
    doc.text(scheduleNote,14,y);
    y += scheduleNote.length*4+3;
    const scheduleColumns=[
        {h:'Month',w:19},{h:'Status',w:18},{h:'Rent expected',w:22},
        {h:'Deposit due / paid / remaining',w:35},{h:'Late fees',w:15},
        {h:'Total expected rent',w:24},{h:'Rent applied',w:24},{h:'Rent outstanding',w:25}
    ];
    function drawScheduleHeader() {
        const headerLines=scheduleColumns.map(column=>doc.splitTextToSize(column.h,column.w-2));
        const headerHeight=Math.max(...headerLines.map(lines=>lines.length))*3.5+3;
        if (y+headerHeight>280) { doc.addPage(); y=16; }
        doc.setFillColor(240,244,248); doc.rect(14,y,pageW-28,headerHeight,'F');
        doc.setFont('helvetica','bold'); doc.setFontSize(7);
        let x=14;
        scheduleColumns.forEach((column,index)=>{
            doc.text(headerLines[index],x+1,y+4);
            x+=column.w;
        });
        y+=headerHeight;
    }
    function drawScheduleRow(values,bold=false) {
        const cellLines=values.map((value,index)=>doc.splitTextToSize(String(value),scheduleColumns[index].w-2));
        const rowHeight=Math.max(6,Math.max(...cellLines.map(lines=>lines.length))*3.5+2);
        if (y+rowHeight>280) { doc.addPage(); y=16; drawScheduleHeader(); }
        doc.setFont('helvetica',bold?'bold':'normal'); doc.setFontSize(7);
        let x=14;
        cellLines.forEach((lines,index)=>{
            doc.text(lines,x+1,y+4);
            x+=scheduleColumns[index].w;
        });
        y+=rowHeight;
        doc.setDrawColor(225,230,235); doc.line(14,y,pageW-14,y);
    }
    drawScheduleHeader();
    for (const month of schedule.months) {
        const depositCell=month.depositExpected || month.depositPaid || month.depositOutstanding
            ? `Due ${tenantCurrency(month.depositExpected)}\nPaid ${tenantCurrency(month.depositPaid)}\nRemaining ${tenantCurrency(month.depositOutstanding)}`
            : '—';
        drawScheduleRow([
            tenantBalanceMonthLabel(month.period),tenantBalancePaymentStatus(month).label,tenantCurrency(month.rent),
            depositCell,tenantCurrency(month.late),tenantCurrency(month.expected),
            tenantCurrency(month.paid),tenantCurrency(month.outstanding)
        ]);
    }
    const scheduleTotals=schedule.months.reduce((sum,month)=>({
        rent:sum.rent+month.rent,deposit:sum.deposit+(month.depositExpected||0),
        depositPaid:sum.depositPaid+(month.depositPaid||0),
        depositOutstanding:sum.depositOutstanding+(month.depositOutstanding||0),
        late:sum.late+month.late,expected:sum.expected+month.expected,
        paid:sum.paid+month.paid,outstanding:sum.outstanding+month.outstanding
    }),{rent:0,deposit:0,depositPaid:0,depositOutstanding:0,late:0,expected:0,paid:0,outstanding:0});
    drawScheduleRow([
        'Rent totals','',tenantCurrency(scheduleTotals.rent),
        `Due ${tenantCurrency(scheduleTotals.deposit)}\nPaid ${tenantCurrency(scheduleTotals.depositPaid)}\nRemaining ${tenantCurrency(scheduleTotals.depositOutstanding)}`,
        tenantCurrency(scheduleTotals.late),tenantCurrency(scheduleTotals.expected),
        tenantCurrency(scheduleTotals.paid),tenantCurrency(scheduleTotals.outstanding)
    ],true);
    y+=6;
    addPageIfNeeded(12);
    doc.setFont('helvetica','bold'); doc.setFontSize(12);
    doc.text('Payment history',14,y);
    y+=6;
    if (!monthKeys.length) {
        doc.setFont('helvetica','normal'); doc.setFontSize(9);
        doc.text('No payment history recorded.',14,y);
        y+=6;
    }

    for (const mKey of monthKeys) {
        addPageIfNeeded(18);
        doc.setFont('helvetica','bold'); doc.setFontSize(11);
        doc.text(tenantBalanceMonthLabel(mKey), 14, y);
        y += 6;
        drawHeaderRow();
        for (const p of groups[mKey]) {
            const amt = Number(p.amount) || 0;
            const apply = p.applyTo || 'rent';
            const appliedCred = Number(p.appliedCredit) || 0; // ensure defined for PDF row rendering
            const dateStr = p.date ? new Date(p.date).toLocaleDateString() : '';
            const appliedMonth = tenantBalanceMonthLabel(tenantPaymentPeriod(p));
            const typeLabel = p.type === 'custom' && p.customType ? p.customType : (p.type || '');
            const details = [typeLabel || apply];
            if (typeLabel && String(typeLabel).toLowerCase() !== String(apply).toLowerCase()) details.push(`Applied to ${apply}`);
            if (p.feeType) details.push(p.feeType);
            if (p.feeLabel) details.push(p.feeLabel);
            const noteRaw = String(p.note || '').replace(/\r\n|\r|\n/g,' ');
            const amountText = (amt === 0 && appliedCred > 0)
                ? `Applied credit $${appliedCred.toFixed(2)}`
                : (amt<0?'-':'') + `$${Math.abs(amt).toFixed(2)}`;
            const rowValues = [dateStr,appliedMonth,details.join(' · '),amountText,noteRaw];
            const rowLines = rowValues.map((value,index)=>doc.splitTextToSize(String(value),colDefs[index].w-2));
            const rowHeight = Math.max(lineHeight,rowLines.reduce((height,lines)=>Math.max(height,lines.length*4),0))+2;
            if (y+rowHeight>280) {
                doc.addPage(); y=16;
                doc.setFont('helvetica','bold'); doc.setFontSize(11);
                doc.text(tenantBalanceMonthLabel(mKey),14,y); y+=6;
                drawHeaderRow();
            }
            doc.setFont('helvetica','normal'); doc.setFontSize(8);
            let x=14;
            rowLines.forEach((lines,index)=>{
                doc.text(lines,x+1,y+lineHeight);
                x+=colDefs[index].w;
            });
            y += rowHeight;
            doc.setDrawColor(225,230,235); doc.line(14,y,pageW-14,y);
        }
        y+=4;
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
    const container = document.getElementById('notification');
    const variants = {
        success: { label: 'Success', icon: 'fa-check-circle' },
        error: { label: 'Error', icon: 'fa-exclamation-circle' },
        warning: { label: 'Warning', icon: 'fa-exclamation-triangle' },
        info: { label: 'Notice', icon: 'fa-info-circle' }
    };
    const variant = Object.hasOwn(variants, type) ? type : 'info';
    const notification = document.createElement('div');
    notification.className = `notification ${variant} show`;

    const icon = document.createElement('i');
    icon.className = `fas ${variants[variant].icon} notification-icon`;
    icon.setAttribute('aria-hidden', 'true');
    const content = document.createElement('div');
    content.className = 'notification-content';
    const heading = document.createElement('strong');
    heading.textContent = variants[variant].label;
    const text = document.createElement('span');
    text.textContent = String(message);
    content.append(heading, text);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'notification-close';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.textContent = '\u00d7';
    notification.append(icon, content, close);
    container.appendChild(notification);

    let remaining = Math.max(8000, text.textContent.length * 50);
    let startedAt;
    let timer;
    let leaving = false;
    let hovered = false;
    let focused = false;
    const dismiss = () => {
        if (leaving) return;
        leaving = true;
        clearTimeout(timer);
        notification.classList.add('is-leaving');
        setTimeout(() => notification.remove(), 350);
    };
    const resume = () => {
        if (leaving || hovered || focused) return;
        startedAt = Date.now();
        timer = setTimeout(dismiss, remaining);
    };
    const pause = () => {
        clearTimeout(timer);
        if (startedAt !== undefined) {
            remaining = Math.max(0, remaining - (Date.now() - startedAt));
            startedAt = undefined;
        }
    };
    notification.addEventListener('mouseenter', () => { hovered = true; pause(); });
    notification.addEventListener('mouseleave', () => { hovered = false; resume(); });
    notification.addEventListener('focusin', () => { focused = true; pause(); });
    notification.addEventListener('focusout', event => {
        if (notification.contains(event.relatedTarget)) return;
        focused = false;
        resume();
    });
    close.addEventListener('click', dismiss);
    resume();
}
