const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const withMaintenanceInvoices = require('../server/maintenance-invoices');
const createMaintenance = require('../server/flows/maintenance');
const createSchedules = require('../server/flows/maintenance-schedules');
const createInvoices = require('../server/flows/invoices');

const id = () => new mongoose.Types.ObjectId();
function invoiceModel(invoices = []) {
  return { find: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn(async () => invoices)
  })) };
}
const linked = (estimateId, itemId, extra = {}) => ({ linkedEstimateId: estimateId, linkedEstimateItemId: itemId, ...extra });

test('matches exact estimate/item pairs and sums only matching lines across multiple invoices', async () => {
  const estimateId = id(), itemId = id(), otherEstimate = id(), otherItem = id();
  const invoices = [
    { _id: id(), invoiceNumber: 'INV-1', status: 'Pending', date: '2026-11-11', total: 9999,
      lineItems: [
        { estimateId, itemId, total: 25 }, { estimateId, itemId, total: 15 },
        { estimateId, itemId: otherItem, total: 900 }, { estimateId: otherEstimate, itemId, total: 800 }
      ] },
    { _id: id(), invoiceNumber: 'INV-2', status: 'Paid', lineItems: [{ estimateId, itemId, total: 60 }] },
    // Both IDs occur in this invoice, but never together on the same line.
    { _id: id(), lineItems: [{ estimateId, itemId: otherItem, total: 900 }, { estimateId: otherEstimate, itemId, total: 800 }] }
  ];
  const Invoice = invoiceModel(invoices);
  const original = linked(estimateId, itemId);
  const result = await withMaintenanceInvoices(Invoice, [original, original]);
  expect(result[0].invoices).toEqual([
    { _id: invoices[0]._id, invoiceNumber: 'INV-1', status: 'Pending', date: '2026-11-11', amount: 40 },
    { _id: invoices[1]._id, invoiceNumber: 'INV-2', status: 'Paid', date: undefined, amount: 60 }
  ]);
  expect(result[1].invoices).toEqual(result[0].invoices);
  expect(original.invoices).toBeUndefined();
  expect(Invoice.find).toHaveBeenCalledTimes(1);
  expect(Invoice.find).toHaveBeenCalledWith({
    $or: [{ lineItems: { $elemMatch: { estimateId, itemId } } }]
  });
});

test('schedule summaries include completed visits while occurrences retain only their own invoices', async () => {
  const estimateId = id(), currentItem = id(), pastItem = id(), otherItem = id();
  const schedule = linked(estimateId, currentItem, {
    history: [
      { estimateId, estimateItemId: pastItem },
      { estimateId, estimateItemId: otherItem },
      { completedAt: '2025-01-01' }
    ]
  });
  const Invoice = invoiceModel([
    { _id: id(), invoiceNumber: 'CURRENT', lineItems: [{ estimateId, itemId: currentItem, total: 50 }] },
    { _id: id(), invoiceNumber: 'PAST', lineItems: [{ estimateId, itemId: pastItem, total: 75 }] }
  ]);
  const result = await withMaintenanceInvoices(Invoice, schedule);
  expect(result.invoices.map(invoice => invoice.invoiceNumber)).toEqual(['CURRENT', 'PAST']);
  expect(result.history.map(entry => entry.invoices.map(invoice => invoice.invoiceNumber))).toEqual([['PAST'], [], []]);
  expect(schedule.history[0].invoices).toBeUndefined();
});

test('a completed visit invoice stays visible after completion clears the current item link', async () => {
  const estimateId = id(), itemId = id();
  const invoice = { _id: id(), invoiceNumber: 'COMPLETED', status: 'Pending', lineItems: [{ estimateId, itemId, total: 60 }] };
  const schedule = linked(estimateId, null, {
    history: [{ _id: id(), completedAt: '2026-11-10T01:44:16Z', estimateId, estimateItemId: itemId }]
  });
  const result = await withMaintenanceInvoices(invoiceModel([invoice]), schedule);
  expect(result.linkedEstimateItemId).toBeNull();
  expect(result.invoices).toEqual(result.history[0].invoices);
  expect(result.invoices[0]).toMatchObject({ invoiceNumber: 'COMPLETED', status: 'Pending', amount: 60 });
});

test('a multi-visit invoice is listed once on the schedule without double-counting a current/history overlap', async () => {
  const estimateId = id(), firstItem = id(), secondItem = id();
  const invoice = { _id: id(), lineItems: [
    { estimateId, itemId: firstItem, total: 60 },
    { estimateId, itemId: secondItem, total: 40 },
    { estimateId, itemId: id(), total: 999 }
  ] };
  const result = await withMaintenanceInvoices(invoiceModel([invoice]), linked(estimateId, secondItem, {
    history: [{ estimateId, estimateItemId: firstItem }, { estimateId, estimateItemId: secondItem }]
  }));
  expect(result.invoices).toHaveLength(1);
  expect(result.invoices[0].amount).toBe(100);
  expect(result.history.map(entry => entry.invoices[0].amount)).toEqual([60, 40]);
});

test('unlinked work avoids querying invoices and returns explicit empty arrays', async () => {
  const Invoice = invoiceModel();
  expect(await withMaintenanceInvoices(Invoice, [{}, { linkedEstimateId: id(), history: [{}] }]))
    .toEqual([{ invoices: [] }, expect.objectContaining({ invoices: [], history: [{ invoices: [] }] })]);
  expect(Invoice.find).not.toHaveBeenCalled();
});

test('links reflect invoice edits, deletion, and re-categorization on the next read', async () => {
  const estimateId = id(), itemId = id();
  const invoice = { _id: id(), status: 'Pending', lineItems: [{ estimateId, itemId, total: 10 }] };
  const rows = [invoice], Invoice = invoiceModel(rows);
  const record = linked(estimateId, itemId);
  expect((await withMaintenanceInvoices(Invoice, record)).invoices[0].amount).toBe(10);
  invoice.status = 'Paid';
  invoice.lineItems[0].total = 20;
  expect((await withMaintenanceInvoices(Invoice, record)).invoices[0]).toMatchObject({ amount: 20, status: 'Paid' });
  invoice.lineItems[0].itemId = id();
  expect((await withMaintenanceInvoices(Invoice, record)).invoices).toEqual([]);
  rows.length = 0;
  expect((await withMaintenanceInvoices(Invoice, record)).invoices).toEqual([]);
});

test('mongoose records are enriched without changing persisted documents', async () => {
  const Model = mongoose.model('InvoiceLinkedMaintenanceTest', new mongoose.Schema({
    linkedEstimateId: mongoose.Schema.Types.ObjectId, linkedEstimateItemId: mongoose.Schema.Types.ObjectId,
    history: [{ estimateId: mongoose.Schema.Types.ObjectId, estimateItemId: mongoose.Schema.Types.ObjectId }]
  }));
  const record = new Model(linked(id(), id(), { history: [{ estimateId: id(), estimateItemId: id() }] }));
  const original = record.toObject();
  const result = await withMaintenanceInvoices(invoiceModel(), record);
  expect(result.invoices).toEqual([]);
  expect(result.history[0].invoices).toEqual([]);
  expect(record.toObject()).toEqual(original);
});

function query(rows) {
  const result = {
    populate: () => result, sort: () => result,
    then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject)
  };
  return result;
}

test.each([
  ['get_api_properties_maintenance', '/api/properties/maintenance', createMaintenance, 'MaintenanceRequest'],
  ['get_api_properties_propertyId_maintenance', '/api/properties/property/maintenance', createMaintenance, 'MaintenanceRequest'],
  ['get_api_properties_maintenance_schedules', '/api/properties/maintenance-schedules', createSchedules, 'MaintenanceSchedule'],
  ['get_api_properties_propertyId_maintenance_schedules', '/api/properties/property/maintenance-schedules', createSchedules, 'MaintenanceSchedule']
])('%s exposes invoice summaries', async (registration, endpoint, factory, model) => {
  const estimateId = id(), itemId = id();
  const app = express();
  const context = {
    app, [model]: { find: () => query([linked(estimateId, itemId)]) },
    Invoice: invoiceModel([{ _id: id(), invoiceNumber: 'INV-API', status: 'Approved', lineItems: [{ estimateId, itemId, total: 30 }] }])
  };
  factory(context)[registration]();
  const response = await request(app).get(endpoint).expect(200);
  expect(response.body[0].invoices[0]).toMatchObject({ invoiceNumber: 'INV-API', amount: 30, status: 'Approved' });
});

test('completion details resolve only that entry invoice even when the current visit is linked', async () => {
  const estimateId = id(), itemId = id(), currentItemId = id();
  const entry = { estimateId, estimateItemId: itemId, notes: 'Completed' };
  const schedule = linked(estimateId, currentItemId, { history: { id: () => entry } });
  const app = express();
  createSchedules({
    app, MaintenanceSchedule: { findOne: async () => schedule },
    maintenanceQC: { historyDetails: async () => ({ ...entry, photoSource: 'saved' }) },
    maintenanceQCError: (res, error) => res.status(500).json({ message: error.message }),
    Invoice: invoiceModel([{ _id: id(), invoiceNumber: 'VISIT', lineItems: [{ estimateId, itemId, total: 42 }] }])
  }).get_api_properties_propertyId_maintenance_schedules_scheduleId_history_historyId();
  const response = await request(app).get('/api/properties/p/maintenance-schedules/s/history/e').expect(200);
  expect(response.body).toMatchObject({ notes: 'Completed', photoSource: 'saved', invoices: [{ invoiceNumber: 'VISIT', amount: 42 }] });
});

test('invoice lookup failures are surfaced instead of showing Not invoiced', async () => {
  const app = express();
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  createMaintenance({
    app, MaintenanceRequest: { find: () => query([linked(id(), id())]) },
    Invoice: { find: () => { throw new Error('Database offline'); } }
  }).get_api_properties_maintenance();
  await request(app).get('/api/properties/maintenance').expect(500);
  expect(error).toHaveBeenCalled();
  error.mockRestore();
});

test('invoice ID lookup handles duplicate or blank invoice numbers and validates missing IDs', async () => {
  const app = express(), invoiceId = id();
  const invoice = { _id: invoiceId, invoiceNumber: '', lineItems: [] };
  const Invoice = { findById: jest.fn(async () => invoice) };
  createInvoices({ app, Invoice, mongoose }).get_api_invoices_id();
  const response = await request(app).get(`/api/invoices/${invoiceId}`).expect(200);
  expect(response.body.invoice._id).toBe(String(invoiceId));
  expect(Invoice.findById).toHaveBeenCalledWith(String(invoiceId));
  await request(app).get('/api/invoices/invalid').expect(400);
  Invoice.findById.mockResolvedValue(null);
  await request(app).get(`/api/invoices/${id()}`).expect(404);
});

test('creating an invoice persists the imported IDs and immediately makes it traceable from maintenance', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const definition = source.slice(source.indexOf('const invoiceSchema ='), source.indexOf('const quoteSchema ='));
  const schema = vm.runInNewContext(`${definition}\ninvoiceSchema`, { mongoose });
  const Document = mongoose.model('MaintenanceInvoiceCreationTest', schema);
  const saved = [];
  function Invoice(data) {
    const doc = new Document(data);
    doc.save = async () => {
      await doc.validate();
      saved.push(doc.toObject());
      return doc;
    };
    return doc;
  }
  Invoice.find = invoiceModel(saved).find;
  const app = express();
  app.use(express.json());
  const context = {
    app, Invoice,
    normalizeOptionalObjectId: value => value ? new mongoose.Types.ObjectId(value) : undefined,
    invoiceLineItemsReadyForApproval: () => true
  };
  Object.assign(context, createInvoices(context));
  context.post_api_create();
  context.get_api_invoices_id();
  const estimateId = id(), itemId = id(), projectId = id();
  const created = await request(app).post('/api/create').send({
    projectId, invoiceNumber: 'INV-NEW', vendorId: String(id()), date: '2026-11-11',
    lineItems: [{ projectId, estimateId, itemId, name: 'Repair', quantity: 1, unitPrice: 75, total: 75 }]
  }).expect(201);
  expect(saved[0].lineItems[0].estimateId).toEqual(estimateId);
  expect(saved[0].lineItems[0].itemId).toEqual(itemId);
  const maintenance = await withMaintenanceInvoices(Invoice, linked(estimateId, itemId));
  expect(String(maintenance.invoices[0]._id)).toBe(created.body._id);
  expect(maintenance.invoices[0]).toMatchObject({ invoiceNumber: 'INV-NEW', status: 'Pending', amount: 75 });
});

function historyUi(globals = {}) {
  const context = vm.createContext({
    window: {}, document: { addEventListener: jest.fn(), documentElement: {} },
    MutationObserver: class { observe() {} },
    ...globals
  });
  const source = fs.readFileSync(path.join(__dirname, '../dist/maintenance-history.js'), 'utf8');
  vm.runInContext(source.replace(
    '{ render, historyButton, summary, qcBadge }',
    '{ render, historyButton, summary, qcBadge, load }'
  ), context);
  return context.window.RecurringMaintenanceHistory;
}

test('switching selected history replaces visit invoices without showing the schedule-wide aggregate', async () => {
  const firstInvoice = { _id: 'invoice-first', invoiceNumber: 'FIRST-VISIT', status: 'Paid', amount: 60 };
  const secondInvoice = { _id: 'invoice-second', invoiceNumber: 'SECOND-VISIT', status: 'Pending', amount: 40 };
  const history = [
    { _id: 'first', completedAt: '2026-11-10', qcStatus: 'approved', invoices: [firstInvoice] },
    { _id: 'second', completedAt: '2026-10-10', qcStatus: 'approved', invoices: [secondInvoice] },
    { _id: 'unbilled', completedAt: '2026-09-10', qcStatus: 'approved', invoices: [] }
  ];
  const fetch = jest.fn(async endpoint => ({
    ok: true, json: async () => history.find(entry => endpoint.endsWith(`/${entry._id}`))
  }));
  const ui = historyUi({ fetch });
  ui.render({ _id: 'schedule', projectId: 'property', history, invoices: [firstInvoice, secondInvoice] });
  const target = { innerHTML: '', textContent: '' };
  const panel = {
    dataset: { schedule: 'schedule', selected: 'first' }, isConnected: true,
    closest: () => null, querySelector: () => target
  };
  await ui.load(panel);
  expect(target.innerHTML).toContain('class="maintenance-invoices"');
  expect(target.innerHTML).toContain('FIRST-VISIT');
  expect(target.innerHTML).not.toContain('SECOND-VISIT');
  panel.dataset.selected = 'second';
  await ui.load(panel);
  expect(target.innerHTML).toContain('SECOND-VISIT');
  expect(target.innerHTML).not.toContain('FIRST-VISIT');
  panel.dataset.selected = 'unbilled';
  await ui.load(panel);
  expect(target.innerHTML).toContain('Not invoiced');
  expect(target.innerHTML).not.toContain('FIRST-VISIT');
  expect(target.innerHTML).not.toContain('SECOND-VISIT');
  expect(fetch).toHaveBeenLastCalledWith('/api/properties/property/maintenance-schedules/schedule/history/unbilled', { cache: 'no-store' });
});

test('invoice UI renders multiple exact-ID links, item amounts, statuses, and escaped text', () => {
  const ui = historyUi();
  const html = ui.renderInvoices([
    { _id: 'first', invoiceNumber: '<INV>', status: 'Pending', amount: 12.5 },
    { _id: 'second', invoiceNumber: '', status: 'Paid', amount: 25 }
  ]);
  expect(html).toContain('&lt;INV&gt;');
  expect(html).not.toContain('<INV>');
  expect(html).toContain('$12.50');
  expect(html).toContain('Pending');
  expect(html).toContain('Paid');
  expect(html).toContain('/invoice-creater.html?invoiceId=first');
  expect(html).toContain('/invoice-creater.html?invoiceId=second');
  expect(html).toContain('>&lt;INV&gt;</a>');
  expect(html).toContain('>Invoice</a>');
  expect((html.match(/<a /g) || [])).toHaveLength(2);
  expect(html).not.toContain('>View Invoice<');
  expect(ui.renderInvoices([])).toContain('Not invoiced');
  expect(ui.renderInvoices([], 'Current visit invoices')).toContain('Current visit invoices');
});

test('completed date entries show their invoice number and status without nesting preview links inside buttons', () => {
  const ui = historyUi();
  const html = ui.render({
    _id: 'schedule', history: [
      { _id: 'invoiced', completedAt: '2026-11-10', invoices: [{ invoiceNumber: '<VISIT>', status: 'Pending' }] },
      { _id: 'not-invoiced', completedAt: '2026-10-10', invoices: [] }
    ]
  });
  expect(html).toContain('Invoice &lt;VISIT&gt; &middot; Pending');
  expect(html).not.toContain('Invoice <VISIT>');
  expect((html.match(/class="rm-date-invoice"/g) || [])).toHaveLength(1);
  expect(html).not.toContain('<a ');
});

test('invoice deep links open the preview without a vendor login ID', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../dist/invoice-creater.html'), 'utf8');
  const source = html.slice(html.indexOf('window.onload ='), html.indexOf('let lineItems = []'));
  const context = vm.createContext({
    window: { location: { search: '?invoiceId=exact-invoice' } }, URLSearchParams,
    openSavedInvoiceModal: jest.fn(async () => {}),
    localStorage: { getItem: jest.fn(() => null) }
  });
  vm.runInContext(source, context);
  await context.window.onload();
  expect(context.openSavedInvoiceModal).toHaveBeenCalledWith(null, 'exact-invoice');
  expect(context.localStorage.getItem).not.toHaveBeenCalled();
});

test('the preview fetches the exact invoice ID and displays lookup errors visibly', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../dist/invoice-creater.html'), 'utf8');
  const source = html.slice(html.indexOf('async function openSavedInvoiceModal('), html.indexOf('async function shareInvoice('));
  const modal = { style: {} }, preview = { innerHTML: '' };
  const context = vm.createContext({
    document: { getElementById: name => name === 'invoiceModal' ? modal : preview },
    fetch: jest.fn(async () => ({ ok: false })), showLoader: jest.fn(), hideLoader: jest.fn(),
    console: { error: jest.fn() }
  });
  vm.runInContext(source, context);
  await context.openSavedInvoiceModal('duplicate', 'exact-id');
  expect(context.fetch).toHaveBeenCalledWith('/api/invoices/exact-id');
  expect(modal.style.display).toBe('flex');
  expect(preview.innerHTML).toContain('Failed to load invoice');
  expect(context.hideLoader).toHaveBeenCalled();
});

test('invoice creator inline scripts remain valid JavaScript', () => {
  const html = fs.readFileSync(path.join(__dirname, '../dist/invoice-creater.html'), 'utf8');
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (match[1].trim()) expect(() => new vm.Script(match[1])).not.toThrow();
  }
});
