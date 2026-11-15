const expenseMappingFetch = (url, options = {}) => managerSessionRequest(url, options,
    typeof managerSessionFetch === 'function' ? managerSessionFetch : fetch);
let expenseMappingEditor = null;
let expenseMappingRequest = 0;
function expenseMappingSuggestion(account) {
    if (!['Expense', 'Other Expense', 'Cost of Goods Sold'].includes(account.type)) return '';
    const normalize = value => String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const name = normalize(account.name);
    if (/\b(nopal|nsf|returned|refund|deposit|transfer|mortgage|debt|loan|sweep|rent)\b/.test(name)) return '';
    if (name === 'gas') return 'gas';
    if (name === 'electric') return 'electricity';
    const text = `${name} ${normalize(account.subtype)}`;
    const rules = [
        ['electricity', /\b(electricity|electric utility|electrical utilities)\b/],
        ['water', /\b(water|water sewer)\b/], ['gas', /\b(natural gas|gas utility|gas utilities)\b/],
        ['trashSewer', /\b(trash|garbage|waste collection)\b/], ['internet', /\b(internet|broadband)\b/],
        ['maintenance', /\b(maintenance|repairs?|repair maintenance)\b/], ['insurance', /\binsurance\b/],
        ['propertyTax', /\b(property tax|property taxes|real estate tax)\b/],
        ['bankFees', /\b(bank fees?|bank charges|bank service charges)\b/],
        ['processingFees', /\b(processing fees?|merchant fees?|credit card fees?)\b/],
        ['contractServices', /\b(contract services|contract labor)\b/], ['payroll', /\b(payroll|wages|salaries)\b/],
        ['administrative', /\b(administrative|office expenses?|office supplies)\b/],
        ['managementFee', /\bmanagement fees?\b/]
    ];
    const matches = rules.filter(([, pattern]) => pattern.test(text));
    return matches.length === 1 ? matches[0][0] : '';
}
function expenseMappingChanges(editor = expenseMappingEditor) {
    return editor ? editor.accounts.filter(account => editor.values.get(account.accountId) !== editor.savedValues.get(account.accountId)) : [];
}
function expenseMappingImpact(editor = expenseMappingEditor) {
    const totals = { operating: 0, monthlyDebt: 0, returnedRent: 0, depositTransfer: 0, transactions: 0, affected: 0 };
    const changed = new Set(expenseMappingChanges(editor).map(account => account.accountId));
    editor.preview.transactions.forEach(transaction => {
        let included = false, affected = false;
        transaction.allocations.forEach(line => {
            const group = editor.values.get(line.accountId);
            if (changed.has(line.accountId)) affected = true;
            if (!group || group === 'excluded') return;
            included = true;
            const bucket = ['monthlyDebt', 'returnedRent', 'depositTransfer'].includes(group) ? group : 'operating';
            totals[bucket] += Math.round(line.amount * 100);
        });
        if (included) totals.transactions++;
        if (affected) totals.affected++;
    });
    return totals;
}
function expenseMappingOptions(value = '') {
    return `<option value="" ${value === '' ? 'selected' : ''}>Needs mapping (not imported)</option><option value="excluded" ${value === 'excluded' ? 'selected' : ''}>Exclude from import</option>${Object.entries(expenseMappingEditor.groups).map(([key, label]) => `<option value="${escapeHtml(key)}" ${value === key ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}`;
}
async function openExpenseMappings() {
    const propertyId = String(state.currentProperty?._id || '');
    if (expenseMappingEditor) return;
    const request = ++expenseMappingRequest;
    const root = document.getElementById('expenseMappingsPanel');
    root.hidden = false; root.textContent = 'Loading QuickBooks categories…';
    const range = { from: document.getElementById('expenseFrom').value, to: document.getElementById('expenseTo').value };
    try {
        const response = await expenseMappingFetch(`/api/properties/${encodeURIComponent(propertyId)}/expenses/mappings?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`);
        const data = await response.json();
        if (request !== expenseMappingRequest || String(state.currentProperty?._id) !== propertyId) return;
        if (range.from !== document.getElementById('expenseFrom').value || range.to !== document.getElementById('expenseTo').value) {
            root.innerHTML = '<p role="status">The selected period changed. Reload the mapping preview for the new dates.</p><button type="button" class="btn-secondary" onclick="openExpenseMappings()">Reload preview</button>';
            return;
        }
        if (!response.ok) throw new Error(data.message || 'Unable to load mappings.');
        if (!data.preview || !Array.isArray(data.accountActivity)) throw new Error('Mapping impact preview or account activity is unavailable. Reload mappings to retry.');
        const mapped = new Map(data.mappings.map(row => [row.accountId, row.group]));
        const exclusions = new Set(data.excludedAccountIds || []);
        const values = new Map(data.accounts.map(account => [account.accountId, mapped.get(account.accountId) || (exclusions.has(account.accountId) ? 'excluded' : '')]));
        const activity = new Map(data.accountActivity.map(row => [row.accountId, { count: row.count, periodCount: 0, amount: 0 }]));
        data.preview.transactions.forEach(transaction => {
            const seen = new Set();
            transaction.allocations.forEach(line => {
                const row = activity.get(line.accountId) || { count: 0, periodCount: 0, amount: 0 };
                if (!seen.has(line.accountId)) row.periodCount++;
                seen.add(line.accountId);
                row.amount += Math.round(line.amount * 100);
                activity.set(line.accountId, row);
            });
        });
        expenseMappingEditor = { ...data, propertyId, values, savedValues: new Map(values), activity, selected: new Set(), filter: 'needs', saving: false, preset: document.getElementById('expenseRange').value };
        root.innerHTML = `<h3>Review QuickBooks expense mappings</h3><p>Only mapped account lines are imported. Mapped groups replace saved property amounts. Mortgage / debt, deposit transfers, and returned rent stay separate from operating expenses.</p>
            <div class="expense-mapping-filters" role="group" aria-label="Mapping status">${[['needs', 'Needs mapping'], ['mapped', 'Mapped'], ['excluded', 'Excluded']].map(([key, label]) => `<button type="button" class="btn-secondary" data-mapping-filter="${key}" onclick="filterExpenseMappings('${key}')">${label} <span id="expenseMappingCount-${key}"></span></button>`).join('')}</div>
            <div class="expense-mapping-toolbar"><input type="search" id="expenseMappingSearch" placeholder="Search QuickBooks categories by name" aria-label="Search QuickBooks categories in both activity groups" oninput="renderExpenseMappingRows()"><label><input type="checkbox" id="expenseMappingInactive" onchange="renderExpenseMappingRows()"> Show inactive, unreviewed accounts without transactions</label></div>
            <div class="expense-mapping-toolbar"><label><input type="checkbox" id="expenseMappingSelectAll" onchange="selectAllExpenseMappings(this.checked)"> Select all matching accounts</label><span id="expenseMappingSelected" role="status"></span><select id="expenseMappingBulk" aria-label="Reporting group for selected accounts">${expenseMappingOptions()}</select><button type="button" class="btn-secondary" id="expenseMappingApply" onclick="applyExpenseMappingBulk()">Apply to selected</button><button type="button" class="btn-secondary" id="expenseMappingSuggest" onclick="suggestExpenseMappings()">Accept visible suggestions</button></div>
            <p class="task-meta">Accounts with QuickBooks expense transactions across all dates appear first, including zero-net activity. The amount preview uses ${escapeHtml(range.from)} through ${escapeHtml(range.to)} only. Search applies to both groups in the selected mapping view. Suggestions are drafts only; review before saving. Ambiguous debt, deposits, and returned rent require manual classification.</p>
            <div id="expenseMappingRows"></div>
            <div id="expenseMappingImpact" class="expense-mapping-impact" role="status" aria-live="polite"></div><p id="expenseMappingMessage" role="status" aria-live="polite"></p>
            <div class="expense-mapping-footer"><strong id="expenseMappingDirty" role="status"></strong><button type="button" class="btn-secondary" id="expenseMappingCancel" onclick="closeExpenseMappings()">Cancel</button><button type="button" class="btn-primary" id="expenseMappingSave" onclick="saveExpenseMappings()">Save &amp; sync</button></div>`;
        renderExpenseMappingRows();
    } catch (error) {
        if (request === expenseMappingRequest && String(state.currentProperty?._id) === propertyId) root.innerHTML = `<p role="alert">${escapeHtml(error.message)}</p><button type="button" class="btn-secondary" onclick="openExpenseMappings()">Retry</button>`;
    }
}
function closeExpenseMappings(force = false) {
    if (!force && expenseMappingEditor?.saving) {
        document.getElementById('expenseMappingMessage').textContent = 'Wait for mappings to finish saving before closing.';
        return false;
    }
    if (!force && expenseMappingChanges().length && !confirm('Discard unsaved expense mapping changes?')) return false;
    expenseMappingRequest++; expenseMappingEditor = null;
    document.getElementById('expenseMappingsPanel').hidden = true;
    selectExpenseWorkspace('transactions');
    return true;
}
function visibleExpenseMappingAccounts() {
    const editor = expenseMappingEditor;
    const search = document.getElementById('expenseMappingSearch').value.trim().toLowerCase();
    const showInactive = document.getElementById('expenseMappingInactive').checked;
    return editor.accounts.filter(account => {
        const value = editor.values.get(account.accountId);
        const status = !value ? 'needs' : value === 'excluded' ? 'excluded' : 'mapped';
        return status === editor.filter && (account.active || value || showInactive || editor.activity.get(account.accountId)?.count)
            && (!search || `${account.name} ${account.type}`.toLowerCase().includes(search));
    }).sort((a, b) => (editor.activity.get(b.accountId)?.count || 0) - (editor.activity.get(a.accountId)?.count || 0) || a.name.localeCompare(b.name));
}
function filterExpenseMappings(filter) {
    if (!expenseMappingEditor) return;
    expenseMappingEditor.filter = filter;
    renderExpenseMappingRows();
}
function renderExpenseMappingRows() {
    const editor = expenseMappingEditor;
    if (!editor) return;
    const accounts = visibleExpenseMappingAccounts();
    const money = cents => (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const disabled = editor.saving ? 'disabled' : '';
    const renderAccount = account => {
        const value = editor.values.get(account.accountId), activity = editor.activity.get(account.accountId);
        const suggestion = !value && expenseMappingSuggestion(account);
        return `<tr><td><input type="checkbox" data-expense-select="${escapeHtml(account.accountId)}" aria-label="Select ${escapeHtml(account.name)}" ${editor.selected.has(account.accountId) ? 'checked' : ''} ${disabled}></td><td>${escapeHtml(account.name)}${account.active ? '' : ' (inactive)'}<small>${escapeHtml(account.type)}</small></td><td>${activity?.count ? `${activity.count} transaction(s) across all dates<br>${activity.periodCount} this period · ${money(activity.amount)}` : 'No transactions'}</td><td><select data-expense-account="${escapeHtml(account.accountId)}" aria-label="Map ${escapeHtml(account.name)}" ${disabled}>${expenseMappingOptions(value)}</select>${suggestion ? `<div class="expense-mapping-suggestion">Suggested: ${escapeHtml(editor.groups[suggestion])} <button type="button" class="btn-secondary" data-map-accept="${escapeHtml(account.accountId)}" ${disabled}>Accept</button> <button type="button" class="btn-secondary" data-map-change="${escapeHtml(account.accountId)}" ${disabled}>Change</button></div>` : ''}</td></tr>`;
    };
    const withTransactions = accounts.filter(account => (editor.activity.get(account.accountId)?.count || 0) > 0);
    const withoutTransactions = accounts.filter(account => !editor.activity.get(account.accountId)?.count);
    document.getElementById('expenseMappingRows').innerHTML = [
        { key: 'with', label: 'With transactions', accounts: withTransactions },
        { key: 'without', label: 'No transactions', accounts: withoutTransactions }
    ].map(group => `<section class="expense-mapping-activity-group" data-mapping-activity="${group.key}" aria-labelledby="expenseMappingHeading-${group.key}"><h4 id="expenseMappingHeading-${group.key}">${group.label} <span>${group.accounts.length} account(s)</span></h4><div class="table-responsive"><table class="payments-table"><thead><tr><th>Select</th><th>QuickBooks account</th><th>Transaction activity</th><th>Reporting group / suggestion</th></tr></thead><tbody>${group.accounts.length ? group.accounts.map(renderAccount).join('') : '<tr><td colspan="4">No accounts match this view in this activity group.</td></tr>'}</tbody></table></div></section>`).join('');
    ['needs', 'mapped', 'excluded'].forEach(filter => {
        document.getElementById(`expenseMappingCount-${filter}`).textContent = editor.accounts.filter(account => {
            const value = editor.values.get(account.accountId);
            return (!value ? 'needs' : value === 'excluded' ? 'excluded' : 'mapped') === filter;
        }).length;
    });
    document.querySelectorAll('[data-mapping-filter]').forEach(button => {
        const active = button.dataset.mappingFilter === editor.filter;
        button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    document.getElementById('expenseMappingSelected').textContent = `${editor.selected.size} selected`;
    const selectAll = document.getElementById('expenseMappingSelectAll');
    const selectedVisible = accounts.filter(account => editor.selected.has(account.accountId)).length;
    selectAll.checked = accounts.length > 0 && selectedVisible === accounts.length;
    selectAll.indeterminate = selectedVisible > 0 && selectedVisible < accounts.length;
    selectAll.disabled = editor.saving || !accounts.length;
    const changes = expenseMappingChanges().length;
    document.getElementById('expenseMappingDirty').textContent = `${changes} unsaved change${changes === 1 ? '' : 's'}`;
    document.getElementById('expenseMappingSave').disabled = editor.saving || !changes;
    document.getElementById('expenseMappingCancel').disabled = editor.saving;
    document.getElementById('expenseMappingApply').disabled = editor.saving || !editor.selected.size;
    document.getElementById('expenseMappingBulk').disabled = editor.saving;
    document.getElementById('expenseMappingSuggest').disabled = editor.saving || !accounts.some(account => !editor.values.get(account.accountId) && expenseMappingSuggestion(account));
    const impact = expenseMappingImpact();
    document.getElementById('expenseMappingImpact').textContent = `Preview: these mappings would include ${money(impact.operating)} in operating expenses across ${impact.transactions} included transaction(s) for this period. Mortgage / debt: ${money(impact.monthlyDebt)}; returned rent: ${money(impact.returnedRent)}; deposit transfers: ${money(impact.depositTransfer)}. ${impact.affected} transaction(s) affected by unsaved changes. Company home currency, tax included, credits signed. Preview only; nothing is imported until Save & sync.`;
}
function changeExpenseMapping(accountId, value) {
    const editor = expenseMappingEditor;
    if (!editor || editor.saving) return;
    if (!editor.values.has(accountId) || (value && value !== 'excluded' && !editor.groups[value])) {
        document.getElementById('expenseMappingMessage').textContent = 'Choose a valid account and reporting group.';
        return;
    }
    editor.values.set(accountId, value);
    renderExpenseMappingRows();
}
function selectAllExpenseMappings(checked) {
    if (!expenseMappingEditor || expenseMappingEditor.saving) return;
    visibleExpenseMappingAccounts().forEach(account => checked ? expenseMappingEditor.selected.add(account.accountId) : expenseMappingEditor.selected.delete(account.accountId));
    renderExpenseMappingRows();
}
function applyExpenseMappingBulk() {
    const editor = expenseMappingEditor;
    if (!editor || editor.saving) return;
    const value = document.getElementById('expenseMappingBulk').value;
    if (!editor.selected.size) {
        document.getElementById('expenseMappingMessage').textContent = 'Select one or more accounts first.';
        return;
    }
    if (value && value !== 'excluded' && !editor.groups[value]) {
        document.getElementById('expenseMappingMessage').textContent = 'Choose a valid reporting group.';
        return;
    }
    editor.selected.forEach(id => editor.values.set(id, value));
    editor.selected.clear();
    renderExpenseMappingRows();
}
function suggestExpenseMappings() {
    if (!expenseMappingEditor || expenseMappingEditor.saving) return;
    visibleExpenseMappingAccounts().forEach(account => {
        const suggestion = expenseMappingSuggestion(account);
        if (!expenseMappingEditor.values.get(account.accountId) && suggestion) expenseMappingEditor.values.set(account.accountId, suggestion);
    });
    renderExpenseMappingRows();
    document.getElementById('expenseMappingMessage').textContent = 'Suggestions applied to the draft. Review the Mapped tab and impact preview before saving.';
}
async function saveExpenseMappings() {
    const editor = expenseMappingEditor;
    if (!editor || editor.saving || !expenseMappingChanges().length || editor.propertyId !== String(state.currentProperty?._id)) return;
    editor.saving = true;
    renderExpenseMappingRows();
    try {
        const mappings = Array.from(editor.values).filter(([, value]) => value && value !== 'excluded').map(([accountId, group]) => ({ accountId, group }));
        const excludedAccountIds = Array.from(editor.values).filter(([, value]) => value === 'excluded').map(([accountId]) => accountId);
        const response = await expenseMappingFetch(`/api/properties/${encodeURIComponent(editor.propertyId)}/expenses/mappings`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mappings, excludedAccountIds, version: editor.version })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to save mappings.');
        if (expenseMappingEditor !== editor || String(state.currentProperty?._id) !== editor.propertyId) return;
        editor.version = data.version;
        editor.savedValues = new Map(editor.values);
        document.getElementById('expenseMappingMessage').textContent = 'Mappings saved. Refreshing selected period…';
        state.propertyOverviewData = null;
        await loadExpenseWorkspace(editor.propertyId, true);
    } catch (error) { if (expenseMappingEditor === editor) document.getElementById('expenseMappingMessage').textContent = error.message; }
    finally {
        if (expenseMappingEditor === editor) { editor.saving = false; renderExpenseMappingRows(); }
    }
}

document.addEventListener('change', event => {
    if (event.target.matches('[data-expense-account]')) changeExpenseMapping(event.target.dataset.expenseAccount, event.target.value);
    if (event.target.matches('[data-expense-select]') && expenseMappingEditor && !expenseMappingEditor.saving) {
        const id = event.target.dataset.expenseSelect;
        if (event.target.checked) expenseMappingEditor.selected.add(id); else expenseMappingEditor.selected.delete(id);
        renderExpenseMappingRows();
    }
});
document.addEventListener('click', event => {
    const accept = event.target.closest('[data-map-accept]');
    if (accept && expenseMappingEditor) {
        const account = expenseMappingEditor.accounts.find(row => row.accountId === accept.dataset.mapAccept);
        if (account) changeExpenseMapping(account.accountId, expenseMappingSuggestion(account));
    }
    const change = event.target.closest('[data-map-change]');
    if (change) change.closest('td').querySelector('select').focus();
});
window.addEventListener('beforeunload', event => {
    if (!expenseMappingChanges().length && !expenseMappingEditor?.saving) return;
    event.preventDefault();
    event.returnValue = '';
});

async function saveExpenseReport(expenseId) {
    const propertyId = String(state.currentProperty?._id || '');
    const root = document.getElementById(`report-${expenseId}`);
    const button = root.querySelector('button'); button.disabled = true;
    const values = Object.fromEntries(Array.from(root.querySelectorAll('[data-report-field]')).map(input => [input.dataset.reportField, input.value]));
    try {
        const response = await expenseMappingFetch(`/api/properties/${encodeURIComponent(propertyId)}/expenses/${encodeURIComponent(expenseId)}/report`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, body: JSON.stringify(values)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to save report link.');
        if (String(state.currentProperty?._id) !== propertyId) return;
        const item = expenseWorkspaceData?.expenses.find(row => row._id === expenseId);
        if (item) item.maintenanceReport = data.maintenanceReport;
        root.querySelector('[role=status]').textContent = 'Report link saved. This adds supporting detail only; it does not add another expense.';
    } catch (error) { root.querySelector('[role=status]').textContent = error.message; }
    finally { button.disabled = false; }
}
function expenseReportEditor(item) {
    if (!item.allocations?.some(line => line.group === 'maintenance')) return '';
    const report = item.maintenanceReport || {};
    return `<details id="report-${escapeHtml(item._id)}"><summary>Monthly maintenance report</summary><label>Work month <input type="month" data-report-field="month" value="${escapeHtml(report.month || '')}"></label><label>Report reference <input data-report-field="reference" maxlength="200" value="${escapeHtml(report.reference || '')}"></label><label>Report link (HTTPS) <input type="url" data-report-field="url" value="${escapeHtml(report.url || '')}"></label><button type="button" class="btn-secondary" data-report-save="${escapeHtml(item._id)}">Save report link</button><p role="status"></p></details>`;
}
document.addEventListener('click', event => { const button = event.target.closest('[data-report-save]'); if (button) saveExpenseReport(button.dataset.reportSave); });
