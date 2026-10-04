const fs = require('fs');
const path = require('path');
const vm = require('vm');

function browserContext() {
  const tenant = {
    _id:'tenant-a',projectId:'property-a',name:'Test Tenant',leaseStatus:'active',
    leaseStart:'2026-01-10T12:00:00',leaseEnd:'2026-04-20T12:00:00',
    baseRent:1000,waterFee:30,monthlyOverrides:{'2026-02':{expectedRent:800,lateFee:20}}
  };
  const modal = {innerHTML:''};
  const drawer = {classList:{contains:()=>false}};
  const context = vm.createContext({
    state:{tenants:[tenant],allTenants:[tenant]},
    document:{getElementById:id=>id==='tenantDetailsModal'?modal:drawer},
    API_URL:'/api',
    getWorkspaceTenantRecord:()=>tenant,
    portfolioPropertyId:t=>t.projectId,
    escapeHtml:value=>String(value??'').replace(/</g,'&lt;'),
    formatDateDisplay:value=>String(value).slice(0,10),
    openModal:jest.fn(),closeModal:jest.fn(),closePortfolioRecordDrawer:jest.fn(),
    openPortfolioRecordDrawer:jest.fn(),viewTenantDetails:jest.fn(),
    showNotification:jest.fn(),invalidateCache:jest.fn(),
    upsertLocalTenantMonthlyOverride:jest.fn(),upsertLocalAllTenantMonthlyOverride:jest.fn(),
    fetch:jest.fn(),console
  });
  for (const file of ['shared-utilities.js','tenant-balances-reports.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/property-management/js',file),'utf8'),context);
  }
  context.showNotification=jest.fn();
  context.invalidateCache=jest.fn();
  return {context,tenant,modal,drawer};
}

describe('lease ledger month schedule', () => {
  test('lists every lease month, including months without payments, with first-month proration', () => {
    const {context,tenant} = browserContext();
    const months = context.tenantLeaseLedgerMonths(tenant,[]);
    expect(months.map(month=>month.period)).toEqual(['2026-01','2026-02','2026-03','2026-04']);
    expect(months[0].rent).toBe(709.68);
    expect(months[1]).toMatchObject({rent:800,late:20,expected:820,outstanding:820,overridden:true});
    expect(months[2]).toMatchObject({rent:1030,late:0});
  });
  test('cuts off at termination while retaining the reviewed final charge', () => {
    const {context,tenant} = browserContext();
    tenant.leaseStatus = 'terminated';
    tenant.termination = {effectiveDate:'2026-02-15T12:00:00'};
    const months = context.tenantLeaseLedgerMonths(tenant,[]);
    expect(months.map(month=>month.period)).toEqual(['2026-01','2026-02']);
    expect(months[1].expected).toBe(820);
  });
  test('matches payments by applied month and tenant instead of receipt month', () => {
    const {context,tenant} = browserContext();
    const months = context.tenantLeaseLedgerMonths(tenant,[
      {tenantId:'tenant-a',date:'2026-03-01',periodMonth:'2026-02',amount:500,appliedCredit:20},
      {tenantId:'another',date:'2026-02-01',periodMonth:'2026-02',amount:1000}
    ]);
    expect(months[1]).toMatchObject({paid:520,outstanding:300});
    expect(months[2].paid).toBe(0);
  });
  test('shows future lease months but does not count future-dated receipts as paid', () => {
    const {context,tenant} = browserContext();
    tenant.leaseEnd = '2099-02-01T12:00:00';
    tenant.leaseStart = '2099-01-01T12:00:00';
    const months = context.tenantLeaseLedgerMonths(tenant,[{tenantId:'tenant-a',date:'2099-01-01',periodMonth:'2099-01',amount:1030}]);
    expect(months).toHaveLength(2);
    expect(months[0].paid).toBe(0);
  });
  test.each([{leaseStart:null},{leaseEnd:null},{leaseStart:'invalid'},{leaseEnd:'2025-01-01'}])(
    'requires valid lease bounds %j', changes => {
      const {context,tenant} = browserContext();
      expect(()=>context.tenantLeaseLedgerMonths({...tenant,...changes},[])).toThrow(/lease start and end/);
    }
  );
});

describe('details to ledger navigation and editing', () => {
  test('the shared details renderer wires Open Ledger to the clean ledger view', () => {
    const {context}=browserContext();
    context.renderPortfolioTenantDrawerContent=()=>`<button onclick="closePortfolioRecordDrawer();openPortfolioTenantLedger('tenant-a')">Open Ledger</button>`;
    const source=fs.readFileSync(path.join(__dirname,'../dist/property-management/js/property-management.js'),'utf8');
    const start=source.indexOf('const renderTenantDetailsWithLedgerBase=');
    const end=source.indexOf('const openPortfolioRecordDrawerBase=',start);
    vm.runInContext(source.slice(start,end),context);
    const markup=context.renderPortfolioTenantDrawerContent('tenant-a');
    expect(markup).toContain(`onclick="openTenantLeaseLedger('tenant-a')"`);
    expect(markup).not.toContain('openPortfolioTenantLedger');
  });
  test('replaces details with the monthly ledger and navigates back to details', async () => {
    const {context,tenant,modal} = browserContext();
    modal.innerHTML = '<div>Old tenant details</div>';
    context.fetch.mockImplementation(async url=>({ok:true,json:async()=>url.endsWith('/tenants')?[tenant]:[]}));
    await context.openTenantLeaseLedger('tenant-a');
    expect(modal.innerHTML).not.toContain('Old tenant details');
    expect(modal.innerHTML).toContain('Back to tenant details');
    expect(modal.innerHTML).toContain('2026-01');
    expect(modal.innerHTML).toContain('2026-04');
    expect(modal.innerHTML).toContain('name="expectedRent"');
    expect(context.openModal).toHaveBeenCalledWith('tenantDetailsModal');
    context.backToTenantDetailsFromLedger();
    expect(context.viewTenantDetails).toHaveBeenCalledWith('tenant-a');
    expect(modal.leaseLedger).toBeUndefined();
  });
  test('returns to the originating portfolio drawer', async () => {
    const {context,tenant,drawer} = browserContext();
    drawer.classList.contains=()=>true;
    context.fetch.mockImplementation(async url=>({ok:true,json:async()=>url.endsWith('/tenants')?[tenant]:[]}));
    await context.openTenantLeaseLedger('tenant-a');
    context.backToTenantDetailsFromLedger();
    expect(context.closeModal).toHaveBeenCalledWith('tenantDetailsModal');
    expect(context.openPortfolioRecordDrawer).toHaveBeenCalledWith('tenant','tenant-a');
  });
  test('rent-only saving preserves the returned late-fee override and updates totals', async () => {
    const {context,tenant,modal} = browserContext();
    modal.leaseLedger={tenantId:'tenant-a',propertyId:'property-a',origin:'details',tenant,payments:[]};
    context.fetch.mockResolvedValue({ok:true,json:async()=>({ok:true,override:{expectedRent:650,lateFee:20,lateFeeMode:'amount'}})});
    const button={disabled:false};
    const event={preventDefault:jest.fn(),target:{elements:{expectedRent:{value:'650'}},querySelector:()=>button}};
    await context.saveTenantLeaseLedgerExpected(event,'2026-02');
    expect(JSON.parse(context.fetch.mock.calls[0][1].body)).toEqual({expectedRent:650});
    expect(tenant.monthlyOverrides['2026-02']).toMatchObject({expectedRent:650,lateFee:20});
    expect(modal.innerHTML).toContain('$670.00');
    expect(context.invalidateCache).toHaveBeenCalledWith('tenants','payments');
    expect(button.disabled).toBe(false);
  });
  test('closing while loading prevents a stale response from rewriting the modal', async () => {
    const {context,tenant,modal} = browserContext();
    let resolve;
    const pending=new Promise(r=>{resolve=r;});
    context.fetch.mockImplementation(()=>pending);
    const loading=context.openTenantLeaseLedger('tenant-a');
    context.closeTenantLeaseLedger();
    modal.innerHTML='Another view';
    resolve({ok:true,json:async()=>[tenant]});
    await loading;
    expect(modal.innerHTML).toBe('Another view');
  });
  test('a failed save keeps the original charge and displays an error', async () => {
    const {context,tenant,modal}=browserContext();
    modal.leaseLedger={tenantId:'tenant-a',propertyId:'property-a',origin:'details',tenant,payments:[]};
    context.fetch.mockResolvedValue({ok:false,json:async()=>({message:'Unable to save'})});
    const log=jest.spyOn(console,'error').mockImplementation(()=>{});
    const button={disabled:false};
    await context.saveTenantLeaseLedgerExpected({preventDefault:jest.fn(),target:{elements:{expectedRent:{value:'650'}},querySelector:()=>button}},'2026-02');
    expect(tenant.monthlyOverrides['2026-02'].expectedRent).toBe(800);
    expect(context.showNotification).toHaveBeenCalledWith('Unable to save','error');
    expect(button.disabled).toBe(false);
    log.mockRestore();
  });
});

function routeSetup() {
  const tenant={
    _id:'tenant-a',leaseStatus:'active',leaseStart:'2026-01-01',leaseEnd:'2026-12-31',baseRent:1000,
    monthlyOverrides:new Map([['2026-06',{expectedRent:900,lateFee:10,lateFeeMode:'percent'}]]),
    save:jest.fn().mockResolvedValue(undefined)
  };
  const session={withTransaction:jest.fn(async fn=>fn()),endSession:jest.fn()};
  const query=value=>({then:fn=>Promise.resolve(value).then(fn),session:()=>Promise.resolve(value)});
  const context={
    app:{put:jest.fn()},Tenant:{findById:jest.fn(()=>query(tenant))},
    Payment:{find:jest.fn(()=>query([]))},mongoose:{startSession:jest.fn().mockResolvedValue(session)}
  };
  Object.assign(context,require('../server/flows/payments')(context));
  context.put_api_tenants_tenantId_monthly_overrides_period();
  const handler=context.app.put.mock.calls[0][1];
  const response=()=>({code:200,status(code){this.code=code;return this;},json(payload){this.payload=payload;return this;}});
  return {context,tenant,session,handler,response};
}

describe('monthly expected-rent persistence', () => {
  test('partial rent update preserves percentage late fees and runs in a transaction', async () => {
    const {handler,tenant,session,response}=routeSetup();
    const res=response();
    await handler({params:{tenantId:'tenant-a',period:'2026-06'},body:{expectedRent:650}},res);
    expect(res.code).toBe(200);
    expect(res.payload.override).toEqual({expectedRent:650,lateFee:10,lateFeeMode:'percent'});
    expect(tenant.save).toHaveBeenCalledWith({session});
    expect(session.withTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });
  test('zero is a valid charge and explicit null clearing restores calculated rent', async () => {
    const {handler,tenant,response}=routeSetup();
    const res=response();
    await handler({params:{tenantId:'tenant-a',period:'2026-06'},body:{expectedRent:0}},res);
    expect(res.payload.override.expectedRent).toBe(0);
    const cleared=response();
    await handler({params:{tenantId:'tenant-a',period:'2026-06'},body:{expectedRent:null,lateFee:null}},cleared);
    expect(cleared.payload.override).toBeNull();
    expect(tenant.monthlyOverrides.has('2026-06')).toBe(false);
  });
  test.each([
    {period:'2026-13',body:{expectedRent:100}},
    {period:'2027-01',body:{expectedRent:100}},
    {period:'2026-06',body:{expectedRent:-1}},
    {period:'2026-06',body:{expectedRent:'invalid'}},
    {period:'2026-06',body:{lateFeeMode:'invalid'}},
    {period:'2026-06',body:{}}
  ])('rejects invalid edits without saving %j', async ({period,body})=>{
    const {handler,tenant,response}=routeSetup();
    const res=response();
    await handler({params:{tenantId:'tenant-a',period},body},res);
    expect(res.code).toBe(400);
    expect(tenant.save).not.toHaveBeenCalled();
  });
  test('editing the final month keeps the termination review amount consistent', async () => {
    const {handler,tenant,response}=routeSetup();
    tenant.leaseStatus='terminated';
    tenant.termination={effectiveDate:'2026-06-15',finalRent:900};
    const res=response();
    await handler({params:{tenantId:'tenant-a',period:'2026-06'},body:{expectedRent:450}},res);
    expect(res.code).toBe(200);
    expect(res.payload.termination.finalRent).toBe(450);
    expect(res.payload.override.lateFee).toBe(10);
  });
  test('saving expected rent recalculates payment balances in the same transaction', async () => {
    const {context,tenant,session,handler,response}=routeSetup();
    const payment={_id:'payment-a',tenantId:'tenant-a',type:'rent',applyTo:'rent',periodMonth:'2026-06',date:'2026-06-01',amount:100,balance:890};
    context.Payment.find.mockReturnValue({session:async()=>[payment]});
    context.Payment.bulkWrite=jest.fn().mockResolvedValue({});
    const res=response();
    await handler({params:{tenantId:tenant._id,period:'2026-06'},body:{expectedRent:650}},res);
    expect(res.code).toBe(200);
    expect(context.Payment.bulkWrite).toHaveBeenCalledWith([
      {updateOne:{filter:{_id:'payment-a'},update:{$set:{balance:615,lateFee:0}}}}
    ],{ordered:true,session});
  });
});
