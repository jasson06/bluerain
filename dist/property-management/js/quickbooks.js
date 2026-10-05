// Property management: quickbooks.
// Classic script: declarations share the page scope; startup runs in property-management.js.

async function loadQuickBooksStatus() {
  const root=document.getElementById('quickBooksPropertyStatus');if(!root||!state.currentProperty)return;
  root.innerHTML='<i class="fas fa-spinner fa-spin"></i> Checking connection…';
  try{const response=await fetch(`/api/properties/${state.currentProperty._id}/quickbooks/status`),data=await response.json();state.quickBooksStatus=data;if(!data.connected){root.innerHTML='<div class="overview-alert"><strong>Not connected.</strong> Connect this property to its own QuickBooks company.</div>';return;}const c=data.connection;root.innerHTML=`<div class="overview-metrics"><div class="overview-mini-stat"><span>Company</span><strong>${escapeHtml(c.companyName||'QuickBooks')}</strong></div><div class="overview-mini-stat"><span>Status</span><strong style="color:#047857">Connected</strong></div><div class="overview-mini-stat"><span>Last sync</span><strong>${c.lastSuccessfulSyncAt?formatDateDisplay(c.lastSuccessfulSyncAt):'Never'}</strong></div></div>`;}catch(error){root.innerHTML='<div class="overview-alert">Unable to load QuickBooks status.</div>';}
}

async function openQuickBooksSettings(){if(!state.currentProperty)return;openModal('quickBooksSettingsModal');const summary=document.getElementById('quickBooksConnectionSummary'),panel=document.getElementById('quickBooksMappingsPanel');summary.innerHTML='<div class="empty-compact"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';panel.style.display='none';await loadQuickBooksStatus();const status=state.quickBooksStatus;if(!status?.connected){summary.innerHTML=`<div class="overview-alert"><strong>This property is not connected.</strong><p>Each property must connect to its own QuickBooks company.</p><button class="btn-primary" onclick="connectPropertyQuickBooks()"><i class="fas fa-link"></i> Connect QuickBooks</button></div>`;return;}summary.innerHTML=`<div class="overview-ok"><strong>Connected to ${escapeHtml(status.connection.companyName||'QuickBooks')}</strong><br><span class="task-meta">Company ID ending ${escapeHtml(String(status.connection.realmId||'').slice(-6))}</span></div>`;panel.style.display='block';await loadQuickBooksMappingsAndCatalog();}

async function connectPropertyQuickBooks(){
 const propertyId=state.currentProperty?._id;if(!propertyId)return;
 const popup=window.open('about:blank','quickbooks-connect','width=760,height=780');
 if(!popup)return showNotification('Allow popups to connect QuickBooks','error');
 setQuickBooksProgress('setup','Opening QuickBooks sign-in…');
 try{const response=await fetch(`/api/properties/${propertyId}/quickbooks/connect`),data=await response.json();if(!response.ok)throw new Error(data.message||'Unable to connect QuickBooks');popup.location.href=data.url;setQuickBooksProgress('setup','Complete sign-in in the QuickBooks window, then return here.','info');}
 catch(error){popup.close();setQuickBooksProgress('setup',error.message,'error');showNotification(error.message,'error');}
}

function qbOption(value,label,selected){return `<option value="${escapeHtml(value||'')}" ${String(value||'')===String(selected||'')?'selected':''}>${escapeHtml(label||'Select')}</option>`;}

async function loadQuickBooksMappingsAndCatalog(){const panel=document.getElementById('quickBooksMappingsPanel');const save=document.getElementById('qbSaveMappingsBtn');if(save)save.disabled=true;setQuickBooksProgress('setup','Loading QuickBooks accounts, items, and mappings…');try{const response=await fetch(`/api/properties/${state.currentProperty._id}/quickbooks/catalog`),catalog=await response.json();if(!response.ok)throw new Error(catalog.message||'Unable to load catalog');const mapping=state.quickBooksStatus.connection.mappings||{},items=catalog.items||[],allAccounts=catalog.accounts||[],depositAccounts=allAccounts.filter(a=>['Bank','Other Current Asset'].includes(a.AccountType)||a.AccountSubType==='UndepositedFunds'),expenseAccounts=allAccounts.filter(a=>['Expense','Cost of Goods Sold','Other Expense'].includes(a.AccountType)),methods=catalog.paymentMethods||[];const fill=(id,list,selected)=>{const el=document.getElementById(id);if(el)el.innerHTML='<option value="">Select…</option>'+list.map(item=>qbOption(item.Id,item.FullyQualifiedName||item.Name,selected)).join('');};fill('qbMapRentItem',items,mapping.incomeItems?.rent?.value);fill('qbMapLateItem',items,mapping.incomeItems?.late?.value);fill('qbMapOtherItem',items,mapping.incomeItems?.other?.value);fill('qbMapDepositItem',items,mapping.incomeItems?.deposit?.value);fill('qbMapDepositAccount',depositAccounts,mapping.depositAccounts?.default?.value);fill('qbMapExpenseAccount',expenseAccounts,mapping.expenseAccounts?.default?.value);fill('qbMapExpensePaymentAccount',depositAccounts,mapping.defaultExpensePaymentAccount?.value);fill('qbMapMethodCash',methods,mapping.paymentMethods?.cash?.value);fill('qbMapMethodCheck',methods,mapping.paymentMethods?.check?.value);fill('qbMapMethodBank',methods,mapping.paymentMethods?.bank?.value);fill('qbMapMethodOnline',methods,mapping.paymentMethods?.online?.value);document.getElementById('qbPaymentSyncMode').value=state.quickBooksStatus.connection.settings?.paymentSyncMode||'manual';await loadQuickBooksSyncLog();setQuickBooksProgress('setup','QuickBooks is connected. Review your mappings and select Save Mappings.','success');if(save)save.disabled=false;}catch(error){setQuickBooksProgress('setup',error.message+' Close and reopen settings to retry.','error');}}

function qbSelectedRef(id){const el=document.getElementById(id);return el?.value?{value:el.value,name:el.options[el.selectedIndex]?.text||''}:{};}

async function saveQuickBooksMappings(){
 const propertyId=state.currentProperty?._id,button=document.getElementById('qbSaveMappingsBtn');
 if(!propertyId||button?.disabled)return;
 const label=button?.textContent;if(button){button.disabled=true;button.textContent='Saving…';}
 let saved=false;
 setQuickBooksProgress('setup','Saving QuickBooks mappings…');
 try{const mappings={incomeItems:{rent:qbSelectedRef('qbMapRentItem'),late:qbSelectedRef('qbMapLateItem'),other:qbSelectedRef('qbMapOtherItem'),deposit:qbSelectedRef('qbMapDepositItem')},depositAccounts:{default:qbSelectedRef('qbMapDepositAccount')},paymentMethods:{cash:qbSelectedRef('qbMapMethodCash'),check:qbSelectedRef('qbMapMethodCheck'),bank:qbSelectedRef('qbMapMethodBank'),online:qbSelectedRef('qbMapMethodOnline')},expenseAccounts:{default:qbSelectedRef('qbMapExpenseAccount')},defaultExpensePaymentAccount:qbSelectedRef('qbMapExpensePaymentAccount')};const settings={paymentSyncMode:document.getElementById('qbPaymentSyncMode').value,expenseSyncMode:'manual'};
 const response=await fetch(`/api/properties/${propertyId}/quickbooks/mappings`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({mappings,settings})});
 const data=await response.json();if(!response.ok)throw new Error(data.message||'Unable to save mappings');saved=true;
 if(String(state.currentProperty?._id)!==String(propertyId))return;
 state.quickBooksStatus={connected:true,connection:data.connection};
 setQuickBooksProgress('setup','Mappings saved. Preparing payments and updating balances…');
 if(button)button.textContent='Preparing payments…';
 const workspace=await loadPaymentWorkspace(propertyId,true);
 if(!workspace)throw new Error('Mappings were saved, but payments could not refresh. Retry from the payment section.');
 if(String(state.currentProperty?._id)!==String(propertyId))return;
 setQuickBooksProgress('setup','Mappings saved and payments updated. Review Customers or Unmatched for anything needing attention.','success');
 showNotification('Mappings saved. Payment section updated.','success');
 }catch(error){setQuickBooksProgress('setup',error.message,'error');showNotification(error.message,'error');}
 finally{if(button){button.disabled=false;button.textContent=label||'Save Mappings';}}
}

async function disconnectQuickBooks(){if(!confirm('Disconnect QuickBooks from this property? Other properties will not be affected.'))return;const response=await fetch(`/api/properties/${state.currentProperty._id}/quickbooks/connection`,{method:'DELETE'});if(response.ok){state.quickBooksStatus=null;closeModal('quickBooksSettingsModal');loadQuickBooksStatus();showNotification('QuickBooks disconnected','success');}}

async function loadQuickBooksSyncLog(){const root=document.getElementById('quickBooksSyncLog');if(!root)return;const response=await fetch(`/api/properties/${state.currentProperty._id}/quickbooks/sync-log`),data=await response.json();root.innerHTML=(data.logs||[]).length?`<div class="overview-table-wrap"><table class="overview-table"><thead><tr><th>Record</th><th>Status</th><th>QuickBooks ID</th><th>Updated</th></tr></thead><tbody>${data.logs.slice(0,20).map(log=>`<tr><td>${escapeHtml(log.localEntityType)} ${escapeHtml(String(log.localEntityId).slice(-6))}</td><td>${escapeHtml(log.status)}</td><td>${escapeHtml(log.quickBooksEntityId||'—')}</td><td>${formatDateDisplay(log.updatedAt)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-compact">No synchronization activity yet.</div>';}

async function syncPaymentQuickBooks(paymentId){const button=document.querySelector(`[data-qb-sync-payment="${paymentId}"]`);if(button)button.disabled=true;try{const response=await fetch(`/api/properties/${state.currentProperty._id}/payments/${paymentId}/sync-quickbooks`,{method:'POST'}),data=await response.json();if(!response.ok)throw new Error(data.message||'QuickBooks sync failed');await loadPayments(state.currentProperty._id,true);showNotification(data.matchedExisting?'Matched existing QuickBooks payment':data.duplicate?'Already synchronized':'Payment synchronized to QuickBooks','success');}catch(error){showNotification(error.message,'error');if(button)button.disabled=false;}}

function getOverviewRange() {
  const now=new Date(), value=document.getElementById('overviewRange')?.value||'month'; let from,to;
  if(value==='lastMonth'){from=new Date(now.getFullYear(),now.getMonth()-1,1);to=new Date(now.getFullYear(),now.getMonth(),1);}
  else if(value==='quarter'){const q=Math.floor(now.getMonth()/3)*3;from=new Date(now.getFullYear(),q,1);to=new Date(now.getFullYear(),q+3,1);}
  else if(value==='year'){from=new Date(now.getFullYear(),0,1);to=new Date(now.getFullYear()+1,0,1);}
  else {from=new Date(now.getFullYear(),now.getMonth(),1);to=new Date(now.getFullYear(),now.getMonth()+1,1);}
  return {from:from.toISOString(),to:to.toISOString(),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone};
}

function setQuickBooksProgress(area, message, kind='loading') {
  const anchor=document.getElementById(area==='payments'?'paymentsList':'quickBooksConnectionSummary');
  if(!anchor)return;
  const id=area==='payments'?'qbPaymentsProgress':'qbSetupProgress';
  let banner=document.getElementById(id);
  if(!banner){banner=document.createElement('div');banner.id=id;banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');anchor.parentNode.insertBefore(banner,anchor);}
  if(banner.quickBooksProgressTimeout)clearTimeout(banner.quickBooksProgressTimeout);
  banner.className=kind==='error'?'overview-alert':kind==='success'?'overview-ok':'empty-compact';
  banner.style.marginBottom='12px';
  banner.innerHTML=`<i aria-hidden="true" class="fas ${kind==='loading'?'fa-spinner fa-spin':kind==='error'?'fa-triangle-exclamation':'fa-circle-check'}"></i> ${escapeHtml(message)}`;
  anchor.setAttribute('aria-busy',kind==='loading'?'true':'false');
  if(kind==='success')banner.quickBooksProgressTimeout=setTimeout(()=>banner.remove(),4000);
}

let paymentAllocationEditor=null;
async function openPaymentAllocation(paymentId){
 const propertyId=state.currentProperty?._id;if(!propertyId)return;
 let modal=document.getElementById('paymentAllocationModal');
 if(!modal){modal=document.createElement('div');modal.id='paymentAllocationModal';modal.className='modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Allocate payment');document.body.appendChild(modal);}
 modal.innerHTML='<div class="modal-content" style="max-width:1000px;max-height:90vh;overflow:auto"><button type="button" class="btn-secondary" onclick="closeModal(\'paymentAllocationModal\')">Close</button><p role="status"><i class="fas fa-spinner fa-spin"></i> Loading payment and invoice details…</p></div>';
 openModal('paymentAllocationModal');paymentAllocationEditor=null;
 try{
  const response=await fetch(`${API_URL}/properties/${propertyId}/payments/${paymentId}?allocationDetails=1`),data=await response.json();if(!response.ok)throw Error(data.message||'Unable to load allocation details');
  if(String(state.currentProperty?._id)!==String(propertyId)){closeModal('paymentAllocationModal');return;}
  paymentAllocationEditor={...data,propertyId};
  modal.innerHTML=`<div class="modal-content" style="max-width:1000px;max-height:90vh;overflow:auto"><div class="panel-heading"><h2>Allocate payment</h2><button class="btn-secondary" onclick="closeModal('paymentAllocationModal')">Close</button></div><p>Received <strong>$${Number(data.total).toFixed(2)}</strong> on ${escapeHtml(formatDateDisplay(data.payment.date))}. Assign each portion to a category and month. The received date and total stay unchanged.</p>${renderInvoiceOutstanding(data.invoice, data.total)}<p class="task-meta">These allocations update this app only. They do not create or change a QuickBooks payment. A late-fee allocation records money paid toward that fee; it does not add a new charge.</p>${data.invoice?`<details open><summary>Invoice ${escapeHtml(data.invoice.number||'')} · ${escapeHtml(data.invoice.date||'')}</summary><div class="overview-table-wrap"><table class="overview-table"><thead><tr><th>Item</th><th>Description</th><th>Invoice amount</th></tr></thead><tbody>${data.invoice.lines.map(l=>`<tr><td>${escapeHtml(l.item)}</td><td>${escapeHtml(l.description)}</td><td>$${Number(l.amount).toFixed(2)}</td></tr>`).join('')}</tbody></table></div><button class="btn-secondary" onclick="useInvoiceAllocationLines()">Use invoice lines as a draft</button><p class="task-meta">Invoice charges may exceed this payment. Review the categories and months, and reduce unpaid lines to $0 or remove them.</p></details>`:`<p class="overview-alert">${escapeHtml(data.invoiceError||'No invoice details are linked. Enter the allocation from your records.')}</p>`}<div class="overview-table-wrap"><table class="overview-table"><thead><tr><th>Category</th><th>Applied month</th><th>Amount paid</th><th>Description</th><th></th></tr></thead><tbody id="paymentAllocationRows"></tbody></table></div><button class="btn-secondary" onclick="addPaymentAllocationRow()">Add allocation</button><p id="paymentAllocationTotal" role="status" aria-live="polite"></p><p id="paymentAllocationMessage" role="status" aria-live="polite"></p><div class="modal-buttons"><button class="btn-secondary" onclick="closeModal('paymentAllocationModal')">Cancel</button><button type="button" id="paymentAllocationSave" class="btn-primary" onclick="savePaymentAllocation()">Save allocations</button></div></div>`;
  for(const row of data.rows)addPaymentAllocationRow(row);
 }catch(error){modal.innerHTML=`<div class="modal-content"><p role="alert">${escapeHtml(error.message)}</p><button class="btn-secondary" onclick="closeModal('paymentAllocationModal')">Close</button></div>`;}
}
function addPaymentAllocationRow(row={}){
 const root=document.getElementById('paymentAllocationRows');if(!root||root.children.length>=40)return;
 const tr=document.createElement('tr');const categories={rent:'Rent',deposit:'Security deposit',fee:'Fee (application / non-refundable)',late:'Late fee',water:'Water',electric:'Electric',trash:'Trash',admin:'Admin fee',other:'Other'};
 const period=row.periodMonth||paymentAllocationEditor?.payment?.periodMonth||String(paymentAllocationEditor?.invoice?.date||'').slice(0,7);
 tr.innerHTML=`<td><select class="allocation-category" aria-label="Category">${Object.entries(categories).map(([key,label])=>`<option value="${key}" ${key===(row.applyTo||'rent')?'selected':''}>${label}</option>`).join('')}</select></td><td><input class="allocation-period" aria-label="Applied month" type="month" value="${escapeHtml(period)}"></td><td><input class="allocation-amount" aria-label="Amount paid" type="number" min="0" step="0.01" value="${Number(row.amount||0).toFixed(2)}"></td><td><input class="allocation-label" aria-label="Description" maxlength="200" value="${escapeHtml(row.feeLabel||'')}"></td><td><button class="btn-secondary" type="button">Remove</button></td>`;
 tr.querySelector('button').onclick=()=>{tr.remove();updatePaymentAllocationTotal();};tr.oninput=updatePaymentAllocationTotal;tr.onchange=updatePaymentAllocationTotal;root.appendChild(tr);updatePaymentAllocationTotal();
}
function readPaymentAllocationRows(){return [...document.querySelectorAll('#paymentAllocationRows tr')].map(tr=>({applyTo:tr.querySelector('.allocation-category').value,periodMonth:tr.querySelector('.allocation-period').value,amount:Number(tr.querySelector('.allocation-amount').value),feeLabel:tr.querySelector('.allocation-label').value}));}
function updatePaymentAllocationTotal(){
 const rows=readPaymentAllocationRows(),total=Math.round(Number(paymentAllocationEditor?.total||0)*100),sum=rows.reduce((n,r)=>n+(Number.isFinite(r.amount)?Math.round(r.amount*100):0),0);
 let error='';
 if(!rows.length||!rows.some(r=>r.amount>0))error='Enter at least one amount paid.';
 for(let i=0;i<rows.length;i++){
  const r=rows[i];
  if(!Number.isFinite(r.amount)||r.amount<0||Math.abs(r.amount*100-Math.round(r.amount*100))>0.00001){error=`Row ${i+1}: enter a non-negative amount with at most two decimals.`;break;}
  if(r.amount>0&&!/^20\d{2}-(0[1-9]|1[0-2])$/.test(r.periodMonth)){error=`Row ${i+1}: select the applied month.`;break;}
 }
 if(!error&&sum!==total)error=sum>total?`Allocations exceed the received payment by $${((sum-total)/100).toFixed(2)}. Set unpaid invoice lines to $0 or reduce the paid amounts.`:`Allocate the remaining $${((total-sum)/100).toFixed(2)} of the received payment.`;
 if(paymentAllocationEditor)paymentAllocationEditor.validationError=error;
 const text=document.getElementById('paymentAllocationTotal');if(text)text.textContent=`Allocated: $${(sum/100).toFixed(2)} of $${(total/100).toFixed(2)}. ${error||'Received payment fully allocated. Any invoice balance remains outstanding.'}`;
 const save=document.getElementById('paymentAllocationSave');if(save){save.disabled=!!paymentAllocationEditor?.saving;save.textContent=paymentAllocationEditor?.saving?'Saving allocations…':'Save allocations';}
 return !error;
}
function useInvoiceAllocationLines(){
 const data=paymentAllocationEditor;if(!data?.invoice)return;
 if(!confirm('Replace the current draft with invoice lines? Review all months and amounts before saving.'))return;
 document.getElementById('paymentAllocationRows').innerHTML='';
 const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
 for(const line of data.invoice.lines){
  const text=`${line.item} ${line.description}`.toLowerCase();
  const applyTo=/late/.test(text)?'late':/non.?refundable|application/.test(text)?'fee':/deposit/.test(text)?'deposit':/rent|prorat/.test(text)?'rent':'other';
  const month=months.findIndex(m=>new RegExp(`\\b${m}\\b`,'i').test(text));
  const year=(text.match(/\b20\d{2}\b/)||[])[0]||String(data.invoice.date).slice(0,4);
  addPaymentAllocationRow({applyTo,periodMonth:month<0?String(data.invoice.date).slice(0,7):`${year}-${String(month+1).padStart(2,'0')}`,amount:Math.max(0,line.amount),feeLabel:line.description||line.item});
 }
}
async function savePaymentAllocation(){
 const data=paymentAllocationEditor;if(!data){showNotification('Reopen Allocate to load the payment before saving.','error');return;}if(data.saving)return;
 if(!updatePaymentAllocationTotal()){const message=document.getElementById('paymentAllocationMessage');if(message){message.textContent=data.validationError;message.scrollIntoView?.({block:'nearest'});}showNotification(data.validationError,'error');return;}
 const allocations=readPaymentAllocationRows().filter(row=>row.amount>0),message=document.getElementById('paymentAllocationMessage');data.saving=true;updatePaymentAllocationTotal();message.textContent='Saving allocations and recalculating balances…';
 let saved=false;
 try{
  const response=await fetch(`${API_URL}/properties/${data.propertyId}/payments/${data.rootId}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({allocations,version:data.version})}),result=await response.json();if(!response.ok)throw Error(result.message||'Unable to save allocations');saved=true;
  message.textContent='Allocations saved. Refreshing payments…';
  if(String(state.currentProperty?._id)===String(data.propertyId)){const refreshed=await loadPaymentWorkspace(data.propertyId,true);if(!refreshed)throw Error('Allocations saved, but payments could not refresh. Close this window and retry from Payments.');}
  closeModal('paymentAllocationModal');showNotification(result.warning||'Payment allocated. Periods and balances updated.','success');
 }catch(error){message.textContent=error.message;showNotification(error.message,'error');}
 finally{data.saving=false;if(saved){const button=document.getElementById('paymentAllocationSave');if(button)button.disabled=true;}else updatePaymentAllocationTotal();}
}

function renderInvoiceOutstanding(invoice, paymentAmount){
 if(!invoice)return '';
 const money=value=>value!=null&&Number.isFinite(Number(value))?'$'+Number(value).toFixed(2):'Unavailable';
 return `<div class="overview-metrics"><div class="overview-mini-stat"><span>Invoice total</span><strong>${money(invoice.total)}</strong></div><div class="overview-mini-stat"><span>This payment</span><strong>${money(paymentAmount)}</strong></div><div class="overview-mini-stat"><span>Still owed on invoice</span><strong>${money(invoice.balance)}</strong></div></div><p class="task-meta">The outstanding invoice balance comes from QuickBooks and includes all payments and credits. Saving these allocations does not mark that balance as paid.</p>`;
}
