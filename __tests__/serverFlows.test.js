const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const flowDir = path.join(root, 'server', 'flows');
const flowFiles = fs.readdirSync(flowDir).filter(name => name.endsWith('.js'));
const response = () => {
  const res = { code: 200, payload: undefined };
  res.status = code => { res.code = code; return res; };
  res.json = payload => { res.payload = payload; return res; };
  return res;
};

test('flow factories do not read models or configuration during initialization', () => {
  const context = new Proxy({}, { get(_, name) { throw Error(`Early dependency: ${String(name)}`); } });
  for (const file of flowFiles) expect(typeof require(path.join(flowDir, file))(context)).toBe('object');
});

test('all route paths, methods, middleware counts, and registration order match the original server', () => {
  const actual = [];
  const app = Object.fromEntries(['get', 'post', 'put', 'patch', 'delete'].map(method => [method, (url, ...handlers) => {
    expect(handlers.every(handler => typeof handler === 'function')).toBe(true);
    actual.push({ method, url, handlers: handlers.length });
  }]));
  const stub = new Proxy(function () { return stub; }, { get() { return stub; } });
  const context = new Proxy({ app }, { get(target, name) { return name === 'app' ? app : stub; } });
  const flows = Object.fromEntries(flowFiles.map(file => [file.replace('.js', ''), require(path.join(flowDir, file))(context)]));
  const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  for (const match of source.matchAll(/serverFlows\["([^"]+)"\]\.([A-Za-z0-9_]+)\(\);/g)) flows[match[1]][match[2]]();
  expect(actual).toEqual(require('./fixtures/server-route-order.json'));
});

test('tenant routes resolve the current model after registration', async () => {
  let handler;
  const context = { app: { get(url, fn) { handler = fn; } } };
  const flow = require('../server/flows/tenants')(context);
  flow.get_api_properties_propertyId_tenants();
  const tenants = [{ _id: 'tenant-a' }];
  const populate = jest.fn().mockResolvedValue(tenants);
  context.Tenant = { find: jest.fn(() => ({ populate })) };
  const res = response();
  await handler({ params: { propertyId: 'property-a' } }, res);
  expect(context.Tenant.find).toHaveBeenCalledWith({ projectId: 'property-a' });
  expect(populate).toHaveBeenCalledWith('unitId');
  expect(res.payload).toEqual(tenants);
});

test('creating a tenant keeps lease-holder filtering and occupied-unit updates', async () => {
  let handler;
  const save = jest.fn().mockResolvedValue(undefined);
  function Tenant(data) { Object.assign(this, data, { _id: 'tenant-a', save }); }
  const context = { app: { post(url, fn) { handler = fn; } }, Tenant, Unit: { findByIdAndUpdate: jest.fn().mockResolvedValue({}) } };
  require('../server/flows/tenants')(context).post_api_properties_propertyId_tenants();
  const res = response();
  await handler({ params: { propertyId: 'property-a' }, body: { name: 'Test', unitId: 'unit-a', leaseHolders: [null, {}, { name: 'Holder' }] } }, res);
  expect(res.code).toBe(201);
  expect(res.payload.leaseHolders).toEqual([{ name: 'Holder' }]);
  expect(context.Unit.findByIdAndUpdate).toHaveBeenCalledWith('unit-a', { status: 'occupied', tenant: 'tenant-a' });
  expect(save).toHaveBeenCalledTimes(1);
});

test('editing a missing tenant retains the 404 response', async () => {
  let handler;
  const context = { app: { put(url, fn) { handler = fn; } }, Tenant: { findOne: jest.fn().mockResolvedValue(null) } };
  require('../server/flows/tenants')(context).put_api_properties_propertyId_tenants_tenantId();
  const res = response();
  await handler({ params: { tenantId: 'missing' }, body: {} }, res);
  expect(res.code).toBe(404);
  expect(res.payload).toEqual({ message: 'Tenant not found' });
});

test('payment helpers retain proration, recurring fees, and monthly overrides', () => {
  const context = {};
  const flow = require('../server/flows/payments')(context);
  Object.assign(context, flow);
  const tenant = { baseRent: 1200, waterFee: 30, leaseStart: '2025-11-10T12:00:00' };
  expect(flow.computeExpectedRentForMonth(tenant, '2025-11-15T12:00:00', 'rent')).toBe(840);
  expect(flow.computeExpectedRentForMonth(tenant, '2025-12-15T12:00:00', 'rent')).toBe(1230);
  tenant.monthlyOverrides = { '2025-12': { expectedRent: 900 } };
  expect(flow.computeExpectedRentForMonth(tenant, '2025-12-15T12:00:00', 'rent')).toBe(900);
  expect(flow.normalizePaymentTypeServer('Section8')).toBe('hub');
});

test('maintenance workflow status mapping retains completed and active states', () => {
  const context = { MAINTENANCE_WORKFLOW_STAGES: ['new', 'scheduled', 'waiting', 'in-progress', 'completed', 'closed'] };
  const flow = require('../server/flows/maintenance')(context);
  Object.assign(context, flow);
  expect(flow.deriveMaintenanceStatusFromStage('completed')).toBe('completed');
  expect(flow.deriveMaintenanceStatusFromStage('in-progress')).toBe('in-progress');
  expect(flow.normalizeMaintenanceWorkflowStage('assigned', 'pending', true, false)).toBe('scheduled');
  expect(flow.normalizeMaintenanceWorkflowStage('scheduled', 'pending', false, false)).toBe('new');
});

test('QuickBooks connection retains its configuration guard without calling external services', async () => {
  let handler;
  const context = { app: { get(url, fn) { handler = fn; } }, Project: { findById: jest.fn() } };
  require('../server/flows/quickbooks')(context).get_api_properties_propertyId_quickbooks_connect();
  const res = response();
  await handler({ params: { propertyId: 'property-a' } }, res);
  expect(res.code).toBe(503);
  expect(res.payload.message).toBe('QuickBooks environment configuration is incomplete');
  expect(context.Project.findById).not.toHaveBeenCalled();
});

test('QuickBooks token encryption still round-trips and rejects a changed authentication tag', () => {
  const context = { crypto: require('crypto'), QB_TOKEN_KEY: Buffer.alloc(32, 7) };
  const flow = require('../server/flows/quickbooks')(context);
  const encrypted = flow.encryptQbSecret('test-token');
  expect(flow.decryptQbSecret(encrypted)).toBe('test-token');
  const parts = encrypted.split('.');
  const tag = Buffer.from(parts[1], 'base64url');
  tag[0] ^= 1;
  parts[1] = tag.toString('base64url');
  expect(() => flow.decryptQbSecret(parts.join('.'))).toThrow();
});

test('QuickBooks workspace keeps an existing link attached when its record needs review', () => {
  const context = {
    normalizeQbPaymentDate: value => value || '',
    normalizeQbPaymentAmount: value => Number(value) || 0,
    normalizeQbPaymentText: value => String(value || '').toLowerCase()
  };
  const flow = require('../server/flows/quickbooks')(context);
  Object.assign(context, flow);
  const payment = { _id: 'local-linked', amount: 125, quickBooks: { entityType: 'SalesReceipt', entityId: 'qb-1' } };
  const otherPayment = { _id: 'local-unlinked', amount: 125 };
  const records = [{ sourceType: 'SalesReceipt', id: 'qb-1', totalAmt: 125, periodError: 'Review this transaction' }];

  expect(flow.attachQuickBooksPaymentMatches([payment, otherPayment], records)[0].localPaymentId).toBe('local-linked');
});

test('QuickBooks payment expansion includes all invoice line descriptions', async () => {
  const invoice = {
    TxnDate: '2026-10-28',
    DueDate: '2026-11-01',
    CustomerRef: { value: 'customer-1' },
    Line: [
      { DetailType: 'SalesItemLineDetail', Amount: 100, Description: 'September rent' },
      { DetailType: 'SalesItemLineDetail', Amount: 50, Description: 'Parking' }
    ]
  };
  const invoicePeriods = require('../server/quickbooks-invoice-periods')({
    qbRequest: jest.fn().mockResolvedValue({ Invoice: invoice })
  });
  const [payment] = await invoicePeriods.expand([{
    sourceType: 'Payment',
    id: 'payment-1',
    customerId: 'customer-1',
    txnDate: '2026-10-29',
    totalAmt: 150,
    raw: { Line: [{ Amount: 150, LinkedTxn: [{ TxnType: 'Invoice', TxnId: 'invoice-1' }] }] }
  }], {});

  expect(payment.lineDescriptions).toEqual(['September rent', 'Parking']);
  expect(payment.periodMonth).toBe('2026-11');
  expect(payment.txnDate).toBe('2026-10-29');
  expect(invoicePeriods.metadata(payment)).toMatchObject({
    invoiceDate: '2026-10-28',
    invoiceDueDate: '2026-11-01',
    periodSource: 'invoice-due-date'
  });
  expect(require('../server/flows/quickbooks')({})
    .inferPeriodMonthFromQuickBooksPaymentRecord(payment)).toBe('2026-11');
});

test('QuickBooks invoices without a due date retain invoice-date rent-period fallback', async () => {
  const invoicePeriods = require('../server/quickbooks-invoice-periods')({
    qbRequest: jest.fn().mockResolvedValue({ Invoice: {
      TxnDate: '2026-10-28',
      CustomerRef: { value: 'customer-1' }
    } })
  });
  const [payment] = await invoicePeriods.expand([{
    sourceType: 'Payment',
    id: 'payment-1',
    customerId: 'customer-1',
    totalAmt: 150,
    raw: { Line: [{ Amount: 150, LinkedTxn: [{ TxnType: 'Invoice', TxnId: 'invoice-1' }] }] }
  }], {});

  expect(payment.periodMonth).toBe('2026-10');
  expect(invoicePeriods.metadata(payment)).toMatchObject({periodSource:'invoice-date'});
});

test('QuickBooks import notes no longer store the import label as note text', () => {
  const flow = require('../server/flows/quickbooks')({});

  expect(flow.buildQuickBooksImportNote({
    invoiceId: 'invoice-1',
    invoiceNumber: 'INV-100',
    invoiceDate: '2026-09-15',
    invoiceDueDate: '2026-10-01',
    docNumber: 'PMT-100',
    privateNote: 'September payment'
  })).toBe('Invoice INV-100 dated 2026-09-15, due 2026-10-01 · PMT-100 · September payment');
});
