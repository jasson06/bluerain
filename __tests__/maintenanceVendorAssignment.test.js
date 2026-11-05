const fs = require('fs');
const path = require('path');
const vm = require('vm');
const mongoose = require('mongoose');
const createEstimates = require('../server/flows/maintenance-estimates');
const createSchedules = require('../server/flows/maintenance-schedules');

const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
function loadSchema(name, end) {
  const definition = source.slice(source.indexOf(`const ${name} =`), source.indexOf(end));
  return vm.runInNewContext(`${definition}\n${name}`, { mongoose });
}
const Vendor = mongoose.model('MaintenanceAssignmentTestVendor', loadSchema('vendorSchema', '// Project schema'));
const Estimate = mongoose.model('MaintenanceAssignmentTestEstimate', loadSchema('estimateSchema', '// Additional domain schemas'));
const Project = mongoose.model('Project', new mongoose.Schema({ name: String }));

function setup() {
  const project = new Project({ name: 'Test property' });
  const vendor = new Vendor({ name: 'Landscaper' });
  vendor.save = jest.fn(async () => { await vendor.validate(); return vendor; });
  const estimate = new Estimate({
    projectId: project._id, invoiceNumber: 'MS-test',
    title: 'Maintenance: Landscaping Maintenance', lineItems: [], total: 0
  });
  estimate.save = jest.fn(async () => { await estimate.validate(); return estimate; });
  const schedule = {
    _id: new mongoose.Types.ObjectId(), projectId: project, assignedVendor: vendor,
    title: 'Landscaping Maintenance', frequency: 'monthly', status: 'pending', cost: 50,
    startDate: new Date(), nextScheduledDate: new Date(), history: []
  };
  schedule.save = jest.fn(async () => schedule);
  const context = {
    Vendor: {
      findById: jest.fn(async () => vendor),
      updateMany: jest.fn(async () => ({ modifiedCount: 0 }))
    },
    Estimate: {
      findById: jest.fn(async () => estimate),
      findOne: jest.fn(async () => estimate)
    },
    MaintenanceSchedule: {
      find: jest.fn()
        .mockReturnValueOnce({ populate: async () => [schedule] })
        .mockReturnValueOnce({ populate: async () => [] })
    },
    getRecurringMaintenanceUnitLabel: async () => ''
  };
  Object.assign(context, createSchedules(context), createEstimates(context));
  context.sendTodayMaintenanceReminder = jest.fn();
  return { context, project, vendor, estimate, schedule };
}

test.each(['string', 'ObjectId', 'plain object', 'document'])(
  'vendor project assignments accept %s references without duplicates',
  async representation => {
    const { context, project, vendor } = setup();
    const reference = doc => {
      if (representation === 'string') return String(doc._id);
      if (representation === 'ObjectId') return doc._id;
      if (representation === 'plain object') return doc.toObject();
      return doc;
    };
    await context.ensureVendorProjectAssignment(reference(vendor), reference(project));
    await context.ensureVendorProjectAssignment(reference(vendor), reference(project));
    expect(vendor.assignedProjects).toHaveLength(1);
    expect(String(vendor.assignedProjects[0].projectId)).toBe(String(project._id));
    expect(vendor.assignedProjects[0].status).toBe('new');
    expect(vendor.save).toHaveBeenCalledTimes(1);
    expect(String(context.Vendor.findById.mock.calls[0][0])).toBe(String(vendor._id));
    await expect(vendor.validate()).resolves.toBeUndefined();
  }
);

test('an existing populated project assignment is not duplicated or reset', async () => {
  const { context, project, vendor } = setup();
  vendor.assignedProjects.push({ projectId: project._id, status: 'in-progress' });
  vendor.assignedProjects[0].projectId = project;
  expect(vendor.assignedProjects[0].projectId).toBe(project);
  await context.ensureVendorProjectAssignment(vendor, project);
  expect(vendor.assignedProjects).toHaveLength(1);
  expect(vendor.assignedProjects[0].status).toBe('in-progress');
  expect(vendor.save).not.toHaveBeenCalled();
});

test('automatic activation with populated references syncs one estimate item and vendor assignment', async () => {
  const { context, project, vendor, estimate, schedule } = setup();
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const activated = await context.updateNextScheduledDates();
    expect(error).not.toHaveBeenCalled();
    expect(activated).toBe(true);
    const result = await context.syncMaintenanceScheduleToEstimate(schedule, { createIfMissing: true });
    expect(result.itemCreated).toBe(false);
    expect(error).not.toHaveBeenCalled();
    expect(schedule.status).toBe('in-progress');
    expect(context.sendTodayMaintenanceReminder).toHaveBeenCalledTimes(1);
    expect(estimate.lineItems[0].items).toHaveLength(1);
    const item = estimate.lineItems[0].items[0];
    expect(String(item.assignedTo)).toBe(String(vendor._id));
    expect(String(schedule.linkedEstimateItemId)).toBe(String(item._id));
    expect(vendor.assignedProjects).toHaveLength(1);
    expect(vendor.assignedItems).toHaveLength(1);
    expect(String(vendor.assignedItems[0].projectId)).toBe(String(project._id));
    expect(vendor.assignedItems[0].itemId).toBe(String(item._id));
    expect(vendor.assignedItems[0].status).toBe('in-progress');
    expect(vendor.assignedItems[0].total).toBe(50);
    expect(context.Vendor.updateMany).toHaveBeenCalledWith(
      { _id: { $ne: String(vendor._id) }, 'assignedItems.itemId': String(item._id) },
      { $pull: { assignedItems: { itemId: String(item._id) } } }
    );
    await expect(vendor.validate()).resolves.toBeUndefined();
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
});

test('vendor persistence errors are propagated by project assignment', async () => {
  const { context, project, vendor } = setup();
  const error = new Error('Vendor persistence failed');
  vendor.save.mockRejectedValue(error);
  await expect(context.ensureVendorProjectAssignment(vendor._id, project._id)).rejects.toBe(error);
});
