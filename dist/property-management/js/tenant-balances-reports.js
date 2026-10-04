// Property management: tenant balances reports.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// -------- Tenant Balance Sheet Helpers & Modal --------
// Currency formatter with sign handling used in balance sheet cards
function tenantCurrency(value) {
    const v = Number(value) || 0;
    const sign = v < 0 ? '-' : '';
    return `${sign}$${Math.abs(v).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
}

function exportTenantPaymentsReportFromModal() {
    const modal = document.getElementById('tenantBalanceModal');
    if (!modal) return;
    const tenantId = modal.dataset.tenantId;
    if (!tenantId) { showNotification('No tenant loaded for report.', 'error'); return; }
    exportTenantPaymentsReport(tenantId);
}

// Generate a PDF summarizing all payments grouped by month with subtotals
function calculateOccupancyRate(units) {
    if (!units?.length) return '0%';
    const occupiedUnits = units.filter(u => u.status === 'occupied').length;
    return `${Math.round((occupiedUnits / units.length) * 100)}%`;
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

let tenantLedgerView=null;
async function openTenantBalanceModal(tenantId,refresh=false){
 const propertyId=state.currentProperty?._id;if(!propertyId)return;
 let modal=document.getElementById('tenantBalanceModal');if(!modal)return;
 modal.dataset.tenantId=tenantId;modal.innerHTML='<div class="modal-content" style="max-width:1150px;max-height:90vh;overflow:auto"><button class="btn-secondary" onclick="closeModal(\'tenantBalanceModal\')">Close</button><p role="status">Loading tenant charge ledger…</p></div>';openModal('tenantBalanceModal');
 const request={propertyId,tenantId};tenantLedgerView=request;
 try{const response=await fetch(`${API_URL}/properties/${propertyId}/tenants/${tenantId}/charge-ledger${refresh?'?refresh=1':''}`);const data=await response.json();if(!response.ok)throw Error(data.message||'Unable to load ledger');if(tenantLedgerView!==request||String(state.currentProperty?._id)!==String(propertyId))return;request.data=data;state.tenantChargeLedgers=state.tenantChargeLedgers||{};state.tenantChargeLedgers[tenantId]=data;state.propertyOverviewData=null;renderTenantChargeLedger();}
 catch(error){if(tenantLedgerView!==request)return;modal.innerHTML='<div class="modal-content"><p role="alert">'+escapeHtml(error.message)+'</p><button class="btn-secondary" onclick="closeModal(\'tenantBalanceModal\')">Close</button></div>';}
}
function ledgerCategoryOptions(value){return Object.entries({rent:'Rent',fee:'Fee',late:'Late fee',deposit:'Security deposit',water:'Water',electric:'Electric',trash:'Trash',admin:'Admin',other:'Other'}).map(([key,label])=>`<option value="${key}" ${key===value?'selected':''}>${label}</option>`).join('');}
function renderTenantChargeLedger(){
 const view=tenantLedgerView;if(!view?.data)return;const d=view.data,s=d.summary,modal=document.getElementById('tenantBalanceModal');
 const metrics=[['Rent owed',s.rentOwed],['Fees owed',s.feesOwed],['Deposit owed',s.depositOwed],['Unapplied credit',s.unappliedCredit],['Total outstanding',s.totalOutstanding]];
 modal.innerHTML=`<div class="modal-content" style="max-width:1150px;max-height:90vh;overflow:auto"><div class="panel-heading"><h2>Tenant Balance Sheet — ${escapeHtml(d.tenantName||'Tenant')}</h2><button class="btn-secondary" onclick="closeModal('tenantBalanceModal')">Close</button></div><p>Charges minus payments applied to those charges. Unapplied credit is shown separately until assigned.</p><div class="overview-metrics">${metrics.map(([label,value])=>`<div class="overview-mini-stat"><span>${label}</span><strong>${tenantCurrency(value)}</strong></div>`).join('')}</div>${d.warning?`<p role="alert" class="overview-alert">${escapeHtml(d.warning)}</p>`:''}${s.needsReview?`<p class="overview-alert">Provisional totals: ${s.needsReview} invoice charge(s) need category/month review. Confirm the suggestions below. Discounts and credits need reconciliation before these totals can be treated as final.</p>`:''}${d.issues.map(i=>`<p class="overview-alert">${escapeHtml(i)}</p>`).join('')}<p class="task-meta">Invoice refresh: ${escapeHtml(d.refreshedAt?new Date(d.refreshedAt).toLocaleString():'Not refreshed')}. Invoice balances in QuickBooks may include credits not yet recorded here.</p><div style="display:flex;gap:8px"><button id="ledgerRefresh" class="btn-secondary">Refresh QuickBooks charges</button><button id="ledgerExport" class="btn-secondary">Export balance sheet</button></div><p id="ledgerMessage" role="status" aria-live="polite"></p><div class="overview-table-wrap"><table class="overview-table"><thead><tr><th>Charge / source</th><th>Category</th><th>Month</th><th>Charged</th><th>Applied</th><th>Outstanding</th><th>Review</th></tr></thead><tbody>${d.charges.map((c,i)=>`<tr data-charge-index="${i}"><td>${escapeHtml(c.description)}<br><small>${escapeHtml(c.source)}${c.invoiceNumber?' · Invoice '+escapeHtml(String(c.invoiceNumber)):''}</small></td><td><select class="ledger-category" aria-label="Charge category">${ledgerCategoryOptions(c.category)}</select></td><td><input class="ledger-period" aria-label="Charge month" type="month" value="${escapeHtml(c.periodMonth)}"></td><td>${tenantCurrency(c.amount)}</td><td>${tenantCurrency(c.paid)}</td><td>${tenantCurrency(c.outstanding)}</td><td><button class="btn-secondary ledger-save" >${c.needsReview?'Confirm':'Save change'}</button></td></tr>`).join('')}</tbody></table></div><details><summary>Add a missing charge</summary><p>Use this only for a charge that is absent from both the lease and QuickBooks invoices.</p><input id="ledgerDescription" maxlength="200" aria-label="Description" placeholder="Description"><select id="ledgerCategory">${ledgerCategoryOptions('fee')}</select><input id="ledgerPeriod" type="month" aria-label="Month"><input id="ledgerAmount" type="number" min="0.01" step="0.01" aria-label="Charge amount"><button id="ledgerAdd" class="btn-secondary">Add charge</button></details><details><summary>Apply available credit</summary><p>Choose an unapplied payment and the charge it should pay. This updates this app's ledger; it does not change QuickBooks.</p><select id="ledgerCreditSource" aria-label="Available credit">${d.payments.filter(p=>p.unapplied>0).map(p=>`<option value="${escapeHtml(p.paymentId)}">${escapeHtml(p.paymentId)} — ${tenantCurrency(p.unapplied)}</option>`).join('')}</select><select id="ledgerCreditCharge" aria-label="Outstanding charge">${d.charges.filter(c=>c.outstanding>0).map(c=>`<option value="${escapeHtml(c.id)}">${escapeHtml(c.description)} · ${escapeHtml(c.periodMonth)} — ${tenantCurrency(c.outstanding)}</option>`).join('')}</select><input id="ledgerCreditAmount" type="number" min="0.01" step="0.01" aria-label="Credit amount"><button id="ledgerApplyCredit" class="btn-secondary">Apply credit</button></details><h3>Payment application</h3><p>Payments with unapplied amounts remain available credit; they do not silently reduce another month’s rent.</p><div class="overview-table-wrap"><table class="overview-table"><thead><tr><th>Payment</th><th>Amount</th><th>Applied</th><th>Unapplied</th><th></th></tr></thead><tbody>${d.payments.map(p=>`<tr><td>${escapeHtml(p.paymentId)}</td><td>${tenantCurrency(p.amount)}</td><td>${tenantCurrency(p.applied)}</td><td>${tenantCurrency(p.unapplied)}</td><td><button class="btn-secondary" data-ledger-payment="${escapeHtml(p.paymentId)}">Review payment</button></td></tr>`).join('')}</tbody></table></div><details><summary>Charge change history</summary>${(d.audit||[]).slice().reverse().map(a=>`<p>${escapeHtml(new Date(a.at).toLocaleString())} · ${escapeHtml(a.action)} · ${escapeHtml(a.chargeId)}</p>`).join('')||'<p>No charge changes recorded.</p>'}</details></div>`;
 document.getElementById('ledgerRefresh').onclick=()=>openTenantBalanceModal(view.tenantId,true);
 document.getElementById('ledgerExport').onclick=()=>exportTenantPaymentsReport(view.tenantId);
 modal.querySelectorAll('[data-charge-index]').forEach(tr=>tr.querySelector('.ledger-save').onclick=()=>saveTenantCharge({chargeId:d.charges[Number(tr.dataset.chargeIndex)].id,category:tr.querySelector('.ledger-category').value,periodMonth:tr.querySelector('.ledger-period').value}));
 document.getElementById('ledgerApplyCredit').onclick=()=>saveTenantCharge({action:'apply-credit',sourcePaymentId:document.getElementById('ledgerCreditSource').value,chargeId:document.getElementById('ledgerCreditCharge').value,amount:document.getElementById('ledgerCreditAmount').value});
 document.getElementById('ledgerAdd').onclick=()=>saveTenantCharge({category:document.getElementById('ledgerCategory').value,periodMonth:document.getElementById('ledgerPeriod').value,amount:document.getElementById('ledgerAmount').value,description:document.getElementById('ledgerDescription').value});
 modal.querySelectorAll('[data-ledger-payment]').forEach(button=>button.onclick=()=>{const id=button.dataset.ledgerPayment;const p=(state.payments||[]).find(p=>String(p._id)===id);closeModal('tenantBalanceModal');if(p?.quickBooks?.entityId)openPaymentAllocation(id);else editPayment(id);});
}
async function saveTenantCharge(body){
 const view=tenantLedgerView;if(!view||view.saving)return;view.saving=true;const message=document.getElementById('ledgerMessage');message.textContent='Saving charge and recalculating…';
 try{const response=await fetch(`${API_URL}/properties/${view.propertyId}/tenants/${view.tenantId}/charge-ledger`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,version:view.data.version})});const data=await response.json();if(!response.ok)throw Error(data.message||'Unable to save charge');if(tenantLedgerView!==view)return;view.data=data;state.tenantChargeLedgers[view.tenantId]=data;state.propertyOverviewData=null;renderTenantChargeLedger();if(document.getElementById('propertyOverviewGrid')?.offsetParent&&typeof renderPropertyOverview==='function')renderPropertyOverview(true);document.getElementById('ledgerMessage').textContent='Charge saved. Tenant and property balances updated.';}
 catch(error){message.textContent=error.message;}finally{view.saving=false;}
}
async function exportTenantPaymentsReport(tenantId){
 try{const response=await fetch(`${API_URL}/properties/${state.currentProperty._id}/tenants/${tenantId}/charge-ledger`);const data=await response.json();if(!response.ok)throw Error(data.message||'Unable to load ledger');const {jsPDF}=window.jspdf;const doc=new jsPDF();doc.setFontSize(15);doc.text('Tenant Balance Sheet',14,16);doc.setFontSize(10);doc.text(String(data.tenantName||'Tenant'),14,24);doc.text(`Rent owed: ${tenantCurrency(data.summary.rentOwed)} | Fees: ${tenantCurrency(data.summary.feesOwed)} | Deposit: ${tenantCurrency(data.summary.depositOwed)}`,14,31);doc.text(`Total outstanding: ${tenantCurrency(data.summary.totalOutstanding)} | Unapplied credit: ${tenantCurrency(data.summary.unappliedCredit)}`,14,38);doc.text(data.summary.needsReview||data.summary.reviewIssues||data.warning?'PROVISIONAL: review invoice classifications and refresh warnings.':'Amounts are based on saved charges and applied payments.',14,45);doc.autoTable({startY:52,head:[['Charge','Category','Month','Charged','Applied','Owed']],body:data.charges.map(c=>[c.description,c.category,c.periodMonth,tenantCurrency(c.amount),tenantCurrency(c.paid),tenantCurrency(c.outstanding)]),styles:{fontSize:8}});doc.save('tenant-balance-sheet.pdf');}catch(error){showNotification(error.message,'error');}
}
