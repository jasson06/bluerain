const response = () => {
  const res={code:200,payload:null};
  res.status=code=>{res.code=code;return res;};
  res.json=payload=>{res.payload=payload;return res;};
  return res;
};

function setup(payment,tenant={depositPaid:0},action='void',payments=[payment]) {
  let handler;
  const session={withTransaction:jest.fn(async callback=>callback()),endSession:jest.fn()};
  const paymentQuery={session:jest.fn(async()=>payments)};
  const tenantQuery={session:jest.fn(async()=>tenant)};
  const context={
    app:{post:(url,callback)=>{if(url.endsWith(`/${action}`))handler=callback;}},
    Payment:{
      db:{startSession:jest.fn(async()=>session)},
      findOne:jest.fn(()=>({session:jest.fn(async()=>payment)})),
      find:jest.fn(()=>paymentQuery),
      bulkWrite:jest.fn()
    },
    Tenant:{findById:jest.fn(()=>tenantQuery)}
  };
  Object.assign(context,require('../server/flows/payments')(context));
  context[`post_api_properties_propertyId_payments_paymentId_${action}`]();
  return {context,handler,payment,tenant,session};
}

const rentPayment=overrides=>({
  _id:'payment-a',
  projectId:'property-a',
  tenantId:'tenant-a',
  applyTo:'rent',
  amount:2700,
  balance:0,
  postingStatus:'posted',
  quickBooks:{},
  save:jest.fn(async()=>{}),
  toObject(){return {...this};},
  ...overrides
});

describe('void payment',()=>{
  test('requires an audit reason',async()=>{
    const {context,handler}=setup(rentPayment());
    const res=response();
    await handler({params:{propertyId:'property-a',paymentId:'payment-a'},body:{reason:' '}},res);
    expect(res.code).toBe(400);
    expect(context.Payment.db.startSession).not.toHaveBeenCalled();
  });

  test('voids and retains a returned payment, then refreshes tenant balances',async()=>{
    const payment=rentPayment();
    const {context,handler,session}=setup(payment);
    const res=response();
    await handler({params:{propertyId:'property-a',paymentId:'payment-a'},body:{reason:'Returned / insufficient funds (NSF)'}},res);
    expect(res.code).toBe(200);
    expect(res.payload).toMatchObject({success:true,voidedCount:1,payment:{postingStatus:'voided',voidReason:'Returned / insufficient funds (NSF)'}});
    expect(payment.save).toHaveBeenCalledWith({session});
    expect(payment.preVoidPostingStatus).toBe('posted');
    expect(payment.reinstatedAt).toBeNull();
    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  describe('reinstate payment',()=>{
    const req={params:{propertyId:'property-a',paymentId:'payment-a'}};
    const voided=overrides=>rentPayment({
      postingStatus:'voided',type:'rent',date:'2026-10-01',periodMonth:'2026-10',
      voidReason:'Returned check',voidedAt:new Date('2026-10-02'),...overrides
    });
    const tenant=()=>({depositPaid:700,deposit:1200,baseRent:2700,save:jest.fn(async()=>{})});

    test.each(['posted','pending','conflict',undefined])('restores prior status %s without erasing the void audit',async status=>{
      const payment=voided({preVoidPostingStatus:status});
      const {handler,context,session}=setup(payment,tenant(),'reinstate');
      const res=response();
      await handler(req,res);
      expect(res.code).toBe(200);
      expect(res.payload).toMatchObject({success:true,reinstatedCount:1,payment:{
        postingStatus:status||'posted',voidReason:'Returned check',reinstatedAt:expect.any(Date),balance:0
      }});
      expect(payment.voidedAt).toEqual(new Date('2026-10-02'));
      expect(payment.save).toHaveBeenCalledWith({session});
      expect(context.Payment.findOne).toHaveBeenCalledWith({_id:'payment-a',projectId:'property-a'});
      expect(session.withTransaction).toHaveBeenCalledTimes(1);
      expect(session.endSession).toHaveBeenCalledTimes(1);
    });

    test('restores deposit tracking exactly once',async()=>{
      const payment=voided({applyTo:'deposit',amount:500});
      const t=tenant();
      const {handler}=setup(payment,t,'reinstate');
      const res=response();
      await handler(req,res);
      expect(res.code).toBe(200);
      expect(t.depositPaid).toBe(1200);
      expect(t.save).toHaveBeenCalledWith({session:expect.any(Object)});
      const duplicate=response();
      await handler(req,duplicate);
      expect(duplicate.code).toBe(409);
      expect(t.depositPaid).toBe(1200);
      expect(payment.save).toHaveBeenCalledTimes(1);
    });

    test('reinstates the whole split from a child row and recalculates rent and deposits',async()=>{
      const qb={manualAllocation:true,allocationRootId:'root',entityId:'qb-1'};
      const child=voided({quickBooks:{...qb,entityId:'qb-1:allocation:1'},applyTo:'deposit',amount:500});
      const root=voided({_id:'root',quickBooks:qb,amount:1000});
      const t=tenant();
      const {handler,session}=setup(child,t,'reinstate',[root,child]);
      const res=response();
      await handler(req,res);
      expect(res.code).toBe(200);
      expect(res.payload).toMatchObject({reinstatedCount:2,payment:{_id:'payment-a',postingStatus:'posted',balance:700}});
      expect(root.balance).toBe(1700);
      expect(root.save).toHaveBeenCalledWith({session});
      expect(child.save).toHaveBeenCalledWith({session});
      expect(t.depositPaid).toBe(1200);
      expect(root.quickBooks).toEqual(qb);
    });

    test('refreshes subsequent payment balances when a rent receipt is restored',async()=>{
      const payment=voided({amount:1000});
      const later=rentPayment({_id:'later',type:'rent',date:'2026-10-03',periodMonth:'2026-10',amount:1700,balance:1000});
      const {handler,context}=setup(payment,tenant(),'reinstate',[payment,later]);
      const res=response();
      await handler(req,res);
      expect(res.code).toBe(200);
      expect(payment.balance).toBe(1700);
      expect(later.balance).toBe(0);
      expect(context.Payment.bulkWrite).toHaveBeenCalledWith(expect.arrayContaining([
        {updateOne:{filter:{_id:'later'},update:{$set:{balance:0}}}}
      ]),{ordered:true,session:expect.any(Object)});
    });

    test.each(['posted','pending','conflict'])('rejects a non-voided %s payment',async status=>{
      const payment=rentPayment({postingStatus:status});
      const {handler}=setup(payment,tenant(),'reinstate');
      const res=response();
      await handler(req,res);
      expect(res.code).toBe(409);
      expect(payment.save).not.toHaveBeenCalled();
    });

    test('rejects mixed-state allocation groups before writing',async()=>{
      const payment=voided({quickBooks:{manualAllocation:true,allocationRootId:'payment-a'}});
      const sibling=rentPayment({_id:'sibling'});
      const {handler}=setup(payment,tenant(),'reinstate',[payment,sibling]);
      const res=response();
      await handler(req,res);
      expect(res.code).toBe(409);
      expect(payment.save).not.toHaveBeenCalled();
      expect(sibling.save).not.toHaveBeenCalled();
    });

    test('returns 404 for a missing payment and releases the session',async()=>{
      const {handler,session}=setup(null,tenant(),'reinstate');
      const res=response();
      await handler(req,res);
      expect(res.code).toBe(404);
      expect(session.endSession).toHaveBeenCalledTimes(1);
    });

    test('reports transaction failures instead of success',async()=>{
      const payment=voided({save:jest.fn().mockRejectedValue(new Error('Database unavailable'))});
      const {handler,session}=setup(payment,tenant(),'reinstate');
      const log=jest.spyOn(console,'error').mockImplementation(()=>{});
      try {
        const res=response();
        await handler(req,res);
        expect(res.code).toBe(500);
        expect(res.payload).toEqual({message:'Unable to reinstate payment'});
        expect(log).toHaveBeenCalled();
        expect(session.endSession).toHaveBeenCalledTimes(1);
      } finally {log.mockRestore();}
    });
  });

  test('reverses the deposit-paid total when voiding a deposit payment',async()=>{
    const payment=rentPayment({applyTo:'deposit',amount:500});
    const tenant={depositPaid:1200,save:jest.fn(async()=>{})};
    const {handler}=setup(payment,tenant);
    const res=response();
    await handler({params:{propertyId:'property-a',paymentId:'payment-a'},body:{reason:'Returned check'}},res);
    expect(res.code).toBe(200);
    expect(tenant.depositPaid).toBe(700);
    expect(tenant.save).toHaveBeenCalledWith({session:expect.any(Object)});
  });

  test('rejects duplicate voids and payments with already-used credit',async()=>{
    const alreadyVoided=rentPayment({postingStatus:'voided'});
    const duplicate=setup(alreadyVoided);
    const duplicateRes=response();
    await duplicate.handler({params:{propertyId:'property-a',paymentId:'payment-a'},body:{reason:'Returned'}},duplicateRes);
    expect(duplicateRes.code).toBe(409);
    expect(alreadyVoided.save).not.toHaveBeenCalled();

    const appliedCredit=rentPayment({appliedCredit:100});
    const creditCase=setup(appliedCredit);
    const creditRes=response();
    await creditCase.handler({params:{propertyId:'property-a',paymentId:'payment-a'},body:{reason:'Returned'}},creditRes);
    expect(creditRes.code).toBe(409);
    expect(appliedCredit.save).not.toHaveBeenCalled();
    const source=rentPayment({creditConsumed:30});
    const consumed=setup(source);
    const consumedRes=response();
    await consumed.handler({params:{propertyId:'property-a',paymentId:'payment-a'},body:{reason:'Returned'}},consumedRes);
    expect(consumedRes.code).toBe(409);
    expect(source.save).not.toHaveBeenCalled();
  });
});
