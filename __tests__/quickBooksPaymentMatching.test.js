jest.mock('../server/payment-balances', () => () => ({
  refreshTenant: mockRefreshTenant
}));

const mockRefreshTenant = jest.fn();
const createFlow = require('../server/flows/quickbooks');

function setup({records = [], linked = [], paymentOverrides = {}, connectionOverrides = {}} = {}) {
  const tenant = {_id: 'tenant-1', name: 'Jane Doe', unitId: {_id: 'unit-1', number: '1'}, quickBooks: {
    'connection-1': {customerId: 'customer-1'}
  }};
  const payment = {
    _id: 'payment-1', projectId: 'property-1', tenantId: tenant, amount: 100,
    date: '2026-11-10', periodMonth: '2026-11', postingStatus: 'posted', quickBooks: {},
    ...paymentOverrides
  };
  const connection = {_id: 'connection-1', realmId: 'realm-1', ...connectionOverrides};
  const chain = result => ({
    populate() { return this; },
    select() { return this; },
    sort() { return this; },
    lean: jest.fn().mockResolvedValue(result)
  });
  const context = {
    Payment: {
      findById: jest.fn(() => ({populate: jest.fn().mockResolvedValue(payment)})),
      find: jest.fn(() => chain(linked)),
      updateOne: jest.fn().mockResolvedValue({matchedCount: 1})
    },
    Tenant: {find: jest.fn(() => chain([tenant]))},
    QuickBooksConnection: {findOne: jest.fn(() => chain(connection))},
    getQbConnection: jest.fn().mockResolvedValue(connection),
    qbRequest: jest.fn(),
    fetchQuickBooksPaymentRecords: jest.fn().mockResolvedValue(records),
    normalizeQbPaymentDate: value => value ? new Date(value).toISOString().slice(0, 10) : '',
    normalizeQbPaymentAmount: value => Math.round(Number(value) * 100) / 100,
    normalizeQbPaymentText: value => String(value || '').trim().toLowerCase()
  };
  const flow = createFlow(context);
  context.matchTenantForQuickBooksPaymentRecord = flow.matchTenantForQuickBooksPaymentRecord;
  context.syncPaymentToQuickBooks = flow.syncPaymentToQuickBooks;
  return {context, flow, payment};
}

const record = (id = 'qb-1', overrides = {}) => ({
  id, sourceType: 'SalesReceipt', customerId: 'customer-1', customerName: 'Jane Doe',
  txnDate: '2026-11-10', totalAmt: 100, ...overrides
});

beforeEach(() => mockRefreshTenant.mockReset());

test('links one existing transaction without creating a QuickBooks payment or customer', async () => {
  const {context, flow} = setup({records: [record()]});
  await expect(flow.syncPaymentToQuickBooks('payment-1')).resolves.toMatchObject({
    matchedExisting: true, entityId: 'qb-1'
  });
  expect(context.Payment.updateOne).toHaveBeenCalledWith(
    expect.objectContaining({_id: 'payment-1', postingStatus: {$ne: 'voided'}}),
    {$set: expect.objectContaining({
      'quickBooks.entityId': 'qb-1', 'quickBooks.syncStatus': 'synced',
      'quickBooks.matchMethod': 'automatic-tenant-match'
    })}
  );
  expect(mockRefreshTenant).toHaveBeenCalledWith('tenant-1');
  expect(context.qbRequest).not.toHaveBeenCalled();
});

test('reads existing QuickBooks records without any outgoing writes', async () => {
  const {context, flow} = setup();
  context.fetchQuickBooksPaymentRecords = flow.fetchQuickBooksPaymentRecords;
  context.buildQuickBooksPaymentRecord = flow.buildQuickBooksPaymentRecord;
  context.qbRequest.mockImplementation(async (_connection, method, path) => {
    expect(method).toBe('get');
    return path.includes('SalesReceipt')
      ? {QueryResponse: {SalesReceipt: [{Id: 'qb-1', TxnDate: '2026-11-10', TotalAmt: 100, CustomerRef: {value: 'customer-1'}}]}}
      : {QueryResponse: {Payment: []}};
  });
  await expect(flow.syncPaymentToQuickBooks('payment-1')).resolves.toMatchObject({entityId: 'qb-1'});
  expect(context.qbRequest).toHaveBeenCalledTimes(2);
});

test.each([
  ['no match', [], []],
  ['ambiguous matches', [record('qb-1'), record('qb-2')], []],
  ['already linked transaction', [record()], [{quickBooks: {entityType: 'SalesReceipt', entityId: 'qb-1'}}]],
  ['different customer', [record('qb-1', {customerId: 'other'})], []],
  ['different invoice period', [record('qb-1', {invoiceId: 'invoice-1', periodMonth: '2026-10'})], []]
])('%s remains local without creating a QuickBooks transaction', async (_label, records, linked) => {
  const {context, flow} = setup({records, linked});
  await expect(flow.syncPaymentToQuickBooks('payment-1')).resolves.toMatchObject({pending: true});
  expect(context.Payment.updateOne).toHaveBeenCalledWith(
    expect.anything(), {$set: expect.objectContaining({'quickBooks.syncStatus': 'pending'})}
  );
  expect(context.qbRequest).not.toHaveBeenCalled();
  expect(mockRefreshTenant).not.toHaveBeenCalled();
});

test('does not automatically choose between identical unlinked local payments', async () => {
  const {context, flow} = setup({
    records: [record()],
    linked: [{_id: 'payment-2', tenantId: 'tenant-1', amount: 100, date: '2026-11-10', periodMonth: '2026-11', quickBooks: {}}]
  });
  await expect(flow.syncPaymentToQuickBooks('payment-1')).resolves.toMatchObject({pending: true});
  expect(context.Payment.updateOne).toHaveBeenCalledWith(
    expect.anything(), {$set: expect.objectContaining({'quickBooks.syncStatus': 'pending'})}
  );
});

test('an already linked payment is idempotent and a voided payment cannot be linked', async () => {
  const linked = setup({paymentOverrides: {quickBooks: {entityId: 'qb-1'}}});
  await expect(linked.flow.syncPaymentToQuickBooks('payment-1')).resolves.toMatchObject({duplicate: true});
  expect(linked.context.fetchQuickBooksPaymentRecords).not.toHaveBeenCalled();

  const voided = setup({paymentOverrides: {postingStatus: 'voided'}});
  await expect(voided.flow.syncPaymentToQuickBooks('payment-1')).rejects.toThrow('Voided');
  expect(voided.context.fetchQuickBooksPaymentRecords).not.toHaveBeenCalled();
});

test('records QuickBooks read failures on the local payment', async () => {
  const {context, flow} = setup();
  context.fetchQuickBooksPaymentRecords.mockRejectedValue(new Error('QuickBooks unavailable'));
  await expect(flow.syncPaymentToQuickBooks('payment-1')).rejects.toThrow('QuickBooks unavailable');
  expect(context.Payment.updateOne).toHaveBeenCalledWith(expect.anything(), {$set: expect.objectContaining({
    'quickBooks.syncStatus': 'failed', 'quickBooks.lastError': 'QuickBooks unavailable'
  })});
});

test('posting schedules matching even for a connection previously set to manual', async () => {
  const {context, flow, payment} = setup({connectionOverrides: {settings: {paymentSyncMode: 'manual'}}});
  context.syncPaymentToQuickBooks = jest.fn().mockResolvedValue({pending: true});
  flow.scheduleAutomaticQuickBooksPaymentSync(payment);
  await new Promise(resolve => setImmediate(resolve));
  expect(context.syncPaymentToQuickBooks).toHaveBeenCalledWith('payment-1');
});

test('posting does not attempt to match a disconnected property or a credit', async () => {
  const {context, flow, payment} = setup();
  context.QuickBooksConnection.findOne.mockReturnValue({lean: jest.fn().mockResolvedValue(null)});
  context.syncPaymentToQuickBooks = jest.fn();
  flow.scheduleAutomaticQuickBooksPaymentSync(payment);
  flow.scheduleAutomaticQuickBooksPaymentSync({...payment, amount: -10});
  await new Promise(resolve => setImmediate(resolve));
  expect(context.QuickBooksConnection.findOne).toHaveBeenCalledTimes(1);
  expect(context.syncPaymentToQuickBooks).not.toHaveBeenCalled();
});

test('the existing manual sync endpoint only runs matching', async () => {
  const {context, flow, payment} = setup({records: [record()]});
  let handler;
  context.app = {post: (_url, callback) => { handler = callback; }};
  context.Payment.findOne = jest.fn().mockResolvedValue(payment);
  flow.post_api_properties_propertyId_payments_paymentId_sync_quickbooks();
  const res = {json: jest.fn(), status: jest.fn().mockReturnThis()};
  await handler({params: {propertyId: 'property-1', paymentId: 'payment-1'}}, res);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({success: true, matchedExisting: true}));
  expect(context.qbRequest).not.toHaveBeenCalled();
});

test('candidate search returns only unlinked same-tenant, same-amount records and flags differences', async () => {
  const {context, flow, payment} = setup({
    records: [
      record('date-diff', {txnDate: '2026-11-11', invoiceId: 'inv-1', periodMonth: '2026-12', invoiceNumber: 'I-1'}),
      record('exact'),
      record('used'),
      record('other-customer', {customerId: 'other'}),
      record('other-amount', {totalAmt: 99}),
      record('review', {periodError: 'Review in QuickBooks'})
    ],
    linked: [{quickBooks: {entityType: 'SalesReceipt', entityId: 'used'}}]
  });
  let handler;
  context.app = {get: (_url, callback) => { handler = callback; }};
  context.Payment.findOne = jest.fn(() => ({populate: jest.fn().mockResolvedValue(payment)}));
  flow.get_api_properties_propertyId_quickbooks_payments();
  const res = {json: jest.fn(), status: jest.fn().mockReturnThis()};
  await handler({params: {propertyId: 'property-1'}, query: {paymentId: 'payment-1'}}, res);
  const data = res.json.mock.calls[0][0];
  expect(data.payment).toMatchObject({tenantName: 'Jane Doe', amount: 100});
  expect(data.candidates).toEqual([
    expect.objectContaining({id: 'exact', dateMatches: true, periodMatches: true}),
    expect.objectContaining({id: 'date-diff', dateMatches: false, periodMatches: false, invoiceNumber: 'I-1'})
  ]);
  expect(context.Payment.updateOne).not.toHaveBeenCalled();
  expect(context.qbRequest).not.toHaveBeenCalled();
});

test('manual linking uses a conditional update and never creates QuickBooks transactions', async () => {
  const {context, flow, payment} = setup();
  let handler;
  context.app = {post: (_url, callback) => { handler = callback; }};
  const local = {...payment, tenantId: 'tenant-1'};
  context.Payment.findOne = jest.fn()
    .mockResolvedValueOnce(local).mockResolvedValueOnce(null).mockResolvedValueOnce(local);
  context.resolveWorkspaceQbRecord = jest.fn().mockResolvedValue(record());
  flow.post_api_properties_propertyId_quickbooks_payment_workspace_link();
  const res = {json: jest.fn(), status: jest.fn().mockReturnThis()};
  await handler({params:{propertyId:'property-1'},body:{
    paymentId:'payment-1',sourceType:'SalesReceipt',entityId:'qb-1',
    reviewedMatch:{tenantId:'tenant-1',amount:100,date:'2026-11-10',periodMonth:'2026-11',txnDate:'2026-11-10',invoicePeriod:''}
  }},res);
  expect(context.Payment.updateOne).toHaveBeenCalledWith(
    expect.objectContaining({_id:'payment-1',postingStatus:{$ne:'voided'}}),
    {$set:expect.objectContaining({'quickBooks.entityId':'qb-1','quickBooks.matchMethod':'manual-payments-workspace'})}
  );
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({success:true}));
  expect(context.qbRequest).not.toHaveBeenCalled();
});

test.each(['voided', 'changed', 'invoice-changed', 'customer-changed', 'raced'])('manual linking rejects a %s payment', async reason => {
  const {context, flow, payment} = setup();
  let handler;
  context.app = {post: (_url, callback) => { handler = callback; }};
  context.Payment.findOne = jest.fn().mockResolvedValueOnce({...payment,tenantId:'tenant-1',postingStatus:reason === 'voided' ? 'voided' : 'posted'}).mockResolvedValueOnce(null);
  context.resolveWorkspaceQbRecord = jest.fn().mockResolvedValue(record('qb-1', reason === 'invoice-changed'
    ? {invoiceId:'inv-1',periodMonth:'2026-12'}
    : reason === 'customer-changed' ? {customerId:'other'} : {}));
  if(reason === 'raced') context.Payment.updateOne.mockResolvedValue({matchedCount:0});
  flow.post_api_properties_propertyId_quickbooks_payment_workspace_link();
  const res = {json: jest.fn(), status: jest.fn().mockReturnThis()};
  await handler({params:{propertyId:'property-1'},body:{
    paymentId:'payment-1',sourceType:'SalesReceipt',entityId:'qb-1',
    reviewedMatch:{tenantId:'tenant-1',amount:reason === 'changed'?99:100,date:'2026-11-10',periodMonth:'2026-11',txnDate:'2026-11-10',invoicePeriod:''}
  }},res);
  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.json.mock.calls[0][0].message).toBeTruthy();
  if(reason !== 'raced') expect(context.Payment.updateOne).not.toHaveBeenCalled();
});

test.each([
  ['ambiguous transactions', [record('qb-1', {privateNote: 'rent'}), record('qb-2', {privateNote: 'rent'})]],
  ['same-period receipt with a different date', [record('qb-1', {txnDate: '2026-11-11'})]]
])('workspace refresh leaves %s for review without importing', async (_label, records) => {
  const {context, flow, payment} = setup({records});
  const local = {...payment, tenantId: 'tenant-1', note: 'rent'};
  const chain = value => ({
    sort() { return this; }, select() { return this; },
    lean: jest.fn().mockResolvedValue(value)
  });
  context.Payment.find = jest.fn(query => chain(
    query['quickBooks.connectionId'] ? [] : [local]
  ));
  context.Payment.create = jest.fn();
  context.refreshQbConnection = jest.fn(async connection => connection);
  context.attachQuickBooksPaymentMatches = flow.attachQuickBooksPaymentMatches;
  context.matchQuickBooksRecordForLocalPayment = flow.matchQuickBooksRecordForLocalPayment;
  context.inferApplyToFromQuickBooksPaymentRecord = flow.inferApplyToFromQuickBooksPaymentRecord;
  context.inferPeriodMonthFromQuickBooksPaymentRecord = flow.inferPeriodMonthFromQuickBooksPaymentRecord;

  const result = await flow.autoResolveQuickBooksPaymentsForProperty('property-1', {_id: 'connection-1', realmId: 'realm-1'});

  expect(context.Payment.updateOne).not.toHaveBeenCalled();
  expect(context.Payment.create).not.toHaveBeenCalled();
  expect(result.qbPayments.every(item => !item.localPaymentId)).toBe(true);
});
