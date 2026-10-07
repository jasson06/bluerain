const createPaymentsFlow = require('../server/flows/payments');

function setup(previousPayments) {
    let handler;
    const tenant = {
        _id: 'tenant-1', baseRent: 43, leaseStatus: 'active',
        leaseStart: '2026-09-01', leaseEnd: '2026-12-31'
    };
    function Payment(data) {
        Object.assign(this, data);
        this.save = jest.fn().mockResolvedValue();
    }
    Payment.find = jest.fn(async query =>
        query.carryForward ? [] : previousPayments
    );
    const context = {
        app: {post: (url, callback) => {handler = callback;}},
        Payment,
        Tenant: {findById: jest.fn().mockResolvedValue(tenant)},
        scheduleAutomaticQuickBooksPaymentSync: jest.fn()
    };
    Object.assign(context, createPaymentsFlow(context));
    context.post_api_properties_propertyId_payments();
    const res = {
        code: 200,
        status(code) {this.code = code; return this;},
        json(payload) {this.payload = payload; return this;}
    };
    const req = {
        params: {propertyId: 'property-1'},
        body: {
            tenantId: 'tenant-1', unitId: 'unit-1', type: 'rent',
            applyTo: 'rent', amount: 43, method: 'cash',
            date: '2026-10-06', periodMonth: '2026-10'
        }
    };
    return {handler, req, res};
}

describe('posting replacement payments after a void', () => {
    test('posting cash does not silently consume a carry-forward credit', async () => {
        const source = {amount: -100, carryForward: true, appliedCredit: 0};
        const {handler, req, res} = setup([source]);
        await handler(req, res);
        expect(res.code).toBe(201);
        expect(res.payload.payment).toMatchObject({amount: 43, appliedCredit: 0, balance: 0});
        expect(source.appliedCredit).toBe(0);
    });
    test('tenant balance refresh repairs an existing false credit without changing payment amounts or statuses', async () => {
        const payments = [
            {_id: 'returned', tenantId: 'tenant-1', type: 'rent', applyTo: 'rent', periodMonth: '2026-10', date: '2026-10-06', amount: 43, balance: 0, postingStatus: 'voided'},
            {_id: 'replacement', tenantId: 'tenant-1', type: 'rent', applyTo: 'rent', periodMonth: '2026-10', date: '2026-10-06', amount: 43, balance: -43, postingStatus: 'posted'}
        ];
        const context = {
            Payment: {
                find: jest.fn().mockResolvedValue(payments),
                bulkWrite: jest.fn().mockResolvedValue({})
            },
            Tenant: {findById: jest.fn().mockResolvedValue({
                baseRent: 43, leaseStatus: 'active',
                leaseStart: '2026-09-01', leaseEnd: '2026-12-31'
            })}
        };
        Object.assign(context, createPaymentsFlow(context));

        await require('../server/payment-balances')(context).refreshTenant('tenant-1');

        expect(payments[1]).toMatchObject({balance: 0, amount: 43, postingStatus: 'posted'});
        expect(payments[0]).toMatchObject({balance: 0, amount: 43, postingStatus: 'voided'});
        expect(context.Payment.bulkWrite).toHaveBeenCalledWith([
            {updateOne: {filter: {_id: 'replacement'}, update: {$set: {balance: 0}}}}
        ], {ordered: true});
    });

    test('a $43 replacement settles $43 rent without counting the returned payment or its late fee', async () => {
        const {handler, req, res} = setup([
            {amount: 43, lateFee: 10, postingStatus: 'voided'}
        ]);
        await handler(req, res);
        expect(res.code).toBe(201);
        expect(res.payload.payment.balance).toBe(0);
        expect(res.payload.calculationDetails).toMatchObject({
            totalPaidPreviously: 0, totalMonthlyCharges: 43, balance: 0
        });
    });

    test('still counts successful prior payments when calculating an actual overpayment', async () => {
        const {handler, req, res} = setup([
            {amount: 43, lateFee: 0, postingStatus: 'voided'},
            {amount: 20, lateFee: 0, postingStatus: 'posted'}
        ]);
        await handler(req, res);
        expect(res.code).toBe(201);
        expect(res.payload.calculationDetails.totalPaidPreviously).toBe(20);
        expect(res.payload.payment.balance).toBe(-20);
    });
});
