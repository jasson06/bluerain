const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const createSchedules = require('../server/flows/maintenance-schedules');

const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const schemaSource = source.slice(source.indexOf('const maintenanceScheduleSchema ='), source.indexOf('const announcementSchema ='));
const schema = vm.runInNewContext(`${schemaSource}\nmaintenanceScheduleSchema`, { mongoose });
const Schedule = mongoose.model('HistoryEditingTestSchedule', schema);

function setup() {
    const schedule = new Schedule({
        projectId: new mongoose.Types.ObjectId(), title: 'Inspection', frequency: 'monthly',
        startDate: '2026-10-10T12:00:00Z', nextScheduledDate: '2026-11-10T12:00:00Z',
        cost: 75, status: 'pending', __v: 3,
        history: [{
            completedAt: '2026-10-10T12:00:00Z', completedBy: 'Vendor', cost: 50, notes: 'Original',
            qcStatus: 'approved', estimateId: new mongoose.Types.ObjectId(),
            estimateItemId: new mongoose.Types.ObjectId(), photos: { before: ['/before.jpg'], after: ['/after.jpg'] },
            reviews: [{ status: 'approved', notes: 'Checked', reviewedAt: new Date('2026-10-11T12:00:00Z') }]
        }, { completedAt: '2026-09-10T12:00:00Z', notes: 'Older visit', qcStatus: 'legacy' }]
    });
    const original = schedule.toObject();
    schedule.save = jest.fn(async () => { await schedule.validate(); schedule.__v++; return schedule; });
    const app = express();
    app.use(express.json());
    const context = {
        app, MaintenanceSchedule: { findOne: jest.fn(async () => schedule) },
        maintenanceQC: { reviewer: jest.fn(async () => ({ _id: 'manager' })) },
        maintenanceQCError: jest.fn((res, error) => res.status(error.status || (error.name === 'VersionError' ? 409 : 500)).json({ message: error.message })),
        syncMaintenanceScheduleToEstimate: jest.fn()
    };
    const flow = createSchedules(context);
    flow.patch_api_properties_propertyId_maintenance_schedules_scheduleId_history_historyId();
    flow.delete_api_properties_propertyId_maintenance_schedules_scheduleId_history_historyId();
    const endpoint = `/api/properties/${schedule.projectId}/maintenance-schedules/${schedule._id}/history/${schedule.history[0]._id}`;
    const payload = {
        expectedVersion: 3, completedAt: '2026-10-09T11:30:00Z', completedBy: 'Updated Vendor', notes: 'Corrected', cost: 60
    };
    return { app, schedule, original, context, endpoint, payload };
}

test('editing history persists only the four editable fields and preserves QC, photos, and recurrence', async () => {
    const { app, schedule, original, context, endpoint, payload } = setup();
    const result = await request(app).patch(endpoint).send({
        ...payload, qcStatus: 'rework', photos: { before: [] }, nextScheduledDate: '2099-01-01',
        reviews: [], estimateItemId: null
    }).expect(200);
    expect(result.body.schedule.__v).toBe(4);
    expect(schedule.history[0].toObject()).toEqual({
        ...original.history[0], completedAt: new Date(payload.completedAt),
        completedBy: payload.completedBy, notes: payload.notes, cost: payload.cost
    });
    expect(schedule.history[1].toObject()).toEqual(original.history[1]);
    for (const field of ['startDate', 'nextScheduledDate', 'status', 'cost', 'createdAt', 'linkedEstimateId', 'linkedEstimateItemId']) {
        expect(schedule[field]).toEqual(original[field]);
    }
    expect(context.syncMaintenanceScheduleToEstimate).not.toHaveBeenCalled();
    expect(schedule.save).toHaveBeenCalledTimes(1);
    expect(context.maintenanceQC.reviewer).toHaveBeenCalled();
    expect(context.MaintenanceSchedule.findOne).toHaveBeenCalledWith({
        _id: String(schedule._id), projectId: String(schedule.projectId)
    });
});

test('deleting a completion removes only that history record', async () => {
    const { app, schedule, original, endpoint, context } = setup();
    const result = await request(app).delete(endpoint).send({ expectedVersion: 3 }).expect(200);
    expect(result.body.schedule.history).toHaveLength(1);
    expect(schedule.toObject()).toEqual({ ...original, __v: 4, history: [original.history[1]] });
    expect(schedule.save).toHaveBeenCalledTimes(1);
    expect(context.syncMaintenanceScheduleToEstimate).not.toHaveBeenCalled();
});

test.each([
    { completedAt: '' }, { completedAt: 'invalid' }, { completedAt: null },
    { completedBy: 10 }, { completedBy: 'x'.repeat(201) },
    { notes: {} }, { notes: 'x'.repeat(4001) },
    { cost: -1 }, { cost: '50' }, { cost: null },
    { expectedVersion: null }, { expectedVersion: -1 }, { expectedVersion: '3' }
])('rejects invalid history edits: %p', async invalid => {
    const { app, schedule, original, endpoint, payload } = setup();
    await request(app).patch(endpoint).send({ ...payload, ...invalid }).expect(400);
    expect(schedule.save).not.toHaveBeenCalled();
    expect(schedule.toObject()).toEqual(original);
});

test.each(['patch', 'delete'])('%s rejects stale history instead of overwriting it', async method => {
    const { app, schedule, original, endpoint, payload } = setup();
    await request(app)[method](endpoint).send({ ...payload, expectedVersion: 2 }).expect(409);
    expect(schedule.save).not.toHaveBeenCalled();
    expect(schedule.toObject()).toEqual(original);
});

test.each(['patch', 'delete'])('%s requires a manager session', async method => {
    const { app, schedule, context, endpoint, payload } = setup();
    context.maintenanceQC.reviewer.mockRejectedValue(Object.assign(new Error('Sign in as a manager'), { status: 401 }));
    await request(app)[method](endpoint).send(payload).expect(401);
    expect(context.MaintenanceSchedule.findOne).not.toHaveBeenCalled();
    expect(schedule.save).not.toHaveBeenCalled();
});

test.each(['patch', 'delete'])('%s returns 404 for a missing completion or property mismatch', async method => {
    const { app, schedule, context, endpoint, payload } = setup();
    await request(app)[method](`${endpoint.slice(0, endpoint.lastIndexOf('/') + 1)}${new mongoose.Types.ObjectId()}`).send(payload).expect(404);
    context.MaintenanceSchedule.findOne.mockResolvedValue(null);
    await request(app)[method](endpoint).send(payload).expect(404);
    expect(schedule.save).not.toHaveBeenCalled();
});

test('a concurrent database save conflict is surfaced explicitly', async () => {
    const { app, schedule, context, endpoint, payload } = setup();
    schedule.save.mockRejectedValue(Object.assign(new Error('Schedule changed'), { name: 'VersionError' }));
    const result = await request(app).patch(endpoint).send(payload).expect(409);
    expect(result.body.message).toBe('Schedule changed');
    expect(context.maintenanceQCError).toHaveBeenCalled();
});
