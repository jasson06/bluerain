// Property management: property overview.
// Classic script: declarations share the page scope; startup runs in property-management.js.

function validateOverviewExpectedPayments(data){
  if(!Array.isArray(data.expectedPayments))throw new Error('Expected payment details are unavailable. Refresh the overview; if this persists, restart or update the server.');
  const sums=data.expectedPayments.reduce((totals,row)=>{
    for(const [field,key] of [['expected','expectedRent'],['paid','rentCollected'],['outstanding','rentOutstanding']]){
      if(typeof row[field]!=='number'||!Number.isFinite(row[field])||row[field]<0)throw new Error('Expected payment details contain invalid amounts. Refresh the overview.');
      totals[key]+=row[field];
    }
    return totals;
  },{expectedRent:0,rentCollected:0,rentOutstanding:0});
  for(const key of Object.keys(sums)){
    if(typeof data.summary?.[key]!=='number'||!Number.isFinite(data.summary[key])||Math.abs(sums[key]-data.summary[key])>0.01)throw new Error('Expected payment details do not match the rent totals. Refresh the overview.');
  }
}

async function renderPropertyOverview(force=false) {
  const grid=document.getElementById('propertyOverviewGrid'); if(!grid||!state.currentProperty)return;
  const propertyId=String(state.currentProperty._id),range=getOverviewRange();
  const cached=state.propertyOverviewData;
  if(!force&&cached&&String(cached.property?._id)===propertyId&&cached.range?.timeZone===range.timeZone&&new Date(cached.range?.from).getTime()===new Date(range.from).getTime()&&new Date(cached.range?.to).getTime()===new Date(range.to).getTime()){
    try{validateOverviewExpectedPayments(cached);renderPropertyOverviewPanels(cached);return;}catch(error){console.warn('Discarding outdated property overview:',error.message);state.propertyOverviewData=null;}
  }
  grid.innerHTML='<div class="empty-compact" style="grid-column:1/-1"><i class="fas fa-spinner fa-spin"></i> Building property overview…</div>';
  try{const response=await fetch(`${API_URL}/properties/${propertyId}/overview?${overviewRangeQuery(range)}`,{cache:'no-store'});if(!response.ok)throw new Error('Unable to load overview');const data=await response.json();if(String(state.currentProperty?._id)!==propertyId)return;validateOverviewExpectedPayments(data);state.propertyOverviewData=data;renderPropertyOverviewPanels(data);}catch(error){if(String(state.currentProperty?._id)!==propertyId)return;console.error('Property overview load error:',error);state.propertyOverviewData=null;grid.innerHTML=`<div class="overview-alert" style="grid-column:1/-1">${escapeHtml(error.message)} <button class="panel-link" onclick="renderPropertyOverview(true)">Try again</button></div>`;const financial=document.getElementById('overviewFinancial');if(financial)financial.innerHTML=`<div class="overview-alert">${escapeHtml(error.message)} <button class="panel-link" onclick="renderPropertyOverview(true)">Refresh overview</button></div>`;}
}

function renderOverviewExpectedPayments(rows,summary){
  if(summary){
    try{validateOverviewExpectedPayments({expectedPayments:rows,summary});}catch(error){console.error('Property overview payment mismatch:',error);return `<div class="overview-alert">${escapeHtml(error.message)} <button class="panel-link" onclick="renderPropertyOverview(true)">Refresh overview</button></div>`;}
  }
  if(!Array.isArray(rows))return '<div class="overview-alert">Expected payment details are unavailable. Refresh the overview.</div>';
  if(!rows.length)return '<div class="empty-compact">No expected rent payments in the selected period.</div>';
  const statuses={'paid':['Paid','badge-success'],'partial':['Partially paid','badge-warning'],'unpaid':['Unpaid','badge-warning'],'scheduled':['Scheduled','badge-secondary'],'no-charge':['No charge','badge-secondary']};
  return `<div class="overview-expected-payments"><table class="overview-payments-table" aria-label="Expected rent payments"><colgroup><col class="overview-payment-tenant-column"><col class="overview-payment-status-column"><col class="overview-payment-money-column"><col class="overview-payment-money-column"></colgroup><thead><tr><th scope="col">Tenant / Unit</th><th scope="col">Status</th><th scope="col">Expected</th><th scope="col">Due</th></tr></thead><tbody>${rows.map(row=>{
    const [label,badge]=statuses[row.status]||['Unknown status','badge-secondary'];
    const tenantName=row.tenantName||'Tenant',unit=row.unitNumber!==''&&row.unitNumber!=null?` · Unit ${row.unitNumber}`:'';
    const details=`${tenantName}${unit} · ${row.period} · ${label}. Expected: ${overviewMoney(row.expected)}. Outstanding: ${overviewMoney(row.outstanding)}. Applied payments / credits: ${overviewMoney(row.paid)}.`;
    return `<tr class="overview-expected-payment" title="${escapeHtml(details)}"><td><button type="button" class="link-button" aria-label="${escapeHtml(`Open tenant lease ledger: ${details}`)}" onclick="openTenantLeaseLedger('${escapeHtml(String(row.tenantId))}')">${escapeHtml(tenantName)}<span class="overview-payment-unit">${escapeHtml(unit)}</span></button></td><td><span class="badge ${badge}">${label}</span></td><td class="overview-payment-amounts"><strong>${overviewMoney(row.expected)}</strong></td><td class="overview-payment-amounts"><strong>${overviewMoney(row.outstanding)}</strong></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function propertyKpiDetail(metric,data){
  const payments=Array.isArray(data.expectedPayments)?data.expectedPayments:[];
  const tenants=Array.isArray(data.tenants)?data.tenants:[];
  const unitLabel=row=>row.unitNumber!==undefined&&row.unitNumber!==''&&row.unitNumber!=null?`Unit ${row.unitNumber}`:'';
  const paymentRows=(field,label)=>payments.filter(row=>Number(row[field])>0).map(row=>({
    title:`${row.tenantName||'Tenant'}${unitLabel(row)?` · ${unitLabel(row)}`:''}`,
    detail:`${row.period} · ${label}`,
    value:overviewMoney(row[field])
  }));
  const dateLabel=value=>value?String(value).slice(0,10):'Date not set';
  const now=new Date(data.generatedAt||Date.now()),in90Days=new Date(now.getTime()+90*86400000);
  const within90Days=value=>{const date=value?new Date(value):null;return !!date&&!Number.isNaN(date.getTime())&&date<=in90Days;};
  const rows=[];
  let title='',description='',emptyMessage='';
  switch(metric){
    case 'occupancy': {
      title='Occupied units';
      description='Current tenants in this property.';
      emptyMessage='No current tenants are listed.';
      const expectedByTenant=new Map(payments.map(row=>[String(row.tenantId),row]));
      tenants.filter(tenant=>String(tenant.leaseStatus||'active').toLowerCase()==='active').forEach(tenant=>{
        const expected=expectedByTenant.get(String(tenant._id));
        const unit=expected?.unitNumber??tenant.unit?.number??tenant.unitNumber;
        rows.push({title:tenant.name||`${tenant.firstName||''} ${tenant.lastName||''}`.trim()||'Tenant',detail:unit!==undefined&&unit!==''?`Unit ${unit}`:'Unit not listed',value:''});
      });
      break;
    }
    case 'rentRoll':
      title='Scheduled rent';
      description='Expected rent by tenant for each month in the selected period.';
      emptyMessage='No expected rent payments in the selected period.';
      const activeTenantIds=new Set(tenants.filter(tenant=>String(tenant.leaseStatus||'active').toLowerCase()==='active').map(tenant=>String(tenant._id)));
      rows.push(...payments.filter(row=>activeTenantIds.has(String(row.tenantId))&&Number(row.expected)>0).map(row=>({
        title:`${row.tenantName||'Tenant'}${unitLabel(row)?` · ${unitLabel(row)}`:''}`,
        detail:row.period,
        value:overviewMoney(row.expected)
      })));
      break;
    case 'collected':
      title='Collected rent';
      description='Payments and credits applied to rent in the selected period.';
      emptyMessage='No rent payments or credits were applied in the selected period.';
      rows.push(...paymentRows('paid','Applied'));
      break;
    case 'outstanding':
      title='Outstanding rent';
      description='Unpaid rent by tenant for the selected period.';
      emptyMessage='No rent is outstanding in the selected period.';
      rows.push(...paymentRows('outstanding','Due'));
      break;
    case 'vacant':
      title='Vacant units';
      description='Units currently marked vacant.';
      emptyMessage='There are no vacant units.';
      (Array.isArray(data.unitsRequiringAttention)?data.unitsRequiringAttention:[])
        .filter(unit=>unit.status==='vacant')
        .forEach(unit=>rows.push({title:`Unit ${unit.number??'—'}`,detail:unit.reasons?.join(' · ')||'Vacant',value:overviewMoney(unit.rent)}));
      break;
    case 'maintenance':
      title='Open maintenance';
      description='Maintenance requests that are not completed, closed, or cancelled.';
      emptyMessage='There are no open maintenance requests.';
      (Array.isArray(data.maintenance)?data.maintenance:[])
        .filter(item=>!['completed','closed','cancelled'].includes(String(item.status||'').toLowerCase()))
        .forEach(item=>rows.push({
          title:item.title||item.issue||'Maintenance request',
          detail:[item.unitNumber?`Unit ${item.unitNumber}`:'',item.priority,item.status].filter(Boolean).join(' · ')||'Open request',
          value:item.cost?overviewMoney(item.cost):''
        }));
      break;
    case 'leaseRisk':
      title='Leases expiring soon';
      description='Current tenant leases ending within the next 90 days.';
      emptyMessage='No leases are expiring within 90 days.';
      tenants.filter(tenant=>{const end=tenant.leaseEnd?new Date(tenant.leaseEnd):null;return end&&!Number.isNaN(end.getTime())&&end>=now&&end<=in90Days;})
        .forEach(tenant=>rows.push({title:tenant.name||'Tenant',detail:`Lease ends ${dateLabel(tenant.leaseEnd)}`,value:''}));
      break;
    case 'equipmentDue':
      title='Equipment due';
      description='Service due and warranties expiring within the next 90 days.';
      emptyMessage='No equipment service or warranty items are due within 90 days.';
      (Array.isArray(data.equipment)?data.equipment:[]).forEach(item=>{
        if(within90Days(item.nextServiceDate))rows.push({
          title:item.name||item.category||'Equipment',
          detail:`${item.unitNumber!=null?`Unit ${item.unitNumber} · `:''}Service due ${dateLabel(item.nextServiceDate)}`,
          value:''
        });
        if(within90Days(item.warrantyExpires))rows.push({
          title:item.name||item.category||'Equipment',
          detail:`${item.unitNumber!=null?`Unit ${item.unitNumber} · `:''}Warranty expires ${dateLabel(item.warrantyExpires)}`,
          value:''
        });
      });
      break;
    default:
      return null;
  }
  return {title,description,emptyMessage,rows};
}

function renderPropertyKpiPopover(metric,data){
  const detail=propertyKpiDetail(metric,data);
  if(!detail)return '';
  const rows=detail.rows.length
    ?detail.rows.map(row=>`<div class="property-kpi-popover-row" role="listitem"><div><strong>${escapeHtml(row.title)}</strong><span>${escapeHtml(row.detail)}</span></div>${row.value?`<b>${escapeHtml(row.value)}</b>`:''}</div>`).join('')
    :`<div class="property-kpi-popover-empty">${escapeHtml(detail.emptyMessage)}</div>`;
  return `<section class="property-kpi-popover" id="propertyKpiPopover" role="dialog" aria-label="${escapeHtml(detail.title)}"><header><div><strong>${escapeHtml(detail.title)}</strong><span>${escapeHtml(detail.description)}</span></div><button type="button" data-kpi-popover-close aria-label="Close ${escapeHtml(detail.title)} summary">×</button></header><div class="property-kpi-popover-list" role="list">${rows}</div></section>`;
}

let activePropertyKpiPopover=null;
function closePropertyKpiPopover(returnFocus=false){
  if(!activePropertyKpiPopover)return;
  const active=activePropertyKpiPopover;
  activePropertyKpiPopover=null;
  document.removeEventListener('pointerdown',active.onOutside,true);
  document.removeEventListener('keydown',active.onKeydown,true);
  window.removeEventListener('resize',active.onViewportChange);
  window.removeEventListener('scroll',active.onViewportChange,true);
  active.popover.remove();
  active.card.setAttribute('aria-expanded','false');
  active.card.removeAttribute('aria-controls');
  if(returnFocus)active.card.focus();
}

function openPropertyKpiPopover(card,metric,data){
  if(activePropertyKpiPopover?.card===card){closePropertyKpiPopover();return;}
  closePropertyKpiPopover();
  const popover=document.createElement('div');
  popover.innerHTML=renderPropertyKpiPopover(metric,data);
  const content=popover.firstElementChild;
  if(!content)return;
  document.body.appendChild(content);
  const close=returnFocus=>closePropertyKpiPopover(returnFocus);
  const onOutside=event=>{if(!content.contains(event.target)&&!card.contains(event.target))close(false);};
  const onKeydown=event=>{if(event.key==='Escape'){event.preventDefault();close(true);}};
  const onViewportChange=()=>close(false);
  activePropertyKpiPopover={card,popover:content,onOutside,onKeydown,onViewportChange};
  card.setAttribute('aria-expanded','true');
  card.setAttribute('aria-controls',content.id);
  const rect=card.getBoundingClientRect(),margin=12;
  const left=Math.max(margin,Math.min(rect.left,window.innerWidth-content.offsetWidth-margin));
  let top=rect.bottom+8;
  if(top+content.offsetHeight>window.innerHeight-margin)top=Math.max(margin,rect.top-content.offsetHeight-8);
  content.style.left=`${left}px`;
  content.style.top=`${top}px`;
  document.addEventListener('pointerdown',onOutside,true);
  document.addEventListener('keydown',onKeydown,true);
  window.addEventListener('resize',onViewportChange);
  window.addEventListener('scroll',onViewportChange,true);
  content.querySelector('[data-kpi-popover-close]')?.addEventListener('click',()=>close(true));
}

function renderPropertyOverviewPanels(data){
  const s=data.summary||{}, statusFilter=document.getElementById('overviewStatusFilter')?.value||'all';
  closePropertyKpiPopover();
  const cards=[['occupancy','Occupancy',`${s.occupancyRate||0}%`,`${s.occupied||0} of ${s.totalUnits||0} units`],['rentRoll','Rent roll',overviewMoney(s.rentRoll),'Scheduled monthly rent'],['collected','Collected',overviewMoney(s.rentCollected),`${s.collectionRate||0}% collected`],['outstanding','Outstanding',overviewMoney(s.rentOutstanding),'Current selected period'],['vacant','Vacant',s.vacant||0,`${s.maintenanceUnits||0} units offline`],['maintenance','Maintenance',s.openMaintenance||0,`${s.urgentMaintenance||0} urgent`],['leaseRisk','Lease risk',s.expiringLeases90||0,'Expiring within 90 days'],['equipmentDue','Equipment due',s.equipmentServiceDue90||0,`${s.warrantiesExpiring90||0} warranties expiring`]];
  const grid=document.getElementById('propertyOverviewGrid');grid.innerHTML=cards.map(([metric,label,value,sub])=>`<div class="property-kpi" tabindex="0" role="button" aria-haspopup="dialog" aria-expanded="false" data-kpi="${metric}"><div class="property-kpi-label">${label}</div><div class="property-kpi-value">${value}</div><div class="property-kpi-sub">${sub}</div></div>`).join('');
  grid.querySelectorAll('[data-kpi]').forEach(card=>{
    const open=()=>openPropertyKpiPopover(card,card.dataset.kpi,data);
    card.addEventListener('click',open);
    card.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target===card){event.preventDefault();open();}});
  });
  const financial=document.getElementById('overviewFinancial');if(financial)financial.innerHTML=`<div class="overview-metrics"><div class="overview-mini-stat"><span>Expected</span><strong>${overviewMoney(s.expectedRent??s.rentRoll)}</strong></div><div class="overview-mini-stat"><span>Collected</span><strong>${overviewMoney(s.rentCollected)}</strong></div><div class="overview-mini-stat"><span>Outstanding</span><strong>${overviewMoney(s.rentOutstanding)}</strong></div></div><div class="overview-progress"><span style="width:${Math.min(100,s.collectionRate||0)}%"></span></div><div class="overview-row"><span>Collection rate</span><strong>${s.collectionRate||0}%</strong></div><div style="display:flex;gap:8px;margin-top:10px"><button class="btn-secondary" onclick="runOverviewAction('payment')">Record payment</button><button class="btn-secondary" onclick="openPropertyOverviewTab('payments')">Review ledger</button></div>`;
        const income=data.financials||{},incomeRoot=document.getElementById('overviewIncomeExpenses');if(incomeRoot){const variance=income.budgetVariance,totalIncome=Number(income.rentalIncome||0)+Number(income.otherIncome||0),expenseBreakdown=income.expenseBreakdown||{},showDepositRow=Number(income.depositCollections||0)>0;incomeRoot.innerHTML=`<div class="overview-row"><span>Total operating income</span><strong>${overviewMoney(totalIncome)}</strong></div><div class="overview-row"><span>Gross potential rent</span><strong>${overviewMoney(expenseBreakdown.grossPotentialRent)}</strong></div><div class="overview-row"><span>Total expenses</span><strong style="color:#b91c1c">${overviewMoney(income.operatingExpenses)}</strong></div><div class="overview-row"><span>Maintenance expenses</span><strong style="color:#b91c1c">${overviewMoney(income.maintenanceExpenses)}</strong></div><div class="overview-row"><span>Utilities subtotal</span><strong style="color:#b91c1c">${overviewMoney(expenseBreakdown.utilitiesTotal)}</strong></div><div class="overview-row"><span>Estimated NOI</span><strong style="color:${Number(income.estimatedNOI)>=0?'#047857':'#b91c1c'}">${overviewMoney(income.estimatedNOI)}</strong></div><div class="overview-row"><span>Budget variance</span><strong style="color:${variance===null?'#64748b':Number(variance)>=0?'#047857':'#b91c1c'}">${variance===null?'Budget not set':`${Number(variance)>=0?'+':''}${overviewMoney(variance)}`}</strong></div><div class="task-meta">${income.expenseCount||0} posted expense record${income.expenseCount===1?'':'s'} in this period. Deposits are excluded from operating income.${showDepositRow?' Deposit collections are tracked separately.':''} Expense totals still include the saved property assumptions and logged maintenance and utility costs.</div>${variance===null?'<button class="btn-secondary" style="margin-top:10px" onclick="openPropertyProfileEditor()">Set operating budget</button>':''}`;}
  const delinquency=data.delinquency||{aging:{},tenants:[]},delRoot=document.getElementById('overviewDelinquency');if(delRoot){const aging=delinquency.aging||{},rows=(delinquency.tenants||[]).slice(0,5);delRoot.innerHTML=`<div class="overview-metrics"><div class="overview-mini-stat"><span>Total overdue</span><strong style="color:#b91c1c">${overviewMoney(delinquency.total)}</strong></div><div class="overview-mini-stat"><span>Tenants</span><strong>${delinquency.tenantCount||0}</strong></div><div class="overview-mini-stat"><span>90+ days</span><strong>${overviewMoney(aging.days90plus)}</strong></div></div><div class="overview-row"><span>1–30 days</span><strong>${overviewMoney(aging.current)}</strong></div><div class="overview-row"><span>31–60 days</span><strong>${overviewMoney(aging.days31to60)}</strong></div><div class="overview-row"><span>61–90 days</span><strong>${overviewMoney(aging.days61to90)}</strong></div>${rows.length?`<div class="overview-table-wrap" style="margin-top:8px"><table class="overview-table"><thead><tr><th>Tenant</th><th>Unit</th><th>Balance</th><th></th></tr></thead><tbody>${rows.map(row=>`<tr><td>${escapeHtml(row.tenantName||'Tenant')}</td><td>${escapeHtml(row.unitNumber||'—')}</td><td><strong>${overviewMoney(row.balance)}</strong></td><td><button class="overview-row-action" onclick="openDelinquentTenant('${escapeHtml(String(row.tenantId))}')">Take action</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="overview-ok" style="margin-top:10px">No tenant rent delinquency found.</div>'}`;}
  const leasing=document.getElementById('overviewLeasing');if(leasing)leasing.innerHTML=`<div class="overview-metrics"><div class="overview-mini-stat"><span>Occupied</span><strong>${s.occupied||0}</strong></div><div class="overview-mini-stat"><span>Vacant</span><strong>${s.vacant||0}</strong></div><div class="overview-mini-stat"><span>Expiring</span><strong>${s.expiringLeases90||0}</strong></div></div><div class="overview-progress"><span style="width:${s.occupancyRate||0}%"></span></div><div style="display:flex;gap:8px;margin-top:10px"><button class="btn-secondary" onclick="runOverviewAction('tenant')">Add tenant</button><button class="btn-secondary" onclick="runOverviewAction('application')">Invite applicant</button></div>`;
  if(financial)financial.insertAdjacentHTML('beforeend',`<div class="overview-row"><span>Total cash collected (excluding deposits)</span><strong>${overviewMoney(s.totalCashCollected)}</strong></div>`);
  if(financial)financial.insertAdjacentHTML('beforeend',`<h4>Expected payments</h4>${renderOverviewExpectedPayments(data.expectedPayments,s)}`);
  if(delRoot){const former=data.formerTenants||{};delRoot.insertAdjacentHTML('beforeend',`<h3>Former tenant rent balances</h3><div class="overview-row"><span>Former rent outstanding</span><strong>${overviewMoney(former.total)}</strong></div><p class="task-meta">${former.tenantCount||0} former tenants with rent owed. ${former.needsReview?`${former.needsReview} accounts need an end-date review. `:''}Deposits remain separate.</p>${(former.tenants||[]).map(row=>`<div class="overview-row"><span>${escapeHtml(row.tenantName)}</span><strong>${row.needsReview?'Needs end-date review':overviewMoney(row.balance)}</strong><button class="overview-row-action" onclick="openTenantBalanceModal('${escapeHtml(row.tenantId)}')">Ledger</button></div>`).join('')}`);}
  const maintenance=(data.maintenance||[]).filter(item=>!['completed','closed','cancelled'].includes(String(item.status||'').toLowerCase())).slice(0,5);const maintRoot=document.getElementById('overviewMaintenance');if(maintRoot)maintRoot.innerHTML=maintenance.length?`<div class="overview-table-wrap"><table class="overview-table"><thead><tr><th>Request</th><th>Priority</th><th>Status</th><th></th></tr></thead><tbody>${maintenance.map(item=>`<tr><td>${escapeHtml(item.title||'Maintenance')}</td><td><span class="task-priority ${escapeHtml(item.priority||'')}">${escapeHtml(item.priority||'medium')}</span></td><td>${escapeHtml(item.status||'pending')}</td><td><button class="overview-row-action" onclick="openPropertyOverviewTab('maintenance')">Open</button></td></tr>`).join('')}</tbody></table></div><button class="btn-secondary" style="margin-top:10px" onclick="runOverviewAction('maintenance')">+ New request</button>`:'<div class="overview-ok">No open maintenance requests.</div><button class="btn-secondary" style="margin-top:10px" onclick="runOverviewAction(\'maintenance\')">Create request</button>';
  const equipment=(data.equipment||[]).filter(item=>item.nextServiceDate||['poor','replace'].includes(item.condition)).sort((a,b)=>new Date(a.nextServiceDate||'9999')-new Date(b.nextServiceDate||'9999')).slice(0,6);const eqRoot=document.getElementById('overviewEquipment');if(eqRoot)eqRoot.innerHTML=equipment.length?equipment.map(item=>`<div class="overview-row"><span><strong>Unit ${escapeHtml(item.unitNumber||'—')}</strong><br>${escapeHtml(item.category||item.name||'Equipment')} ${escapeHtml([item.brand,item.model].filter(Boolean).join(' '))}</span><span>${overviewDate(item.nextServiceDate)}<br><button class="overview-row-action" onclick="editUnit('${escapeHtml(String(item.unitId))}')">Open unit</button></span></div>`).join(''):'<div class="empty-compact">No equipment service risks found.</div>';
  const qb=data.quickBooks||{},qbRoot=document.getElementById('overviewQuickBooks');if(qbRoot)qbRoot.innerHTML=qb.connected?`<div class="overview-ok"><strong>${escapeHtml(qb.companyName||'QuickBooks connected')}</strong></div><div class="overview-metrics"><div class="overview-mini-stat"><span>Synced</span><strong>${qb.syncedPayments||0}</strong></div><div class="overview-mini-stat"><span>Waiting</span><strong>${qb.pendingPayments||0}</strong></div><div class="overview-mini-stat"><span>Failed</span><strong style="color:${qb.failedPayments?'#b91c1c':'inherit'}">${qb.failedPayments||0}</strong></div></div><div class="overview-row"><span>Local payments</span><strong>${overviewMoney(qb.localPaymentTotal)}</strong></div><div class="overview-row"><span>QuickBooks synced</span><strong>${overviewMoney(qb.syncedPaymentTotal)}</strong></div><div class="overview-row"><span>Difference</span><strong>${overviewMoney((qb.localPaymentTotal||0)-(qb.syncedPaymentTotal||0))}</strong></div><button class="btn-secondary" style="margin-top:10px" onclick="openPropertyOverviewTab('payments')">Review payments</button>`:'<div class="overview-alert"><strong>QuickBooks is not connected.</strong><p>Connect this property to its own company to begin syncing.</p><button class="btn-primary" onclick="openQuickBooksSettings()">Connect QuickBooks</button></div>';
  renderOverviewDetailPanel(data);
  renderOverviewAttention(data.unitsRequiringAttention||[],statusFilter);renderOverviewTasks(data.tasks||[]);renderOverviewAlerts(data);renderOverviewUpcoming(data);
  const updated=document.getElementById('propertyOverviewUpdated');if(updated)updated.textContent=`Updated ${new Date(data.generatedAt||Date.now()).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`;
}

function openOverviewDetailPanel(type) {
    const data = state.propertyOverviewData;
    if (!data || String(data.property?._id) !== String(state.currentProperty?._id)) {
        showNotification('Wait for the property overview to finish loading.', 'info'); return;
    }
    if (!state.overviewDetailType) state.overviewDetailScrollY = window.scrollY;
    state.overviewDetailPropertyId = String(data.property._id);
    state.overviewDetailType = type;
    renderOverviewDetailPanel(data);
    const panel = document.getElementById('overviewDetailPanel');
    panel.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    panel.querySelector('h3')?.focus({preventScroll:true});
}

function renderOverviewDetailPanel(data) {
    let panel = document.getElementById('overviewDetailPanel');
    const overview = document.getElementById('propertyOverview');
    if (state.overviewDetailPropertyId && state.overviewDetailPropertyId !== String(data.property?._id)) state.overviewDetailType = null;
    if (!state.overviewDetailType) {
        if(panel) panel.hidden=true;
        overview?.classList.remove('overview-detail-active');
        return;
    }
    const grid = document.getElementById('overviewIncomeExpenses')?.closest('.interactive-overview-grid');
    if (!grid) return;
    if (!panel) { panel=document.createElement('section');panel.id='overviewDetailPanel';panel.className='property-panel';overview.append(panel); }
    overview.classList.add('overview-detail-active');
    panel.hidden=false;
    const esc = value => escapeHtml(String(value ?? '—'));
    const money = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value)||0);
    const date = value => value ? overviewDate(value) : '—';
    const expenses = state.overviewDetailType === 'expenses';
    const items = expenses ? data.expenseDetails : [...(data.equipment||[]), ...(data.property?.buildingEquipment||[]).map(item=>({...item,unitNumber:'Building'}))];
    const end = data.range?.to ? new Date(new Date(data.range.to).getTime()-1) : null;
    const subtitle = expenses ? `${date(data.range?.from)} – ${date(end)} · Includes ledger entries, tracked maintenance, utilities and property assumptions.` : 'All recorded unit and building equipment. Service dates and warranty information are shown when available.';
    const columns = expenses ? ['Date','Description','Source','Category','Status','Amount'] : ['Location','Equipment','Brand','Model','Serial number','Condition','Installed','Last service','Next service','Warranty expires','Notes'];
    const rows = (items||[]).map(item=>expenses ? `<tr><td>${esc(date(item.date))}</td><td>${esc(item.description)}</td><td>${esc(item.source)}</td><td>${esc(item.category)}</td><td>${esc(item.status||'—')}</td><td data-sort-value="${Number(item.amount)||0}">${money(item.amount)}</td></tr>` : `<tr><td>${esc(item.unitNumber==='Building'?'Building':`Unit ${item.unitNumber||'—'}`)}</td><td>${esc(item.name||item.category||'Equipment')}</td><td>${esc(item.brand)}</td><td>${esc(item.model)}</td><td>${esc(item.serialNumber)}</td><td>${esc(item.condition)}</td><td>${esc(date(item.installedDate))}</td><td>${esc(date(item.lastServiceDate))}</td><td>${esc(date(item.nextServiceDate))}</td><td>${esc(date(item.warrantyExpires))}</td><td>${esc(item.notes)}</td></tr>`).join('');
    panel.innerHTML=`<div class="panel-heading overview-detail-heading"><button type="button" class="btn-secondary" data-overview-detail-close><i class="fas fa-arrow-left" aria-hidden="true"></i> Back to overview</button><h3 tabindex="-1">${expenses?'Expenses for selected period':'Equipment details'}</h3></div><p class="task-meta">${esc(subtitle)}</p>${!items?'<div class="empty-compact">Expense details are not available yet. Restart the updated server, then refresh this overview.</div>':items.length?`<div class="overview-detail-scroll"><table class="overview-table"><thead><tr>${columns.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${rows}</tbody>${expenses?`<tfoot><tr><th colspan="5">Total operating expenses</th><td>${money(data.financials?.operatingExpenses)}</td></tr></tfoot>`:''}</table></div>`:`<div class="empty-compact">${expenses?'No expenses for this period.':'No equipment has been recorded for this property.'}</div>`}`;
    panel.querySelector('[data-overview-detail-close]').addEventListener('click',()=>{
        state.overviewDetailType=null;
        state.overviewDetailPropertyId=null;
        panel.hidden=true;
        overview.classList.remove('overview-detail-active');
        document.getElementById(expenses?'overviewOpenExpensesBtn':'overviewOpenEquipmentBtn')?.focus({preventScroll:true});
        window.scrollTo({top:state.overviewDetailScrollY||0,behavior:'instant'});
    });
}

function renderOverviewAttention(items,statusFilter='all'){
  const reason=document.getElementById('overviewAttentionFilter')?.value||'all';let filtered=items.filter(item=>statusFilter==='all'||item.status===statusFilter);if(reason!=='all')filtered=filtered.filter(item=>item.reasons.some(r=>r.toLowerCase().includes(reason==='incomplete'?'not rated':reason)));
  const root=document.getElementById('overviewAttention');if(!root)return;root.innerHTML=filtered.length?`<div class="overview-table-wrap"><table class="overview-table"><thead><tr><th>Unit</th><th>Status</th><th>Reason</th><th>Rent impact</th><th></th></tr></thead><tbody>${filtered.map(item=>`<tr><td><strong>${escapeHtml(item.number||'—')}</strong></td><td>${escapeHtml(item.status||'—')}</td><td>${item.reasons.map(r=>`<span class="overview-chip">${escapeHtml(r)}</span>`).join('')}</td><td>${item.status==='vacant'?overviewMoney(item.rent):'—'}</td><td><button class="overview-row-action" onclick="editUnit('${escapeHtml(String(item.unitId))}')">Take action</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="overview-ok">No units match this attention filter.</div>';
}

function renderOverviewTasks(tasks){const root=document.getElementById('overviewTasks');if(!root)return;const open=tasks.filter(t=>t.status!=='completed');root.innerHTML=open.length?open.slice(0,8).map(task=>`<div class="overview-task"><input type="checkbox" aria-label="Complete task" onchange="updateOverviewTask('${task._id}',{completed:this.checked})"><div><strong>${escapeHtml(task.title)}</strong><div class="task-meta">${escapeHtml(task.category||'general')} · ${task.dueDate?overviewDate(task.dueDate):'No due date'}${task.assignedTo?` · ${escapeHtml(task.assignedTo)}`:''}</div></div><span class="task-priority ${escapeHtml(task.priority||'medium')}">${escapeHtml(task.priority||'medium')}</span></div>`).join(''):'<div class="empty-compact">No open property tasks.</div>';}

function renderOverviewAlerts(data){const s=data.summary||{},p=data.property?.propertyProfile||{},alerts=[];if(s.urgentMaintenance)alerts.push(['Critical',`${s.urgentMaintenance} urgent maintenance request${s.urgentMaintenance===1?'':'s'}`,'maintenance']);if(s.vacant)alerts.push(['Warning',`${s.vacant} vacant unit${s.vacant===1?'':'s'} affecting rent potential`,'units']);if(s.equipmentServiceDue90)alerts.push(['Upcoming',`${s.equipmentServiceDue90} equipment service item${s.equipmentServiceDue90===1?'':'s'} due`,'units']);[['Insurance',p.insuranceExpires],['Rental license',p.licenseExpires]].forEach(([label,date])=>{if(date&&new Date(date)<=new Date(Date.now()+90*86400000))alerts.push(['Upcoming',`${label} expires ${overviewDate(date)}`,'propertyInfo']);});const root=document.getElementById('propertyOverviewAlerts');if(root)root.innerHTML=alerts.length?alerts.map(([type,text,tab])=>`<div class="overview-alert"><strong>${type}:</strong> ${escapeHtml(text)} <button class="panel-link" onclick="openPropertyOverviewTab('${tab}')">Resolve →</button></div>`).join(''):'<div class="overview-ok">No immediate operational alerts.</div>';}

function renderOverviewUpcoming(data){const events=[];(data.tenants||[]).forEach(t=>{if(t.leaseEnd)events.push({date:t.leaseEnd,label:`Lease expires — ${t.name||'Tenant'}`,tab:'tenants'});});(data.equipment||[]).forEach(e=>{if(e.nextServiceDate)events.push({date:e.nextServiceDate,label:`Unit ${e.unitNumber||'—'} ${e.category||'equipment'} service`,tab:'units'});});(data.schedules||[]).forEach(s=>{if(s.nextScheduledDate)events.push({date:s.nextScheduledDate,label:`Recurring maintenance — ${s.title||'Service'}`,tab:'maintenance'});});(data.tasks||[]).forEach(t=>{if(t.dueDate&&t.status!=='completed')events.push({date:t.dueDate,label:t.title,tab:''});});events.sort((a,b)=>new Date(a.date)-new Date(b.date));const root=document.getElementById('overviewUpcoming');if(root)root.innerHTML=events.length?events.slice(0,10).map(e=>`<div class="overview-deadline"><time>${overviewDate(e.date)}</time><span>${escapeHtml(e.label)}</span>${e.tab?`<button class="overview-row-action" onclick="openPropertyOverviewTab('${e.tab}')">Open</button>`:''}</div>`).join(''):'<div class="empty-compact">Nothing scheduled in the upcoming period.</div>';}

function openPropertyOverviewTab(tab){const button=document.querySelector(`.tab-btn[data-tab="${tab}"]`);if(button)button.click();}

function openDelinquentTenant(tenantId){if(typeof openPaymentModalForTenantAndProperty==='function'){openPaymentModalForTenantAndProperty(tenantId,state.currentProperty?._id,false);}else{openPropertyOverviewTab('payments');}}

function runOverviewAction(action){const map={unit:['units','addUnitBtn'],tenant:['tenants','addTenantBtn'],payment:['payments','addPaymentBtn'],maintenance:['maintenance','addMaintenanceBtn'],schedule:['maintenance','addScheduleBtn'],document:['documents','uploadDocumentBtn'],announcement:['announcements',''],application:['applications','sendApplicationBtn']};if(action==='task'){openOverviewTaskModal();return;}const target=map[action];if(!target)return;openPropertyOverviewTab(target[0]);if(target[1])setTimeout(()=>document.getElementById(target[1])?.click(),50);}

function openOverviewTaskModal(){const form=document.getElementById('overviewTaskForm');form?.reset();document.getElementById('overviewTaskId').value='';document.getElementById('overviewTaskPriority').value='medium';openModal('overviewTaskModal');}

async function saveOverviewTask(event){event.preventDefault();if(!state.currentProperty)return;const id=document.getElementById('overviewTaskId').value,payload={projectId:state.currentProperty._id,title:document.getElementById('overviewTaskTitle').value,description:document.getElementById('overviewTaskDescription').value,priority:document.getElementById('overviewTaskPriority').value,category:document.getElementById('overviewTaskCategory').value,dueDate:document.getElementById('overviewTaskDueDate').value||null,assignedTo:document.getElementById('overviewTaskAssignedTo').value};const response=await fetch(id?`/api/portfolio-tasks/${id}`:'/api/portfolio-tasks',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!response.ok){showNotification('Unable to save task','error');return;}closeModal('overviewTaskModal');state.propertyOverviewData=null;await renderPropertyOverview(true);showNotification('Property task saved','success');}

async function updateOverviewTask(id,updates){const response=await fetch(`/api/portfolio-tasks/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(updates)});if(response.ok){state.propertyOverviewData=null;renderPropertyOverview(true);}else showNotification('Unable to update task','error');}

function exportPropertyOverview(){
  const data=state.propertyOverviewData;if(!data)return;
  const f=data.financials||{},d=data.delinquency||{},former=data.formerTenants||{},agingSummary=d.aging||{},e=f.expenseBreakdown||{};
  const rows=[
    ['Metric','Value'],['Occupancy rate',`${data.summary.occupancyRate}%`],['Monthly rent roll',data.summary.rentRoll],
    ['Expected rent for period',data.summary.expectedRent??data.summary.rentRoll],['Rent applied to period charges',data.summary.rentCollected],
    ['Rent outstanding',data.summary.rentOutstanding],['Cash rent collected',data.summary.cashRentCollected],
    ['Total cash collected (excluding deposits)',data.summary.totalCashCollected],['Former tenant rent balances',former.total],
    ['Former tenant accounts needing review',former.needsReview],['Posted rent income',f.rentalIncome],['Posted fee income',f.otherIncome],
    ['Deposits received',f.depositCollections],['Gross potential rent',e.grossPotentialRent],['Expense ledger',f.postedExpenses],
    ['Contract services',e.contractServices],['Payroll',e.payroll],[`Management fee (${e.managementFeeRate??3}%)`,e.managementFee],
    [`Vacancy loss (${e.vacancyLossRate??3}%)`,e.vacancyLoss],['Administrative',e.administrative],['Electrical',e.electrical],
    ['Water',e.water],['Trash/Sewer',e.trashSewer],['Gas',e.gas],['Internet',e.internet],['Utilities subtotal',e.utilitiesTotal],
    ['Maintenance expenses',f.maintenanceExpenses],['Debt service',e.monthlyDebt],['Property tax',e.propertyTax],['Insurance',e.insurance],
    ['Total operating expenses',f.operatingExpenses],['Estimated NOI',f.estimatedNOI],['Operating budget',f.operatingBudget??'Not set'],
    ['Budget variance',f.budgetVariance??'Not set'],['Total delinquency',d.total],['Delinquent tenants',d.tenantCount],
    ['Delinquency 1-30 days',agingSummary.current],['Delinquency 31-60 days',agingSummary.days31to60],
    ['Delinquency 61-90 days',agingSummary.days61to90],['Delinquency 90+ days',agingSummary.days90plus],
    ['Vacant units',data.summary.vacant],['Open maintenance',data.summary.openMaintenance],
    [],['Delinquent tenant','Unit','Balance'],...(d.tenants||[]).map(t=>[t.tenantName,t.unitNumber,t.balance]),
    [],['Former tenant','Unit','Rent balance'],...(former.tenants||[]).map(t=>[t.tenantName,t.unitNumber,t.needsReview?'Needs lease-date review':t.balance]),
    [],['Unit','Status','Reasons','Rent'],...(data.unitsRequiringAttention||[]).map(u=>[u.number,u.status,u.reasons.join('; '),u.rent||0])
  ];
  const csv=rows.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'}),url=URL.createObjectURL(blob),downloadLink=document.createElement('a');
  downloadLink.href=url;downloadLink.download=`${(state.currentProperty.name||'property').replace(/[^a-z0-9]+/gi,'-')}-overview.csv`;
  downloadLink.click();URL.revokeObjectURL(url);
}

function equipmentEditorTemplate(item={}) {
  const id=`eq_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  return `<div class="equipment-editor" data-equipment-id="${id}"><div class="equipment-editor-grid">
    <div class="form-group"><label>Category</label><select data-eq="category"><option value="">Select</option>${['HVAC / AC','Water heater','Refrigerator','Range / oven','Dishwasher','Microwave','Washer','Dryer','Garbage disposal','Thermostat','Smoke / CO detector','Other'].map(v=>`<option ${item.category===v?'selected':''}>${v}</option>`).join('')}</select></div>
    ${[['name','Name'],['brand','Brand'],['model','Model'],['serialNumber','Serial number'],['powerType','Fuel / power'],['capacity','Capacity / size'],['location','Location'],['manufacturedYear','Manufactured year','number'],['installedDate','Installed date','date'],['warrantyExpires','Warranty expires','date'],['lastServiceDate','Last service','date'],['nextServiceDate','Next service','date'],['serviceProvider','Service provider'],['estimatedReplacementCost','Replacement cost','number']].map(([key,label,type='text'])=>`<div class="form-group"><label>${label}</label><input data-eq="${key}" type="${type}" value="${escapeHtml(item[key] == null ? '' : String(item[key]).slice(0,type==='date'?10:999))}"></div>`).join('')}
    <div class="form-group"><label>Condition</label><select data-eq="condition">${['','excellent','good','fair','poor','replace'].map(v=>`<option value="${v}" ${item.condition===v?'selected':''}>${v||'Not rated'}</option>`).join('')}</select></div>
    <div class="form-group" style="grid-column:1/-1"><label>Notes</label><textarea data-eq="notes" rows="2">${escapeHtml(item.notes||'')}</textarea></div>
  </div><button type="button" class="btn-icon delete-btn" onclick="this.closest('.equipment-editor').remove()"><i class="fas fa-trash"></i> Remove equipment</button></div>`;
}

function addUnitEquipment(item={}) { const list=document.getElementById('unitEquipmentList'); if(list) list.insertAdjacentHTML('beforeend',equipmentEditorTemplate(item)); }

function collectUnitEquipment() { return [...document.querySelectorAll('#unitEquipmentList .equipment-editor')].map(row=>{const result={};row.querySelectorAll('[data-eq]').forEach(el=>{let value=el.value; if(['manufacturedYear','estimatedReplacementCost'].includes(el.dataset.eq)) value=value===''?null:Number(value); result[el.dataset.eq]=value;});return result;}).filter(e=>e.category||e.name||e.brand||e.model); }

function getUnitProfileFormData(){return {building:document.getElementById('unitBuilding')?.value||'',floorPlan:document.getElementById('unitFloorPlan')?.value||'',availableDate:document.getElementById('unitAvailableDate')?.value||'',lastRenovation:document.getElementById('unitLastRenovation')?.value||'',condition:document.getElementById('unitCondition')?.value||'',parking:document.getElementById('unitParking')?.value||'',storage:document.getElementById('unitStorage')?.value||'',securityDeposit:Number(document.getElementById('unitSecurityDeposit')?.value)||0,notes:document.getElementById('unitProfileNotes')?.value||''};}