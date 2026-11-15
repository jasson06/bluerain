const expenseMappingFetch = (url, options = {}) => managerSessionRequest(url, options,
    typeof managerSessionFetch === 'function' ? managerSessionFetch : fetch);
let expenseMappingEditor = null;
let expenseMappingRequest = 0;
async function openExpenseMappings() {
    const propertyId = String(state.currentProperty?._id || '');
    const request = ++expenseMappingRequest;
    const root = document.getElementById('expenseMappingsPanel');
    root.hidden = false; root.textContent = 'Loading QuickBooks categories…';
    try {
        const response = await expenseMappingFetch(`/api/properties/${encodeURIComponent(propertyId)}/expenses/mappings`);
        const data = await response.json();
        if (request !== expenseMappingRequest || String(state.currentProperty?._id) !== propertyId) return;
        if (!response.ok) throw new Error(data.message || 'Unable to load mappings.');
        expenseMappingEditor = { ...data, propertyId };
        const mapped = new Map(data.mappings.map(row => [row.accountId, row.group]));
        root.innerHTML = `<h3>QuickBooks expense allocations</h3><p>Only mapped account lines are imported. Mapped categories replace saved property amounts. Deposit transfers and returned rent are shown separately and never added to operating expenses.</p><button type="button" class="btn-secondary" onclick="suggestExpenseMappings()">Use suggested mappings</button><div class="table-responsive"><table class="payments-table"><thead><tr><th>QuickBooks account</th><th>Account type</th><th>Reporting group</th></tr></thead><tbody>${data.accounts.map(account => `<tr><td>${escapeHtml(account.name)}${account.active ? '' : ' (inactive)'}</td><td>${escapeHtml(account.type)}</td><td><select data-expense-account="${escapeHtml(account.accountId)}" aria-label="Map ${escapeHtml(account.name)}"><option value="">Exclude from import</option>${Object.entries(data.groups).map(([key, label]) => `<option value="${key}" ${mapped.get(account.accountId) === key ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div><p id="expenseMappingMessage" role="status"></p><button type="button" class="btn-primary" id="expenseMappingSave" onclick="saveExpenseMappings()">Save mappings and sync</button> <button type="button" class="btn-secondary" onclick="closeExpenseMappings()">Close</button>`;
    } catch (error) { if (request === expenseMappingRequest) root.textContent = error.message; }
}
function closeExpenseMappings() {
    expenseMappingRequest++; expenseMappingEditor = null;
    document.getElementById('expenseMappingsPanel').hidden = true;
}
function suggestExpenseMappings() {
    if (!expenseMappingEditor) return;
    const known = { 'electricity': 'electricity', 'water & sewer': 'water', 'mis opx x4217 sweep': 'monthlyDebt',
        'bank fees & service charges': 'bankFees', 'qbo credit card fees': 'processingFees', 'nsf bank fees': 'bankFees',
        '530-21 opx:repairs & maintenance': 'maintenance' };
    const accounts = new Map(expenseMappingEditor.accounts.map(row => [row.accountId, row]));
    document.querySelectorAll('[data-expense-account]').forEach(select => {
        const name = accounts.get(select.dataset.expenseAccount)?.name.toLowerCase().replace(/\s+/g, ' ').trim();
        if (!select.value && known[name]) select.value = known[name];
    });
    document.getElementById('expenseMappingMessage').textContent = 'Review these suggestions, then save. NOPAL and returned rent remain excluded unless you choose to map them.';
}
async function saveExpenseMappings() {
    const editor = expenseMappingEditor;
    if (!editor || editor.propertyId !== String(state.currentProperty?._id)) return;
    const button = document.getElementById('expenseMappingSave');
    button.disabled = true;
    try {
        const mappings = Array.from(document.querySelectorAll('[data-expense-account]')).filter(select => select.value)
            .map(select => ({ accountId: select.dataset.expenseAccount, group: select.value }));
        const response = await expenseMappingFetch(`/api/properties/${encodeURIComponent(editor.propertyId)}/expenses/mappings`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mappings, version: editor.version })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to save mappings.');
        if (expenseMappingEditor !== editor || String(state.currentProperty?._id) !== editor.propertyId) return;
        editor.version = data.version;
        document.getElementById('expenseMappingMessage').textContent = 'Mappings saved. Refreshing selected period…';
        state.propertyOverviewData = null;
        await loadExpenseWorkspace(editor.propertyId);
    } catch (error) { if (expenseMappingEditor === editor) document.getElementById('expenseMappingMessage').textContent = error.message; }
    finally { button.disabled = false; }
}

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
