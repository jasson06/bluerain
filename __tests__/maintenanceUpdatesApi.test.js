const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const createMaintenance = require('../server/flows/maintenance');
const createAuth = require('../server/flows/auth');

const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const definition = source.slice(source.indexOf('const maintenanceRequestSchema ='), source.indexOf('const documentSchema ='));
const schema = vm.runInNewContext(`${definition}\nmaintenanceRequestSchema`, {
    mongoose, MAINTENANCE_WORKFLOW_STAGES: ['submitted', 'new', 'scheduled', 'in-progress', 'completed']
});
const Maintenance = mongoose.model('MaintenanceUpdatesTest', schema);

function setup(role = 'manager') {
    const maintenance = new Maintenance({
        projectId: new mongoose.Types.ObjectId(), title: 'Repair', description: 'Repair request',
        updates: [
            { authorRole: role, authorName: 'Original author', text: 'Original update', createdAt: '2026-11-01' },
            { authorRole: 'tenant', authorName: 'Tenant', text: 'Another update' }
        ]
    });
    const original = maintenance.toObject();
    maintenance.save = jest.fn(async () => { await maintenance.validate(); return maintenance; });
    const app = express();
    app.use(express.json());
    const context = {
        app, mongoose, jwt, JWT_SECRET: 'maintenance-update-test-secret',
        MAINTENANCE_WORKFLOW_STAGES: ['new', 'scheduled', 'waiting', 'in-progress', 'completed', 'closed'],
        Manager: { findById: jest.fn(() => ({ select: () => ({ lean: async () => ({ name: 'Workflow Manager' }) }) })) },
        maintenancePhotoUpload: { array: () => (req, res, next) => next() },
        syncMaintenanceRequestToEstimate: jest.fn(async () => {}),
        MaintenanceRequest: {
            findById: jest.fn(async () => maintenance),
            findOne: jest.fn(async () => maintenance),
            findOneAndUpdate: jest.fn(async (filter, patch) => {
                const entry = maintenance.updates.id(filter.updates.$elemMatch._id);
                if (!entry || entry.text !== filter.updates.$elemMatch.text) return null;
                if (patch.$pull) entry.deleteOne();
                else {
                    entry.text = patch.$set['updates.$.text'];
                    entry.editedAt = patch.$set['updates.$.editedAt'];
                }
                await maintenance.validate();
                return maintenance;
            })
        }
    };
    Object.assign(context, createAuth(context), createMaintenance(context));
    context.patch_api_properties_propertyId_maintenance_requestId();
    context.put_api_properties_propertyId_maintenance_requestId();
    context.post_api_properties_propertyId_maintenance_requestId_messages();
    context.patch_api_properties_propertyId_maintenance_requestId_messages_updateId();
    context.delete_api_properties_propertyId_maintenance_requestId_messages_updateId();
    const token = jwt.sign({ managerId: String(new mongoose.Types.ObjectId()) }, context.JWT_SECRET);
    const base = `/api/properties/${maintenance.projectId}/maintenance/${maintenance._id}/messages`;
    const endpoint = `${base}/${maintenance.updates[0]._id}`;
    return { app, context, maintenance, original, token, endpoint, base };
}

test.each(['manager', 'tenant', 'system'])('managers can edit %s updates without changing authorship or other messages', async role => {
    const { app, maintenance, original, context, token, endpoint } = setup(role);
    const result = await request(app).patch(endpoint).set('Authorization', `Bearer ${token}`)
        .send({ text: '  Corrected text  ', authorRole: 'system', authorName: 'Replacement', createdAt: '2000-01-01' }).expect(200);
    expect(result.body.updates[0]).toMatchObject({
        text: 'Corrected text', authorRole: role, authorName: 'Original author', createdAt: '2026-11-01T00:00:00.000Z'
    });

    expect(maintenance.updates[0].editedAt).toBeInstanceOf(Date);
    expect(maintenance.updates[1].toObject()).toEqual(original.updates[1]);
    expect(context.MaintenanceRequest.findOne).toHaveBeenCalledWith({
        _id: String(maintenance._id), projectId: String(maintenance.projectId)
    });
    expect(context.MaintenanceRequest.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ updates: { $elemMatch: {
            _id: String(original.updates[0]._id), authorRole: role, text: original.updates[0].text
        } } }),
        { $set: { 'updates.$.text': 'Corrected text', 'updates.$.editedAt': expect.any(Date) } },
        { new: true, runValidators: true }
    );
    expect(maintenance.save).not.toHaveBeenCalled();
});

    test.each(['patch', 'put'])('%s workflow changes save the verified manager name instead of System', async method => {
        const { app, context, maintenance, token, base } = setup();
        const existing = maintenance.updates.toObject();
        maintenance.workflowStage = 'new';
        const result = await request(app)[method](base.replace(/\/messages$/, ''))
            .set('Authorization', `Bearer ${token}`)
            .send({ workflowStage: 'completed', authorRole: 'system', authorName: 'Forged Name', managerId: 'other' }).expect(200);
        expect(context.Manager.findById).toHaveBeenCalledWith(jwt.verify(token, context.JWT_SECRET).managerId);
        expect(result.body.updates.slice(0, 2)).toEqual(JSON.parse(JSON.stringify(existing)));
        expect(result.body.updates[2]).toMatchObject({
            authorRole: 'manager', authorName: 'Workflow Manager', kind: 'workflow', text: 'Workflow moved to completed.'
        });
        expect(result.body.updates[2]._id).toBeTruthy();
        expect(result.body.workflowStage).toBe('completed');
        expect(result.body.status).toBe('completed');
        expect(result.body.completedAt).toBeTruthy();
        expect(context.syncMaintenanceRequestToEstimate).toHaveBeenCalledWith(maintenance);
        await expect(maintenance.validate()).resolves.toBeUndefined();
        const unchanged = await request(app)[method](base.replace(/\/messages$/, ''))
            .set('Authorization', `Bearer ${token}`).send({ workflowStage: 'completed' }).expect(200);
        expect(unchanged.body.updates).toHaveLength(3);
        const reopened = await request(app)[method](base.replace(/\/messages$/, ''))
            .set('Authorization', `Bearer ${token}`).send({ workflowStage: 'new', status: 'pending' }).expect(200);
        expect(reopened.body.completedAt).toBeNull();
        expect(reopened.body.updates[3]).toMatchObject({ authorName: 'Workflow Manager', kind: 'workflow' });
    });

    test.each(['patch', 'put'])('%s workflow changes reject invalid sessions before touching a request', async method => {
        const { app, context, base } = setup();
        const endpoint = base.replace(/\/messages$/, '');
        await request(app)[method](endpoint).send({ workflowStage: 'completed' }).expect(401);
        for (const claims of [
            { managerId: String(new mongoose.Types.ObjectId()), exp: 1 },
            { tenantPortalTenantId: 'tenant' }, { vendorId: 'vendor' }
        ]) {
            const token = jwt.sign(claims, context.JWT_SECRET);
            await request(app)[method](endpoint).set('Authorization', `Bearer ${token}`).send({ workflowStage: 'completed' }).expect(401);
        }
        expect(context.MaintenanceRequest.findById).not.toHaveBeenCalled();
        expect(context.Manager.findById).not.toHaveBeenCalled();
    });

    test.each(['patch', 'put'])('%s workflow changes require an existing manager with a name', async method => {
        const { app, context, maintenance, token, base } = setup();
        context.Manager.findById
            .mockReturnValueOnce({ select: () => ({ lean: async () => null }) })
            .mockReturnValueOnce({ select: () => ({ lean: async () => ({ name: '' }) }) });
        for (const status of [401, 400]) {
            await request(app)[method](base.replace(/\/messages$/, '')).set('Authorization', `Bearer ${token}`)
                .send({ workflowStage: 'completed' }).expect(status);
        }
        expect(maintenance.save).not.toHaveBeenCalled();
        expect(context.MaintenanceRequest.findById).not.toHaveBeenCalled();
    });

    test('managers can edit and delete workflow entries without changing the request workflow', async () => {
        const { app, context, maintenance, token, endpoint } = setup();
        maintenance.updates[0].kind = 'workflow';
        const status = maintenance.status;
        const stage = maintenance.workflowStage;
        const originalUpdate = maintenance.updates[0].toObject();
        const edited = await request(app).patch(endpoint).set('Authorization', `Bearer ${token}`).send({ text: 'Corrected workflow note' }).expect(200);
        expect(edited.body.updates[0]).toMatchObject({
            authorRole: originalUpdate.authorRole, authorName: originalUpdate.authorName,
            kind: 'workflow', text: 'Corrected workflow note', createdAt: originalUpdate.createdAt.toISOString()
        });
        expect(edited.body.updates[0].editedAt).toBeTruthy();
        const deleted = await request(app).delete(endpoint).set('Authorization', `Bearer ${token}`).expect(200);
        expect(deleted.body.updates).toHaveLength(1);
        expect(maintenance.status).toBe(status);
        expect(maintenance.workflowStage).toBe(stage);
        expect(context.syncMaintenanceRequestToEstimate).not.toHaveBeenCalled();
    });

    test('true system events retain their original author', () => {
        const { context, maintenance } = setup();
        context.appendMaintenanceSystemUpdate(maintenance, 'Scheduled time cleared.');
        expect(maintenance.updates[2].toObject()).toMatchObject({ authorRole: 'system', authorName: 'System' });
        expect(maintenance.updates[2].kind).toBeUndefined();
    });
test.each(['manager', 'tenant', 'system'])('managers can delete only the targeted %s update', async role => {
    const { app, maintenance, original, token, endpoint, context } = setup(role);
    const result = await request(app).delete(endpoint).set('Authorization', `Bearer ${token}`).expect(200);
    expect(result.body.updates).toHaveLength(1);
    expect(maintenance.toObject()).toEqual({ ...original, updates: [original.updates[1]] });
    expect(context.MaintenanceRequest.findOneAndUpdate.mock.calls[0][1]).toEqual({
        $pull: { updates: { _id: String(original.updates[0]._id) } }
    });
});

test.each(['patch', 'delete'])('%s rejects anonymous, tenant, and vendor sessions', async method => {
    const { app, context, token, endpoint } = setup();
    await request(app)[method](endpoint).send({ text: 'Changed' }).expect(401);
    for (const claims of [{ tenantPortalTenantId: 'tenant' }, { vendorId: 'vendor' }]) {
        const otherToken = jwt.sign(claims, context.JWT_SECRET);
        await request(app)[method](endpoint).set('Authorization', `Bearer ${otherToken}`).send({ text: 'Changed' }).expect(401);
    }
    expect(token).toBeTruthy();
    expect(context.MaintenanceRequest.findOne).not.toHaveBeenCalled();
});

test('vendor updates remain read-only', async () => {
    const { app, context, token, endpoint } = setup('vendor');
    for (const method of ['patch', 'delete']) {
        await request(app)[method](endpoint).set('Authorization', `Bearer ${token}`).send({ text: 'Changed' }).expect(403);
    }
    expect(context.MaintenanceRequest.findOneAndUpdate).not.toHaveBeenCalled();
});

test.each(['patch', 'delete'])('%s still rejects expired tokens rather than bypassing authentication', async method => {
    const { app, context, endpoint, maintenance, original } = setup();
    const expired = jwt.sign({ managerId: String(new mongoose.Types.ObjectId()), exp: 1 }, context.JWT_SECRET);
    await request(app)[method](endpoint).set('Authorization', `Bearer ${expired}`).send({ text: 'Changed' }).expect(401);
    expect(context.MaintenanceRequest.findOne).not.toHaveBeenCalled();
    expect(maintenance.toObject()).toEqual(original);
});

test.each(['', '   ', 'x'.repeat(1201), 123, null, {}, []])('invalid text is rejected: %p', async text => {
    const { app, context, token, endpoint } = setup();
    await request(app).patch(endpoint).set('Authorization', `Bearer ${token}`).send({ text }).expect(400);
    expect(context.MaintenanceRequest.findOneAndUpdate).not.toHaveBeenCalled();
});

test.each(['patch', 'delete'])('%s scopes lookups to the property and rejects missing updates', async method => {
    const { app, context, token, endpoint, base } = setup();
    await request(app)[method](`${base}/${new mongoose.Types.ObjectId()}`).set('Authorization', `Bearer ${token}`).send({ text: 'Changed' }).expect(404);
    context.MaintenanceRequest.findOne.mockResolvedValue(null);
    await request(app)[method](endpoint).set('Authorization', `Bearer ${token}`).send({ text: 'Changed' }).expect(404);
    await request(app)[method](`${base}/invalid`).set('Authorization', `Bearer ${token}`).send({ text: 'Changed' }).expect(400);
    expect(context.MaintenanceRequest.findOneAndUpdate).not.toHaveBeenCalled();
});

test('message edits preserve concurrently posted updates rather than saving a stale updates array', async () => {
    const { app, context, maintenance, token, endpoint } = setup();
    const apply = context.MaintenanceRequest.findOneAndUpdate.getMockImplementation();
    context.MaintenanceRequest.findOneAndUpdate.mockImplementation(async (...args) => {
        maintenance.updates.push({ authorRole: 'tenant', text: 'Posted concurrently' });
        return apply(...args);
    });
    const result = await request(app).patch(endpoint).set('Authorization', `Bearer ${token}`).send({ text: 'Changed' }).expect(200);
    expect(result.body.updates).toHaveLength(3);
    expect(result.body.updates[2].text).toBe('Posted concurrently');
});

test.each(['patch', 'delete'])('%s surfaces a concurrent change instead of reporting success', async method => {
    const { app, context, maintenance, original, token, endpoint } = setup();
    context.MaintenanceRequest.findOneAndUpdate.mockResolvedValue(null);
    await request(app)[method](endpoint).set('Authorization', `Bearer ${token}`).send({ text: 'Changed' }).expect(409);
    expect(maintenance.toObject()).toEqual(original);
});

test('new messages still return persisted update IDs for subsequent editing', async () => {
    const { app, maintenance, base } = setup();
    const result = await request(app).post(base).send({ text: 'New note', authorName: 'Management' }).expect(201);
    expect(result.body.updates[2]).toMatchObject({ authorRole: 'manager', text: 'New note' });
    expect(mongoose.Types.ObjectId.isValid(result.body.updates[2]._id)).toBe(true);
    expect(maintenance.save).toHaveBeenCalledTimes(1);
});

test('database failures are logged and surfaced', async () => {
    const { app, context, token, endpoint } = setup();
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
        context.MaintenanceRequest.findOneAndUpdate.mockRejectedValue(new Error('Database offline'));
        await request(app).patch(endpoint).set('Authorization', `Bearer ${token}`).send({ text: 'Changed' }).expect(500);
        expect(log).toHaveBeenCalled();
    } finally { log.mockRestore(); }
});
