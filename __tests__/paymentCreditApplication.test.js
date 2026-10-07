const values = require('../server/payment-credit-values');
const lifecycle = require('../server/tenant-lifecycle');
const {randomUUID} = require('crypto');

function setup(sourceOverrides = {}) {
    let handler;
    let nextId = 1;
    let payments = [{
        _id: 'source', projectId: 'property', tenantId: 'tenant',
        type: 'rent', applyTo: 'rent', periodMonth: '2026-10',
        date: '2026-10-01', amount: -100, appliedCredit: 0,
        balance: -100, postingStatus: 'posted', ...sourceOverrides
    }];
    let tenant = {
        _id: 'tenant', projectId: 'property', unitId: 'unit',
        baseRent: 100, deposit: 200, depositPaid: 0,
        leaseStart: '2026-01-01', leaseEnd: '2026-12-31', leaseStatus: 'active'
    };
    let transactionQueue = Promise.resolve();
    const session = {
        withTransaction: jest.fn(callback => {
            const operation = transactionQueue.then(async () => {
                const previousPayments = structuredClone(payments);
                const previousTenant = structuredClone(tenant);
                try { await callback(); }
                catch (error) {
                    payments = previousPayments;
                    tenant = previousTenant;
                    throw error;
                }
            });
            transactionQueue = operation.catch(() => {});
            return operation;
        }),
        endSession: jest.fn()
    };
    const query = load => ({
        session: jest.fn(async () => load()),
        then: (resolve, reject) => Promise.resolve().then(load).then(resolve, reject)
    });
    function Payment(data) { Object.assign(this, structuredClone(data)); }
    Payment.prototype.save = jest.fn(async function () {
        if (this.creditSourceId && context.failAllocation) throw new Error('Allocation write failed');
        this._id ||= `allocation-${nextId++}`;
        const data = {...this};
        const index = payments.findIndex(payment => payment._id === this._id);
        if (index < 0) payments.push(data);
        else payments[index] = data;
    });
    Payment.db = {startSession: jest.fn(async () => session)};
    Payment.findOne = jest.fn(filter => query(() => {
        const payment = payments.find(item => Object.entries(filter).every(([key, value]) => String(item[key]) === String(value)));
        return payment ? new Payment(payment) : null;
    }));
    Payment.find = jest.fn(filter => query(() => payments
        .filter(item => item.tenantId === filter.tenantId)
        .map(item => new Payment(item))));
    Payment.bulkWrite = jest.fn(async writes => {
        for (const {updateOne} of writes) {
            Object.assign(payments.find(payment => payment._id === updateOne.filter._id), updateOne.update.$set);
        }
    });
    const tenantDoc = () => ({...tenant, save: async function () {
        const {save, ...data} = this;
        tenant = data;
    }});
    const context = {
        app: {post: (url, callback) => {handler = callback;}},
        Payment,
        Tenant: {
            findOne: filter => query(() => tenant._id === filter._id && tenant.projectId === filter.projectId ? tenantDoc() : null),
            findById: () => query(tenantDoc)
        }
    };
    Object.assign(context, require('../server/flows/payments')(context));
    context.post_api_properties_propertyId_payments_creditPaymentId_apply_credit();
    async function apply(changes = {}) {
        const res = {
            statusCode: 200,
            status(code) {this.statusCode = code; return this;},
            json(body) {this.body = body; return this;}
        };
        await handler({
            params: {propertyId: 'property', creditPaymentId: 'source'},
            body: {tenantId: 'tenant', amount: 30, targetApplyTo: 'rent', periodMonth: '2026-11', requestId: randomUUID(), ...changes}
        }, res);
        return res;
    }
    return {apply, context, session, getPayments: () => payments, getTenant: () => tenant};
}

describe('transactional credit allocation', () => {
    test('a $30 application from $100 credit leaves $70 and settles exactly $30 of target rent', async () => {
        const {apply, getPayments, context} = setup();
        const response = await apply();
        expect(response.statusCode).toBe(201);
        const [source, target] = getPayments();
        expect(source).toMatchObject({amount: -100, appliedCredit: 0, creditConsumed: 30, balance: -70});
        expect(target).toMatchObject({amount: 0, appliedCredit: 30, creditSourceId: 'source', periodMonth: '2026-11', balance: 70, note: '(Credit applied from OCT-26)'});
        expect(values.availableCredit(source)).toBe(70);
        const totals = lifecycle.tenantMonthTotals(
            {_id: 'tenant', baseRent: 100},
            new Date('2026-11-15'), getPayments(), context.computeExpectedRentForMonth
        );
        expect(totals).toMatchObject({paid: 30, outstanding: 70});
    });

    test.each([
        [{periodMonth: '2026-11', date: '2026-10-28'}, 'NOV-26'],
        [{periodMonth: undefined, date: '2026-11-15T12:00:00Z'}, 'NOV-26'],
        [{periodMonth: '2026-12'}, 'DEC-26']
    ])('credit note uses the source period rather than the destination or receipt date: %j', async (source, label) => {
        const {apply, getPayments} = setup(source);
        const response = await apply({periodMonth: '2026-10', note: 'Manual adjustment'});
        expect(response.statusCode).toBe(201);
        expect(getPayments()[1].note).toBe(`Manual adjustment (Credit applied from ${label})`);
        expect(getPayments()[1].creditSourceId).toBe('source');
    });

    test('an overpayment source is reduced only once and cash receipt amounts stay unchanged', async () => {
        const {apply, getPayments} = setup({amount: 200, balance: -100});
        const response = await apply();
        expect(response.statusCode).toBe(201);
        const [source, target] = getPayments();
        expect(source).toMatchObject({amount: 200, creditConsumed: 30, appliedCredit: 0, balance: -70});
        expect(values.availableCredit(source)).toBe(70);
        expect(target.balance).toBe(70);
        expect(getPayments().reduce((sum, payment) => sum + Math.max(0, payment.amount), 0)).toBe(200);
    });

    test('same-month issued credit counts once, not on both source and target', async () => {
        const {apply, getPayments, context} = setup();
        const response = await apply({periodMonth: '2026-10'});
        expect(response.statusCode).toBe(201);
        const totals = lifecycle.tenantMonthTotals(
            {_id: 'tenant', baseRent: 100},
            new Date('2026-10-15'), getPayments(), context.computeExpectedRentForMonth
        );
        expect(totals).toMatchObject({paid: 30, outstanding: 70});
    });

    test('retrying the same request does not consume or create credit twice', async () => {
        const {apply, getPayments} = setup();
        const requestId = randomUUID();
        const results = await Promise.all([apply({requestId}), apply({requestId})]);
        expect(results.map(result => result.statusCode)).toEqual([201, 200]);
        expect(results[1].body.duplicate).toBe(true);
        expect(getPayments()).toHaveLength(2);
        expect(getPayments()[0].creditConsumed).toBe(30);
    });

    test('two allocations cannot consume more than the source has available', async () => {
        const {apply, getPayments} = setup();
        const results = await Promise.all([apply({amount: 60}), apply({amount: 60})]);
        expect(results.map(result => result.statusCode)).toEqual([201, 409]);
        expect(getPayments()).toHaveLength(2);
        expect(values.availableCredit(getPayments()[0])).toBe(40);
    });

    test('rejects changing an already-used request UUID rather than applying it again', async () => {
        const {apply, getPayments} = setup();
        const requestId = randomUUID();
        expect((await apply({requestId})).statusCode).toBe(201);
        expect((await apply({requestId, amount: 20})).statusCode).toBe(409);
        expect(getPayments()).toHaveLength(2);
        expect(values.availableCredit(getPayments()[0])).toBe(70);
    });

    test.each([
        {periodMonth: 'invalid'},
        {periodMonth: '2027-01'},
        {targetApplyTo: 'unknown'},
        {tenantId: 'another-tenant'},
        {requestId: ''},
        {feeLabel: 'x'.repeat(201)}
    ])('rejects invalid destinations or request metadata %j', async changes => {
        const {apply, getPayments} = setup();
        expect([400, 404]).toContain((await apply(changes)).statusCode);
        expect(getPayments()).toHaveLength(1);
    });

    test('cannot consume overpayment into the source month again', async () => {
        const {apply, getPayments} = setup({amount: 200, balance: -100});
        expect((await apply({periodMonth: '2026-10'})).statusCode).toBe(400);
        expect(getPayments()).toHaveLength(1);
    });

    test('rent applications cannot exceed the target outstanding balance', async () => {
        const {apply, getPayments} = setup();
        getPayments().push({
            _id: 'prior', tenantId: 'tenant', type: 'rent', applyTo: 'rent',
            periodMonth: '2026-11', date: '2026-11-01', amount: 80, lateFee: 0, postingStatus: 'posted'
        });
        const response = await apply();
        expect(response.statusCode).toBe(409);
        expect(response.body.message).toContain('$20.00');
        expect(values.availableCredit(getPayments()[0])).toBe(100);
    });

    test('deposit applications cannot exceed the remaining deposit', async () => {
        const {apply, getTenant, getPayments} = setup();
        getTenant().depositPaid = 190;
        const response = await apply({targetApplyTo: 'deposit'});
        expect(response.statusCode).toBe(409);
        expect(response.body.message).toContain('$10.00');
        expect(getPayments()).toHaveLength(1);
    });

    test.each([undefined, null, '', 0, -1, 'invalid', Infinity, 0.001, true, 101])('rejects invalid or unavailable amount %p without committing anything', async amount => {
        const {apply, getPayments} = setup();
        const response = await apply({amount});
        expect([400, 409]).toContain(response.statusCode);
        expect(getPayments()).toHaveLength(1);
        expect(values.availableCredit(getPayments()[0])).toBe(100);
    });

    test('allocation failure rolls back source consumption and balances', async () => {
        const {apply, context, getPayments, session} = setup();
        context.failAllocation = true;
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const response = await apply();
            expect(response.statusCode).toBe(500);
            expect(getPayments()).toHaveLength(1);
            expect(getPayments()[0]).toMatchObject({appliedCredit: 0, balance: -100});
            expect(session.endSession).toHaveBeenCalled();
        } finally { log.mockRestore(); }
    });

    test('a recalculation failure also rolls back the saved source and allocation', async () => {
        const {apply, context, getPayments} = setup();
        context.Payment.bulkWrite.mockRejectedValueOnce(new Error('Balance write failed'));
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            expect((await apply()).statusCode).toBe(500);
            expect(getPayments()).toHaveLength(1);
            expect(values.availableCredit(getPayments()[0])).toBe(100);
        } finally { log.mockRestore(); }
    });

    test('transferring a deposit overpayment reduces tracked source deposits and target rent correctly', async () => {
        const {apply, getTenant, getPayments} = setup({applyTo: 'deposit', amount: 300, balance: -100});
        getTenant().depositPaid = 300;
        expect((await apply()).statusCode).toBe(201);
        expect(getTenant().depositPaid).toBe(270);
        expect(getPayments()[0]).toMatchObject({amount: 300, creditConsumed: 30, balance: -70});
        expect(getPayments()[1]).toMatchObject({applyTo: 'rent', amount: 0, appliedCredit: 30, balance: 70});
    });

    test('deposit credit updates depositPaid and survives another ledger refresh', async () => {
        const {apply, context, getPayments, getTenant} = setup();
        const response = await apply({targetApplyTo: 'deposit'});
        expect(response.statusCode).toBe(201);
        expect(getTenant().depositPaid).toBe(30);
        await require('../server/payment-balances')(context).refreshTenant('tenant');
        expect(getPayments()[1]).toMatchObject({periodMonth: '2026-11', balance: 170, appliedCredit: 30});
    });

    test('fee credit keeps its selected category and month without new cash', async () => {
        const {apply, getPayments} = setup();
        const response = await apply({targetApplyTo: 'water'});
        expect(response.statusCode).toBe(201);
        expect(getPayments()[1]).toMatchObject({applyTo: 'water', periodMonth: '2026-11', amount: 0, appliedCredit: 30, balance: 0});
    });

    test.each([
        {postingStatus: 'voided'},
        {creditSourceId: 'another-source', amount: 0, appliedCredit: 100},
        {amount: 200, appliedCredit: 30, creditConsumed: null}
    ])('rejects voided, already allocated, or ambiguous legacy credit sources %j', async source => {
        const {apply, getPayments} = setup(source);
        expect((await apply()).statusCode).toBe(409);
        expect(getPayments()).toHaveLength(1);
    });

    test('legacy negative credits preserve their previously consumed amount without double counting', async () => {
        const {apply, getPayments} = setup({appliedCredit: 20});
        expect((await apply()).statusCode).toBe(201);
        expect(getPayments()[0]).toMatchObject({appliedCredit: 0, creditConsumed: 50, balance: -50});
    });
});
