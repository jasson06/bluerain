// Charge-based receivables. Amounts are computed in integer cents.
const cents = value => Math.round((Number(value)||0)*100);
const periodOf = p => /^\d{4}-(0[1-9]|1[0-2])$/.test(p.periodMonth||'') ? p.periodMonth : String(p.date instanceof Date?p.date.toISOString():p.date||'').slice(0,7);
const categories=['rent','deposit','fee','late','water','electric','trash','admin','other'];
function suggestLine(line,invoiceDate){
  const text=`${line.SalesItemLineDetail?.ItemRef?.name||''} ${line.Description||''}`.toLowerCase();
  const category=/non.?refundable|application/.test(text)?'fee':/late/.test(text)?'late':/deposit/.test(text)?'deposit':/rent|prorat/.test(text)?'rent':/water/.test(text)?'water':/electric/.test(text)?'electric':/trash/.test(text)?'trash':/admin/.test(text)?'admin':'other';
  const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
  const month=months.findIndex(m=>new RegExp(`\\b${m}\\b`).test(text));
  const year=(text.match(/\b20\d{2}\b/)||[])[0]||String(invoiceDate).slice(0,4);
  return {category,periodMonth:month<0?String(invoiceDate).slice(0,7):`${year}-${String(month+1).padStart(2,'0')}`};
}
function buildCharges(tenant,snapshot,expectedRent,asOf=new Date()){
  const overrides=snapshot.overrides||{},charges=[];
  for(const invoice of snapshot.invoices||[]){
    if(Number(invoice.TotalAmt)===0)continue;
    const lines=(invoice.Line||[]).filter(l=>l.DetailType==='SalesItemLineDetail'&&Number(l.Amount)>0);
    for(const line of lines){
      const id=`qb:${invoice.Id}:${line.Id}`;
      const override=overrides[id]||{};
      const suggested=suggestLine(line,invoice.TxnDate);
      charges.push({id,source:'quickbooks',invoiceId:String(invoice.Id),invoiceNumber:invoice.DocNumber||invoice.Id,invoiceBalance:invoice.Balance??null,description:line.Description||line.SalesItemLineDetail?.ItemRef?.name||'Invoice charge',amount:Number(line.Amount),...suggested,...override,needsReview:!override.confirmed,invoiceDate:invoice.TxnDate});
    }
    const difference=cents(invoice.TotalAmt)-lines.reduce((s,l)=>s+cents(l.Amount),0);
    if(difference){const override=overrides[`qb:${invoice.Id}:adjustment`]||{};charges.push({id:`qb:${invoice.Id}:adjustment`,source:'quickbooks',invoiceId:String(invoice.Id),invoiceNumber:invoice.DocNumber||invoice.Id,description:'Invoice tax/discount adjustment',category:'other',periodMonth:String(invoice.TxnDate).slice(0,7),amount:difference/100,...override,needsReview:!override.confirmed});}
  }
  // Invoice charges replace generated obligations for the same category/period.
  // Classification remains visible for review; no duplicate lease charge is added.
  const covered=new Set(charges.filter(c=>!c.ignored).map(c=>`${c.category}:${c.periodMonth}`));
  const start=tenant.leaseStart?new Date(tenant.leaseStart):new Date(asOf.getFullYear(),asOf.getMonth(),1);
  const end=tenant.leaseEnd?new Date(tenant.leaseEnd):asOf;
  if(Number.isFinite(start.getTime()))for(let d=new Date(start.getFullYear(),start.getMonth(),1),count=0;d<=asOf&&d<=end&&count<1200;d=new Date(d.getFullYear(),d.getMonth()+1,1),count++){
    const period=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const local=(category,amount,description)=>{if(!covered.has(`${category}:${period}`)&&amount>0)charges.push({id:`lease:${category}:${period}`,source:'lease',category,periodMonth:period,description,amount,...(overrides[`lease:${category}:${period}`]||{}),needsReview:false});};
    // Preserve the existing rent obligation while separating recurring fees.
    const expected=Number(expectedRent(tenant,d,'rent'))||0;
    const first=period===`${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}`;
    const monthOverride=typeof tenant.monthlyOverrides?.get==='function'?tenant.monthlyOverrides.get(period):tenant.monthlyOverrides?.[period];
    const custom=monthOverride?.expectedRent!=null&&monthOverride.expectedRent!=='';
    const fees=first||custom?[]:[['water',tenant.waterFee],['trash',tenant.trashFee],['admin',tenant.adminFee],['fee',tenant.additionalFee?.amount]];
    local('rent',Math.max(0,expected-fees.reduce((s,f)=>s+(Number(f[1])||0),0)),'Monthly rent');
    for(const [category,amount] of fees)local(category,Number(amount)||0,`Monthly ${category} fee`);
    const mo=tenant.monthlyOverrides,ov=typeof mo?.get==='function'?mo.get(period):mo?.[period];
    if(ov?.lateFee!=null)local('late',ov.lateFeeMode==='percent'?(Number(expectedRent(tenant,d,'rent'))||0)*Number(ov.lateFee)/100:Number(ov.lateFee),'Monthly late fee');
  }
  const deposit=Number(tenant.deposit||0)+Number(tenant.pets?.depositIncrease||tenant.depositIncrease||0);
  if(deposit>0&&!charges.some(c=>c.category==='deposit'&&!c.ignored))charges.push({id:'lease:deposit',source:'lease',category:'deposit',periodMonth:Number.isFinite(start.getTime())?`${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}`:'',amount:deposit,description:'Required security deposit',needsReview:false,...(overrides['lease:deposit']||{})});
  for(const charge of snapshot.manualCharges||[])charges.push({...charge,source:'manual',needsReview:false,...(overrides[charge.id]||{})});
  const cutoff=`${asOf.getFullYear()}-${String(asOf.getMonth()+1).padStart(2,'0')}`;
  return charges.filter(c=>!c.ignored&&c.periodMonth<=cutoff).map(c=>({...c,amount:cents(c.amount)/100}));
}
function calculate(charges,payments,options={}){
  const entries=charges.map(c=>({...c,chargedCents:cents(c.amount),paidCents:0,allocations:[]}));
  const paymentEntries=[],issues=[];
  // Existing per-payment late charges remain obligations unless an invoice or
  // monthly override already supplies the late charge for that month.
  for(const p of payments){if(Number(p.lateFee)>0&&!charges.some(c=>c.category==='late'&&c.periodMonth===periodOf(p)))entries.push({id:`payment-late:${p._id}`,source:'payment',category:'late',periodMonth:periodOf(p),description:'Recorded late fee',amount:Number(p.lateFee),chargedCents:cents(p.lateFee),paidCents:0,allocations:[]});}
  let openingDeposit=options.depositPaid==null?0:Math.max(0,cents(options.depositPaid)-payments.filter(p=>p.applyTo==='deposit').reduce((s,p)=>s+cents(p.amount)+cents(p.appliedCredit),0));
  for(const c of entries.filter(c=>c.category==='deposit'&&c.chargedCents>0)){const amount=Math.min(openingDeposit,c.chargedCents);c.paidCents+=amount;openingDeposit-=amount;if(amount)c.allocations.push({source:'legacy-deposit-opening-balance',amount:amount/100});}
  // Confirmed invoice discounts reduce the selected category on that invoice.
  for(const credit of entries.filter(c=>c.chargedCents<0&&!c.needsReview)){
    let remaining=-credit.chargedCents;
    for(const c of entries.filter(c=>c.chargedCents>0&&c.invoiceId===credit.invoiceId&&c.category===credit.category&&c.periodMonth===credit.periodMonth)){
      const amount=Math.min(remaining,c.chargedCents-c.paidCents);c.paidCents+=amount;remaining-=amount;c.allocations.push({adjustmentId:credit.id,amount:amount/100});
    }
    if(remaining)issues.push(`Discount ${credit.id} has ${remaining/100} not matched to a charge. Review its category and month.`);
  }
  const sorted=[...payments].sort(require('./payment-balances')({}).comparePayments);
  let unapplied=0,issuedCredits=0,consumedCredits=0;
  for(const p of sorted){
    if(p.postingStatus==='conflict'||p.postingStatus==='pending')continue;
    if(Number(p.amount)<0){issuedCredits+=Math.abs(cents(p.amount));paymentEntries.push({paymentId:String(p._id),amount:Number(p.amount),applied:0,unapplied:Math.abs(cents(p.amount))/100,balance:Number(p.amount),isCredit:true,allocations:[]});continue;}
    consumedCredits+=Math.max(0,cents(p.appliedCredit));
    let remaining=Math.max(0,cents(p.amount))+Math.max(0,cents(p.appliedCredit));
    const initial=remaining,assigned=[];
    const explicit=p.quickBooks?.ledgerChargeId;
    const manualInvoice=p.quickBooks?.invoiceId;
    // Invoice payments need a confirmed allocation before they can pay a line.
    let candidates=entries.filter(c=>c.chargedCents>0&& (explicit?c.id===explicit:c.category===(p.applyTo||'rent')&&c.periodMonth===periodOf(p)&&(!manualInvoice||String(c.invoiceId)===String(manualInvoice))));
    // Legacy rent payments included recurring lease fees. Apply their remainder
    // only to the same month's generated fees, never to another month's rent.
    if(!explicit&&!manualInvoice&&(p.applyTo||'rent')==='rent')candidates.push(...entries.filter(c=>c.source==='lease'&&c.category!=='rent'&&c.category!=='deposit'&&c.category!=='late'&&c.periodMonth===periodOf(p)));
    if(p.quickBooks?.ledgerUnapplied)candidates=[];
    for(const c of candidates){const paid=Math.min(remaining,Math.max(0,c.chargedCents-c.paidCents));if(!paid)continue;c.paidCents+=paid;remaining-=paid;c.allocations.push({paymentId:String(p._id),amount:paid/100,date:p.date});assigned.push({chargeId:c.id,amount:paid/100});if(!remaining)break;}
    unapplied+=remaining;
    if(explicit&&!entries.some(c=>c.id===explicit))issues.push(`Payment ${p._id} references a charge that is no longer present.`);
    const matching=entries.filter(c=>c.category===(p.applyTo||'rent')&&c.periodMonth===periodOf(p));
    paymentEntries.push({paymentId:String(p._id),amount:initial/100,applied:(initial-remaining)/100,unapplied:remaining/100,balance:matching.reduce((s,c)=>s+Math.max(0,c.chargedCents-c.paidCents),0)/100,allocations:assigned});
  }
  unapplied+=Math.max(0,issuedCredits-consumedCredits);
  let legacyConsumed=consumedCredits;
  for(const source of paymentEntries.filter(p=>p.isCredit)){const consumed=Math.min(legacyConsumed,cents(source.unapplied));legacyConsumed-=consumed;source.unapplied=(cents(source.unapplied)-consumed)/100;source.applied=consumed/100;source.balance=-source.unapplied;}
  for(const transfer of options.creditApplications||[]){
    const source=paymentEntries.find(p=>p.paymentId===transfer.sourcePaymentId),target=entries.find(c=>c.id===transfer.chargeId);
    const requested=cents(transfer.amount);
    const amount=source&&target?Math.max(0,Math.min(requested,cents(source.unapplied),target.chargedCents-target.paidCents)):0;
    if(amount!==requested)issues.push('A credit application needs review because its source payment or target charge changed.');
    if(!amount)continue;
    source.unapplied=(cents(source.unapplied)-amount)/100;source.applied=(cents(source.applied)+amount)/100;if(source.isCredit)source.balance=-source.unapplied;unapplied-=amount;target.paidCents+=amount;target.allocations.push({paymentId:source.paymentId,amount:amount/100,source:'credit-application'});
  }
  const byCategory={};let outstanding=0;
  for(const c of entries){c.paid=c.paidCents/100;c.outstanding=Math.max(0,c.chargedCents-c.paidCents)/100;outstanding+=c.outstanding;byCategory[c.category]=(byCategory[c.category]||0)+c.outstanding;delete c.chargedCents;delete c.paidCents;}
  if(entries.some(c=>c.amount<0&&c.needsReview))issues.push('Invoice discount/credit adjustments require review; they have not been automatically applied to charges.');
  return {charges:entries,payments:paymentEntries,summary:{rentOwed:cents(byCategory.rent)/100,depositOwed:cents(byCategory.deposit)/100,feesOwed:cents(outstanding-(byCategory.rent||0)-(byCategory.deposit||0))/100,totalOutstanding:cents(outstanding)/100,unappliedCredit:unapplied/100,needsReview:entries.filter(c=>c.needsReview).length,reviewIssues:issues.length},issues};
}
function reconcileInvoices(result,snapshot){
  for(const invoice of snapshot.invoices||[]){
    const charges=result.charges.filter(c=>String(c.invoiceId)===String(invoice.Id));
    if(invoice.Balance==null||cents(charges.reduce((s,c)=>s+c.amount,0))!==cents(invoice.TotalAmt))continue;
    const local=cents(charges.reduce((s,c)=>s+c.outstanding,0));
    if(local!==cents(invoice.Balance))result.issues.push(`Invoice ${invoice.DocNumber||invoice.Id}: app outstanding ${(local/100).toFixed(2)} differs from QuickBooks ${Number(invoice.Balance).toFixed(2)}. Review missing payments, credits, or allocations.`);
  }
  result.summary.reviewIssues=result.issues.length;
  return result;
}
module.exports=function tenantChargeLedger(context){
  const collection=()=>context.Payment.db.collection('tenant_charge_ledgers');
  const key=(propertyId,tenantId)=>`${propertyId}:${tenantId}`;
  async function snapshot(propertyId,tenantId){return await collection().findOne({_id:key(propertyId,tenantId)})||{_id:key(propertyId,tenantId),projectId:String(propertyId),tenantId:String(tenantId),version:0,invoices:[],overrides:{},manualCharges:[]};}
  async function synchronize(tenant,doc){
    let connection=await context.QuickBooksConnection.findOne({projectId:tenant.projectId,status:'connected'}).lean();
    if(!connection)return {doc,warning:doc.invoices.length?'QuickBooks is disconnected. Invoice charges are from the last successful refresh.':''};
    connection=await context.getQbConnection(tenant.projectId);
    const mapping=tenant.quickBooks?.[String(connection._id)]||{};
    const ids=[...new Set([mapping.customerId,...(mapping.customers||[]).map(c=>c.customerId)].filter(Boolean).map(String))];
    if(!ids.length)return{doc,warning:'Map this tenant’s QuickBooks customer before importing their invoice charges.'};
    const invoices=[];
    for(const id of ids){for(let start=1;;start+=1000){const result=await context.qbRequest(connection,'get',`query?query=${encodeURIComponent(`select * from Invoice where CustomerRef = '${context.escapeQbQuery(id)}' startposition ${start} maxresults 1000`)}`);const page=result.QueryResponse?.Invoice||[];invoices.push(...page);if(page.length<1000)break;}}
    const unique=[...new Map(invoices.map(i=>[String(i.Id),i])).values()];
    await collection().updateOne({_id:doc._id},{$set:{invoices:unique,refreshedAt:new Date(),projectId:String(tenant.projectId),tenantId:String(tenant._id)},$setOnInsert:{version:0,overrides:{},manualCharges:[]}},{upsert:true});
    return{doc:{...doc,invoices:unique,refreshedAt:new Date()},warning:''};
  }
  async function read(propertyId,tenantId,refresh=false){
    const tenant=await context.Tenant.findOne({_id:tenantId,projectId:propertyId}).lean();if(!tenant)throw Error('Tenant not found in this property');
    let doc=await snapshot(propertyId,tenantId),warning='';
    if(refresh)try{({doc,warning}=await synchronize(tenant,doc));}catch(error){warning='QuickBooks invoice refresh failed. Showing saved charges; retry before relying on the balance.';}
    const payments=await context.Payment.find({projectId:propertyId,tenantId}).lean();
    const charges=buildCharges(tenant,doc,context.computeExpectedRentForMonth);
    const result=reconcileInvoices(calculate(charges,payments.filter(p=>new Date(p.date)<=new Date()),{depositPaid:tenant.depositPaid,creditApplications:doc.creditApplications}),doc);
    const invoices=(doc.invoices||[]).map(i=>({id:String(i.Id),number:i.DocNumber||i.Id,total:i.TotalAmt,balance:i.Balance}));
    if(!doc.refreshedAt&&Object.keys(tenant.quickBooks||{}).length)warning=warning||'Invoice charges have not been refreshed. Refresh QuickBooks charges before relying on these totals.';
    return{...result,tenantName:tenant.name,version:doc.version||0,warning,invoices,refreshedAt:doc.refreshedAt||null,audit:(doc.audit||[]).slice(-50)};
  }
  async function change(propertyId,tenantId,body){
    const tenant=await context.Tenant.findOne({_id:tenantId,projectId:propertyId}).lean();if(!tenant)throw Error('Tenant not found');
    const doc=await snapshot(propertyId,tenantId);
    if(Number(body.version)!==Number(doc.version||0))throw Error('Ledger changed. Refresh before saving.');
    if(body.action==='apply-credit'){
      const ledger=await read(propertyId,tenantId);
      const source=ledger.payments.find(p=>p.paymentId===body.sourcePaymentId),charge=ledger.charges.find(c=>c.id===body.chargeId),amount=Number(body.amount);
      if(!source||!charge||!Number.isFinite(amount)||cents(amount)<=0||Math.abs(amount*100-cents(amount))>.00001||cents(amount)>cents(source.unapplied)||cents(amount)>cents(charge.outstanding))throw Error('Choose an available payment credit and outstanding charge, and enter an amount within both balances.');
      const application={sourcePaymentId:body.sourcePaymentId,chargeId:body.chargeId,amount,at:new Date()};
      if(!await collection().findOne({_id:doc._id}))await collection().updateOne({_id:doc._id},{$setOnInsert:{...doc}},{upsert:true});
      const saved=await collection().updateOne({_id:doc._id,version:Number(body.version)},{$push:{creditApplications:application,audit:{...application,action:'apply-credit'}},$inc:{version:1}});
      if(!saved.modifiedCount)throw Error('Ledger changed. Refresh before saving.');
      return afterChange(propertyId,tenantId);
    }
    const charges=buildCharges(tenant,doc,context.computeExpectedRentForMonth),existing=charges.find(c=>c.id===body.chargeId);
    if(!categories.includes(body.category)||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(body.periodMonth||''))throw Error('Choose a category and applied month');
    const overrides={...doc.overrides},manualCharges=[...(doc.manualCharges||[])];
    if(existing){overrides[existing.id]={category:body.category,periodMonth:body.periodMonth,confirmed:true};}
    else {if(body.chargeId)throw Error('Charge no longer exists');const amount=Number(body.amount);if(!Number.isFinite(amount)||amount<=0||Math.abs(amount*100-cents(amount))>.00001)throw Error('Enter a positive charge amount with at most two decimals');manualCharges.push({id:`manual:${context.crypto.randomUUID()}`,category:body.category,periodMonth:body.periodMonth,amount,description:String(body.description||'Manual charge').slice(0,200)});}
    const event={at:new Date(),action:existing?'classify-charge':'add-charge',chargeId:existing?.id||manualCharges.at(-1).id,before:existing||null,after:existing?overrides[existing.id]:manualCharges.at(-1)};
    const update={$set:{overrides,manualCharges,projectId:String(propertyId),tenantId:String(tenantId)},$inc:{version:1},$push:{audit:event}};
    if(!await collection().findOne({_id:doc._id}))await collection().updateOne({_id:doc._id},{$setOnInsert:{...doc}},{upsert:true});
    const saved=await collection().updateOne({_id:doc._id,version:Number(body.version)},update);if(!saved.modifiedCount)throw Error('Ledger changed. Refresh before saving.');
    return afterChange(propertyId,tenantId);
  }
  async function afterChange(propertyId,tenantId){
    let warning='';
    try{await require('./payment-balances')(context).refreshTenant(tenantId);}catch(error){warning='Charge change saved, but payment rows could not be recalculated. Refresh Payments to retry.';}
    const result=await read(propertyId,tenantId);if(warning)result.warning=[result.warning,warning].filter(Boolean).join(' ');return result;
  }
  async function overview(propertyId,tenants,payments,asOf=new Date()){
    const docs=await collection().find({projectId:String(propertyId)}).toArray();
    const snapshots=new Map(docs.map(d=>[d.tenantId,d]));
    const summary={rentOwed:0,depositOwed:0,feesOwed:0,totalOutstanding:0,unappliedCredit:0,needsReview:0,reviewIssues:0};
    const aging={current:0,days31to60:0,days61to90:0,days90plus:0},rows=[];
    const byTenant=new Map();for(const p of payments){if(new Date(p.date)>asOf)continue;const id=String(p.tenantId);if(!byTenant.has(id))byTenant.set(id,[]);byTenant.get(id).push(p);}
    let missingSnapshots=0;
    for(const tenant of tenants){
      const doc=snapshots.get(String(tenant._id))||{};
      if(!doc.refreshedAt&&Object.keys(tenant.quickBooks||{}).length)missingSnapshots++;
      const result=calculate(buildCharges(tenant,doc,context.computeExpectedRentForMonth,asOf),byTenant.get(String(tenant._id))||[],{depositPaid:asOf.toDateString()===new Date().toDateString()?tenant.depositPaid:0,creditApplications:(doc.creditApplications||[]).filter(a=>new Date(a.at)<=asOf)});
      if(asOf.toDateString()===new Date().toDateString())reconcileInvoices(result,doc);
      for(const field of Object.keys(summary))summary[field]+=result.summary[field];
      const tenantAging={current:0,days31to60:0,days61to90:0,days90plus:0};
      for(const c of result.charges){const days=Math.max(0,Math.floor((asOf-new Date(c.periodMonth+'-01T12:00:00'))/86400000));const bucket=days<=30?'current':days<=60?'days31to60':days<=90?'days61to90':'days90plus';tenantAging[bucket]+=c.outstanding;aging[bucket]+=c.outstanding;}
      rows.push({tenantId:tenant._id,tenantName:tenant.name,unitId:tenant.unitId,balance:result.summary.totalOutstanding,...result.summary,aging:tenantAging});
    }
    for(const field of Object.keys(summary))summary[field]=cents(summary[field])/100;
    return{summary,aging,tenants:rows.sort((a,b)=>b.balance-a.balance),asOf,missingSnapshots};
  }
  // Called once during payment synchronization. Includes completely unpaid invoices.
  async function refreshProperty(propertyId,connection,tenants){
    const invoices=[];
    for(let start=1;;start+=1000){const data=await context.qbRequest(connection,'get',`query?query=${encodeURIComponent(`select * from Invoice startposition ${start} maxresults 1000`)}`);const page=data.QueryResponse?.Invoice||[];invoices.push(...page);if(page.length<1000)break;}
    const operations=[];
    for(const tenant of tenants){
      const mapping=tenant.quickBooks?.[String(connection._id)]||{};
      const ids=new Set([mapping.customerId,...(mapping.customers||[]).map(c=>c.customerId)].filter(Boolean).map(String));
      if(!ids.size)continue;
      operations.push({updateOne:{filter:{_id:key(propertyId,tenant._id)},update:{$set:{projectId:String(propertyId),tenantId:String(tenant._id),invoices:invoices.filter(i=>ids.has(String(i.CustomerRef?.value))),refreshedAt:new Date()},$setOnInsert:{version:0,overrides:{},manualCharges:[]}},upsert:true}});
    }
    if(operations.length)await collection().bulkWrite(operations);
  }
  return {read,change,snapshot,overview,refreshProperty};
};
module.exports.buildCharges=buildCharges;module.exports.calculate=calculate;module.exports.suggestLine=suggestLine;
