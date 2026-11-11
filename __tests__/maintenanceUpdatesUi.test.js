const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dist = path.join(__dirname, '../dist');
const read = file => fs.readFileSync(path.join(dist, file), 'utf8');
const workflow = read('property-management/js/maintenance-workflow.js');
const requests = read('property-management/js/maintenance-requests.js');

function setup() {
    const other = { _id: 'request-b', updates: [{ text: 'Other request' }] };
    const state = {
        currentProperty: { _id: 'property' },
        maintenanceRequests: [{ _id: 'request-a', updates: [] }, other],
        portfolioMaintenance: [{ _id: 'request-a', projectId: { _id: 'property', name: 'Property' }, updates: [] }, other],
        portfolioComparisonPage: 2, portfolioWorkspaceMode: 'maintenance'
    };
    const updated = [{ _id: 'update-a', authorRole: 'manager', authorName: 'Management', text: 'New note' }];
    const focus = { focus: jest.fn() };
    const thread = (requestId, scrollTop = 25) => ({
        dataset: { requestId, projectId: 'property' }, scrollTop, scrollHeight: 200, clientHeight: 100,
        innerHTML: 'Existing thread', querySelector: () => focus,
        closest: () => ({ querySelector: () => focus })
    });
    const threads = [thread('request-a'), thread('request-a', 95), thread('request-b')];
    const nodes = ['request-a', 'request-b'].map(maintId => ({
        dataset: { maintId, maintSource: 'request' }, remove: jest.fn()
    }));
    const form = {
        dataset: {}, input: { value: 'New note', focus: jest.fn() }, submit: { disabled: false },
        querySelector(selector) { return selector.startsWith('input') ? this.input : this.submit; }
    };
    const storage = new Map([['token', 'manager-token'], ['managerName', 'Management']]);
    const context = vm.createContext({
        state, globalMaintenanceOverviewState: { requests: [...state.maintenanceRequests] },
        API_URL: '/api', console: { error: jest.fn() },
        localStorage: { getItem: key => storage.get(key), setItem: jest.fn((key, value) => storage.set(key, value)) },
        document: {
            getElementById: jest.fn(() => null),
            querySelectorAll: selector => selector === '[data-maintenance-updates]' ? threads : selector === '[data-maint-id]' ? nodes : [],
            createElement: jest.fn()
        },
        fetch: jest.fn(async () => ({ ok: true, json: async () => ({ updates: updated }) })),
        showNotification: jest.fn(), invalidateCache: jest.fn(), confirm: jest.fn(() => true),
        loadMaintenanceRequests: jest.fn(), refreshContent: jest.fn(),
        renderPortfolioOverview: jest.fn(), renderPortfolioDetails: jest.fn(),
        preloadGlobalMaintenanceCount: jest.fn(async () => {}),
        refreshPortfolioMaintenanceWorkspaceAfterRemoval: jest.fn()
    });
    vm.runInContext(workflow, context);
    vm.runInContext(requests, context);
    context.loadMaintenanceRequests = jest.fn();
    context.updateMaintenanceTabBadge = jest.fn();
    context.syncPortfolioMaintenanceOverviewSummary = jest.fn();
    context.syncPortfolioMaintenanceExecutiveCards = jest.fn();
    return { context, state, other, updated, threads, nodes, form, focus };
}

test.each(['sendManagerMaintenanceMessage', 'sendPortfolioMaintenanceMessage'])('%s updates only the matching threads and keeps drafts, focus, and scroll', async name => {
    const { context, state, other, updated, threads, form } = setup();
    const event = { preventDefault: jest.fn(), currentTarget: form };
    await context[name](event, 'request-a', 'property');
    expect(state.maintenanceRequests[0].updates).toEqual(updated);
    expect(state.portfolioMaintenance[0].projectId).toEqual({ _id: 'property', name: 'Property' });
    expect(state.maintenanceRequests[1]).toBe(other);
    expect(threads[0].innerHTML).toContain('New note');
    expect(threads[0].scrollTop).toBe(25);
    expect(threads[1].scrollTop).toBe(200);
    expect(threads[2].innerHTML).toBe('Existing thread');
    expect(form.input.value).toBe('');
    expect(form.input.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(state.portfolioComparisonPage).toBe(2);
    expect(context.loadMaintenanceRequests).not.toHaveBeenCalled();
    expect(context.refreshContent).not.toHaveBeenCalled();
    expect(context.renderPortfolioOverview).not.toHaveBeenCalled();
    expect(context.renderPortfolioDetails).not.toHaveBeenCalled();
});

test('pending posts reject duplicates and do not erase a newer draft', async () => {
    const { context, form } = setup();
    let finish;
    context.fetch.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const event = { preventDefault: jest.fn(), currentTarget: form };
    const pending = context.sendManagerMaintenanceMessage(event, 'request-a');
    await context.sendManagerMaintenanceMessage(event, 'request-a');
    expect(context.fetch).toHaveBeenCalledTimes(1);
    expect(form.submit.disabled).toBe(true);
    form.input.value = 'Next draft';
    finish({ ok: true, json: async () => ({ updates: [] }) });
    await pending;
    expect(form.input.value).toBe('Next draft');
    expect(form.submit.disabled).toBe(false);
    expect(form.dataset.saving).toBeUndefined();
});

test('post failures leave the thread and draft untouched and permit retry', async () => {
    const { context, threads, form } = setup();
    context.fetch.mockResolvedValue({ ok: false, json: async () => ({ message: 'Save failed' }) });
    await context.sendManagerMaintenanceMessage({ preventDefault() {}, currentTarget: form }, 'request-a');
    expect(form.input.value).toBe('New note');
    expect(threads[0].innerHTML).toBe('Existing thread');
    expect(context.showNotification).toHaveBeenLastCalledWith('Save failed', 'error');
    expect(form.submit.disabled).toBe(false);
});

test.each(['deleteMaintenance', 'deletePortfolioMaintenance'])('%s removes only the deleted request and never reloads a section', async name => {
    const { context, state, other, nodes } = setup();
    await context[name]('request-a', 'property');
    expect(state.maintenanceRequests).toEqual([other]);
    expect(state.portfolioMaintenance).toEqual([other]);
    expect(nodes[0].remove).toHaveBeenCalledTimes(1);
    expect(nodes[1].remove).not.toHaveBeenCalled();
    expect(context.syncPortfolioMaintenanceOverviewSummary).toHaveBeenCalled();
    expect(context.refreshPortfolioMaintenanceWorkspaceAfterRemoval).toHaveBeenCalled();
    expect(context.loadMaintenanceRequests).not.toHaveBeenCalled();
    expect(context.refreshContent).not.toHaveBeenCalled();
    expect(context.renderPortfolioOverview).not.toHaveBeenCalled();
    expect(context.renderPortfolioDetails).not.toHaveBeenCalled();
});

test('failed or cancelled request deletion preserves all requests', async () => {
    const { context, state, nodes } = setup();
    context.confirm.mockReturnValueOnce(false);
    await context.deleteMaintenance('request-a');
    expect(context.fetch).not.toHaveBeenCalled();
    context.fetch.mockResolvedValue({ ok: false, json: async () => ({ message: 'Delete failed' }) });
    await context.deleteMaintenance('request-a');
    expect(state.maintenanceRequests).toHaveLength(2);
    expect(nodes[0].remove).not.toHaveBeenCalled();
    expect(context.showNotification).toHaveBeenLastCalledWith('Delete failed', 'error');
});

test('deleting the last visible request shows an empty state without rebuilding other sections', async () => {
    const { context } = setup();
    const propertyList = { innerHTML: 'Last request', querySelector: () => null };
    context.document.getElementById.mockImplementation(name => name === 'maintenanceList' ? propertyList : null);
    await context.deleteMaintenance('request-a');
    expect(propertyList.innerHTML).toContain('No maintenance requests match');
    expect(context.renderPortfolioDetails).not.toHaveBeenCalled();
});

test('manager, tenant, and system updates have accessible hover controls while vendor entries remain read-only', () => {
    const { context } = setup();
    const html = context.renderMaintenanceUpdates({ updates: ['manager', 'tenant', 'system', 'vendor'].map(role => ({
        _id: role, authorRole: role, authorName: '<author>', text: '<script>bad</script>', editedAt: '2026-11-11'
    })) });
    expect((html.match(/aria-label="Edit update"/g) || [])).toHaveLength(3);
    expect((html.match(/aria-label="Delete update"/g) || [])).toHaveLength(3);
    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(html).toContain('&lt;author&gt;');
    expect(html).toContain('(edited)');
    const css = read('property-management/css/property-management.css');
    expect(css).toContain('.maintenance-update:hover .maintenance-update-actions');
    expect(css).toContain('.maintenance-update:focus-within .maintenance-update-actions');
    expect(css).toContain('@media (hover: none) { .maintenance-update-actions');
    expect((workflow.match(/renderMaintenanceUpdates\(request\)/g) || [])).toHaveLength(3);
    expect(requests).toContain('${renderMaintenanceUpdates(request)}');
});

test('manager-attributed workflow updates display the saved name and edit/delete controls', () => {
    const { context } = setup();
    const html = context.renderMaintenanceUpdates({ updates: [{
        _id: 'workflow-update', authorRole: 'manager', authorName: 'Workflow <Manager>',
        kind: 'workflow', text: 'Workflow moved to completed.'
    }] });
    expect(html).toContain('Workflow &lt;Manager&gt;');
    expect(html).toContain('aria-label="Edit update"');
    expect(html).toContain('aria-label="Delete update"');
});

test('inline workflow updates attach the manager token while preserving the media transport', async () => {
    const { context } = setup();
    const updated = { _id: 'request-a', updates: [{ authorRole: 'manager', authorName: 'Workflow Manager' }] };
    context.MaintenanceMedia = { upload: jest.fn(async () => ({ ok: true, json: async () => updated })) };
    await context.updateMaintenanceInlineFields('property', 'request-a', { workflowStage: 'completed' }, {
        refreshProperty: false, refreshPortfolio: false
    });
    expect(context.MaintenanceMedia.upload).toHaveBeenCalledWith('/api/properties/property/maintenance/request-a', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer manager-token' },
        body: JSON.stringify({ workflowStage: 'completed' })
    });
    expect(context.fetch).not.toHaveBeenCalled();
    expect(context.state.maintenanceRequests[0]).toEqual(updated);
});

test('a media workflow save renews an expired token and retries through the same transport once', async () => {
    const { context } = setup();
    const upload = jest.fn()
        .mockResolvedValueOnce({ ok: false, status: 401 })
        .mockResolvedValueOnce({ ok: true });
    context.reauthenticateMaintenanceManager = jest.fn(async () => 'renewed-token');
    const body = { multipart: true };
    await context.managerSessionRequest('/workflow', { method: 'PUT', body }, upload);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[0][1].headers.Authorization).toBe('Bearer manager-token');
    expect(upload.mock.calls[1][1].headers.Authorization).toBe('Bearer renewed-token');
    expect(upload.mock.calls[1][1].body).toBe(body);
    expect(context.fetch).not.toHaveBeenCalled();
});

function editor(setupResult) {
    const { context, threads } = setupResult;
    const actions = { hidden: false };
    const textarea = { value: '', focus: jest.fn() };
    const cancel = {};
    const save = {};
    const original = { textContent: 'Original note', replaceWith: jest.fn() };
    const form = {
        innerHTML: '', replaceWith: jest.fn(), addEventListener: jest.fn(),
        querySelector: selector => selector === 'textarea' ? textarea : cancel,
        querySelectorAll: () => [textarea, cancel, save]
    };
    const message = {
        dataset: { maintenanceUpdateId: 'update-a' },
        querySelector: selector => selector === '.maintenance-update-text' ? original : actions,
        closest: () => threads[0]
    };
    const button = { closest: () => message, focus: jest.fn() };
    context.document.createElement.mockReturnValue(form);
    return { actions, textarea, cancel, original, form, message, button };
}

test('editing saves only text with manager credentials and updates the thread in place', async () => {
    const result = setup();
    const { context, threads, focus } = result;
    const { textarea, form, button } = editor(result);
    context.fetch.mockResolvedValue({ ok: true, json: async () => ({ updates: [{
        _id: 'update-a', authorRole: 'manager', text: 'Corrected note', editedAt: '2026-11-11'
    }] }) });
    context.editMaintenanceUpdate(button);
    textarea.value = 'Corrected note';
    await form.onsubmit({ preventDefault() {} });
    const [url, options] = context.fetch.mock.calls[0];
    expect(url).toBe('/api/properties/property/maintenance/request-a/messages/update-a');
    expect(options.method).toBe('PATCH');
    expect(options.headers.Authorization).toBe('Bearer manager-token');
    expect(JSON.parse(options.body)).toEqual({ text: 'Corrected note' });
    expect(threads[0].innerHTML).toContain('Corrected note');
    expect(threads[2].innerHTML).toBe('Existing thread');
    expect(focus.focus).toHaveBeenCalledWith({ preventScroll: true });
});

test('cancel restores the original note and editing failures keep the editor for retry', async () => {
    const result = setup();
    const { context } = result;
    const { textarea, cancel, form, original, actions, button } = editor(result);
    context.editMaintenanceUpdate(button);
    cancel.onclick();
    expect(form.replaceWith).toHaveBeenCalledWith(original);
    expect(actions.hidden).toBe(false);
    context.editMaintenanceUpdate(button);
    textarea.value = 'Correction';
    context.fetch.mockResolvedValue({ ok: false, json: async () => ({ message: 'Edit failed' }) });
    await form.onsubmit({ preventDefault() {} });
    expect(textarea.value).toBe('Correction');
    expect(textarea.disabled).toBe(false);
    expect(context.showNotification).toHaveBeenLastCalledWith('Edit failed', 'error');
});

test('deleting an update refreshes only its request and missing credentials fail visibly', async () => {
    const { context, threads } = setup();
    const message = { dataset: { maintenanceUpdateId: 'update-a' }, closest: () => threads[0], querySelectorAll: () => [] };
    const button = { closest: () => message };
    await context.deleteMaintenanceUpdate(button);
    expect(context.fetch.mock.calls[0][1].method).toBe('DELETE');
    expect(threads[2].innerHTML).toBe('Existing thread');
    context.localStorage.getItem = () => null;
    context.reauthenticateMaintenanceManager = jest.fn().mockRejectedValue(new Error('Sign-in cancelled. Your update has not been changed.'));
    await context.deleteMaintenanceUpdate(button);
    expect(context.fetch).toHaveBeenCalledTimes(1);
    expect(context.showNotification).toHaveBeenLastCalledWith('Sign-in cancelled. Your update has not been changed.', 'error');
});

function signInDialog(context) {
    const listeners = {};
    const email = { value: '' }, password = { value: '' }, error = { textContent: '' };
    const submit = {}, cancel = {};
    const fields = { '[name="email"]': email, '[name="password"]': password, '.rm-error': error, '[type="submit"]': submit, '[data-cancel]': cancel };
    const form = { reportValidity: () => true, querySelector: selector => fields[selector] };
    const dialog = {
        innerHTML: '', setAttribute: jest.fn(), remove: jest.fn(), showModal: jest.fn(),
        querySelector: () => form, addEventListener: (name, handler) => { listeners[name] = handler; },
        close: () => listeners.close()
    };
    context.document.createElement.mockReturnValue(dialog);
    context.document.body = { append: jest.fn() };
    return { form, dialog, email, password, error, cancel, submit };
}

test.each(['PATCH', 'DELETE'])('an expired session signs in in place and retries %s with the new token', async method => {
    const { context, updated, threads } = setup();
    const modal = signInDialog(context);
    let expiredResponse;
    context.fetch.mockImplementation(async url => {
        if (url === '/api/manager/signin') {
            return { ok: true, json: async () => ({ token: 'renewed-token', managerId: 'manager', managerName: 'Management' }) };
        }
        if (!expiredResponse) {
            expiredResponse = true;
            return { ok: false, status: 401, json: async () => ({ error: 'Invalid or expired session.' }) };
        }
        return { ok: true, json: async () => ({ updates: updated }) };
    });
    const pending = context.maintenanceMessageRequest('property', 'request-a', method, method === 'PATCH' ? { text: 'New note' } : null, 'update-a');
    await new Promise(setImmediate);
    expect(modal.dialog.showModal).toHaveBeenCalledTimes(1);
    expect(threads[0].innerHTML).toBe('Existing thread');
    modal.email.value = 'manager@example.test';
    modal.password.value = 'test-password';
    await modal.form.onsubmit({ preventDefault() {} });
    await pending;
    const calls = context.fetch.mock.calls;
    expect(calls.map(([url]) => url)).toEqual([
        '/api/properties/property/maintenance/request-a/messages/update-a',
        '/api/manager/signin',
        '/api/properties/property/maintenance/request-a/messages/update-a'
    ]);
    expect(calls[0][1].headers.Authorization).toBe('Bearer manager-token');
    expect(calls[2][1].headers.Authorization).toBe('Bearer renewed-token');
    expect(calls[2][1].method).toBe(method);
    expect(calls[2][1].body).toBe(calls[0][1].body);
    expect(context.localStorage.getItem('token')).toBe('renewed-token');
    expect(modal.password.value).toBe('');
    expect(threads[0].innerHTML).toContain('New note');
    expect(threads[0].scrollTop).toBe(25);
    expect(threads[2].innerHTML).toBe('Existing thread');
    expect(context.refreshContent).not.toHaveBeenCalled();
});

test('cancelling session renewal keeps the inline edit and its draft intact', async () => {
    const result = setup();
    const { context, threads } = result;
    const { textarea, form, button } = editor(result);
    context.editMaintenanceUpdate(button);
    textarea.value = 'Unsaved correction';
    context.fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'Invalid or expired session.' }) });
    const modal = signInDialog(context);
    const pending = form.onsubmit({ preventDefault() {} });
    await new Promise(setImmediate);
    modal.cancel.onclick();
    await pending;
    expect(textarea.value).toBe('Unsaved correction');
    expect(textarea.disabled).toBe(false);
    expect(threads[0].innerHTML).toBe('Existing thread');
    expect(context.fetch).toHaveBeenCalledTimes(1);
    expect(context.showNotification).toHaveBeenLastCalledWith('Sign-in cancelled. Your update has not been changed.', 'error');
});

test('failed sign-in stays in the dialog and never retries the protected operation', async () => {
    const { context } = setup();
    const modal = signInDialog(context);
    const pending = context.reauthenticateMaintenanceManager();
    expect(context.reauthenticateMaintenanceManager()).toBe(pending);
    context.fetch.mockResolvedValue({ ok: false, json: async () => ({ message: 'Invalid email or password.' }) });
    modal.email.value = 'manager@example.test';
    modal.password.value = 'wrong-password';
    await modal.form.onsubmit({ preventDefault() {} });
    expect(modal.error.textContent).toBe('Invalid email or password.');
    expect(modal.submit.disabled).toBe(false);
    expect(modal.password.value).toBe('');
    expect(modal.dialog.remove).not.toHaveBeenCalled();
    expect(context.localStorage.setItem).not.toHaveBeenCalled();
    const cancelled = expect(pending).rejects.toThrow('Sign-in cancelled');
    modal.cancel.onclick();
    await cancelled;
});

test('session renewal is attempted at most once and bearer prefixes are normalized', async () => {
    const { context } = setup();
    context.localStorage.setItem('token', ' Bearer manager-token ');
    context.fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'Invalid or expired session.' }) });
    context.reauthenticateMaintenanceManager = jest.fn(async () => 'renewed-token');
    await expect(context.maintenanceMessageRequest('property', 'request-a', 'PATCH', { text: 'Note' }, 'update-a'))
        .rejects.toThrow('Invalid or expired session.');
    expect(context.reauthenticateMaintenanceManager).toHaveBeenCalledTimes(1);
    expect(context.fetch).toHaveBeenCalledTimes(2);
    expect(context.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer manager-token');
});

test('a missing token requires sign-in before sending any protected request', async () => {
    const { context } = setup();
    context.localStorage.setItem('token', '');
    context.reauthenticateMaintenanceManager = jest.fn(async () => 'renewed-token');
    await context.maintenanceMessageRequest('property', 'request-a', 'DELETE', null, 'update-a');
    expect(context.reauthenticateMaintenanceManager).toHaveBeenCalledTimes(1);
    expect(context.fetch).toHaveBeenCalledTimes(1);
    expect(context.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer renewed-token');
});

test('permission failures do not prompt for sign-in or replay the operation', async () => {
    const { context } = setup();
    context.reauthenticateMaintenanceManager = jest.fn();
    context.fetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'Manager access required.' }) });
    await expect(context.maintenanceMessageRequest('property', 'request-a', 'DELETE', null, 'update-a'))
        .rejects.toThrow('Manager access required.');
    expect(context.reauthenticateMaintenanceManager).not.toHaveBeenCalled();
    expect(context.fetch).toHaveBeenCalledTimes(1);
});

test.each(['card', 'list'])('deleting a request fills its %s page without replacing remaining request nodes or drafts', view => {
    const source = read('property-management/js/portfolio-dashboard.js');
    const functions = source.slice(source.indexOf('function filterPortfolioMaintenanceWorkspaceItems('), source.indexOf('function renderPortfolioMaintenanceWorkspace('));
    const container = {
        children: [],
        insertBefore(node, before) {
            const existingIndex = this.children.indexOf(node);
            if (existingIndex >= 0) this.children.splice(existingIndex, 1);
            const index = before ? this.children.indexOf(before) : this.children.length;
            this.children.splice(index, 0, node);
        }
    };
    const node = id => ({
        dataset: { maintId: id }, draft: 'Keep my draft',
        remove() { container.children.splice(container.children.indexOf(this), 1); }
    });
    const remaining = node('b');
    container.children = [remaining];
    const root = { innerHTML: 'Unchanged workspace', querySelector: () => container };
    const pager = { innerHTML: '' };
    const items = ['b', 'c', 'd'].map(_id => ({ _id, projectId: 'property', title: 'Repair', status: 'pending' }));
    const state = {
        portfolioWorkspaceMode: 'maintenance', portfolioMaintenanceType: 'request', portfolioMaintenanceView: view,
        portfolioMaintenance: items, portfolioRowsPerPage: 2, portfolioComparisonPage: 1
    };
    const context = vm.createContext({
        state, document: {
            getElementById: name => ({ portfolioComparisonTable: root, portfolioComparisonPagination: pager, portfolioComparisonSearch: { value: '' } })[name],
            createElement: () => {
                const template = { content: {} };
                Object.defineProperty(template, 'innerHTML', { set: value => { template.content.firstElementChild = node(value); } });
                return template;
            }
        },
        getPortfolioFilteredProperties: () => [{ _id: 'property' }],
        getPortfolioMaintenanceFilterState: () => ({ status: '' }),
        getPortfolioMaintenanceStatusValue: item => item.status,
        portfolioPropertyId: item => item.projectId, portfolioPropertyName: () => 'Property',
        renderPortfolioMaintenanceRequestCard: item => item._id,
        renderPortfolioMaintenanceRequestRow: item => item._id,
        scheduleMaintenancePhotoHydration: jest.fn()
    });
    vm.runInContext(functions, context);
    context.refreshPortfolioMaintenanceWorkspaceAfterRemoval();
    expect(container.children.map(item => item.dataset.maintId)).toEqual(['b', 'c']);
    expect(container.children[0]).toBe(remaining);
    expect(remaining.draft).toBe('Keep my draft');
    expect(root.innerHTML).toBe('Unchanged workspace');
    expect(pager.innerHTML).toContain('Page 1 of 2 · 3 records');
    // Removing the final record on the last page clamps the page and fills it locally.
    state.portfolioComparisonPage = 2;
    state.portfolioMaintenance = items.slice(0, 2);
    container.children = [];
    context.refreshPortfolioMaintenanceWorkspaceAfterRemoval();
    expect(state.portfolioComparisonPage).toBe(1);
    expect(container.children.map(item => item.dataset.maintId)).toEqual(['b', 'c']);
    state.portfolioMaintenance = [];
    context.refreshPortfolioMaintenanceWorkspaceAfterRemoval();
    expect(root.innerHTML).toContain('No maintenance records');
    expect(pager.innerHTML).toContain('0 records');
});
