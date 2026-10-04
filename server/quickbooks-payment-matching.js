const id=value=>String(value?._id||value||'');
const cents=value=>Math.round((Number(value)||0)*100);
const day=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?date.toISOString().slice(0,10):'';};
function customerIds(tenant,connection){const link=tenant?.quickBooks?.[id(connection)]||{};return [...new Set([link.customerId,...(link.customers||[]).map(c=>c.customerId)].filter(Boolean).map(String))];}
function evaluate(record,payment,tenant,connection){
 const reasons=[],differences=[];let score=0,blocked='';
 if(record.periodError)blocked=record.periodError;
 else if(payment.quickBooks?.entityId)blocked='Local payment is already linked.';
 else if(['pending','conflict'].includes(payment.postingStatus))blocked='Resolve this local payment’s posting status first.';
 else if(cents(payment.amount)!==cents(record.totalAmt)||cents(record.totalAmt)<=0)blocked='The received amounts must match exactly.';
 else if(!customerIds(tenant,connection).includes(String(record.customerId)))blocked=customerIds(tenant,connection).length?'QuickBooks customer does not match this tenant’s mapped customers.':'Map this QuickBooks customer to the tenant first.';
 if(cents(payment.amount)===cents(record.totalAmt)){score+=40;reasons.push('Same amount');}
 if(customerIds(tenant,connection).includes(String(record.customerId))){score+=40;reasons.push('Mapped tenant');}
 if(day(payment.date)&&day(payment.date)===day(record.txnDate)){score+=15;reasons.push('Same received date');}else differences.push('Received dates differ; the local received date will be retained.');
 if(record.periodMonth&&payment.periodMonth===record.periodMonth){score+=10;reasons.push('Same applied month');}
 else if(record.invoiceId&&payment.periodMonth!==record.periodMonth)differences.push(`Applied month will change from ${payment.periodMonth||'unspecified'} to invoice month ${record.periodMonth}.`);
 if(record.docNumber&&String(payment.reference||payment.checkNumber||'')===String(record.docNumber)){score+=10;reasons.push('Same reference');}
 return {paymentId:id(payment),tenantId:id(payment.tenantId),tenantName:tenant?.name||'Unknown tenant',unitNumber:tenant?.unitId?.number||'',amount:Number(payment.amount),date:payment.date,periodMonth:payment.periodMonth||'',eligible:!blocked,blocked,score,reasons,differences};
}
function suggest(record,payments,tenants,connection){
 const tenantById=new Map(tenants.map(t=>[id(t),t]));
 return payments.filter(p=>!p.quickBooks?.entityId&&cents(p.amount)===cents(record.totalAmt)).map(p=>evaluate(record,p,tenantById.get(id(p.tenantId)),connection)).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.score-a.score||a.paymentId.localeCompare(b.paymentId)).slice(0,12);
}
module.exports={evaluate,suggest,customerIds};
