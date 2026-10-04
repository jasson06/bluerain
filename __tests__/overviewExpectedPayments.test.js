const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setup() {
  const context = vm.createContext({
    API_URL:'/api',
    escapeHtml:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
    overviewMoney:value=>`$${Number(value).toFixed(2)}`
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/property-management/js/property-overview.js'),'utf8'),context);
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
  expect(html.match(/role="listitem"/g)).toHaveLength(5);
  expect(html).toContain('Expected <strong>$1000.00</strong>');
  expect(html).toContain('Outstanding <strong>$600.00</strong>');
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
  expect(context.renderOverviewExpectedPayments(rows,summary)).toContain('Expected <strong>$86.00</strong>');
  expect(context.renderOverviewExpectedPayments(rows,summary)).toContain('Unpaid');
  expect(context.renderOverviewExpectedPayments([],{expectedRent:0,rentCollected:0,rentOutstanding:0})).toContain('No expected rent payments');
});

test('outdated cached overview is fetched again before rendering',async()=>{
  const context=setup();
  const grid={innerHTML:''};
  const range={from:'2026-10-01T00:00:00Z',to:'2026-11-01T00:00:00Z'};
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
