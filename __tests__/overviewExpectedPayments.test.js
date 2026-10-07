const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setup() {
  const context = vm.createContext({
    API_URL:'/api',
    URLSearchParams,
    escapeHtml:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
    overviewMoney:value=>`$${Number(value).toFixed(2)}`
  });
  for (const file of ['shared-utilities.js','property-overview.js','quickbooks.js','portfolio-dashboard.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/property-management/js',file),'utf8'),context);
  }
  return context;
}

test('expected rent list renders all statuses and monthly amounts',()=>{
  const context=setup();
  const rows=['paid','partial','unpaid','scheduled','no-charge'].map((status,index)=>({
    tenantId:`tenant-${index}`,tenantName:`Tenant ${index}`,period:'2026-10',unitNumber:index,
    expected:1000,paid:400,outstanding:600,status
  }));
  const html=context.renderOverviewExpectedPayments(rows);
  for(const label of ['Paid','Partially paid','Unpaid','Scheduled','No charge'])expect(html).toContain(`>${label}</span>`);
  expect(html.match(/class="overview-expected-payment"/g)).toHaveLength(5);
  expect(html).toContain('<strong>$1000.00</strong>');
  expect(html).toContain('<strong>$600.00</strong>');
  expect(html).toContain('Applied payments / credits: $400.00');
  expect(html).toContain('Unit 0');
  expect(html).toContain("openTenantLeaseLedger('tenant-0')");
});

test('expected rent list escapes tenant data and explains an empty selected period',()=>{
  const context=setup();
  const html=context.renderOverviewExpectedPayments([{tenantId:'id',tenantName:'<script>',period:'2026-10',unitNumber:'<unit>',expected:0,paid:0,outstanding:0,status:'no-charge'}]);
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script>');
  expect(html).toContain('&lt;unit>');
  expect(context.renderOverviewExpectedPayments([])).toContain('No expected rent payments in the selected period.');
});

test('an empty or missing breakdown with $86 totals is an error, not an empty state',()=>{
  const context=setup();
  context.console={error:jest.fn()};
  const summary={expectedRent:86,rentCollected:0,rentOutstanding:86};
  for(const rows of [undefined,[]]){
    const html=context.renderOverviewExpectedPayments(rows,summary);
    expect(html).not.toContain('No expected rent payments');
    expect(html).toContain('overview-alert');
    expect(html).toContain('Refresh overview');
  }
});

test('a valid $86 expected payment reconciles with the overview and is displayed',()=>{
  const context=setup();
  const rows=[{tenantId:'tenant-a',tenantName:'Tenant A',period:'2026-10',unitNumber:'1',expected:86,paid:0,outstanding:86,status:'unpaid'}];
  const summary={expectedRent:86,rentCollected:0,rentOutstanding:86};
  expect(()=>context.validateOverviewExpectedPayments({expectedPayments:rows,summary})).not.toThrow();
  expect(context.renderOverviewExpectedPayments(rows,summary)).toContain('<strong>$86.00</strong>');
  expect(context.renderOverviewExpectedPayments(rows,summary)).toContain('Unpaid');
  expect(context.renderOverviewExpectedPayments([],{expectedRent:0,rentCollected:0,rentOutstanding:0})).toContain('No expected rent payments');
});

test('compact payment rows retain full details and the existing keyboard-accessible ledger action',()=>{
  const context=setup();
  const row={tenantId:'tenant-a',tenantName:'A long tenant name',period:'2026-10',unitNumber:'12',expected:1000,paid:400,outstanding:600,status:'partial'};
  const html=context.renderOverviewExpectedPayments([row]);
  expect(html).not.toContain('class="overview-row"');
  expect(html).not.toContain('class="task-meta"');
  expect(html).toContain('title="A long tenant name · Unit 12 · 2026-10 · Partially paid. Expected: $1000.00. Outstanding: $600.00. Applied payments / credits: $400.00."');
  expect(html).toContain('aria-label="Open tenant lease ledger:');
  expect(html).toContain('<button type="button"');
  context.openTenantLeaseLedger=jest.fn();
  vm.runInContext(html.match(/onclick="([^"]+)"/)[1],context);
  expect(context.openTenantLeaseLedger).toHaveBeenCalledWith('tenant-a');
});

test('compact payment rows escape hover details and omit missing units',()=>{
  const context=setup();
  const row={tenantId:'tenant-a',tenantName:'Tenant "quoted" <name>',period:'2026-10',unitNumber:'',expected:0,paid:0,outstanding:0,status:'no-charge'};
  const html=context.renderOverviewExpectedPayments([row]);
  expect(html).toContain('title="Tenant &quot;quoted&quot; &lt;name>');
  expect(html).not.toContain(' · Unit ');
  expect(html).toContain('>No charge</span>');
});

test('payment table provides column headers and sticky styles inside its scroll container',()=>{
  const context=setup();
  const html=context.renderOverviewExpectedPayments([{tenantId:'id',tenantName:'Tenant',period:'2026-10',expected:100,paid:0,outstanding:100,status:'unpaid'}]);
  expect(html).toContain('<table class="overview-payments-table" aria-label="Expected rent payments">');
  for (const label of ['Tenant / Unit','Status','Expected','Due']) {
    expect(html).toContain(`<th scope="col">${label}</th>`);
  }
  expect(html).toContain('</thead><tbody><tr class="overview-expected-payment"');
  expect(html).toContain('</tbody></table></div>');
  const css=fs.readFileSync(path.join(__dirname,'../dist/property-management/css/overview-details.css'),'utf8');
  expect(css).toMatch(/\.overview-expected-payments\{[^}]*max-height:380px;overflow:auto/);
  expect(css).toMatch(/\.overview-payments-table th\{[^}]*position:sticky;top:0;z-index:1;background:/);
  expect(css).toContain('body.dark-theme .overview-payments-table th{background:');
});

test('KPI popovers summarize collected rent for the selected period and escape tenant data',()=>{
  const context=setup();
  const html=context.renderPropertyKpiPopover('collected',{
    expectedPayments:[
      {tenantId:'tenant-a',tenantName:'Tenant <A>',period:'2026-11',unitNumber:'2',expected:1000,paid:750,outstanding:250},
      {tenantId:'tenant-b',tenantName:'Tenant B',period:'2026-11',unitNumber:'3',expected:1000,paid:0,outstanding:1000}
    ]
  });
  expect(html).toContain('role="dialog"');
  expect(html).toContain('Payments and credits applied to rent in the selected period.');
  expect(html).toContain('Tenant &lt;A>');
  expect(html).toContain('2026-11 · Applied');
  expect(html).toContain('$750.00');
  expect(html).not.toContain('Tenant B');
});

test('each remaining property KPI has a useful detail list or empty state',()=>{
  const context=setup();
  const data={
    generatedAt:'2026-10-07T12:00:00Z',
    expectedPayments:[
      {tenantId:'active',tenantName:'Current Tenant',period:'2026-10',unitNumber:'1',expected:1000,paid:700,outstanding:300},
      {tenantId:'former',tenantName:'Former Tenant',period:'2026-10',unitNumber:'2',expected:800,paid:0,outstanding:800}
    ],
    tenants:[
      {_id:'active',name:'Current Tenant',leaseStatus:'active',leaseEnd:'2026-10-20',unitNumber:'1'},
      {_id:'former',name:'Former Tenant',leaseStatus:'terminated',leaseEnd:'2026-10-01',unitNumber:'2'}
    ],
    unitsRequiringAttention:[{number:'4',status:'vacant',rent:1200,reasons:['Vacant']}],
    maintenance:[{title:'Repair sink',status:'open',priority:'urgent',unitNumber:'1'}],
    equipment:[{name:'Water heater',unitNumber:'1',nextServiceDate:'2026-10-20',warrantyExpires:'2026-11-01'}]
  };
  expect(context.renderPropertyKpiPopover('occupancy',data)).toContain('Current Tenant');
  expect(context.renderPropertyKpiPopover('rentRoll',data)).toContain('Current Tenant');
  expect(context.renderPropertyKpiPopover('rentRoll',data)).not.toContain('Former Tenant');
  expect(context.renderPropertyKpiPopover('outstanding',data)).toContain('$300.00');
  expect(context.renderPropertyKpiPopover('vacant',data)).toContain('Unit 4');
  expect(context.renderPropertyKpiPopover('maintenance',data)).toContain('Repair sink');
  expect(context.renderPropertyKpiPopover('leaseRisk',data)).toContain('Current Tenant');
  expect(context.renderPropertyKpiPopover('leaseRisk',data)).not.toContain('Former Tenant');
  const equipment=context.renderPropertyKpiPopover('equipmentDue',data);
  expect(equipment).toContain('Service due');
  expect(equipment).toContain('Warranty expires');
  expect(context.renderPropertyKpiPopover('vacant',{unitsRequiringAttention:[]})).toContain('There are no vacant units.');
});

test('outdated cached overview is fetched again before rendering',async()=>{
  const context=setup();
  const grid={innerHTML:''};
  const range={from:'2026-10-01T00:00:00Z',to:'2026-11-01T00:00:00Z',timeZone:'America/Chicago'};
  const data={property:{_id:'property-a'},range,summary:{expectedRent:86,rentCollected:0,rentOutstanding:86}};
  const fresh={...data,expectedPayments:[{expected:86,paid:0,outstanding:86}]};
  context.state={currentProperty:{_id:'property-a'},propertyOverviewData:data};
  context.document={getElementById:()=>grid};
  context.getOverviewRange=()=>range;
  context.console={warn:jest.fn(),error:jest.fn()};
  context.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>fresh});
  context.renderPropertyOverviewPanels=jest.fn();
  await context.renderPropertyOverview();
  expect(context.fetch).toHaveBeenCalledWith(expect.stringContaining('/properties/property-a/overview?'),{cache:'no-store'});
  expect(new URL(context.fetch.mock.calls[0][0],'http://localhost').searchParams.get('timeZone')).toBe('America/Chicago');
  expect(context.renderPropertyOverviewPanels).toHaveBeenCalledWith(fresh);
  expect(context.state.propertyOverviewData).toBe(fresh);
});

test('a response missing the breakdown never renders the false empty message',async()=>{
  const context=setup();
  const grid={innerHTML:''},financial={innerHTML:'Old totals'};
  context.state={currentProperty:{_id:'property-a'}};
  context.document={getElementById:id=>id==='propertyOverviewGrid'?grid:financial};
  context.getOverviewRange=()=>({from:'2026-10-01',to:'2026-11-01'});
  context.console={error:jest.fn()};
  context.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({summary:{expectedRent:86,rentCollected:0,rentOutstanding:86}})});
  context.renderPropertyOverviewPanels=jest.fn();
  await context.renderPropertyOverview();
  expect(context.renderPropertyOverviewPanels).not.toHaveBeenCalled();
  expect(financial.innerHTML).toContain('details are unavailable');
  expect(financial.innerHTML).not.toContain('No expected rent payments');
  expect(context.state.propertyOverviewData).toBeNull();
});

test('overview and portfolio ranges send the browser time zone and an exclusive month boundary',()=>{
  const context=setup();
  context.document={getElementById:()=>({value:'month'})};
  const timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  for (const range of [context.getOverviewRange(),context.getPortfolioExecutiveRange()]) {
    expect(range.timeZone).toBe(timeZone);
    const query=new URLSearchParams(context.overviewRangeQuery(range));
    expect(query.get('from')).toBe(range.from);
    expect(query.get('to')).toBe(range.to);
    expect(query.get('timeZone')).toBe(timeZone);
    const end=new Date(range.to);
    expect(end.getDate()).toBe(1);
    expect(end.getHours()).toBe(0);
    expect(end.getMilliseconds()).toBe(0);
  }
});

test('a cached overview without the selected time zone is refreshed',async()=>{
  const context=setup(),grid={innerHTML:''};
  const range={from:'2026-10-01T05:00:00Z',to:'2026-11-01T05:00:00Z',timeZone:'America/Chicago'};
  const cached={property:{_id:'property-a'},range:{from:range.from,to:range.to},summary:{expectedRent:0,rentCollected:0,rentOutstanding:0},expectedPayments:[]};
  const fresh={...cached,range};
  context.state={currentProperty:{_id:'property-a'},propertyOverviewData:cached};
  context.document={getElementById:()=>grid};
  context.getOverviewRange=()=>range;
  context.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>fresh});
  context.renderPropertyOverviewPanels=jest.fn();
  await context.renderPropertyOverview();
  expect(context.fetch).toHaveBeenCalledTimes(1);
  expect(context.renderPropertyOverviewPanels).toHaveBeenCalledWith(fresh);
});
