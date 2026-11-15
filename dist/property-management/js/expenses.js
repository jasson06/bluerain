// Saved property expenses load on entry; QuickBooks sync is explicit.
let expenseWorkspaceRequest = 0;
let expenseWorkspaceProperty = '';
let expenseWorkspaceData = null;
let expenseWorkspaceRange = '';
let expenseSyncStatusTimeout = null;

function expenseTransactionCount() {
    return expenseWorkspaceProperty === String(state.currentProperty?._id)
        ? expenseWorkspaceData?.expenses.length || 0 : 0;
}

function selectExpenseWorkspace(section) {
    const panels = { transactions: 'expenseTransactionsPanel', mappings: 'expenseMappingsPanel', history: 'expenseHistoryPanel' };
    Object.entries(panels).forEach(([key, id]) => { document.getElementById(id).hidden = key !== section; });
    document.querySelectorAll('[data-expense-workspace]').forEach(button => {
        const active = button.dataset.expenseWorkspace === section;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    if (section === 'mappings' && !expenseMappingEditor) openExpenseMappings();
}

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
    if (typeof closeExpenseMappings === 'function') closeExpenseMappings(true);
    expenseWorkspaceProperty = String(propertyId);
    expenseWorkspaceData = null;
    expenseWorkspaceRange = '';
    document.getElementById('expenseHistory').innerHTML = '';
    selectExpenseWorkspace('transactions');
    document.getElementById('expenseRange').value = 'month';
    document.getElementById('expenseSearch').value = '';
    document.getElementById('expenseCategory').innerHTML = '<option value="">All categories</option>';
    setExpenseRange(false);
    updateTabCounts();
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
    selectExpenseWorkspace('transactions');
    navigateWorkspaceTab('expenses');
}

async function loadExpenseWorkspace(propertyId, sync = false, busyAttempt = 0) {
    if (!propertyId) return;
    initializeExpenseWorkspace(propertyId);
    if (expenseMappingEditor && (expenseMappingEditor.preview.range.from !== document.getElementById('expenseFrom').value
        || expenseMappingEditor.preview.range.to !== document.getElementById('expenseTo').value)) {
        const editor = expenseMappingEditor;
        if (!closeExpenseMappings()) {
            document.getElementById('expenseFrom').value = editor.preview.range.from;
            document.getElementById('expenseTo').value = editor.preview.range.to;
            document.getElementById('expenseRange').value = editor.preset;
            return;
        }
    }
    const request = ++expenseWorkspaceRequest;
    const range = { from: document.getElementById('expenseFrom').value, to: document.getElementById('expenseTo').value };
    const status = document.getElementById('expenseSyncStatus');
    const list = document.getElementById('expensesList');
    const refresh = document.getElementById('expenseRefresh');
    const current = () => request === expenseWorkspaceRequest && String(state.currentProperty?._id) === String(propertyId);
    clearTimeout(expenseSyncStatusTimeout);
    expenseSyncStatusTimeout = null;
    status.hidden = false;
    const rangeKey = `${range.from}:${range.to}`;
    if (expenseWorkspaceRange !== rangeKey) {
        expenseWorkspaceData = null;
        list.innerHTML = '';
        document.getElementById('expenseSummary').textContent = '';
        updateTabCounts();
    }
    status.className = 'empty-compact';
    if (!range.from || !range.to || range.from > range.to) {
        status.className = 'overview-alert'; status.textContent = 'Choose valid start and end dates.';
        refresh.disabled = false; list.setAttribute('aria-busy', 'false'); return;
    }
    status.textContent = sync ? 'Syncing expenses from QuickBooks…' : 'Loading saved expenses…';
    list.setAttribute('aria-busy', 'true');
    refresh.disabled = true;
    try {
        const url = `/api/properties/${encodeURIComponent(propertyId)}/expenses`;
        const response = await expenseMappingFetch(sync ? `${url}/sync` : `${url}?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`, {
            method: sync ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
            ...(sync ? { body: JSON.stringify(range) } : {})
        });
        const data = await response.json();
        if (!current()) return;
        if (!response.ok) throw new Error(response.status === 401 ? 'Sign in again to sync expenses.' : data.message || 'Unable to load expenses.');
        expenseWorkspaceData = data;
        expenseWorkspaceRange = rangeKey;
        updateTabCounts();
        const selected = document.getElementById('expenseCategory').value;
        const categories = [...new Set(data.expenses.flatMap(item => item.allocations?.map(line => line.category) || [item.category]))].sort();
        document.getElementById('expenseCategory').innerHTML = '<option value="">All categories</option>' + categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
        document.getElementById('expenseCategory').value = categories.includes(selected) ? selected : '';
        const synced = data.lastSyncedAt ? new Date(data.lastSyncedAt).toLocaleString() : 'Never';
        const issue = data.sync.status === 'failed' || data.sync.busy || data.sync.disconnected;
        status.className = issue ? 'overview-alert' : 'overview-ok';
        status.textContent = `${issue ? data.sync.message + ' Showing saved records; totals may be incomplete.' : sync ? 'Expenses for this period are up to date.' : 'Showing saved expenses. Use Sync now to check for QuickBooks updates.'} Last successful sync: ${synced}${data.companyName ? ' · ' + data.companyName : ''}`;
        if (!data.mappingCount) status.textContent = 'No categories mapped. Open Category mappings to choose what to import. ' + status.textContent;
        if (data.sync.unmapped?.length) status.textContent += ` ${data.sync.unmapped.length} unmapped accounts were excluded; review Category mappings.`;
        if (data.sync.status !== 'failed' && !data.sync.busy && !data.sync.unmapped?.length) {
            expenseSyncStatusTimeout = setTimeout(() => {
                expenseSyncStatusTimeout = null;
                if (current()) status.hidden = true;
            }, 4000);
        }
        renderExpenseWorkspace();
        document.getElementById('expenseHistory').innerHTML = (data.history || []).length
            ? `<div class="table-responsive"><table class="payments-table expense-history-table"><thead><tr><th>Date / time</th><th>Period</th><th>Status</th><th>Imported</th><th>Refreshed</th><th>Removed</th></tr></thead><tbody>${data.history.map(item => `<tr><td data-label="Date / time">${escapeHtml(new Date(item.completedAt || item.startedAt).toLocaleString())}</td><td data-label="Period">${escapeHtml(item.from)} – ${escapeHtml(item.to)}</td><td data-label="Status">${item.status === 'synced' ? 'Synced' : `Failed: ${escapeHtml(item.message || 'Use Sync now to retry.')}`}</td><td data-label="Imported">${Number(item.imported) || 0}</td><td data-label="Refreshed">${Number(item.updated) || 0}</td><td data-label="Removed">${Number(item.removed) || 0}</td></tr>`).join('')}</tbody></table></div>`
            : '<p>No import history yet.</p>';
        if (sync) {
            state.propertyOverviewData = null;
            if (state.currentTab === 'propertyOverview') renderPropertyOverview(true);
        }
        if (data.sync.busy && busyAttempt < 10) {
            setTimeout(() => {
                if (current() && state.currentTab === 'expenses') loadExpenseWorkspace(propertyId, false, busyAttempt + 1);
            }, 3000);
        }
    } catch (error) {
        if (!current()) return;
        status.className = 'overview-alert'; status.textContent = `${error.message} Use Sync now to retry.`;
    } finally {
        if (current()) { refresh.disabled = false; list.setAttribute('aria-busy', 'false'); }
    }
}

function renderExpenseWorkspace() {
    const data = expenseWorkspaceData;
    if (!data) return;
    const search = document.getElementById('expenseSearch').value.trim().toLowerCase();
    const category = document.getElementById('expenseCategory').value;
    const rows = data.expenses.map(item => ({ ...item, visibleLines: (item.allocations || [{ category: item.category, amount: item.amount, group: 'other' }]).filter(line => !category || line.category === category) }))
        .filter(item => item.visibleLines.length && (!search || [item.vendor, item.description, ...item.visibleLines.map(line => line.category)].join(' ').toLowerCase().includes(search)));
    const money = value => Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const totals = { operating: 0, debt: 0, returnedRent: 0, depositTransfer: 0 };
    rows.forEach(item => item.visibleLines.forEach(line => {
        const group = line.group === 'monthlyDebt' ? 'debt' : ['returnedRent','depositTransfer'].includes(line.group) ? line.group : 'operating';
        totals[group] += Math.round(Number(line.amount) * 100);
    }));
    document.getElementById('expenseSummary').textContent = `${rows.length} of ${data.expenses.length} transactions · Operating: ${money(totals.operating/100)} · Mortgage / debt: ${money(totals.debt/100)} · Returned rent: ${money(totals.returnedRent/100)} · Deposit transfers: ${money(totals.depositTransfer/100)} · Company home currency`;
    const mobileSummary = `<details class="expense-mobile-totals"><summary>${rows.length} of ${data.expenses.length} · Operating: ${money(totals.operating/100)}</summary><p>${escapeHtml(document.getElementById('expenseSummary').textContent)}</p></details>`;
    document.getElementById('expensesList').innerHTML = mobileSummary + (rows.length
        ? `<div class="table-responsive"><table class="payments-table expense-table"><thead><tr><th>Date</th><th>Payee</th><th>Description / allocations</th><th>Included amount</th><th>Original total</th></tr></thead><tbody>${rows.map(item => `<tr><td class="expense-date">${escapeHtml(item.date)}</td><td class="expense-payee">${escapeHtml(item.vendor || 'Payee not supplied')}</td><td class="expense-description"><span class="expense-description-preview">${escapeHtml(item.description || '—')}${item.ref ? ' · Ref: '+escapeHtml(item.ref) : ''}</span><details class="expense-transaction-details"><summary><span class="expense-mobile-label">Details · </span>${item.visibleLines.length} allocation(s)</summary><p class="expense-mobile-description">${escapeHtml(item.description || '—')}${item.ref ? ' · Ref: '+escapeHtml(item.ref) : ''}</p>${item.visibleLines.map(line => `<p>${escapeHtml(line.category)} — ${money(line.amount)}${line.description ? ' · '+escapeHtml(line.description) : ''}</p>`).join('')}<p class="expense-mobile-description">Original total: ${money(item.originalTotal ?? item.amount)}</p><p>Excluded from import: ${money(item.excludedAmount)}. ${escapeHtml(item.source)} · ${escapeHtml(item.status)}</p></details>${typeof expenseReportEditor === 'function' ? expenseReportEditor(item) : ''}</td><td class="expense-amount"><span class="expense-mobile-label">Included </span>${money(item.visibleLines.reduce((sum,line) => sum+Math.round(Number(line.amount)*100),0)/100)}</td><td class="expense-original">${money(item.originalTotal ?? item.amount)}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty-compact">No mapped expenses match this date range and filters.</div>');
}
