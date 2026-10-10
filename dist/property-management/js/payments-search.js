// Property management: payments search.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// Load payments when Payments tab is selected
async function loadPayments(propertyId, force = false) {

    try {
        const workspace = await loadPaymentWorkspace(propertyId,true);
        if (Array.isArray(workspace?.localPayments)) {
            state.payments = workspace.localPayments;
        } else {
            const response = await fetch(`${API_URL}/properties/${propertyId}/payments`);
            if (!response.ok) throw new Error('Failed to fetch payments');
            state.payments = await response.json();
        }
        renderPayments();
        renderPaymentWorkspace();
        // After loading fresh payments for the selected property, recompute tenant rent status badges
        renderTenants();
        updateTabCounts(); 
        touchCache('payments', propertyId);
        if (state.currentTab === 'propertyOverview') { state.propertyOverviewData=null; renderPropertyOverview(true); }
    } catch (error) {
        console.error('Error loading payments:', error);
        showNotification('Error loading payments', 'error');
    }
}

async function loadQuickBooksPayments(propertyId) {
    state.quickBooksPaymentsError = '';
    if (!propertyId) {
        state.quickBooksPaymentsConnected = false;
        state.quickBooksPayments = [];
        return;
    }
    try {
        const response = await fetch(`${API_URL}/properties/${propertyId}/quickbooks/payments`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Failed to fetch QuickBooks payments');
        state.quickBooksPaymentsConnected = !!data.connected;
        state.quickBooksPayments = Array.isArray(data.payments) ? data.payments : [];
    } catch (error) {
        console.error('Error loading QuickBooks payments:', error);
        state.quickBooksPaymentsConnected = false;
        state.quickBooksPayments = [];
        state.quickBooksPaymentsError = error.message || 'Unable to load QuickBooks payments';
    }
}

function getQuickBooksPaymentMatch(payment, quickBooksPaymentsSource = null) {
    if (!payment) return null;
    const quickBooksPayments = Array.isArray(quickBooksPaymentsSource) ? quickBooksPaymentsSource : (state.quickBooksPayments || []);
    const localPaymentId = String(payment._id || '');
    const entityId = String(payment.quickBooks?.entityId || '');
    const docNumber = String(payment.quickBooks?.docNumber || '');
    return quickBooksPayments.find(record =>
        (localPaymentId && String(record.localPaymentId || '') === localPaymentId)
        || (entityId && String(record.id || '') === entityId)
        || (!record.invoiceId && docNumber && String(record.docNumber || '') === docNumber)
    ) || null;
}

function getLocalPaymentForQuickBooksRecord(record, paymentsSource = null) {
    if (!record) return null;
    const payments = Array.isArray(paymentsSource) ? paymentsSource : (state.payments || []);
    const localPaymentId = String(record.localPaymentId || '');
    const receiptId = String(record.id || '');
    const docNumber = String(record.docNumber || '');
    return payments.find(payment =>
        (localPaymentId && String(payment._id) === localPaymentId)
        || (receiptId && String(payment.quickBooks?.entityId || '') === receiptId)
        || (!record.invoiceId && docNumber && String(payment.quickBooks?.docNumber || '') === docNumber)
    ) || null;
}

function getQuickBooksSourceLabel(sourceType) {
    return sourceType === 'Payment' ? 'Payment' : 'Sales Receipt';
}

function normalizeQuickBooksPaymentText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function getQuickBooksPaymentNote(record, note = record?.privateNote) {
    return [note, ...(Array.isArray(record?.lineDescriptions) ? record.lineDescriptions : [])]
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(' · ');
}

function formatPaymentPeriodLabel(period) {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(period || ''));
    if (!match) return String(period || '');
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
        .toLocaleDateString('en-US', {month: 'short', year: '2-digit', timeZone: 'UTC'})
        .replace(' ', '-').toUpperCase();
}

function getPaymentDisplayNote(payment, payments) {
    return String(payment.note || '').replace(/\(Applied from credit ([a-zA-Z0-9-]+)\)/g, (original, sourceId) => {
        const source = payments.find(item => String(item._id) === sourceId
            && paymentReferenceId(item.tenantId) === paymentReferenceId(payment.tenantId));
        if (!source) return original;
        let period = source.periodMonth;
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period || '')) {
            const date = new Date(source.date);
            if (Number.isNaN(date.getTime())) return original;
            period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }
        return `(Credit applied from ${formatPaymentPeriodLabel(period)})`;
    });
}

function renderPaymentNote(row) {
    const payment = row?.localPayment;
    const record = row?.qbPayment;
    const fromQuickBooks = !!record || payment?.source === 'quickbooks' || !!payment?.quickBooks?.entityId;
    if (!fromQuickBooks) return row?.noteText ? escapeHtml(row.noteText) : '';

    const icon = '<i class="fa-brands fa-quickbooks" role="img" aria-label="From QuickBooks" title="From QuickBooks"></i>';
    const descriptions = (Array.isArray(record?.lineDescriptions) ? record.lineDescriptions : [])
        .map(description => String(description || '').trim())
        .filter(Boolean)
        .map(escapeHtml)
        .join(' · ');
    return `${icon}${descriptions ? ` ${descriptions}` : ''}`;
}

function paymentReferenceId(reference) {
    const id = reference && typeof reference === 'object' ? reference._id : reference;
    return id == null ? '' : String(id);
}

function resolvePaymentTenant(payment) {
    const reference = payment?.tenantId;
    if (reference && typeof reference === 'object' && (reference.name || reference.firstName || reference.lastName)) return reference;
    const id = paymentReferenceId(reference);
    return [...(state.tenants || []), ...(state.allTenants || [])]
        .find(tenant => paymentReferenceId(tenant?._id) === id) || null;
}

function resolvePaymentUnit(payment, tenant) {
    const reference = payment?.unitId || tenant?.unitId;
    if (reference && typeof reference === 'object' && reference.number != null) return reference;
    const id = paymentReferenceId(reference);
    return (state.units || []).find(unit => paymentReferenceId(unit?._id) === id) || null;
}

function inferQuickBooksPaymentApplyTo(record) {
    const text = normalizeQuickBooksPaymentText([record?.privateNote, record?.docNumber].filter(Boolean).join(' '));
    if (!text) return 'rent';
    if (/security deposit|\bdeposit\b/.test(text)) return 'deposit';
    if (/\blate\b/.test(text)) return 'late';
    if (/\bwater\b/.test(text)) return 'water';
    if (/\belectric|electricity\b/.test(text)) return 'electric';
    if (/\btrash\b|\bsewer\b/.test(text)) return 'trash';
    if (/\badmin\b|\badministrative\b/.test(text)) return 'admin';
    if (/\bfee\b/.test(text)) return 'fee';
    return 'rent';
}

function inferQuickBooksPaymentMethod(record) {
    const method = normalizeQuickBooksPaymentText(record?.paymentMethodName);
    if (!method) return '';
    if (method.includes('check')) return 'check';
    if (method.includes('cash')) return 'cash';
    if (method.includes('bank') || method.includes('ach')) return 'bank';
    if (method.includes('card') || method.includes('credit') || method.includes('debit')) return 'card';
    if (method.includes('online')) return 'online';
    return method;
}

function getTenantForQuickBooksPaymentRecord(record, tenantsSource = [], unitsSource = []) {
    const customerName = normalizeQuickBooksPaymentText(record?.customerName);
    if (!customerName) return null;
    for (const tenant of (tenantsSource || [])) {
        const tenantName = normalizeQuickBooksPaymentText(tenant?.name || `${tenant?.firstName || ''} ${tenant?.lastName || ''}`.trim());
        if (!tenantName) continue;
        const unitId = tenant?.unitId?._id || tenant?.unitId || '';
        const unit = (unitsSource || []).find(item => String(item?._id || '') === String(unitId));
        const quickBooksDisplayName = normalizeQuickBooksPaymentText(`${tenantName} - ${unit?.number != null ? `Unit ${unit.number}` : 'Tenant'}`);
        if (customerName === tenantName || customerName === quickBooksDisplayName || customerName.startsWith(`${tenantName} -`)) {
            return tenant;
        }
    }
    return null;
}

function buildQuickBooksOnlyPaymentRecord(record, options = {}) {
    const localPayments = Array.isArray(options.localPayments) ? options.localPayments : [];
    if (getLocalPaymentForQuickBooksRecord(record, localPayments)) return null;
    const tenantsSource = Array.isArray(options.tenantsSource) ? options.tenantsSource : [];
    const unitsSource = Array.isArray(options.unitsSource) ? options.unitsSource : [];
    const tenant = getTenantForQuickBooksPaymentRecord(record, tenantsSource, unitsSource);
    const unitId = tenant?.unitId?._id || tenant?.unitId || '';
    return {
        _id: `quickbooks:${record?.sourceType || 'Payment'}:${record?.id || Date.now()}`,
        tenantId: tenant?._id || '',
        unitId,
        projectId: options.propertyId || tenant?.projectId || tenant?.propertyId || '',
        type: 'payment',
        amount: Number(record?.totalAmt || 0),
        method: inferQuickBooksPaymentMethod(record),
        date: record?.txnDate || '',
        note: String(record?.privateNote || ''),
        applyTo: inferQuickBooksPaymentApplyTo(record),
        appliedCredit: 0,
        quickBooks: {
            entityType: record?.sourceType || 'Payment',
            entityId: record?.id || '',
            docNumber: record?.docNumber || '',
            syncStatus: 'synced',
            sourceOnly: true
        }
    };
}

function getUnifiedPayments(localPayments = [], quickBooksPayments = [], options = {}) {
    const locals = Array.isArray(localPayments) ? localPayments.slice() : [];
    const quickBooksOnly = (Array.isArray(quickBooksPayments) ? quickBooksPayments : [])
        .map(record => buildQuickBooksOnlyPaymentRecord(record, {
            ...options,
            localPayments: locals
        }))
        .filter(Boolean);
    return [...locals, ...quickBooksOnly];
}

function getUnifiedCurrentPropertyPayments() {
    return getUnifiedPayments(
        Array.isArray(state.payments) ? state.payments : [],
        Array.isArray(state.quickBooksPayments) ? state.quickBooksPayments : [],
        {
            tenantsSource: Array.isArray(state.tenants) ? state.tenants : [],
            unitsSource: Array.isArray(state.units) ? state.units : [],
            propertyId: state.currentProperty?._id || ''
        }
    );
}

function matchesUnifiedPaymentQuery(row, query) {
    const tokens = query.tokens || {};
    const haystack = [
        row.tenantName || '',
        row.unitText || '',
        row.noteText || '',
        row.typeText || '',
        row.methodText || '',
        row.appliedText || '',
        row.localPayment?.periodMonth || '',
        row.quickBooksDoc || '',
        row.quickBooksType || ''
    ].join(' ').toLowerCase();
    if (query.text && !haystack.includes(query.text)) return false;
    const tname = (row.tenantName || '').toLowerCase();
    const uname = (row.unitText || '').toLowerCase();
    if (tokens.tenantIdList?.length) {
        if (!tokens.tenantIdList.includes(String(row.tenantId || ''))) return false;
    } else if (tokens.tenantList?.length) {
        const nameParts = tname.split(/\s+/).filter(Boolean);
        const matchesTenant = tokens.tenantList.some(raw => {
            const value = String(raw || '').toLowerCase().trim();
            if (!value) return false;
            if (value.includes(' ')) return tname.includes(value);
            if (tname.includes(value)) return true;
            if (nameParts.some(part => part === value || part.startsWith(value))) return true;
            return false;
        });
        if (!matchesTenant) return false;
    }
    if (tokens.unitList?.length && !tokens.unitList.some(value => uname.includes(value))) return false;
    const typeValue = (row.typeText || '').toLowerCase().replace(/\s+/g, '');
    if (tokens.typeList?.length && !tokens.typeList.includes(typeValue)) return false;
    const methodValue = (row.methodText || '').toLowerCase();
    if (tokens.methodList?.length && !tokens.methodList.includes(methodValue)) return false;
    const appliedValue = (row.appliedText || '').toLowerCase();
    if (tokens.applyList?.length && !tokens.applyList.includes(appliedValue)) return false;
    if (tokens.date) {
        const rowDate = new Date(row.dateValue);
        const [y, m, d] = tokens.date.split('-').map(Number);
        if (isNaN(rowDate)) return false;
        if (y && rowDate.getFullYear() !== y) return false;
        if (m && rowDate.getMonth() + 1 !== m) return false;
        if (d && rowDate.getDate() !== d) return false;
    }
    if (tokens.amountOp) {
        const amount = Number(row.amountValue) || 0;
        const value = Number(tokens.amountVal) || 0;
        if (tokens.amountOp === '>' && !(amount > value)) return false;
        if (tokens.amountOp === '<' && !(amount < value)) return false;
        if (tokens.amountOp === '>=' && !(amount >= value)) return false;
        if (tokens.amountOp === '<=' && !(amount <= value)) return false;
        if (tokens.amountOp === '=' && !(amount === value)) return false;
    }
    const noteValue = (row.noteText || '').toLowerCase();
    if (tokens.noteList?.length && !tokens.noteList.some(value => noteValue.includes(value))) return false;
    return true;
}

// Render payments list
let paymentActionsMenu = null;
let paymentActionsTrigger = null;
let paymentEditLockPopover = null;
let paymentEditLockTrigger = null;

function closePaymentEditLockPopover(restoreFocus = false) {
    if (!paymentEditLockPopover) return;
    paymentEditLockPopover.remove();
    paymentEditLockPopover = null;
    const trigger = paymentEditLockTrigger;
    paymentEditLockTrigger = null;
    trigger?.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', dismissPaymentEditLockPopover);
    document.removeEventListener('keydown', handlePaymentEditLockKeydown);
    window.removeEventListener('scroll', dismissPaymentEditLockPopover, true);
    window.removeEventListener('resize', dismissPaymentEditLockPopover);
    if (restoreFocus && trigger?.isConnected) trigger.focus();
}

function dismissPaymentEditLockPopover(event) {
    if (event.type === 'click' && (paymentEditLockPopover?.contains(event.target) || paymentEditLockTrigger?.contains(event.target))) return;
    closePaymentEditLockPopover();
}

function handlePaymentEditLockKeydown(event) {
    if (event.key === 'Escape') {
        event.preventDefault();
        closePaymentEditLockPopover(true);
    } else if (event.key === 'Tab') {
        closePaymentEditLockPopover(true);
    }
}

function handlePaymentEditLockRowKeydown(event, paymentId) {
    if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    openPaymentEditLockPopover(event, paymentId);
}

function openPaymentEditLockPopover(event, paymentId) {
    event.stopPropagation();
    const payment = (state.payments || []).find(item => String(item._id) === String(paymentId));
    if (!payment) return showNotification('Payment not found', 'error');
    const reason = getPaymentEditLockReason(payment);
    if (!reason) return editPayment(paymentId);
    const trigger = event.currentTarget;
    const wasOpen = paymentEditLockTrigger === trigger;
    closePaymentEditLockPopover();
    closePaymentActionsMenu();
    if (wasOpen) return;
    const popover = document.createElement('div');
    paymentEditLockPopover = popover;
    paymentEditLockTrigger = trigger;
    trigger.setAttribute('aria-expanded', 'true');
    popover.id = 'paymentEditLockPopover';
    popover.className = 'payment-actions-menu payment-edit-lock-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-labelledby', 'paymentEditLockTitle');
    popover.setAttribute('aria-describedby', 'paymentEditLockReason');
    popover.innerHTML = `<div class="payment-edit-lock-header"><span class="payment-edit-lock-icon" aria-hidden="true"><i class="fas fa-lock"></i></span><strong id="paymentEditLockTitle">Read-only payment</strong><button type="button" aria-label="Close editing explanation"><i class="fas fa-times" aria-hidden="true"></i></button></div><p id="paymentEditLockReason">${escapeHtml(reason)}</p>`;
    popover.addEventListener('click', clickEvent => clickEvent.stopPropagation());
    const closeButton = popover.querySelector('button');
    closeButton.addEventListener('click', () => closePaymentEditLockPopover(true));
    document.body.appendChild(popover);
    const rect = trigger.getBoundingClientRect();
    const width = popover.offsetWidth, height = popover.offsetHeight;
    popover.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    popover.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - height - 8))}px`;
    document.addEventListener('click', dismissPaymentEditLockPopover);
    document.addEventListener('keydown', handlePaymentEditLockKeydown);
    window.addEventListener('scroll', dismissPaymentEditLockPopover, true);
    window.addEventListener('resize', dismissPaymentEditLockPopover);
    closeButton.focus();
}

function closePaymentActionsMenu(restoreFocus = false) {
    if (!paymentActionsMenu) return;
    paymentActionsMenu.remove();
    paymentActionsMenu = null;
    const trigger = paymentActionsTrigger;
    paymentActionsTrigger = null;
    trigger?.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', dismissPaymentActionsMenu);
    document.removeEventListener('keydown', handlePaymentActionsKeydown);
    window.removeEventListener('scroll', dismissPaymentActionsMenu, true);
    window.removeEventListener('resize', dismissPaymentActionsMenu);
    if (restoreFocus && trigger?.isConnected) trigger.focus();
}

function dismissPaymentActionsMenu(event) {
    if (event.type === 'click' && (paymentActionsMenu?.contains(event.target) || paymentActionsTrigger?.contains(event.target))) return;
    closePaymentActionsMenu();
}

function handlePaymentActionsKeydown(event) {
    if (event.key === 'Escape') {
        event.preventDefault();
        closePaymentActionsMenu(true);
        return;
    }
    if (event.key === 'Tab') {
        closePaymentActionsMenu(true);
        return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(paymentActionsMenu.querySelectorAll('button'));
    const index = items.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
}

function openPaymentActionsMenu(event, paymentId) {
    event.stopPropagation();
    closePaymentEditLockPopover();
    const trigger = event.currentTarget;
    const wasOpen = paymentActionsTrigger === trigger;
    closePaymentActionsMenu();
    if (wasOpen) return;
    const payment = typeof state !== 'undefined' ? (state.payments || []).find(item => String(item._id) === String(paymentId)) : null;
    const isVoided = payment?.postingStatus === 'voided';
    const hasCreditHistory = !!payment?.creditSourceId || Number(payment?.creditConsumed)>0 || Number(payment?.appliedCredit)>0;
    paymentActionsTrigger = trigger;
    trigger.setAttribute('aria-expanded', 'true');
    const menu = document.createElement('div');
    paymentActionsMenu = menu;
    menu.id = 'paymentActionsMenu';
    menu.className = 'payment-actions-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Payment actions');
    menu.innerHTML = `
        <button type="button" role="menuitem" data-action="download"><i class="fas fa-file-arrow-down" aria-hidden="true"></i> Download receipt</button>
        ${isVoided ? '' : '<button type="button" role="menuitem" data-action="email"><i class="fas fa-paper-plane" aria-hidden="true"></i> Email receipt</button>'}
        ${isVoided ? '<button type="button" role="menuitem" data-action="reinstate"><i class="fas fa-rotate-left" aria-hidden="true"></i> Reinstate payment</button>' : ''}
        ${isVoided || hasCreditHistory ? '' : `<button type="button" role="menuitem" data-action="void" class="payment-action-void"><i class="fas fa-ban" aria-hidden="true"></i> Void payment${payment?.quickBooks?.entityId ? ' locally' : ''}</button>`}
        ${isVoided || hasCreditHistory ? '' : '<button type="button" role="menuitem" data-action="delete" class="payment-action-delete"><i class="fas fa-trash" aria-hidden="true"></i> Delete</button>'}`;
    menu.addEventListener('click', actionEvent => {
        actionEvent.stopPropagation();
        const action = actionEvent.target.closest('button[data-action]')?.dataset.action;
        if (!action) return;
        closePaymentActionsMenu(true);
        if (action === 'download') exportReceipt(paymentId);
        else if (action === 'email') emailReceipt(paymentId);
        else if (action === 'void') voidPayment(paymentId, !!payment?.quickBooks?.entityId);
        else if (action === 'reinstate') reinstatePayment(paymentId, !!payment?.quickBooks?.entityId);
        else if (action === 'delete') deletePayment(paymentId);
    });
    document.body.appendChild(menu);
    const rect = trigger.getBoundingClientRect();
    const width = menu.offsetWidth, height = menu.offsetHeight;
    menu.style.left = `${Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - height - 8))}px`;
    document.addEventListener('click', dismissPaymentActionsMenu);
    document.addEventListener('keydown', handlePaymentActionsKeydown);
    window.addEventListener('scroll', dismissPaymentActionsMenu, true);
    window.addEventListener('resize', dismissPaymentActionsMenu);
    menu.querySelector('button').focus();
}

function getPaymentEditLockReason(payment) {
    if (payment.postingStatus === 'voided') {
        return 'This voided payment is kept for audit and excluded from balances.';
    }
    if (payment.creditSourceId || Number(payment.creditConsumed)>0 || Number(payment.appliedCredit)>0) {
        return 'Editing is disabled to preserve linked credit allocations and accounting history.';
    }
    return '';
}

function schedulePaymentConnectionNoticeDismissal(root) {
    const notice = root.querySelector('[data-qb-connection-notice]');
    if (!notice) return;
    root.quickBooksConnectionNoticeTimeout = setTimeout(() => {
        root.quickBooksConnectionNoticeTimeout = null;
        notice.remove();
    }, 4000);
}

function renderPayments() {
    closePaymentActionsMenu();
    closePaymentEditLockPopover();
    const paymentsList = document.getElementById('paymentsList');
    if (paymentsList?.quickBooksConnectionNoticeTimeout) {
        clearTimeout(paymentsList.quickBooksConnectionNoticeTimeout);
        paymentsList.quickBooksConnectionNoticeTimeout = null;
    }
    initializePaymentPeriodFilter();
    const localPayments = Array.isArray(state.payments) ? state.payments : [];
    const quickBooksPayments = Array.isArray(state.quickBooksPayments) ? state.quickBooksPayments : [];
    // Ensure search/sort are initialized once
    if (!window.__paymentsFiltersInitialized) {
        initializeSimplePaymentSearchAndSort();
        window.__paymentsFiltersInitialized = true;
    }
    const { query, sort } = getPaymentSearchAndSort();
    // Helper to derive YYYY-MM from a date-like
    const toYYYYMM = (d) => {
        if (!d) return '';
        const dt = new Date(d);
        if (isNaN(dt)) return '';
        return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
    };
    const unifiedRows = localPayments.map(payment => {
        const tenant = resolvePaymentTenant(payment);
        const unit = resolvePaymentUnit(payment, tenant);
        const tenantId = paymentReferenceId(payment.tenantId);
        const qbPayment = getQuickBooksPaymentMatch(payment);
        let displayBalance = payment.balance;
        let overrideActive = false;
        let lateFeeDisplay = Number(payment.lateFee || 0);
        if (tenant && (payment.applyTo === 'rent' || !payment.applyTo)) {
            const period = payment.periodMonth || toYYYYMM(payment.date);
            if (period) {
                let overrideMap = tenant.monthlyOverrides || null;
                if (overrideMap && typeof overrideMap.get === 'function') {
                    const obj = {};
                    overrideMap.forEach((value, key) => { obj[key] = value; });
                    overrideMap = obj;
                }
                const ov = overrideMap ? overrideMap[period] : null;
                if (ov && (ov.expectedRent != null || ov.lateFee != null || ov.lateFeeMode != null)) {
                    const [y, m] = period.split('-').map(Number);
                    const periodDate = (y && m) ? new Date(y, m - 1, 1) : new Date(payment.date);
                    let expectedForPeriod;
                    if (ov.expectedRent != null && ov.expectedRent !== '' && Number.isFinite(Number(ov.expectedRent))) {
                        expectedForPeriod = Number(ov.expectedRent);
                    } else {
                        const base = computeExpectedBaseRentForMonth(tenant, periodDate);
                        const petFees = tenant.pets?.hasPets ? (Number(tenant.pets.monthlyRent) || 0) : 0;
                        const additionalFees = (Number(tenant.waterFee) || 0) + (Number(tenant.trashFee) || 0) + (Number(tenant.adminFee) || 0) + (tenant.additionalFee?.amount || 0) + petFees;
                        expectedForPeriod = base + additionalFees;
                    }
                    const ovLate = Number(ov.lateFee);
                    const ovMode = ov.lateFeeMode === 'percent' ? 'percent' : 'amount';
                    if (Number.isFinite(ovLate)) {
                        const addedLate = ovMode === 'percent' ? (expectedForPeriod * (ovLate / 100)) : ovLate;
                        lateFeeDisplay = addedLate;
                        expectedForPeriod += addedLate;
                    } else {
                        lateFeeDisplay = 0;
                    }
                    const totalPaidForPeriod = localPayments.filter(row =>
                        paymentReferenceId(row.tenantId) === tenantId
                        && row.postingStatus !== 'voided'
                        && (row.applyTo === 'rent' || !row.applyTo)
                        && ((row.periodMonth && row.periodMonth === period) || (!row.periodMonth && toYYYYMM(row.date) === period))
                    ).reduce((sum, row) => sum + Number(row.amount || 0), 0);
                    // The server supplies the chronological balance after this payment.
                    // Do not overwrite every row with the final monthly balance.
                    overrideActive = true;
                }
            }
        }
        return {
            rowKind: 'local',
            rowKey: `local:${payment._id}`,
            localPayment: payment,
            qbPayment,
            tenantId,
            tenantName: tenant?.name || `${tenant?.firstName || ''} ${tenant?.lastName || ''}`.trim() || payment.tenantName || '',
            unitText: unit?.number != null ? String(unit.number) : '',
            typeText: (payment.type || '').charAt(0).toUpperCase() + (payment.type || '').slice(1),
            appliedText: `${payment.applyTo ? payment.applyTo.charAt(0).toUpperCase() + payment.applyTo.slice(1) : 'Rent'}${payment.periodMonth ? ` · ${formatPaymentPeriodLabel(payment.periodMonth)}` : ''}`,
            amountValue: Number(payment.amount) || 0,
            methodText: payment.method ? payment.method.charAt(0).toUpperCase() + payment.method.slice(1) : '',
            dateValue: payment.date,
            lateFeeDisplay,
            displayBalance,
            overrideActive,
            noteText: getQuickBooksPaymentNote(qbPayment, getPaymentDisplayNote(payment, localPayments) || qbPayment?.privateNote || ''),
            quickBooksDoc: String(qbPayment?.docNumber || payment.quickBooks?.docNumber || ''),
            quickBooksType: getQuickBooksSourceLabel(qbPayment?.sourceType || payment.quickBooks?.entityType || '')
        };
    });
    const quickBooksOnlyRows = quickBooksPayments.filter(record => !getLocalPaymentForQuickBooksRecord(record)).map(record => ({
        rowKind: 'quickbooks',
        rowKey: `quickbooks:${record.sourceType}:${record.id}`,
        localPayment: null,
        qbPayment: record,
        tenantId: '',
        tenantName: String(record.customerName || ''),
        unitText: '',
        typeText: getQuickBooksSourceLabel(record.sourceType),
        appliedText: '',
        amountValue: Number(record.totalAmt || 0),
        methodText: String(record.paymentMethodName || ''),
        dateValue: record.txnDate,
        lateFeeDisplay: null,
        displayBalance: null,
        overrideActive: false,
        noteText: getQuickBooksPaymentNote(record),
        quickBooksDoc: String(record.docNumber || ''),
        quickBooksType: getQuickBooksSourceLabel(record.sourceType)
    }));
    // Show every local payment. QuickBooks contributes data only when matched to a local record;
    // QuickBooks-only records stay in Unmatched to avoid duplicate financial rows.
    const selectedPeriod=document.getElementById('paymentPeriodFilter')?.value||'';
    const filtered = unifiedRows.filter(row => {
        const rowPeriod=row.localPayment?.periodMonth||toYYYYMM(row.dateValue);
        return (!selectedPeriod||rowPeriod===selectedPeriod)&&matchesUnifiedPaymentQuery(row,query);
    });
    const periodCountEl=document.getElementById('paymentPeriodResultCount');if(periodCountEl)periodCountEl.textContent=`${filtered.length} payment${filtered.length===1?'':'s'}${selectedPeriod?` in ${selectedPeriod}`:''}`;
    if (!filtered.length) {
        const qbMessage = state.quickBooksPaymentsError
            ? `<div class="overview-alert" style="margin-top:12px;">${escapeHtml(state.quickBooksPaymentsError)}</div>`
            : (!state.quickBooksPaymentsConnected ? '<div class="empty-compact" data-qb-connection-notice style="margin-top:12px;">Connect this property to QuickBooks to match existing payments.</div>' : '');
        paymentsList.innerHTML = `<div class="empty-state"><i class="fas fa-link"></i><p>No matched transactions found</p><span class="task-meta">Use Unmatched to link or import QuickBooks payments.</span></div>${qbMessage}`;
        schedulePaymentConnectionNoticeDismissal(paymentsList);
        return;
    }
    // Apply sorting
    const sortCmp = (a,b) => {
        const getTenant = p => p.tenantName || '';
        const getApplied = p => p.appliedText || '';
        const getMethod = p => p.methodText || '';
        const getAmount = p => Number(p.amountValue)||0;
        const getDate = p => new Date(p.dateValue);
        const dir = (sort.dir === 'desc') ? -1 : 1;
        let va,vb;
        switch(sort.key){
            case 'tenant': va=getTenant(a).toLowerCase(); vb=getTenant(b).toLowerCase(); return va>vb?dir:(va<vb?-dir:0);
            case 'applied': va=getApplied(a).toLowerCase(); vb=getApplied(b).toLowerCase(); return va>vb?dir:(va<vb?-dir:0);
            case 'method': va=getMethod(a).toLowerCase(); vb=getMethod(b).toLowerCase(); return va>vb?dir:(va<vb?-dir:0);
            case 'amount': va=getAmount(a); vb=getAmount(b); return (va-vb)*dir;
            case 'date': va=getDate(a).getTime(); vb=getDate(b).getTime(); return (va-vb)*dir;
            default: return 0;
        }
    };
    if (sort.key) filtered.sort(sortCmp);
    else filtered.sort((a, b) => new Date(b.dateValue || 0) - new Date(a.dateValue || 0));
    state.paymentPageSize=Number(state.paymentPageSize)||50;state.paymentPage=Number(state.paymentPage)||1;
    const totalPages=Math.max(1,Math.ceil(filtered.length/state.paymentPageSize));state.paymentPage=Math.min(state.paymentPage,totalPages);
    const pageStart=(state.paymentPage-1)*state.paymentPageSize,pageRows=filtered.slice(pageStart,pageStart+state.paymentPageSize);
    const quickBooksStatusMessage = state.quickBooksPaymentsError
        ? `<div class="overview-alert" style="margin-bottom:12px;">${escapeHtml(state.quickBooksPaymentsError)}</div>`
        : (!state.quickBooksPaymentsConnected ? '<div class="empty-compact" data-qb-connection-notice style="margin-bottom:12px;">Connect this property to QuickBooks to match existing QuickBooks payments.</div>' : '');
    paymentsList.innerHTML = `
    ${quickBooksStatusMessage}
    <div class="table-responsive">
    <table class="payments-table">
            <thead>
                <tr>
                    <th class="sortable" data-sort-key="tenant">Tenant <span class="sort-arrow" id="arrow-tenant"></span></th>
                    <th>Unit #</th>
                    <th>Type</th>
                    <th class="sortable" data-sort-key="applied">Applied To <span class="sort-arrow" id="arrow-applied"></span></th>
                    <th class="sortable" data-sort-key="amount">Amount <span class="sort-arrow" id="arrow-amount"></span></th>
                    <th class="sortable" data-sort-key="method">Method <span class="sort-arrow" id="arrow-method"></span></th>
                    <th class="sortable" data-sort-key="date">Date <span class="sort-arrow" id="arrow-date"></span></th>
                    <th>Late Fee</th>
                    <th>Balance</th>
                    <th>Note</th>
                    <th>QuickBooks</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${pageRows.map(row => {
                    if (row.rowKind === 'quickbooks') {
                        const qbPayment = row.qbPayment || {};
                        return `
                        <tr>
                            <td>${escapeHtml(row.tenantName || '—')}</td>
                            <td>${escapeHtml(row.unitText || '—')}</td>
                            <td>${escapeHtml(row.typeText || 'Payment')}</td>
                            <td>${escapeHtml(row.appliedText || '—')}</td>
                            <td>$${Number(row.amountValue || 0).toFixed(2)}</td>
                            <td>${escapeHtml(row.methodText || '—')}</td>
                            <td>${row.dateValue ? formatDateDisplay(row.dateValue) : '—'}</td>
                            <td>—</td>
                            <td>—</td>
                            <td class="note-cell">${renderPaymentNote(row)}</td>
                            <td onclick="event.stopPropagation()"><span class="badge badge-success">${escapeHtml(getQuickBooksSourceLabel(qbPayment.sourceType))}</span></td>
                            <td>—</td>
                        </tr>`;
                    }
                    const payment = row.localPayment;
                    const qbPayment = row.qbPayment;
                    const isVoided = payment.postingStatus === 'voided';
                    const editLockReason = getPaymentEditLockReason(payment);
                    const isPersistedMatch = payment.quickBooks?.syncStatus === 'synced' && payment.quickBooks?.entityId;
                    const rowClick = editLockReason
                        ? `openPaymentEditLockPopover(event, '${payment._id}')`
                        : `${payment.quickBooks?.manualAllocation?'openPaymentAllocation':'editPayment'}('${payment._id}')`;
                    return `
                        <tr class="payment-row${isVoided?' payment-row-voided':''}" onclick="${rowClick}"${editLockReason?` tabindex="0" aria-haspopup="dialog" aria-expanded="false" aria-controls="paymentEditLockPopover" onkeydown="handlePaymentEditLockRowKeydown(event, '${payment._id}')"`:''}>
                            <td>${row.tenantName ? `<button class=\"link-button\" title=\"View balance sheet\" onclick=\"event.stopPropagation();openTenantBalanceModal('${payment.tenantId}')\">${escapeHtml(row.tenantName)}</button>` : 'N/A'}</td>
                            <td>${escapeHtml(row.unitText || 'N/A')}</td>
                            <td>${escapeHtml(row.typeText || '')}</td>
                            <td>${escapeHtml(row.appliedText || 'Rent')}</td>
                            <td>${(
                                isVoided
                                    ? `<del title="Voided payment">$${Number(payment.amount || 0).toFixed(2)}</del>`
                                    :
                                (Number(payment.amount) === 0 && Number(payment.appliedCredit) > 0)
                                    ? `<span style="color:#065f46;" title="Applied credit">Applied credit $${Number(payment.appliedCredit).toFixed(2)}</span>`
                                    : (payment.amount < 0
                                        ? '<span style="color:#dc2626" title="Credit">-$' + Math.abs(payment.amount).toFixed(2) + '</span>'
                                        : '$' + Number(payment.amount).toFixed(2))
                              )}</td>
                               <td>${escapeHtml(row.methodText || '')}</td>
                            <td>${formatDateDisplay(payment.date)}</td>
                               <td>$${Number(row.lateFeeDisplay).toFixed(2)}</td>
                                                        <td>
                                                        ${isVoided ? '—' : row.displayBalance < 0 || payment.amount < 0
                                                            ? `<button class="link-button" title="Apply credit${row.overrideActive ? ' • override active' : ''}" onclick="event.stopPropagation();openCreditAllocation(event, '${payment.tenantId}', '${payment._id}')">` +
                                                                (row.displayBalance < 0 ? `<span style='color:#16a34a'>-$${Math.abs(row.displayBalance).toFixed(2)}</span>` : `$${(Number(row.displayBalance).toFixed(2))}`) +
                                                                     `</button>`
                                                            : (row.displayBalance !== undefined && row.displayBalance !== null ? `$${(Number(row.displayBalance).toFixed(2))}` : '')}
                                                        </td>
                                                     <td class="note-cell">${renderPaymentNote(row)}${isVoided?`<span class="payment-void-reason">${escapeHtml(payment.voidReason||'Voided')}</span>`:''}</td>
                            <td onclick="event.stopPropagation()">
                                ${isVoided
                                    ? '<span class="badge badge-warning">Voided locally</span>'
                                    : payment.quickBooks?.syncStatus === 'failed'
                                    ? `<button class="overview-row-action" data-qb-sync-payment="${payment._id}" title="${escapeHtml(payment.quickBooks.lastError||'Retry QuickBooks sync')}" onclick="syncPaymentQuickBooks('${payment._id}')">Retry</button>`
                                    : (isPersistedMatch
                                                                    ? `<span class="badge ${payment.quickBooks?.allocationReviewRequired&&!payment.quickBooks?.manualAllocation?'badge-warning':'badge-success'}">${payment.quickBooks?.manualAllocation?'Allocated':payment.quickBooks?.allocationReviewRequired?'Review':'Synced'}</span><button class="overview-row-action" onclick="openPaymentAllocation('${payment._id}')">Allocate</button>`
                                        : qbPayment
                                            ? `<button class="overview-row-action" data-qb-sync-payment="${payment._id}" title="Match existing QuickBooks ${escapeHtml(getQuickBooksSourceLabel(qbPayment.sourceType))}" onclick="syncPaymentQuickBooks('${payment._id}')">Match</button>`
                                            : `<button class="overview-row-action" data-qb-sync-payment="${payment._id}" onclick="syncPaymentQuickBooks('${payment._id}')">Sync</button>`)}
                            </td>
                            <td>
                                <button class="btn-icon payment-actions-trigger" type="button" aria-label="Payment actions" title="Payment actions" aria-haspopup="menu" aria-expanded="false" aria-controls="paymentActionsMenu" onclick="openPaymentActionsMenu(event, '${payment._id}')"><i class="fas fa-ellipsis-v" aria-hidden="true"></i></button>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
    </table>
    </div>
    <div class="payment-record-pagination" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><span class="task-meta">Showing ${filtered.length?`${pageStart+1}–${Math.min(pageStart+pageRows.length,filtered.length)}`:'0'} of ${filtered.length}</span><div style="display:flex;align-items:center;gap:8px"><label class="task-meta">Rows <select class="pm-page-size" aria-label="Rows per page" onchange="setPaymentPageSize(this.value)" style="padding:5px;border:1px solid #cbd5e1;border-radius:7px"><option value="25" ${state.paymentPageSize===25?'selected':''}>25</option><option value="50" ${state.paymentPageSize===50?'selected':''}>50</option><option value="100" ${state.paymentPageSize===100?'selected':''}>100</option></select></label><button class="btn-secondary" onclick="changePaymentPage(-1)" ${state.paymentPage<=1?'disabled':''}><i class="fas fa-chevron-left"></i></button><span class="task-meta">Page ${state.paymentPage} of ${totalPages}</span><button class="btn-secondary" onclick="changePaymentPage(1)" ${state.paymentPage>=totalPages?'disabled':''}><i class="fas fa-chevron-right"></i></button></div></div>
    `;
    schedulePaymentConnectionNoticeDismissal(paymentsList);
    // Wire clickable header sort and update arrows
    wireClickableHeaderSort();
    updateSortArrows();
}

// Initialize single search bar and header sort controls
function initializeSimplePaymentSearchAndSort() {
    const search = document.getElementById('paymentSearchBar');
    if (search) {
        if (search.dataset._inited === '1') return;
        search.dataset._inited = '1';
        const debouncedRender = debounce(renderPayments, 200);
        search.addEventListener('input', ()=> { positionSearchSuggestions(); autoSuggestBasedOnInput(); showSearchSuggestions(true); debouncedRender(); });
        search.addEventListener('change', ()=> { positionSearchSuggestions(); debouncedRender(); });
        search.addEventListener('focus', ()=> { positionSearchSuggestions(); showSearchSuggestions(true); });
        search.addEventListener('blur', ()=> setTimeout(()=>showSearchSuggestions(false), 120));
        // basic keyboard navigation for the dropdown
        search.addEventListener('keydown', (e)=>{
            const list = document.getElementById('paymentSuggestList');
            const box = document.getElementById('paymentSearchSuggestions');
            if (!list || box.style.display === 'none') return;
            const items = Array.from(list.querySelectorAll('.suggest-item'));
            if (!items.length) return;
            window.__suggestIndex = (typeof window.__suggestIndex === 'number') ? window.__suggestIndex : -1;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                window.__suggestIndex = Math.min(items.length-1, window.__suggestIndex + 1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                window.__suggestIndex = Math.max(0, window.__suggestIndex - 1);
            } else if (e.key === 'Enter') {
                if (window.__suggestIndex >= 0) {
                    e.preventDefault();
                    const item = items[window.__suggestIndex];
                    const token = item.getAttribute('data-token') || '';
                    const acc = (window.__accumulatedQuery || '').trim();
                    const sep = acc ? ' ' : '';
                    window.__accumulatedQuery = `${acc}${sep}${token}`;
                    search.value = '';
                    renderPayments();
                    showSearchSuggestions(false);
                    window.__suggestIndex = -1;
                    // Defocus so the field is ready for the next filter (user clicks to reopen)
                    search.blur();
                }
            }
            // update highlight
            items.forEach((li, idx) => li.style.background = idx === window.__suggestIndex ? '#f1f5f9' : 'transparent');
        });
    }
    const clr = document.getElementById('clearPaymentFiltersBtn');
    if (clr) clr.onclick = ()=>{ if (search) search.value=''; window.__accumulatedQuery=''; renderPayments(); showSearchSuggestions(false); };

    const sug = document.getElementById('paymentSearchSuggestions');
    if (sug) {
        renderSuggestionTokens();
        sug.addEventListener('mousedown', (e)=>{
            const item = e.target.closest('.suggest-item');
            const valItem = e.target.closest('.suggest-value');
            e.preventDefault();
            if (item) {
                // Choose token -> show values for that token
                const token = item.getAttribute('data-token') || '';
                showValueSuggestions(token);
            } else if (valItem) {
                const token = valItem.getAttribute('data-token') || '';
                const value = valItem.getAttribute('data-value') || '';
                if (search) {
                    const acc = (window.__accumulatedQuery || '').trim();
                    const sep = acc ? ' ' : '';
                    window.__accumulatedQuery = `${acc}${sep}${token}${value}`;
                    search.value = '';
                    renderPayments();
                    showSearchSuggestions(false);
                    // Defocus to keep box closed until user clicks again
                    search.blur();
                }
            }
        });
        // Back button returns to token list
        const backBtn = document.getElementById('paymentSuggestBack');
        if (backBtn) backBtn.addEventListener('mousedown', (e)=>{ e.preventDefault(); renderSuggestionTokens(); });
        // hover highlight
        sug.addEventListener('mousemove', (e)=>{
            const item = e.target.closest('.suggest-item');
            const valItem = e.target.closest('.suggest-value');
            document.querySelectorAll('#paymentSuggestList .suggest-item').forEach(li => {
                li.style.background = li === item ? '#f8fafc' : 'transparent';
            });
            document.querySelectorAll('#paymentSuggestValues .suggest-value').forEach(li => {
                li.style.background = li === valItem ? '#f8fafc' : 'transparent';
            });
        });
    }
}

function parsePaymentSearch(queryStr) {
    const tokens = { tenant:'', unit:'', type:'', method:'', apply:'', date:'', amountOp:'', amountVal:'', note:'', text:'',
                     tenantList:[], tenantIdList:[], unitList:[], typeList:[], methodList:[], applyList:[], noteList:[] };
    const q = (queryStr || '').trim();
    if (!q) return { tokens, text:'' };
    const parts = q.split(/\s+/);
    const rest = [];
    for (const part of parts) {
        const low = part.toLowerCase();
        const takeVal = (pfx) => part.slice(pfx.length);
        if (low.startsWith('tenant:')) { const v = takeVal('tenant:').toLowerCase(); tokens.tenantList.push(...v.split(',').filter(Boolean)); }
        else if (low.startsWith('tenantid:')) { const v = takeVal('tenantid:'); tokens.tenantIdList.push(...v.split(',').filter(Boolean)); }
        else if (low.startsWith('unit:')) { const v = takeVal('unit:').toLowerCase(); tokens.unitList.push(...v.split(',').filter(Boolean)); }
        else if (low.startsWith('type:')) { const v = takeVal('type:').toLowerCase(); tokens.typeList.push(...v.split(',').filter(Boolean)); }
        else if (low.startsWith('method:')) { const v = takeVal('method:').toLowerCase(); tokens.methodList.push(...v.split(',').filter(Boolean)); }
        else if (low.startsWith('apply:')) { const v = takeVal('apply:').toLowerCase(); tokens.applyList.push(...v.split(',').filter(Boolean)); }
        else if (low.startsWith('date:')) tokens.date = takeVal('date:');
        else if (low.startsWith('amount:')) {
            const val = takeVal('amount:');
            const m = val.match(/^(>=|<=|>|<|=)?\s*(\-?\d+(?:\.\d+)?)$/);
            if (m) { tokens.amountOp = m[1] || '='; tokens.amountVal = m[2]; }
        }
        else if (low.startsWith('note:')) { const v = takeVal('note:').toLowerCase(); tokens.noteList.push(...v.split(',').filter(Boolean)); }
        else rest.push(part);
    }
    // Normalize: trim, dedupe, and set scalar mirrors for chips display
    const dedupe = (arr)=>Array.from(new Set(arr.map(v=>String(v).trim()).filter(Boolean)));
    tokens.tenantList = dedupe(tokens.tenantList);
    tokens.tenantIdList = dedupe(tokens.tenantIdList);
    tokens.unitList = dedupe(tokens.unitList);
    tokens.typeList = dedupe(tokens.typeList);
    tokens.methodList = dedupe(tokens.methodList);
    tokens.applyList = dedupe(tokens.applyList);
    tokens.noteList = dedupe(tokens.noteList);
    tokens.tenant = tokens.tenantList.join(',');
    tokens.unit = tokens.unitList.join(',');
    tokens.type = tokens.typeList.join(',');
    tokens.method = tokens.methodList.join(',');
    tokens.apply = tokens.applyList.join(',');
    tokens.note = tokens.noteList.join(',');
    tokens.text = rest.join(' ').toLowerCase();
    return { tokens, text: tokens.text };
}

function getPaymentSearchAndSort() {
    const currentInput = document.getElementById('paymentSearchBar')?.value || '';
    const combined = `${(window.__accumulatedQuery || '').trim()} ${currentInput.trim()}`.trim();
    const query = parsePaymentSearch(combined);
    const sort = window.__paymentSortState || { key:'', dir:'asc' };
    renderActiveFilterChips(query.tokens);
    return { query, sort };
}

function renderActiveFilterChips(tokens) {
    const container = document.getElementById('activeFilterChips');
    if (!container) return;
    const chipHtml = [];
    const pushChip = (key, value, displayLabel) => {
        chipHtml.push(`
        <span class="filter-chip" data-key="${key}" data-value="${value}" style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:#eef2f7;color:#374151;border:1px solid #e5e7eb;font-size:.9em;">
            <span style="color:#0b5cab;font-weight:600">${key === 'tenantid:' ? 'tenant:' : key}</span>
            <span>${displayLabel ?? value}</span>
            <button class="chip-remove" title="Remove" style="background:transparent;border:none;color:#6b7280;cursor:pointer;font-weight:700;">×</button>
        </span>`);
    };
    // Split multi-value lists into individual chips for fine-grained removal
    // Prefer ID-based chips with display names
    if (tokens.tenantIdList && tokens.tenantIdList.length) {
        tokens.tenantIdList.forEach(id => {
            const t = (state.tenants || []).find(tt => String(tt._id) === String(id));
            const label = t?.name || String(id);
            pushChip('tenantid:', String(id), label);
        });
    } else {
        (tokens.tenantList || []).forEach(v => pushChip('tenant:', v));
    }
    (tokens.unitList || []).forEach(v => pushChip('unit:', v));
    (tokens.typeList || []).forEach(v => pushChip('type:', v));
    (tokens.methodList || []).forEach(v => pushChip('method:', v));
    (tokens.applyList || []).forEach(v => pushChip('apply:', v));
    if (tokens.date) pushChip('date:', tokens.date);
    if (tokens.amountOp) pushChip('amount:', `${tokens.amountOp}${tokens.amountVal}`);
    (tokens.noteList || []).forEach(v => pushChip('note:', v));
    container.innerHTML = chipHtml.join('');
    container.querySelectorAll('.chip-remove').forEach(btn=>{
        btn.addEventListener('click', (e)=>{
            const chip = e.target.closest('.filter-chip');
            if (!chip) return;
            const key = chip.getAttribute('data-key') || '';
            const value = chip.getAttribute('data-value') || '';
            removeFilterTokenFromSearch(key, value);
        });
    });
}

function removeFilterTokenFromSearch(key, value) {
    // Robust approach: parse current tokens, remove the specific value, then rebuild the query
    const currentInput = document.getElementById('paymentSearchBar')?.value || '';
    const combined = `${(window.__accumulatedQuery || '').trim()} ${currentInput.trim()}`.trim();
    const { tokens } = parsePaymentSearch(combined);
    const normVal = (value || '').toLowerCase();
    const removeFrom = (list) => {
        const idx = list.findIndex(v => v.toLowerCase() === normVal);
        if (idx >= 0) list.splice(idx, 1);
    };
    switch (key) {
        case 'tenant:': removeFrom(tokens.tenantList); break;
        case 'tenantid:': removeFrom(tokens.tenantIdList); break;
        case 'unit:': removeFrom(tokens.unitList); break;
        case 'type:': removeFrom(tokens.typeList); break;
        case 'method:': removeFrom(tokens.methodList); break;
        case 'apply:': removeFrom(tokens.applyList); break;
        case 'note:': removeFrom(tokens.noteList); break;
        case 'date:': tokens.date = ''; break;
        case 'amount:': tokens.amountOp = ''; tokens.amountVal = ''; break;
        default: break;
    }
    // Rebuild accumulated query string from remaining tokens (exclude free text input)
    const parts = [];
    if (tokens.tenantIdList.length) parts.push(`tenantid:${tokens.tenantIdList.join(',')}`);
    else if (tokens.tenantList.length) parts.push(`tenant:${tokens.tenantList.join(',')}`);
    if (tokens.unitList.length) parts.push(`unit:${tokens.unitList.join(',')}`);
    if (tokens.typeList.length) parts.push(`type:${tokens.typeList.join(',')}`);
    if (tokens.methodList.length) parts.push(`method:${tokens.methodList.join(',')}`);
    if (tokens.applyList.length) parts.push(`apply:${tokens.applyList.join(',')}`);
    if (tokens.date) parts.push(`date:${tokens.date}`);
    if (tokens.amountOp) parts.push(`amount:${tokens.amountOp}${tokens.amountVal}`);
    if (tokens.noteList.length) parts.push(`note:${tokens.noteList.join(',')}`);
    window.__accumulatedQuery = parts.join(' ').trim();
    // Clear input to avoid reintroducing removed values; re-render
    const search = document.getElementById('paymentSearchBar');
    if (search) search.value = '';
    renderPayments();
}

function showSearchSuggestions(show) {
    const box = document.getElementById('paymentSearchSuggestions');
    if (!box) return;
    if (show) renderSuggestionTokens();
    box.style.display = show ? 'block' : 'none';
}

function positionSearchSuggestions() {
    const bar = document.getElementById('paymentsFilterBar');
    const input = document.getElementById('paymentSearchBar');
    const box = document.getElementById('paymentSearchSuggestions');
    if (!bar || !input || !box) return;
    const barRect = bar.getBoundingClientRect();
    const inRect = input.getBoundingClientRect();
    const left = inRect.left - barRect.left;
    const top = inRect.bottom - barRect.top + 6;
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.minWidth = `${Math.max(inRect.width, 320)}px`;
}

function renderSuggestionTokens() {
    const list = document.getElementById('paymentSuggestList');
    const header = document.getElementById('paymentSuggestHeader');
    const title = document.getElementById('paymentSuggestTitle');
    const values = document.getElementById('paymentSuggestValues');
    if (!list) return;
    const tokens = ['tenant:','unit:','type:','method:','apply:','date:','amount:','note:'];
    list.innerHTML = tokens.map(k => `
        <li class='suggest-item' data-token='${k}' style='padding:8px 12px;cursor:pointer;display:flex;gap:8px;align-items:center;'>
            <span style='font-weight:600;color:#1f2937'>${k}</span>
            <span style='font-size:.85em;color:#6b7280'>Add ${k} filter</span>
        </li>
    `).join('');
    if (title) title.textContent = 'Choose a filter';
    const backBtn = document.getElementById('paymentSuggestBack');
    if (backBtn) backBtn.style.display = 'none';
    if (values) { values.style.display = 'none'; values.innerHTML = ''; }
    // Ensure token list is visible when resetting
    list.style.display = 'block';
}

function showValueSuggestions(token) {
    const list = document.getElementById('paymentSuggestList');
    const values = document.getElementById('paymentSuggestValues');
    const title = document.getElementById('paymentSuggestTitle');
    const backBtn = document.getElementById('paymentSuggestBack');
    if (!list || !values || !title) return;
    // Build values by token
    let items = [];
    if (token === 'tenant:' || token === 'tenantid:') {
        items = (state.tenants || []).map(t=>({label: t?.name || 'Unknown', value: t?._id || ''}));
        token = 'tenantid:'; // force ID-based token for reliability
    } else if (token === 'unit:') {
        items = (state.units || []).map(u=>({label: String(u?.number ?? ''), value: String(u?.number ?? '').toLowerCase()}));
    } else if (token === 'type:') {
        items = ['rent','deposit','fee','credit','payment','salesreceipt'].map(v=>({label:v === 'salesreceipt' ? 'sales receipt' : v, value:v}));
    } else if (token === 'method:') {
        items = ['cash','check','card','bank','online'].map(v=>({label:v, value:v}));
    } else if (token === 'apply:') {
        items = ['rent','deposit','late','water','electric','trash','admin','other'].map(v=>({label:v, value:v}));
    } else if (token === 'date:') {
        // Suggest recent months
        const now = new Date();
        items = Array.from({length:6}, (_,i)=>{
            const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
            const label = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            return {label, value:label};
        });
    } else if (token === 'amount:') {
        items = ['>100','>500','>1000','<100','<500','=0'].map(v=>({label:v, value:v}));
    } else if (token === 'note:') {
        items = ['late','credit','deposit','partial'].map(v=>({label:v, value:v}));
    }
    if (title) title.textContent = `Choose a value for ${token}`;
    if (backBtn) backBtn.style.display = 'inline';
    // Hide token list when showing values
    list.style.display = 'none';
    values.innerHTML = items.map(it=>`<li class='suggest-value' data-token='${token}' data-value='${it.value}' style='padding:8px 12px;cursor:pointer;display:flex;gap:8px;align-items:center;'>
        <span style='font-weight:600;color:#1f2937'>${it.label}</span>
    </li>`).join('');
    values.style.display = items.length ? 'block' : 'none';
}

// Auto switch to value suggestions based on text after a token prefix
function autoSuggestBasedOnInput() {
    const inp = document.getElementById('paymentSearchBar');
    const val = (inp?.value || '').trim();
    const match = val.match(/(tenant:|unit:|type:|method:|apply:|date:|amount:|note:)([^\s]*)$/i);
    if (match) {
        const token = match[1].toLowerCase();
        const partial = match[2].toLowerCase();
        // Show values filtered by partial
        showValueSuggestions(token);
        // Filter list by partial if available
        const values = document.getElementById('paymentSuggestValues');
        if (values && partial) {
            Array.from(values.querySelectorAll('.suggest-value')).forEach(li => {
                const v = (li.getAttribute('data-value') || '').toLowerCase();
                li.style.display = v.includes(partial) ? 'flex' : 'none';
            });
        }
    } else {
        renderSuggestionTokens();
    }
}

function wireClickableHeaderSort() {
    const headers = document.querySelectorAll('.payments-table thead .sortable');
    headers.forEach(h => {
        h.style.cursor = 'pointer';
        h.addEventListener('click', () => {
            const key = h.getAttribute('data-sort-key');
            const cur = window.__paymentSortState || { key:'', dir:'asc' };
            let dir = 'asc';
            if (cur.key === key) dir = cur.dir === 'asc' ? 'desc' : 'asc';
            window.__paymentSortState = { key, dir };
            renderPayments();
        });
    });
}

function updateSortArrows() {
    const cur = window.__paymentSortState || { key:'', dir:'asc' };
    const keys = ['tenant','applied','amount','method','date'];
    keys.forEach(k => {
        const el = document.getElementById(`arrow-${k}`);
        if (!el) return;
        if (cur.key === k) {
            el.textContent = cur.dir === 'asc' ? '▲' : '▼';
            el.style.color = '#217dbb';
            el.style.fontSize = '0.85em';
            el.style.marginLeft = '4px';
        } else {
            el.textContent = '';
        }
    });
}
