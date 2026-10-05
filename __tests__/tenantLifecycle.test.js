const fs = require('fs');
const path = require('path');
const vm = require('vm');
const lifecycle = require('../server/tenant-lifecycle');

function calculationContext() {
  const context = {};
  Object.assign(context, require('../server/flows/payments')(context));
  return context;
}

const baseTenant = () => ({
  _id:'tenant-a',projectId:'property-a',leaseStatus:'active',
  leaseStart:'2026-01-01T12:00:00',leaseEnd:'2026-12-31T12:00:00',
  baseRent:1000,waterFee:30
});

describe('reviewed lease termination', () => {
  const input = () => ({effectiveDate:'2026-06-15T12:00:00',reason:'Early move-out',finalRent:1030,possessionReturned:false});
  test('keeps the reviewed full charge without automatically prorating', () => {
    const result = lifecycle.reviewedTermination(baseTenant(), input(), new Date('2026-07-01T12:00:00'));
    expect(result.finalRent).toBe(1030);
    expect(result.possessionReturned).toBe(false);
    expect(result.unitDisposition).toBeNull();
  });
  test('allows an explicit zero final charge and confirmed turnover', () => {
    const result = lifecycle.reviewedTermination(baseTenant(), {
      ...input(),finalRent:0,possessionReturned:true,returnedAt:'2026-06-20T12:00:00',unitDisposition:'maintenance'
    }, new Date('2026-07-01T12:00:00'));
    expect(result.finalRent).toBe(0);
    expect(result.unitDisposition).toBe('maintenance');
  });
  test.each([
    {effectiveDate:'invalid'}, {effectiveDate:'2027-01-01'}, {effectiveDate:'2025-12-01'},
    {reason:''}, {finalRent:-1}, {finalRent:NaN}, {finalRent:null}, {possessionReturned:'yes'},
    {possessionReturned:true}, {possessionReturned:true,returnedAt:'2026-06-20',unitDisposition:'occupied'}
  ])('rejects invalid review input %j', changes => {
    expect(() => lifecycle.reviewedTermination(baseTenant(), {...input(),...changes},new Date('2026-07-01T12:00:00'))).toThrow();
  });
  test('allows today before noon but rejects tomorrow', () => {
    const now = new Date('2026-06-15T08:00:00');
    expect(() => lifecycle.reviewedTermination(baseTenant(),input(),now)).not.toThrow();
    expect(() => lifecycle.reviewedTermination(baseTenant(),{...input(),effectiveDate:'2026-06-16T12:00:00'},now)).toThrow();
  });
});

describe('rent periods and former tenants', () => {
  const context = calculationContext();
  const browser = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/property-management/js/shared-utilities.js'),'utf8'),browser);

  test.each(['2026-05-01T12:00:00','2026-06-01T12:00:00','2026-07-01T12:00:00'])(
    'server and browser agree on rent charge and allocation for %s', value => {
      const tenant = {...baseTenant(),leaseStatus:'terminated',termination:{effectiveDate:'2026-06-15T12:00:00'},
        monthlyOverrides:{'2026-06':{expectedRent:650,lateFee:5},'2026-07':{expectedRent:999}}};
      const date = new Date(value);
      const payments = [{tenantId:tenant._id,date:'2026-07-01T12:00:00',periodMonth:'2026-06',amount:600,appliedCredit:20}];
      expect(browser.computeExpectedRentForMonth(tenant,date,'rent')).toBe(context.computeExpectedRentForMonth(tenant,date,'rent'));
      expect(browser.computeTenantMonthTotals(tenant,date,payments)).toEqual(lifecycle.tenantMonthTotals(tenant,date,payments,context.computeExpectedRentForMonth));
    }
  );
  test('termination stops even saved monthly overrides and recurring fees after the final month', () => {
    const tenant = {...baseTenant(),leaseStatus:'terminated',termination:{effectiveDate:'2026-06-15'},
      monthlyOverrides:{'2026-06':{expectedRent:650},'2026-07':{expectedRent:999}}};
    expect(context.computeExpectedRentForMonth(tenant,'2026-06-01','rent')).toBe(650);
    expect(context.computeExpectedRentForMonth(tenant,'2026-07-01','rent')).toBe(0);
  });
  test('overpayments cannot offset another tenant or another period', () => {
    const tenant = baseTenant();
    const payments = [
      {tenantId:tenant._id,date:'2026-06-01',periodMonth:'2026-05',amount:2000},
      {tenantId:'other',date:'2026-06-01',periodMonth:'2026-06',amount:2000},
      {tenantId:tenant._id,date:'2026-06-01',periodMonth:'2026-06',amount:500,appliedCredit:30}
    ];
    expect(lifecycle.tenantMonthTotals(tenant,new Date('2026-06-01'),payments,context.computeExpectedRentForMonth)).toEqual({expected:1030,paid:530,outstanding:500});
  });
  test('preserves first-month proration and ignores null expected override', () => {
    const tenant = {...baseTenant(),leaseStart:'2026-06-10T12:00:00',monthlyOverrides:{'2026-06':{expectedRent:null}}};
    expect(browser.computeExpectedRentForMonth(tenant,'2026-06-15','rent')).toBe(context.computeExpectedRentForMonth(tenant,'2026-06-15','rent'));
    expect(context.computeExpectedRentForMonth(tenant,'2026-06-15','rent')).toBe(700);
  });
});

function query(value) {
  const q = {lean:jest.fn().mockResolvedValue(value),sort:jest.fn(),session:jest.fn()};
  q.sort.mockReturnValue(q);
  q.session.mockResolvedValue(value);
  return q;
}

function response() {
  const res = {code:200,status(code){this.code=code;return this;},json(payload){this.payload=payload;return this;}};
  return res;
}

describe('tenant termination endpoint', () => {
  function setup() {
    const tenant = {...baseTenant(),unitId:'unit-a',monthlyOverrides:new Map(),save:jest.fn().mockResolvedValue(undefined)};
    const session = {withTransaction:jest.fn(async fn => fn()),endSession:jest.fn()};
    const context = {
      app:{put:jest.fn()},mongoose:{startSession:jest.fn().mockResolvedValue(session)},
      Tenant:{findOne:jest.fn().mockReturnValue(query(tenant)),findById:jest.fn().mockReturnValue(query(tenant))},
      Unit:{updateOne:jest.fn().mockResolvedValue({matchedCount:1})},
      Payment:{find:jest.fn().mockReturnValue(query([]))}
    };
    // Model queries are thenable in Mongoose.
    context.Tenant.findOne.mockImplementation(() => ({...query(tenant),then:fn=>Promise.resolve(tenant).then(fn)}));
    require('../server/flows/tenants')(context).put_api_properties_propertyId_tenants_tenantId();
    const handler = context.app.put.mock.calls[0][1];
    const body = {termination:{effectiveDate:'2026-06-15T12:00:00',reason:'Move-out',finalRent:650,possessionReturned:false}};
    return {tenant,context,session,handler,body};
  }
  test('persists reviewed termination without changing occupancy when possession is not returned', async () => {
    const {tenant,context,handler,body,session} = setup();
    const res = response();
    await handler({params:{propertyId:'property-a',tenantId:'tenant-a'},body},res);
    expect(res.code).toBe(200);
    expect(tenant.leaseStatus).toBe('terminated');
    expect(tenant.monthlyOverrides.get('2026-06').expectedRent).toBe(650);
    expect(context.Unit.updateOne).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
    expect(tenant.save).toHaveBeenCalledWith({session});
  });
  test('releases only the unit still assigned to this tenant, inside the transaction', async () => {
    const {context,handler,body,session} = setup();
    Object.assign(body.termination,{possessionReturned:true,returnedAt:'2026-06-20T12:00:00',unitDisposition:'maintenance'});
    const res = response();
    await handler({params:{propertyId:'property-a',tenantId:'tenant-a'},body},res);
    expect(res.code).toBe(200);
    expect(context.Unit.updateOne).toHaveBeenCalledWith(
      {_id:'unit-a',projectId:'property-a',tenant:'tenant-a'},{$set:{status:'maintenance',tenant:null}},{session}
    );
  });
  test('rejects direct status-only termination', async () => {
    const {handler,tenant} = setup();
    const res = response();
    await handler({params:{propertyId:'property-a',tenantId:'tenant-a'},body:{leaseStatus:'terminated'}},res);
    expect(res.code).toBe(400);
    expect(tenant.save).not.toHaveBeenCalled();
  });
  test('invalid final rent does not start a transaction or alter the tenant', async () => {
    const {handler,tenant,body,context} = setup();
    body.termination.finalRent = -1;
    const res = response();
    await handler({params:{propertyId:'property-a',tenantId:'tenant-a'},body},res);
    expect(res.code).toBe(400);
    expect(context.mongoose.startSession).not.toHaveBeenCalled();
    expect(tenant.leaseStatus).toBe('active');
  });
  test('a replacement tenant is never removed from the unit', async () => {
    const {context,handler,body} = setup();
    const unit = {_id:'unit-a',tenant:'replacement',status:'occupied'};
    context.Unit.updateOne.mockImplementation(async filter => {
      if (unit.tenant === filter.tenant) Object.assign(unit,{tenant:null,status:'maintenance'});
      return {matchedCount:0};
    });
    Object.assign(body.termination,{possessionReturned:true,returnedAt:'2026-06-20',unitDisposition:'maintenance'});
    const res = response();
    await handler({params:{propertyId:'property-a',tenantId:'tenant-a'},body},res);
    expect(res.code).toBe(200);
    expect(unit).toEqual({_id:'unit-a',tenant:'replacement',status:'occupied'});
  });
  test('a previously returned possession cannot be reset', async () => {
    const {handler,body,tenant,context} = setup();
    tenant.termination={effectiveDate:new Date(body.termination.effectiveDate),possessionReturned:true};
    const errorLog = jest.spyOn(console,'error').mockImplementation(()=>{});
    const res = response();
    await handler({params:{propertyId:'property-a',tenantId:'tenant-a'},body},res);
    expect(res.code).toBe(500);
    expect(tenant.save).not.toHaveBeenCalled();
    expect(context.Unit.updateOne).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });
  test('ordinary expiration does not vacate the occupied unit', async () => {
    const {context,handler,tenant} = setup();
    context.Tenant.findOneAndUpdate = jest.fn().mockResolvedValue({...tenant,leaseStatus:'expired'});
    const res = response();
    await handler({params:{propertyId:'property-a',tenantId:'tenant-a'},body:{leaseStatus:'expired'}},res);
    expect(res.code).toBe(200);
    expect(context.Unit.updateOne).not.toHaveBeenCalled();
    expect(context.Tenant.findOneAndUpdate.mock.calls[0][2].session).toBeDefined();
  });
  test('null termination metadata cannot erase a reviewed cutoff', async () => {
    const {handler,tenant} = setup();
    tenant.termination={effectiveDate:new Date('2026-06-15'),possessionReturned:false};
    const res = response();
    await handler({params:{propertyId:'property-a',tenantId:'tenant-a'},body:{termination:null}},res);
    expect(res.code).toBe(400);
    expect(tenant.save).not.toHaveBeenCalled();
  });
});

describe('property overview separates lease collections from cash', () => {
  async function overview(from,to,extraTenants=[],extraPayments=[],timeZone,expectedStatus=200) {
    const active = baseTenant();
    const former = {...baseTenant(),_id:'former',leaseStatus:'terminated',termination:{effectiveDate:'2026-05-15'},monthlyOverrides:{'2026-05':{expectedRent:600}}};
    const payments = [
      {tenantId:'tenant-a',date:'2026-06-02',periodMonth:'2026-06',amount:500,applyTo:'rent'},
      {tenantId:'former',date:'2026-06-03',periodMonth:'2026-05',amount:400,applyTo:'rent'},
      {tenantId:'former',date:'2026-06-03',amount:200,applyTo:'deposit'},
      {tenantId:'former',date:'2026-06-03',amount:50,applyTo:'other'},...extraPayments
    ];
    const context = calculationContext();
    Object.assign(context,{
      app:{get:jest.fn()},mongoose:{Types:{ObjectId:{isValid:()=>true}}},
      Project:{findById:()=>query({_id:'property-a'})},
      Tenant:{find:()=>query([active,former,...extraTenants])},Unit:{find:()=>query([])},
      Payment:{find:()=>query(payments)},QuickBooksConnection:{findOne:()=>query(null)}
    });
    for (const model of ['MaintenanceRequest','MaintenanceSchedule','PortfolioTask','Expense']) context[model]={find:()=>query([])};
    require('../server/flows/properties')(context).get_api_properties_id_overview();
    const res = response();
    await context.app.get.mock.calls[0][1]({params:{id:'property-a'},query:{from,to,timeZone}},res);
    expect(res.code).toBe(expectedStatus);
    return res.payload;
  }
  test('old-period former payments increase cash but do not reduce active outstanding', async () => {
    const data = await overview('2026-06-01','2026-07-01');
    expect(data.summary.expectedRent).toBe(1030);
    expect(data.summary.rentCollected).toBe(500);
    expect(data.summary.rentOutstanding).toBe(530);
    expect(data.expectedPayments).toEqual([
      {tenantId:'tenant-a',tenantName:undefined,unitNumber:'',period:'2026-06',expected:1030,paid:500,outstanding:530,status:'partial'}
    ]);
    expect(data.summary.cashRentCollected).toBe(900);
    expect(data.summary.totalCashCollected).toBe(950);
    expect(data.financials.rentalIncome).toBe(900);
    expect(data.financials.depositCollections).toBe(200);
    expect(data.formerTenants.tenantCount).toBe(1);
    expect(data.formerTenants.total).toBe(4290);
    expect(data.delinquency.tenants.every(row=>row.tenantId!=='former')).toBe(true);
  });
  test('historical charges retain the reviewed former final month', async () => {
    const data = await overview('2026-05-01','2026-06-01');
    expect(data.summary.expectedRent).toBe(1630);
    expect(data.expectedPayments.find(row=>row.tenantId==='former')).toMatchObject({period:'2026-05',expected:600,paid:0,outstanding:600,status:'unpaid'});
  });
  test('overpaid active rent does not cover another tenant balance', async () => {
    const data = await overview('2026-06-01','2026-07-01',
      [{...baseTenant(),_id:'unpaid'}],
      [{tenantId:'tenant-a',date:'2026-06-05',periodMonth:'2026-06',amount:2000,applyTo:'rent'}]
    );
    expect(data.summary.expectedRent).toBe(2060);
    expect(data.summary.rentCollected).toBe(1030);
    expect(data.summary.rentOutstanding).toBe(1030);
    expect(data.summary.totalCashCollected).toBe(2950);
    expect(data.expectedPayments.find(row=>row.tenantId==='tenant-a').status).toBe('paid');
    expect(data.expectedPayments.find(row=>row.tenantId==='unpaid').status).toBe('unpaid');
  });
  test('former accounts with missing lease dates are explicitly flagged, not settled', async () => {
    const data = await overview('2026-06-01','2026-07-01',
      [{_id:'legacy',name:'Legacy former tenant',leaseStatus:'terminated',baseRent:1000}]
    );
    expect(data.formerTenants.needsReview).toBe(1);
    expect(data.formerTenants.tenants.find(row=>row.tenantId==='legacy')).toMatchObject({balance:null,needsReview:true});
  });
  test('future months are scheduled and zero-rent leases have no charge', async () => {
    const data = await overview('2026-11-01','2026-12-01',[{...baseTenant(),_id:'zero',baseRent:0,waterFee:0}]);
    expect(data.expectedPayments.find(row=>row.tenantId==='tenant-a').status).toBe('scheduled');
    expect(data.expectedPayments.find(row=>row.tenantId==='zero').status).toBe('no-charge');
    expect(data.expectedPayments.reduce((sum,row)=>sum+row.expected,0)).toBe(data.summary.expectedRent);
    expect(data.expectedPayments.reduce((sum,row)=>sum+row.outstanding,0)).toBe(data.summary.rentOutstanding);
  });
  test.each([
    ['America/Chicago','2026-10-01T05:00:00Z','2026-11-01T05:00:00Z',['2026-10']],
    ['Asia/Tokyo','2026-09-30T15:00:00Z','2026-10-31T15:00:00Z',['2026-10']],
    ['Pacific/Kiritimati','2026-09-30T10:00:00Z','2026-10-31T10:00:00Z',['2026-10']],
    ['America/Chicago','2026-11-01T05:00:00Z','2026-12-01T06:00:00Z',['2026-11']],
    ['America/Chicago','2026-03-01T06:00:00Z','2026-04-01T05:00:00Z',['2026-03']],
    ['America/Chicago','2026-10-01T05:00:00Z','2027-01-01T06:00:00Z',['2026-10','2026-11','2026-12']],
    ['Asia/Tokyo','2025-12-31T15:00:00Z','2026-12-31T15:00:00Z',Array.from({length:12},(_,i)=>`2026-${String(i+1).padStart(2,'0')}`)]
  ])('rent periods respect %s calendar boundaries from %s to %s', async (timeZone,from,to,periods) => {
    const data = await overview(from,to,[],[],timeZone);
    expect(data.expectedPayments.filter(row=>row.tenantId==='tenant-a').map(row=>row.period)).toEqual(periods);
    expect(data.expectedPayments.every(row=>periods.includes(row.period))).toBe(true);
    expect(data.summary.periodMonths).toBe(periods.length);
    expect(data.summary.expectedRent).toBe(data.expectedPayments.reduce((sum,row)=>sum+row.expected,0));
    expect(data.summary.rentOutstanding).toBe(data.expectedPayments.reduce((sum,row)=>sum+row.outstanding,0));
    if (periods.length===1) {
      expect(data.expectedPayments.every(row=>row.expected===1030)).toBe(true);
      expect(data.summary.expectedRent).toBe(1030*data.expectedPayments.length);
      expect(data.financials.expenseBreakdown.grossPotentialRent).toBe(1030);
    }
  });
  test('zoned rent periods preserve exclusive receipt timestamp filters', async () => {
    const from='2026-06-01T05:00:00Z',to='2026-07-01T05:00:00Z';
    const data = await overview(from,to,[],[
      {tenantId:'tenant-a',date:'2026-06-01T04:59:59Z',periodMonth:'2026-06',amount:10},
      {tenantId:'tenant-a',date:from,periodMonth:'2026-06',amount:20},
      {tenantId:'tenant-a',date:'2026-07-01T04:59:59Z',periodMonth:'2026-06',amount:30},
      {tenantId:'tenant-a',date:to,periodMonth:'2026-07',amount:40}
    ],'America/Chicago');
    expect(data.expectedPayments.map(row=>row.period)).toEqual(['2026-06']);
    expect(data.summary.cashRentCollected).toBe(950);
    expect(data.range).toMatchObject({timeZone:'America/Chicago'});
  });
  test('invalid overview time zones are rejected explicitly', async () => {
    const data = await overview('2026-10-01','2026-11-01',[],[],'Invalid/Zone',400);
    expect(data).toEqual({message:'Choose a valid overview time zone'});
  });
  test('a month that has started in the selected calendar is not scheduled', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-30T16:00:00Z'));
    try {
      const data = await overview('2026-09-30T15:00:00Z','2026-10-31T15:00:00Z',[],[],'Asia/Tokyo');
      expect(data.expectedPayments).toHaveLength(1);
      expect(data.expectedPayments[0]).toMatchObject({period:'2026-10',status:'unpaid'});
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('former ledger retention', () => {
  test.each(['terminated','expired','active'])('%s tenant with protected history cannot be deleted', async status => {
    const context={
      app:{delete:jest.fn()},
      Tenant:{findOne:jest.fn().mockResolvedValue({_id:'tenant-a',leaseStatus:status}),findByIdAndDelete:jest.fn()},
      Payment:{exists:jest.fn().mockResolvedValue(true)},Unit:{updateOne:jest.fn()}
    };
    require('../server/flows/tenants')(context).delete_api_properties_propertyId_tenants_tenantId();
    const res=response();
    await context.app.delete.mock.calls[0][1]({params:{propertyId:'property-a',tenantId:'tenant-a'}},res);
    expect(res.code).toBe(409);
    expect(context.Tenant.findByIdAndDelete).not.toHaveBeenCalled();
    expect(context.Unit.updateOne).not.toHaveBeenCalled();
  });

  describe('former receipts use the applied rent period, not the receipt month', () => {
    function setup() {
      const tenant={...baseTenant(),leaseStatus:'terminated',termination:{effectiveDate:'2026-06-15'},monthlyOverrides:{'2026-06':{expectedRent:650}}};
      const context=calculationContext();
      const saved=[];
      function Payment(data){Object.assign(this,data,{_id:'payment-a'});this.save=jest.fn(async()=>saved.push(this));}
      Payment.find=jest.fn().mockResolvedValue([]);
      Object.assign(context,{
        app:{post:jest.fn()},Tenant:{findById:jest.fn().mockResolvedValue(tenant)},
        Payment,scheduleAutomaticQuickBooksPaymentSync:jest.fn()
      });
      require('../server/flows/payments')(context).post_api_properties_propertyId_payments();
      const handler=context.app.post.mock.calls[0][1];
      const body={tenantId:'tenant-a',unitId:'unit-a',type:'rent',applyTo:'rent',amount:100,method:'cash',date:'2026-10-01',periodMonth:'2026-06'};
      return{handler,body,saved};
    }
    test('a later cash receipt pays the reviewed final-month charge', async () => {
      const {handler,body,saved}=setup();
      const res=response();
      await handler({params:{propertyId:'property-a'},body},res);
      expect(res.code).toBe(201);
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({periodMonth:'2026-06',date:'2026-10-01',amount:100,balance:550});
    });
    test('a new post-termination rent period is explicitly rejected', async () => {
      const {handler,body,saved}=setup();
      const res=response();
      await handler({params:{propertyId:'property-a'},body:{...body,periodMonth:'2026-10'}},res);
      expect(res.code).toBe(400);
      expect(res.payload.message).toMatch(/ended lease/);
      expect(saved).toHaveLength(0);
    });
  });
});
