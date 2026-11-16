const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setup(candidates) {
  const elements = {};
  const button = {disabled:false, addEventListener: jest.fn((_event, callback) => { button.click = callback; })};
  const error = {textContent:''};
  const modal = {
    style:{display:'none'}, innerHTML:'', setAttribute:jest.fn(),
    querySelector:jest.fn(() => modal.choice || null)
  };
  const payment = {id:'p1',tenantId:'t1',tenantName:'Jane <Doe>',amount:100,date:'2026-11-10',periodMonth:'2026-11'};
  const response = data => ({ok:true,json:async()=>data});
  const fetch = jest.fn()
    .mockResolvedValueOnce(response({payment,candidates}))
    .mockResolvedValueOnce(response({success:true}));
  const context = vm.createContext({
    state:{currentProperty:{_id:'property-1'}}, API_URL:'/api', fetch,
    document:{
      getElementById:id => id === 'quickBooksMatchModal' ? elements[id] : id === 'confirmQuickBooksMatch' && candidates.length ? button : id === 'quickBooksMatchError' ? error : null,
      createElement:()=>modal,
      body:{appendChild:node => {elements[node.id]=node;}}
    },
    openModal:()=>{modal.style.display='flex';}, closeModal:()=>{modal.style.display='none';},
    escapeHtml:value=>String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
    formatDateDisplay:value=>value,
    showNotification:jest.fn(), loadPayments:jest.fn().mockResolvedValue(), console
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/property-management/js/quickbooks.js'),'utf8'),context);
  return {context,modal,button,error,fetch,payment};
}

const candidate = {
  sourceType:'Payment',id:'qb-1',customerName:'Jane Doe',txnDate:'2026-11-11',amount:100,
  periodMonth:'2026-12',invoiceNumber:'INV-1',docNumber:'A1',dateMatches:false,periodMatches:false
};

test('shows local payment, candidate details and warnings without linking until confirmed', async () => {
  const {context,modal,button,error,fetch} = setup([candidate]);
  await context.openQuickBooksMatchModal('p1');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(modal.innerHTML).toContain('Jane &lt;Doe&gt;');
  expect(modal.innerHTML).toContain('Date differs');
  expect(modal.innerHTML).toContain('Linking changes the rent period to 2026-12');
  expect(modal.innerHTML).toContain('Invoice INV-1');
  await button.click();
  expect(error.textContent).toBe('Select a transaction to link.');
  expect(fetch).toHaveBeenCalledTimes(1);
  modal.choice = {value:'0'};
  await button.click();
  const [url, options] = fetch.mock.calls[1];
  expect(url).toBe('/api/properties/property-1/quickbooks/payment-workspace/link');
  expect(JSON.parse(options.body)).toMatchObject({
    paymentId:'p1',sourceType:'Payment',entityId:'qb-1',
    reviewedMatch:{tenantId:'t1',amount:100,periodMonth:'2026-11',txnDate:'2026-11-11',invoicePeriod:'2026-12'}
  });
  expect(context.loadPayments).toHaveBeenCalledWith('property-1',true);
  expect(modal.style.display).toBe('none');
});

test('empty results explain how to retry and do not offer a link action', async () => {
  const {context,modal,fetch} = setup([]);
  await context.openQuickBooksMatchModal('p1');
  expect(modal.innerHTML).toContain('No eligible matches found');
  expect(modal.innerHTML).not.toContain('Link selected');
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('a suggested exact match still requires explicit confirmation', async () => {
  const {context,modal,button,fetch} = setup([{...candidate,dateMatches:true,periodMatches:true}]);
  await context.openQuickBooksMatchModal('p1');
  expect(modal.innerHTML).toContain('Suggested');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(button.click).toBeDefined();
});

test('a failed link stays open and exposes the server error', async () => {
  const {context,modal,button,error,fetch} = setup([candidate]);
  fetch.mockReset()
    .mockResolvedValueOnce({ok:true,json:async()=>({payment:{id:'p1',tenantId:'t1',tenantName:'Jane',amount:100,date:'2026-11-10',periodMonth:'2026-11'},candidates:[candidate]})})
    .mockResolvedValueOnce({ok:false,json:async()=>({message:'Already linked'})});
  await context.openQuickBooksMatchModal('p1');
  modal.choice = {value:'0'};
  await button.click();
  expect(error.textContent).toBe('Already linked');
  expect(button.disabled).toBe(false);
  expect(modal.style.display).toBe('flex');
});
