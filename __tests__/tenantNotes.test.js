const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const createAuth = require('../server/flows/auth');
const createTenants = require('../server/flows/tenants');

const serverSource = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const tenantSchema = vm.runInNewContext(
    `${serverSource.slice(serverSource.indexOf('const tenantSchema ='), serverSource.indexOf('const MAINTENANCE_WORKFLOW_STAGES ='))}\ntenantSchema`,
    { mongoose }
);
const TenantNotesModel = mongoose.model('TenantNoteAuthorsTest', tenantSchema);

function api() {
    const tenantId = String(new mongoose.Types.ObjectId());
    const noteId = String(new mongoose.Types.ObjectId());
    const notes = [
        { _id: noteId, text: 'Original', authorRole: 'manager', authorName: 'Original Manager', createdAt: '2026-11-01T00:00:00.000Z' },
        { _id: String(new mongoose.Types.ObjectId()), text: 'Other note' }
    ];
    const app = express();
    app.use(express.json());
    const lean = jest.fn(async () => ({ notesHistory: notes }));
    const select = jest.fn(() => ({ lean }));
    const managerId = String(new mongoose.Types.ObjectId());
    const managerLean = jest.fn(async () => ({ name: 'Posting Manager' }));
    const context = {
        app, mongoose, jwt, JWT_SECRET: 'tenant-notes-test-secret',
        Manager: { findById: jest.fn(() => ({ select: () => ({ lean: managerLean }) })) },
        Tenant: { findOneAndUpdate: jest.fn((filter, update) => {
            const note = filter._id === tenantId && notes.find(item => item._id === filter['notesHistory._id']);
            if (!note) return { select: () => ({ lean: async () => null }) };
            note.text = update.$set['notesHistory.$.text'];
            return { select };
        }), findByIdAndUpdate: jest.fn((id, patch) => {
            const doc = new TenantNotesModel({ notesHistory: [patch.$push.notesHistory] });
            notes.push(doc.toObject().notesHistory[0]);
            return { select };
        }) }
    };
    Object.assign(context, createAuth(context));
    const flow = createTenants(context);
    flow.patch_api_tenants_id_notes_noteId();
    flow.post_api_tenants_id_notes();
    const token = jwt.sign({ managerId }, context.JWT_SECRET);
    return { app, context, token, managerId, managerLean, tenantId, noteId, notes, lean, select, endpoint: `/api/tenants/${tenantId}/notes/${noteId}` };
}

test('posting a tenant note persists the authenticated manager name and role through the real schema', async () => {
    const { app, context, token, managerId, tenantId, notes } = api();
    const oldNotes = notes.slice();
    const response = await request(app).post(`/api/tenants/${tenantId}/notes`).set('Authorization', `Bearer ${token}`)
        .send({ text: '  New note  ', authorRole: 'tenant', authorName: 'Impersonated Manager', managerId: 'other' }).expect(200);
    expect(context.Manager.findById).toHaveBeenCalledWith(managerId);
    expect(context.Tenant.findByIdAndUpdate).toHaveBeenCalledWith(tenantId, {
        $push: { notesHistory: { text: 'New note', authorRole: 'manager', authorName: 'Posting Manager', createdAt: expect.any(Date) } }
    }, { new: true, runValidators: true });
    expect(response.body.notes.slice(0, 2)).toEqual(oldNotes);
    expect(response.body.notes[2]).toMatchObject({ text: 'New note', authorRole: 'manager', authorName: 'Posting Manager' });
    expect(response.body.notes[2]._id).toBeTruthy();
    expect(response.body.notes[2].createdAt).toBeTruthy();
});

test.each(['', ' ', null, 123, {}, []])('posting rejects invalid note text %p', async text => {
    const { app, context, token, tenantId } = api();
    await request(app).post(`/api/tenants/${tenantId}/notes`).set('Authorization', `Bearer ${token}`).send({ text }).expect(400);
    expect(context.Tenant.findByIdAndUpdate).not.toHaveBeenCalled();
});

test('posting notes rejects unsigned, expired and nonmanager sessions', async () => {
    const { app, context, tenantId } = api();
    const endpoint = `/api/tenants/${tenantId}/notes`;
    await request(app).post(endpoint).send({ text: 'New note' }).expect(401);
    for (const claims of [
        { managerId: String(new mongoose.Types.ObjectId()), exp: 1 },
        { tenantPortalTenantId: 'tenant' }, { vendorId: 'vendor' }
    ]) {
        const token = jwt.sign(claims, context.JWT_SECRET);
        await request(app).post(endpoint).set('Authorization', `Bearer ${token}`).send({ text: 'New note' }).expect(401);
    }
    expect(context.Manager.findById).not.toHaveBeenCalled();
    expect(context.Tenant.findByIdAndUpdate).not.toHaveBeenCalled();
});

test('missing manager accounts or profile names cannot silently create unattributed notes', async () => {
    const { app, context, managerLean, token, tenantId } = api();
    managerLean.mockResolvedValueOnce(null).mockResolvedValueOnce({ name: '   ' });
    for (const status of [401, 400]) {
        await request(app).post(`/api/tenants/${tenantId}/notes`).set('Authorization', `Bearer ${token}`).send({ text: 'New note' }).expect(status);
    }
    expect(context.Tenant.findByIdAndUpdate).not.toHaveBeenCalled();
});

test('posting reports missing tenants and invalid IDs without a success fallback', async () => {
    const { app, token, lean, tenantId } = api();
    await request(app).post('/api/tenants/invalid/notes').set('Authorization', `Bearer ${token}`).send({ text: 'New note' }).expect(400);
    lean.mockResolvedValueOnce(null);
    await request(app).post(`/api/tenants/${tenantId}/notes`).set('Authorization', `Bearer ${token}`).send({ text: 'New note' }).expect(404);
});

test('editing a tenant note changes only its text and preserves its ID, timestamp, and other notes', async () => {
    const { app, context, token, tenantId, noteId, notes, select, endpoint } = api();
    const other = { ...notes[1] };
    const response = await request(app).patch(endpoint).set('Authorization', `Bearer ${token}`)
        .send({ text: '  Corrected  ', createdAt: '2000-01-01', _id: 'replacement' }).expect(200);
    expect(response.body.notes).toEqual([
        { _id: noteId, text: 'Corrected', authorRole: 'manager', authorName: 'Original Manager', createdAt: '2026-11-01T00:00:00.000Z' }, other
    ]);
    expect(context.Tenant.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: tenantId, 'notesHistory._id': noteId },
        { $set: { 'notesHistory.$.text': 'Corrected' } },
        { new: true, runValidators: true }
    );
    expect(select).toHaveBeenCalledWith('notesHistory');
});

test.each(['', '   ', null, 123, {}, []])('tenant note edits reject invalid text %p', async text => {
    const { app, context, token, endpoint } = api();
    await request(app).patch(endpoint).set('Authorization', `Bearer ${token}`).send({ text }).expect(400);
    expect(context.Tenant.findOneAndUpdate).not.toHaveBeenCalled();
});

test('tenant note edits scope the note ID to its tenant and validate both IDs', async () => {
    const { app, token, tenantId, noteId } = api();
    for (const [id, note, status] of [
        ['invalid', noteId, 400], [tenantId, 'invalid', 400],
        [tenantId, String(new mongoose.Types.ObjectId()), 404],
        [String(new mongoose.Types.ObjectId()), noteId, 404]
    ]) {
        await request(app).patch(`/api/tenants/${id}/notes/${note}`)
            .set('Authorization', `Bearer ${token}`).send({ text: 'Changed' }).expect(status);
    }
});

test('anonymous, expired, tenant, and vendor sessions cannot edit tenant notes', async () => {
    const { app, context, endpoint } = api();
    await request(app).patch(endpoint).send({ text: 'Changed' }).expect(401);
    for (const claims of [
        { managerId: String(new mongoose.Types.ObjectId()), exp: 1 },
        { tenantPortalTenantId: 'tenant' }, { vendorId: 'vendor' }
    ]) {
        const token = jwt.sign(claims, context.JWT_SECRET);
        await request(app).patch(endpoint).set('Authorization', `Bearer ${token}`).send({ text: 'Changed' }).expect(401);
    }
    expect(context.Tenant.findOneAndUpdate).not.toHaveBeenCalled();
});

test('database failures are logged and surfaced rather than reported as a successful edit', async () => {
    const { app, token, lean, endpoint } = api();
    const error = new Error('Database unavailable');
    lean.mockRejectedValueOnce(error);
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
        const response = await request(app).patch(endpoint).set('Authorization', `Bearer ${token}`).send({ text: 'Changed' }).expect(500);
        expect(response.body.message).toBe('Internal server error');
        expect(log).toHaveBeenCalledWith('Edit tenant note error:', error);
    } finally {
        log.mockRestore();
    }
});

function ui() {
    const original = { textContent: 'Original', replaceWith: jest.fn(), dataset: { tenantId: 'tenant-a', noteId: 'note-a' } };
    const copy = { textContent: 'Original', dataset: { tenantId: 'tenant-a', noteId: 'note-a' } };
    const other = { textContent: 'Other', dataset: { tenantId: 'tenant-b', noteId: 'note-a' } };
    const input = { value: '', focus: jest.fn() };
    const save = {}, cancel = {}, deleteButton = {};
    const listeners = {};
    const form = {
        dataset: {}, replaceWith: jest.fn(),
        querySelector: selector => selector === 'textarea' ? input : cancel,
        querySelectorAll: () => [input, save, cancel],
        addEventListener: (name, handler) => { listeners[name] = handler; }
    };
    const message = {
        dataset: { noteId: 'note-a' },
        querySelector: selector => selector === '[data-tenant-note-text]' ? original : deleteButton
    };
    const button = { dataset: { tenantId: 'tenant-a' }, closest: () => message, focus: jest.fn() };
    const notes = [{ _id: 'note-a', text: 'Corrected <note>', createdAt: '2026-11-01' }];
    const compose = { value: 'Unsent new note' };
    const otherTenant = { _id: 'tenant-b', notesHistory: [] };
    const context = vm.createContext({
        state: {
            tenants: [{ _id: 'tenant-a', notesHistory: [] }, otherTenant],
            allTenants: [{ _id: 'tenant-a', notesHistory: [] }, otherTenant]
        },
        document: {
            createElement: jest.fn(() => form),
            querySelectorAll: jest.fn(() => [original, copy, other]),
            getElementById: jest.fn(() => compose)
        },
        API_URL: '/api', console: { error: jest.fn() },
        managerSessionRequest: jest.fn(async () => ({ ok: true, json: async () => ({ notes }) })),
        showNotification: jest.fn(), invalidateCache: jest.fn(),
        escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/property-management/js/notes.js'), 'utf8'), context);
    const event = () => ({ preventDefault: jest.fn(), stopPropagation: jest.fn() });
    return { context, original, copy, other, input, save, cancel, deleteButton, listeners, form, message, button, notes, compose, otherTenant, event };
}

test('saving edits updates all visible copies and tenant stores without resetting the section or new-note draft', async () => {
    const { context, button, event, input, form, original, copy, other, compose, notes, otherTenant, deleteButton } = ui();
    context.editTenantNote(event(), button);
    expect(input.value).toBe('Original');
    expect(deleteButton.disabled).toBe(true);
    input.value = '  Corrected <note>  ';
    await form.onsubmit(event());
    expect(context.managerSessionRequest).toHaveBeenCalledWith('/api/tenants/tenant-a/notes/note-a', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Corrected <note>' })
    });
    expect(context.state.tenants[0].notesHistory).toEqual(notes);
    expect(context.state.allTenants[0].notesHistory).toEqual(notes);
    expect(context.state.tenants[1]).toBe(otherTenant);
    expect(original.textContent).toBe('Corrected <note>');
    expect(copy.textContent).toBe('Corrected <note>');
    expect(other.textContent).toBe('Other');
    expect(compose.value).toBe('Unsent new note');
    expect(context.document.getElementById).not.toHaveBeenCalled();
    expect(form.replaceWith).toHaveBeenCalledWith(original);
    expect(deleteButton.disabled).toBe(false);
    expect(button.focus).toHaveBeenCalledWith({ preventScroll: true });
});

test.each(['cancel', 'escape'])('%s leaves the original tenant note unchanged', action => {
    const { context, event, button, input, cancel, listeners, form, original, message } = ui();
    context.editTenantNote(event(), button);
    input.value = 'Unsaved correction';
    if (action === 'cancel') cancel.onclick();
    else listeners.keydown({ key: 'Escape', ...event() });
    expect(form.replaceWith).toHaveBeenCalledWith(original);
    expect(original.textContent).toBe('Original');
    expect(message.dataset.editing).toBeUndefined();
    expect(context.managerSessionRequest).not.toHaveBeenCalled();
});

test('failed edits preserve the draft and permit retry; duplicate saves are blocked', async () => {
    const { context, button, event, input, save, form, original } = ui();
    context.editTenantNote(event(), button);
    input.value = 'Correction draft';
    let finish;
    context.managerSessionRequest.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const pending = form.onsubmit(event());
    await form.onsubmit(event());
    expect(context.managerSessionRequest).toHaveBeenCalledTimes(1);
    expect(save.disabled).toBe(true);
    finish({ ok: false, json: async () => ({ message: 'Save failed' }) });
    await pending;
    expect(input.value).toBe('Correction draft');
    expect(save.disabled).toBe(false);
    expect(original.textContent).toBe('Original');
    expect(form.replaceWith).not.toHaveBeenCalled();
    expect(context.showNotification).toHaveBeenLastCalledWith('Save failed', 'error');
    expect(context.invalidateCache).not.toHaveBeenCalled();
});

test('blank notes and invalid response shapes never report success', async () => {
    const { context, button, event, input, form } = ui();
    context.editTenantNote(event(), button);
    input.value = '   ';
    await form.onsubmit(event());
    expect(context.managerSessionRequest).not.toHaveBeenCalled();
    expect(context.showNotification).toHaveBeenLastCalledWith('Note text is required', 'error');
    input.value = 'Correction';
    context.managerSessionRequest.mockResolvedValue({ ok: true, json: async () => ({ notes: [] }) });
    await form.onsubmit(event());
    expect(context.showNotification).toHaveBeenLastCalledWith('The server did not return the edited note.', 'error');
    expect(form.replaceWith).not.toHaveBeenCalled();
});

test('only tenant notes get edit controls in shared drawers and the sidebar', () => {
    const { context } = ui();
    const body = { innerHTML: '', querySelectorAll: () => [] };
    const list = { innerHTML: '', querySelectorAll: () => [] };
    const nodes = {
        notesDrawerBody: body, portfolioNotesList: list,
        portfolioNotesSidebar: { style: {} }, portfolioNotesMeta: {},
        portfolioNotesForm: { style: {} }, portfolioNotesInput: {}
    };
    context.document.getElementById.mockImplementation(id => nodes[id]);
    const notes = [{ _id: 'note-a', text: '<note>', authorRole: 'manager', authorName: 'Saved <Manager>' }];
    context.state.notesDrawerContext = { type: 'tenant', id: 'tenant-a' };
    context.renderNotesDrawerMessages(notes);
    expect(body.innerHTML).toContain('class="notes-drawer-edit tenant-note-edit"');
    expect(body.innerHTML).toContain('data-tenant-note-text');
    expect(body.innerHTML).toContain('Saved &lt;Manager&gt;');
    context.state.notesDrawerContext = { type: 'application', id: 'application-a' };
    context.renderNotesDrawerMessages(notes);
    expect(body.innerHTML).not.toContain('tenant-note-edit');
    context.state.allTenants[0].notesHistory = notes;
    context.state.portfolioNotesContext = { type: 'tenant', id: 'tenant-a' };
    context.renderPortfolioNotesPanel();
    expect(list.innerHTML).toContain('class="portfolio-notes-edit tenant-note-edit"');
    expect(list.innerHTML).toContain('data-tenant-note-text');
    expect(list.innerHTML).toContain('Saved &lt;Manager&gt;');
});

test.each(['card', 'sidebar', 'drawer'])('%s tenant note posting uses the manager session and keeps returned authorship', async surface => {
    const notes = [{ _id: 'note-a', text: 'New note', authorRole: 'manager', authorName: 'Posting Manager' }];
    const input = { value: 'New note' };
    const submit = {};
    const form = {
        dataset: {},
        querySelector: selector => selector.startsWith('input') ? input : submit,
        addEventListener: jest.fn()
    };
    let drawerSubmit;
    const context = vm.createContext({
        state: {
            tenants: [{ _id: 'tenant-a', notesHistory: [] }],
            allTenants: [{ _id: 'tenant-a', notesHistory: [] }],
            notesDrawerContext: { type: 'tenant', id: 'tenant-a' },
            portfolioNotesContext: { type: 'tenant', id: 'tenant-a' }
        },
        document: { getElementById: () => ({ addEventListener: (name, handler) => { drawerSubmit = handler; } }) },
        managerSessionRequest: jest.fn(async () => ({ ok: true, json: async () => ({ notes }) })),
        fetch: jest.fn(), console: { error: jest.fn() }, showNotification: jest.fn(),
        localStorage: { getItem: () => 'Different Viewer' },
        renderTenants: jest.fn(), renderUnifiedPortfolioWorkspace: jest.fn(),
        renderNotesDrawerMessages: jest.fn(), setNotesDrawerLoading: jest.fn()
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/property-management/js/notes.js'), 'utf8'), context);
    context.renderPortfolioNotesPanel = jest.fn();
    context.getNotesDrawerElements = () => ({ inputEl: input });
    context.setNotesDrawerLoading = jest.fn();
    context.renderNotesDrawerMessages = jest.fn();
    const source = fs.readFileSync(path.join(__dirname, '../dist/property-management/js/tenants.js'), 'utf8');
    vm.runInContext(source.slice(source.indexOf('async function sendTenantCardNote('), source.indexOf('async function deleteTenantCardNote(')), context);
    if (surface === 'card') {
        await context.sendTenantCardNote({ preventDefault() {}, currentTarget: form }, 'tenant-a');
    } else if (surface === 'sidebar') {
        await context.savePortfolioNote('New note');
    } else {
        const startup = fs.readFileSync(path.join(__dirname, '../dist/property-management/js/property-management.js'), 'utf8');
        vm.runInContext(startup.slice(startup.indexOf("document.getElementById('notesDrawerForm')?.addEventListener"), startup.indexOf('// Handle Edit Invite modal submit')), context);
        await drawerSubmit({ preventDefault() {} });
    }
    expect(context.fetch).not.toHaveBeenCalled();
    expect(context.managerSessionRequest).toHaveBeenCalledTimes(1);
    const [url, options] = context.managerSessionRequest.mock.calls[0];
    expect(url).toBe('/api/tenants/tenant-a/notes');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body).text).toBe('New note');
    expect(context.state.tenants[0].notesHistory).toEqual(notes);
    expect(context.state.allTenants[0].notesHistory).toEqual(notes);
});
