// User-confirmed allocation of one imported invoice payment; all writes are atomic.
module.exports = function paymentAllocations(context) {
  const cents = amount => {
    const n=Number(amount);
    if(!Number.isFinite(n)||n<0||Math.abs(n*100-Math.round(n*100))>0.00001)throw Error('Amounts must be non-negative with at most two decimal places');
    return Math.round(n*100);
  };
  function validate(rows,total) {
    if(!Array.isArray(rows)||!rows.length||rows.length>40)throw Error('Enter between 1 and 40 allocations');
    const allowed=['rent','deposit','fee','late','water','electric','trash','admin','other'];
    const result=rows.map(row=>{
      if(!allowed.includes(row.applyTo))throw Error('Choose a valid allocation category');
      if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(row.periodMonth||''))throw Error('Choose a month for every allocation');
      return {amount:cents(row.amount)/100,applyTo:row.applyTo,periodMonth:row.periodMonth,feeLabel:String(row.feeLabel||'').trim().slice(0,200),feeType:row.applyTo==='fee'?'other':''};
    }).filter(row=>row.amount>0);
    if(!result.length||result.reduce((sum,row)=>sum+cents(row.amount),0)!==cents(total))throw Error('Allocated amounts must equal the received payment amount exactly');
    return result;
  }
  async function details(payment) {
    const rootId=payment.quickBooks?.allocationRootId||String(payment._id);
    const root=String(payment._id)===rootId?payment:await context.Payment.findOne({_id:rootId,projectId:payment.projectId});
    if(!root)throw Error('Allocation source payment not found');
    const rows=root.quickBooks?.manualAllocation?await context.Payment.find({projectId:root.projectId,'quickBooks.allocationRootId':rootId}).sort({'quickBooks.allocationIndex':1}).lean():[root.toObject()];
    let invoice=null,invoiceError='';
    if(root.quickBooks?.invoiceId)try{
      const connection=await context.getQbConnection(root.projectId);
      if(String(connection._id)!==String(root.quickBooks.connectionId))throw Error('The original QuickBooks connection is no longer active');
      invoice=(await context.qbRequest(connection,'get',`invoice/${encodeURIComponent(root.quickBooks.invoiceId)}`)).Invoice;
    }catch(error){invoiceError='Invoice details could not be loaded. You can allocate manually using your records.';}
    return {payment:root,rootId,version:root.quickBooks?.allocationVersion||0,total:root.quickBooks?.allocationTotal??root.amount,rows,invoice:invoice?{number:invoice.DocNumber,date:invoice.TxnDate,lines:(invoice.Line||[]).filter(l=>l.DetailType==='SalesItemLineDetail').map(l=>({id:l.Id,description:l.Description||'',item:l.SalesItemLineDetail?.ItemRef?.name||'',amount:Number(l.Amount)||0}))}:null,invoiceError};
  }
  async function save(payment,body) {
    if(!payment.quickBooks?.entityId)throw Error('This editor is for imported or linked QuickBooks payments');
    const rootId=payment.quickBooks.allocationRootId||String(payment._id);
    const session=await context.Payment.db.startSession();
    let tenantId;
    try { await session.withTransaction(async()=>{
      const root=await context.Payment.findOne({_id:rootId,projectId:payment.projectId}).session(session);
      if(!root)throw Error('Source payment no longer exists');
      if(Number(body.version)!==Number(root.quickBooks?.allocationVersion||0))throw Error('This allocation was changed. Reopen it before saving');
      const total=root.quickBooks?.allocationTotal??root.amount;
      const rows=validate(body.allocations,total);
      const existing=root.quickBooks?.manualAllocation?await context.Payment.find({projectId:root.projectId,'quickBooks.allocationRootId':rootId}).session(session):[root];
      if(existing.some(p=>p.appliedCredit||p.carryForward||p.amount<0))throw Error('Resolve applied credits before splitting this payment');
      const original=root.quickBooks?.allocationOriginal||{amount:root.amount,applyTo:root.applyTo,periodMonth:root.periodMonth,note:root.note,lateFee:root.lateFee};
      const base=root.toObject();delete base._id;delete base.__v;delete base.updatedAt;
      const qb={...root.quickBooks,manualAllocation:true,allocationRootId:rootId,allocationTotal:total,allocationVersion:Number(body.version)+1,allocationOriginal:original};
      const oldDeposit=existing.filter(p=>p.applyTo==='deposit').reduce((sum,p)=>sum+p.amount,0);
      const newDeposit=rows.filter(p=>p.applyTo==='deposit').reduce((sum,p)=>sum+p.amount,0);
      await context.Payment.deleteMany({projectId:root.projectId,'quickBooks.allocationRootId':rootId,_id:{$ne:root._id}}).session(session);
      for(let i=0;i<rows.length;i++){
        const row=rows[i],data={...base,...row,type:row.applyTo==='rent'?'rent':'custom',lateFee:0,balance:0,appliedCredit:0,carryForward:false,
          note:[original.note,`Allocation: ${row.feeLabel||row.applyTo} (${row.periodMonth})`].filter(Boolean).join(' · '),
          quickBooks:{...qb,allocationIndex:i,entityId:i?`${root.quickBooks.entityId}:allocation:${i}`:root.quickBooks.entityId}};
        if(i===0){root.set(data);root.markModified('quickBooks');await root.save({session});}
        else await context.Payment.create([data],{session});
      }
      // Keep the pre-existing deposit tracking field consistent with the ledger.
      if(newDeposit!==oldDeposit){const tenant=await context.Tenant.findById(root.tenantId).session(session);if(!tenant)throw Error('Tenant not found');tenant.depositPaid=Math.max(0,(Number(tenant.depositPaid)||0)+newDeposit-oldDeposit);await tenant.save({session});}
      tenantId=root.tenantId;
    });}finally{await session.endSession();}
    return {tenantId,rootId};
  }
  return {validate,details,save};
};
