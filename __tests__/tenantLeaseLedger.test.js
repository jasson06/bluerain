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
  const balanceModal = {dataset:{tenantId:'tenant-a',returnTo:'details'}};
  const scheduleContainer = {innerHTML:''};
  const rentBalance = {textContent:''};
  const drawer = {classList:{contains:()=>false}};
  const context = vm.createContext({
    state:{tenants:[tenant],allTenants:[tenant]},
    document:{getElementById:id=>id==='tenantDetailsModal'?modal:id==='tenantBalanceModal'?balanceModal:id==='tenantMonthlyBreakdown'?scheduleContainer:id==='tenantRentBalanceValue'?rentBalance:drawer},
    API_URL:'/api',
    getWorkspaceTenantRecord:()=>tenant,
    portfolioPropertyId:t=>t.projectId,
    getUnifiedCurrentPropertyPayments:()=>[],
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
  return {context,tenant,modal,drawer,balanceModal,scheduleContainer,rentBalance};
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
  test('builds an editable balance sheet schedule for every lease month', () => {
    const {context,tenant} = browserContext();
    const schedule = context.tenantBalanceLeaseSchedule(tenant,[]);
    expect(schedule.months.map(month=>month.period)).toEqual(['2026-01','2026-02','2026-03','2026-04']);
    expect(schedule.html).toContain('Monthly rent schedule');
    expect(schedule.html).toContain(`saveTenantLeaseLedgerExpected(event,'2026-02','balanceSheet')`);
    expect(schedule.html).toContain('Expected rent for 2026-02');
  });
  test('tracks the one-time deposit separately from monthly rent', () => {
    const {context,tenant} = browserContext();
    tenant.deposit=800;
    tenant.pets={depositIncrease:200};
    delete tenant.depositPaid;
    const rentMonths=context.tenantLeaseLedgerMonths(tenant,[]);
    const schedule=context.tenantBalanceLeaseSchedule(tenant,[
      {tenantId:'tenant-a',applyTo:'deposit',amount:250,date:'2026-01-10'},
      {tenantId:'tenant-a',applyTo:'deposit',amount:100,postingStatus:'voided',date:'2026-01-10'},
      {tenantId:'another',applyTo:'deposit',amount:500,date:'2026-01-10'}
    ]);
    expect(schedule.months[0]).toMatchObject({
      depositExpected:1000,depositPaid:250,depositOutstanding:750,
      expected:rentMonths[0].expected,paid:rentMonths[0].paid,outstanding:rentMonths[0].outstanding
    });
    expect(schedule.months.slice(1).every(month=>!month.depositExpected)).toBe(true);
    expect(schedule.html).toContain('Security deposit (due / paid / remaining)');
    expect(schedule.html).toContain('Rent outstanding');
  });
  test('labels monthly charges as overdue, due now, paid, or coming soon', () => {
    const {context}=browserContext();
    const month={period:'2026-11',expected:500,paid:0,outstanding:500};
    expect(context.tenantBalancePaymentStatus(month,new Date(2026,10,1))).toMatchObject({key:'due-now',label:'Due now'});
    expect(context.tenantBalancePaymentStatus(month,new Date(2026,10,2))).toMatchObject({key:'overdue',label:'Overdue'});
    expect(context.tenantBalancePaymentStatus({...month,paid:500,outstanding:0},new Date(2026,10,2))).toMatchObject({key:'paid',label:'Paid'});
    expect(context.tenantBalancePaymentStatus({...month,period:'2026-12'},new Date(2026,10,16))).toMatchObject({key:'coming-soon',label:'Coming soon'});
    expect(context.tenantBalancePaymentStatus({...month,depositOutstanding:200},new Date(2026,10,1))).toMatchObject({key:'due-now',label:'Due now'});
  });
  test('renders the full rent schedule in the balance sheet', () => {
    const {context,balanceModal,drawer} = browserContext();
    const header={innerHTML:''};
    const summary={innerHTML:'',appendChild:jest.fn(),nextSibling:{},parentNode:{insertBefore:jest.fn()}};
    const paymentsBody={innerHTML:'',appendChild:jest.fn()};
    const createdElements=[];
    const elements={
      tenantBalanceModal:balanceModal,portfolioRecordDrawer:drawer,
      tenantDetailsModal:{getAttribute:()=>null},tenantBalanceBackButton:{hidden:false},
      tenantBalancePaymentsBackButton:{hidden:false},
      tenantBalanceHeader:header,tenantBalanceSummary:summary,
      tenantPaymentsTbody:paymentsBody,
      tenantPaymentsTable:{querySelector:()=>({children:{length:7}})}
    };
    context.document.getElementById=id=>id==='tenantMonthlyBreakdown'?undefined:elements[id]||drawer;
    context.document.createElement=()=>{const element={style:{},innerHTML:''};createdElements.push(element);return element;};
    context.getUnifiedCurrentPropertyPayments=()=>[{
      tenantId:'tenant-a',date:'2026-11-15',periodMonth:'2026-10',type:'rent',
      applyTo:'rent',amount:100,balance:930,note:'October rent'
    }];
    context.state.units=[{_id:'unit-a',number:'101'}];
    context.state.tenants[0].unitId='unit-a';
    context.openTenantBalanceModal('tenant-a');
    const scheduleContainer=createdElements.find(element=>element.id==='tenantMonthlyBreakdown');
    expect(scheduleContainer).toBeDefined();
    expect(summary.parentNode.insertBefore).toHaveBeenCalledWith(scheduleContainer,summary.nextSibling);
    expect(scheduleContainer.innerHTML).toContain('Monthly rent schedule');
    expect(scheduleContainer.innerHTML).toContain('2026-04');
    expect(scheduleContainer.innerHTML).toContain('name="expectedRent"');
    expect(scheduleContainer.innerHTML).toContain('<th>Status</th>');
    expect(scheduleContainer.innerHTML).toContain('tenant-payment-status');
    expect(elements.tenantBalancePaymentsBackButton.hidden).toBe(true);
    expect(header.textContent).toBe(' - Test Tenant · Unit 101');
    const paymentRow=createdElements.find(element=>element.innerHTML?.includes('<td>2026-OCT</td>'));
    expect(paymentRow).toBeDefined();
    expect(context.openModal).toHaveBeenCalledWith('tenantBalanceModal');
  });
  test('shows the icon-only back-to-payments button in the header for inline use', () => {
    const {context,tenant,balanceModal,drawer} = browserContext();
    balanceModal.dataset.returnTo='payments';
    const paymentsBackButton={hidden:true};
    const summary={innerHTML:'',appendChild:jest.fn(),nextSibling:{},parentNode:{insertBefore:jest.fn()}};
    const elements={
      tenantBalanceModal:balanceModal,portfolioRecordDrawer:drawer,
      tenantDetailsModal:{getAttribute:()=>null},tenantBalanceBackButton:{hidden:false},
      tenantBalancePaymentsBackButton:paymentsBackButton,tenantBalanceHeader:{textContent:''},
      tenantBalanceSummary:summary,tenantMonthlyBreakdown:{innerHTML:''},
      tenantPaymentsTbody:{innerHTML:'',appendChild:jest.fn()},
      tenantPaymentsTable:{querySelector:()=>({children:{length:6}})}
    };
    context.document.getElementById=id=>elements[id]||drawer;
    context.document.createElement=()=>({style:{},innerHTML:''});
    context.state.units=[];
    context.state.currentTab='payments';
    context.showTenantLedgerInline=jest.fn();
    context.openTenantBalanceModal(tenant._id);
    expect(paymentsBackButton.hidden).toBe(false);
    expect(elements.tenantBalanceBackButton.hidden).toBe(true);
    expect(context.showTenantLedgerInline).toHaveBeenCalled();
  });
  test('exports the schedule and handles an empty payment history', () => {
    const {context}=browserContext();
    const doc={
      setFont:jest.fn(),setFontSize:jest.fn(),text:jest.fn(),setDrawColor:jest.fn(),
      setFillColor:jest.fn(),rect:jest.fn(),line:jest.fn(),
      splitTextToSize:text=>String(text).split('\n'),addPage:jest.fn(),save:jest.fn()
    };
    context.window={jspdf:{jsPDF:jest.fn(()=>doc)}};
    context.state.units=[];
    context.exportTenantPaymentsReport('tenant-a');
    const output=doc.text.mock.calls.flatMap(([value])=>Array.isArray(value)?value:[value]).join('\n');
    expect(output).toContain('Monthly rent schedule');
    expect(output).toContain('Payment history');
    expect(output).toContain('No payment history recorded.');
    expect(output).toContain('Overdue');
    expect(doc.save).toHaveBeenCalledWith('tenant_payments_report_Test_Tenant.pdf');
    expect(context.showNotification).toHaveBeenCalledWith('Monthly report exported','success');
  });
  test('wraps payment history fields within the report table', () => {
    const {context}=browserContext();
    const doc={
      setFont:jest.fn(),setFontSize:jest.fn(),text:jest.fn(),setDrawColor:jest.fn(),
      setFillColor:jest.fn(),rect:jest.fn(),line:jest.fn(),
      splitTextToSize:text=>String(text).split('\n'),addPage:jest.fn(),save:jest.fn()
    };
    context.window={jspdf:{jsPDF:jest.fn(()=>doc)}};
    context.state.units=[];
    context.getUnifiedCurrentPropertyPayments=()=>[
      {tenantId:'tenant-a',date:'2026-04-05',periodMonth:'2026-03',type:'rent',applyTo:'rent',amount:500,balance:530,note:'March payment received'},
      {tenantId:'tenant-a',date:'2026-11-15',periodMonth:'2026-11',type:'rent',applyTo:'rent',amount:25,balance:1005,note:'November payment received'}
    ];
    context.exportTenantPaymentsReport('tenant-a');
    const output=doc.text.mock.calls.flatMap(([value])=>Array.isArray(value)?value:[value]).join('\n');
    expect(output).toContain('Payment history');
    expect(output).toContain('Applied month');
    expect(output).toContain('2026-MAR');
    expect(output).toContain('2026-NOV');
    expect(output).toContain('Details');
    expect(output).toContain('March payment received');
    expect(output).toContain('$500.00');
    expect(output).not.toContain('Rent base');
    expect(output).not.toContain('Credits');
    expect(Math.max(...doc.rect.mock.calls.map(([, , ,height])=>height))).toBeLessThan(20);
    expect(doc.save).toHaveBeenCalled();
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
  test('balance sheet returns to the tenant details view', () => {
    const {context,balanceModal}=browserContext();
    context.viewTenantDetails=jest.fn();
    context.backToTenantDetailsFromBalanceSheet();
    expect(context.viewTenantDetails).toHaveBeenCalledWith(balanceModal.dataset.tenantId);
  });
  test('balance sheet returns to the originating portfolio drawer', () => {
    const {context,balanceModal}=browserContext();
    balanceModal.dataset.returnTo='portfolio';
    context.backToTenantDetailsFromBalanceSheet();
    expect(context.closeModal).toHaveBeenCalledWith('tenantBalanceModal');
    expect(context.openPortfolioRecordDrawer).toHaveBeenCalledWith('tenant',balanceModal.dataset.tenantId);
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
  test('balance sheet rent edits refresh the inline schedule and balance', async () => {
    const {context,tenant,balanceModal,scheduleContainer} = browserContext();
    balanceModal.balanceSheet={tenantId:'tenant-a',tenant,payments:[]};
    context.state.currentTab='payments';
    context.fetch.mockResolvedValue({ok:true,json:async()=>({ok:true,override:{expectedRent:650,lateFee:20,lateFeeMode:'amount'}})});
    const button={disabled:false};
    const event={preventDefault:jest.fn(),target:{elements:{expectedRent:{value:'650'}},querySelector:()=>button}};
    await context.saveTenantLeaseLedgerExpected(event,'2026-02','balanceSheet');
    expect(tenant.monthlyOverrides['2026-02']).toMatchObject({expectedRent:650,lateFee:20});
    expect(scheduleContainer.innerHTML).toContain('value="650.00"');
    expect(scheduleContainer.innerHTML).toContain('$670.00');
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
