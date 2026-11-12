// Property expenses: QuickBooks sync runs on entry and date-range changes.
let expenseWorkspaceRequest = 0;
let expenseWorkspaceProperty = '';
let expenseWorkspaceData = null;

function expenseCalendarDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function expensePresetRange(preset, now = new Date()) {
    const year = now.getFullYear(), month = now.getMonth();
    let from = new Date(year, month, 1), to = new Date(year, month + 1, 0);
    if (preset === 'lastMonth') { from = new Date(year, month - 1, 1); to = new Date(year, month, 0); }
    if (preset === 'quarter') { from = new Date(year, Math.floor(month / 3) * 3, 1); to = new Date(year, Math.floor(month / 3) * 3 + 3, 0); }
    if (preset === 'year') { from = new Date(year, 0, 1); to = new Date(year, 11, 31); }
    return { from: expenseCalendarDate(from), to: expenseCalendarDate(to) };
}

function initializeExpenseWorkspace(propertyId) {
    if (expenseWorkspaceProperty === String(propertyId)) return;
    expenseWorkspaceProperty = String(propertyId);
    expenseWorkspaceData = null;
    document.getElementById('expenseRange').value = 'month';
    document.getElementById('expenseSearch').value = '';
    document.getElementById('expenseCategory').innerHTML = '<option value="">All categories</option>';
    setExpenseRange(false);
}

function setExpenseRange(reload = true) {
    const preset = document.getElementById('expenseRange').value;
    const from = document.getElementById('expenseFrom'), to = document.getElementById('expenseTo');
    if (preset !== 'custom') {
        const range = expensePresetRange(preset);
        from.value = range.from; to.value = range.to;
    }
    if (reload) loadExpenseWorkspace(state.currentProperty?._id);
}

function changeExpenseDates() {
    document.getElementById('expenseRange').value = 'custom';
    loadExpenseWorkspace(state.currentProperty?._id);
}

function openExpensesFromOverview() {
    const propertyId = state.currentProperty?._id;
    if (!propertyId) return;
    initializeExpenseWorkspace(propertyId);
    document.getElementById('expenseRange').value = document.getElementById('overviewRange')?.value || 'month';
    setExpenseRange(false);
    navigateWorkspaceTab('expenses');
}

async function loadExpenseWorkspace(propertyId, busyAttempt = 0) {
    if (!propertyId) return;
    initializeExpenseWorkspace(propertyId);
    const request = ++expenseWorkspaceRequest;
    const range = { from: document.getElementById('expenseFrom').value, to: document.getElementById('expenseTo').value };
    const status = document.getElementById('expenseSyncStatus');
    const list = document.getElementById('expensesList');
    const refresh = document.getElementById('expenseRefresh');
    const current = () => request === expenseWorkspaceRequest && String(state.currentProperty?._id) === String(propertyId);
    expenseWorkspaceData = null;
    list.innerHTML = '';
    document.getElementById('expenseSummary').textContent = '';
    document.getElementById('expenseHistory').innerHTML = '';
    status.className = 'empty-compact';
    if (!range.from || !range.to || range.from > range.to) {
        status.className = 'overview-alert'; status.textContent = 'Choose valid start and end dates.';
        refresh.disabled = false; list.setAttribute('aria-busy', 'false'); return;
    }
    status.textContent = 'Syncing expenses from QuickBooks…';
    list.setAttribute('aria-busy', 'true');
    refresh.disabled = true;
    try {
        const response = await fetch(`/api/properties/${encodeURIComponent(propertyId)}/expenses/sync`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
            body: JSON.stringify(range)
        });
        const data = await response.json();
        if (!current()) return;
        if (!response.ok) throw new Error(response.status === 401 ? 'Sign in again to sync expenses.' : data.message || 'Unable to load expenses.');
        expenseWorkspaceData = data;
        const selected = document.getElementById('expenseCategory').value;
        const categories = [...new Set(data.expenses.map(item => item.category))].sort();
        document.getElementById('expenseCategory').innerHTML = '<option value="">All categories</option>' + categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
        document.getElementById('expenseCategory').value = categories.includes(selected) ? selected : '';
        const synced = data.lastSyncedAt ? new Date(data.lastSyncedAt).toLocaleString() : 'Never';
        const issue = data.sync.status === 'failed' || data.sync.busy || data.sync.disconnected;
        status.className = issue ? 'overview-alert' : 'overview-ok';
        status.textContent = `${issue ? data.sync.message + ' Showing saved records; totals may be incomplete.' : 'Expenses for this period are up to date.'} Last successful sync: ${synced}${data.companyName ? ' · ' + data.companyName : ''}`;
        renderExpenseWorkspace();
        document.getElementById('expenseHistory').innerHTML = (data.history || []).length
            ? `<ul>${data.history.map(item => `<li>${escapeHtml(new Date(item.completedAt || item.startedAt).toLocaleString())} · ${escapeHtml(item.from)} – ${escapeHtml(item.to)} · ${item.status === 'synced' ? `${Number(item.imported) || 0} imported, ${Number(item.updated) || 0} refreshed, ${Number(item.removed) || 0} removed` : `Failed: ${escapeHtml(item.message || 'Refresh to retry.')}`}</li>`).join('')}</ul>`
            : '<p>No import history yet.</p>';
        state.propertyOverviewData = null;
        if (state.currentTab === 'propertyOverview') renderPropertyOverview(true);
        if (data.sync.busy && busyAttempt < 10) {
            setTimeout(() => {
                if (current() && state.currentTab === 'expenses') loadExpenseWorkspace(propertyId, busyAttempt + 1);
            }, 3000);
        }
    } catch (error) {
        if (!current()) return;
        status.className = 'overview-alert'; status.textContent = `${error.message} Use Refresh to retry.`;
    } finally {
        if (current()) { refresh.disabled = false; list.setAttribute('aria-busy', 'false'); }
    }
}

function renderExpenseWorkspace() {
    const data = expenseWorkspaceData;
    if (!data) return;
    const search = document.getElementById('expenseSearch').value.trim().toLowerCase();
    const category = document.getElementById('expenseCategory').value;
    const rows = data.expenses.filter(item => (!category || item.category === category)
        && (!search || [item.vendor, item.description, item.category].join(' ').toLowerCase().includes(search)));
    const money = value => Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const total = rows.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0) / 100;
    document.getElementById('expenseSummary').textContent = `${rows.length} of ${data.expenses.length} expenses · Total: ${money(total)} · Company home currency`;
    document.getElementById('expensesList').innerHTML = rows.length
        ? `<div class="table-responsive"><table class="payments-table expense-table"><thead><tr><th>Date</th><th>Vendor</th><th>Description</th><th>Category</th><th>Amount</th><th>Source / status</th></tr></thead><tbody>${rows.map(item => `<tr><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.vendor || '—')}</td><td>${escapeHtml(item.description || '—')}</td><td>${escapeHtml(item.category)}</td><td class="expense-amount">${money(item.amount)}</td><td>${escapeHtml(item.source)} · ${escapeHtml(item.status)}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty-compact">No expenses match this date range and filters.</div>';
}
