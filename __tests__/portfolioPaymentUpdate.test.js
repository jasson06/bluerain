const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = name => fs.readFileSync(path.join(__dirname, '../dist/property-management/js', name), 'utf8');

function row(id, legacy = false) {
    return {
        dataset: legacy ? {tenantId:id, balance:'with-balance'} : {},
        cells: Array.from({length:8}, () => ({textContent:'unchanged',innerHTML:'unchanged'})),
        querySelector: () => legacy ? null : {dataset:{portfolioRentTenant:id}}
    };
}

function setup() {
    const tenant = {_id:'alice',projectId:'property',baseRent:1000,leaseStatus:'active'};
    const rows = [row('alice'),row('bob'),row('alice',true)];
    const form = {
        dataset:{editMode:'false'},reset:jest.fn(),
        querySelector:() => ({textContent:''})
    };
    const values = {
        paymentProperty:'property',paymentTenant:'alice',paymentUnit:'unit',paymentAmount:'400',
        paymentType:'payment',paymentApplyTo:'rent',paymentPeriodMonth:'2020-06',
        paymentDate:'2020-06-10',paymentLateFee:'0'
    };
    const nodes = {portfolioComparisonSearch:{value:'alice'},portfolioWorkspaceFilter:{value:'unpaid'}};
    const state = {
        portfolioPaymentsLoaded:true, portfolioPayments:[], payments:[], currentProperty:{_id:'property'},
        portfolioMode:true,currentTab:'payments',currentPortfolioDetailsType:'rent',
        portfolioRentMonth:'2020-06',portfolioComparisonPage:3,
        portfolioTenantsWithBalance:[
            {tenant,expectedMonthly:1000,paidThisMonth:0,remainingRent:1000},
            {tenant:{...tenant,_id:'bob'},expectedMonthly:1000,paidThisMonth:0,remainingRent:1000}
        ]
    };
    const payment = {_id:'payment',tenantId:'alice',projectId:'property',amount:400,applyTo:'rent',date:'2020-06-10',periodMonth:'2020-06'};
    const context = vm.createContext({
        state,API_URL:'/api',console:{error:jest.fn()},
        document:{
            querySelectorAll:() => rows,
            getElementById:id => nodes[id] || (id in values || id.startsWith('payment')
                ? {value:values[id] || '',checked:false} : null)
        },
        fetch:jest.fn().mockResolvedValue({ok:true,json:async()=>({payment})}),
        showNotification:jest.fn(),showLoader:jest.fn(),hideLoader:jest.fn(),
        closeModal:jest.fn(),invalidateCache:jest.fn(),refreshContent:jest.fn(),
        dateInputToISOAtNoon:value=>value,
        renderPortfolioOverview:jest.fn(),renderPortfolioDetails:jest.fn()
    });
    vm.runInContext(source('shared-utilities.js'), context);
    vm.runInContext(source('portfolio-dashboard.js'), context);
    vm.runInContext(source('payments-charges.js'), context);
    context.portfolioMoney = value => `$${value.toFixed(2)}`;
    context.renderPortfolioOverview = jest.fn();
    return {context,state,rows,nodes,form,payment};
}

test('saving updates only the tenant row without refreshing the portfolio or losing controls', async () => {
    const {context,state,rows,nodes,form} = setup();
    const otherRow = JSON.stringify(rows[1]);
    await context.handleAddPayment({preventDefault:jest.fn(),target:form});
    expect(context.fetch).toHaveBeenCalledTimes(1);
    expect(context.renderPortfolioOverview).not.toHaveBeenCalled();
    expect(context.renderPortfolioDetails).not.toHaveBeenCalled();
    expect(context.refreshContent).not.toHaveBeenCalled();
    expect(state.portfolioTenantsWithBalance[0]).toMatchObject({paidThisMonth:400,remainingRent:600});
    expect(rows[0].cells[4].textContent).toBe('$400.00');
    expect(rows[0].cells[6].innerHTML).toBe('Partial');
    expect(rows[2].cells[5].innerHTML).toBe('$600.00');
    expect(JSON.stringify(rows[1])).toBe(otherRow);
    expect(rows[0].cells[7].textContent).toBe('unchanged');
    expect(state.portfolioComparisonPage).toBe(3);
    expect(nodes.portfolioComparisonSearch.value).toBe('alice');
    expect(nodes.portfolioWorkspaceFilter.value).toBe('unpaid');
    expect(form.reset).toHaveBeenCalled();
});

test('upserts edited payments and keeps the selected month rather than the receipt month', () => {
    const {context,state,rows,payment} = setup();
    context.updatePortfolioTenantAfterPayment(payment);
    context.updatePortfolioTenantAfterPayment({...payment,amount:1000});
    expect(state.portfolioPayments).toHaveLength(1);
    expect(state.portfolioTenantsWithBalance[0].remainingRent).toBe(0);
    expect(rows[0].cells[6].innerHTML).toContain('Paid');
    expect(rows[2].dataset.balance).toBe('no-balance');
    context.updatePortfolioTenantAfterPayment({...payment,amount:1000,periodMonth:'2020-05'});
    expect(state.portfolioTenantsWithBalance[0].paidThisMonth).toBe(0);
    expect(rows[0].cells[6].innerHTML).toBe('Unpaid');
});

test('excludes deposits, voids and future receipts from the selected rent month', () => {
    const {context,state,payment} = setup();
    for (const change of [{applyTo:'deposit'},{postingStatus:'voided'},{date:'2099-06-10'}]) {
        context.updatePortfolioTenantAfterPayment({...payment,...change});
        expect(state.portfolioTenantsWithBalance[0].paidThisMonth).toBe(0);
    }
});

test('does not seed an unloaded portfolio cache with an incomplete payment list', () => {
    const {context,state,payment} = setup();
    state.portfolioPaymentsLoaded = false;
    state.portfolioTenantsWithBalance = [];
    context.updatePortfolioTenantAfterPayment(payment);
    expect(state.portfolioPayments).toEqual([]);
    expect(state.payments).toHaveLength(1);
});

test('a failed save leaves portfolio rows unchanged and reports an error', async () => {
    const {context,state,rows,form} = setup();
    context.fetch.mockResolvedValue({ok:false});
    await context.handleAddPayment({preventDefault:jest.fn(),target:form});
    expect(state.portfolioPayments).toHaveLength(0);
    expect(rows[0].cells[4].textContent).toBe('unchanged');
    expect(context.showNotification).toHaveBeenCalledWith('Failed to save payment','error');
    expect(form.reset).not.toHaveBeenCalled();
});

test('preserves the property Payments tab refresh outside the portfolio', async () => {
    const {context,state,form} = setup();
    state.portfolioMode = false;
    await context.handleAddPayment({preventDefault:jest.fn(),target:form});
    expect(context.refreshContent).toHaveBeenCalledWith('payments');
    expect(context.renderPortfolioOverview).not.toHaveBeenCalled();
});

test('refreshes only the affected property summary and never replaces the workspace', async () => {
    const {context,state} = setup();
    state.portfolioOverviewByProperty = new Map([['property',{}]]);
    context.getPortfolioExecutiveRange = () => ({});
    context.overviewRangeQuery = () => 'period=month';
    const value = {textContent:'old'};
    const card = {querySelector:selector => selector === '.portfolio-executive-value' ? value : {}};
    context.document.getElementById = id => id === 'portfolioExecutiveKpis'
        ? {querySelector:()=>card,querySelectorAll:()=>[]} : null;
    context.fetch.mockResolvedValue({ok:true,json:async()=>({summary:{rentCollected:400,expectedRent:1000,rentOutstanding:600}})});
    await context.refreshPortfolioPaymentSummary('property');
    expect(context.fetch).toHaveBeenCalledTimes(1);
    expect(context.fetch).toHaveBeenCalledWith('/api/properties/property/overview?period=month');
    expect(state.portfolioOverviewByProperty.get('property').summary.rentCollected).toBe(400);
    expect(context.renderPortfolioOverview).not.toHaveBeenCalled();
});

test('a summary refresh failure reports that the payment was saved without retrying it', async () => {
    const {context,state,form} = setup();
    state.portfolioOverviewByProperty = new Map([['property',{}]]);
    context.getPortfolioExecutiveRange = () => ({});
    context.overviewRangeQuery = () => 'period=month';
    context.fetch.mockResolvedValueOnce({ok:true,json:async()=>({payment:{
        _id:'saved',tenantId:'alice',projectId:'property',amount:400,date:'2020-06-10',periodMonth:'2020-06'
    }})}).mockResolvedValueOnce({ok:false});
    await context.handleAddPayment({preventDefault:jest.fn(),target:form});
    expect(context.fetch).toHaveBeenCalledTimes(2);
    expect(state.portfolioPayments).toHaveLength(1);
    expect(form.reset).toHaveBeenCalled();
    expect(context.showNotification).toHaveBeenLastCalledWith(
        'Payment saved. Portfolio summary could not refresh; use Refresh to update it.', 'error'
    );
    expect(context.renderPortfolioOverview).not.toHaveBeenCalled();
});
