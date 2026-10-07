const response = () => {
  const res={code:200,payload:null};
  res.status=code=>{res.code=code;return res;};
  res.json=payload=>{res.payload=payload;return res;};
  return res;
};

function setup(payment,tenant={depositPaid:0}) {
  let handler;
  const session={withTransaction:jest.fn(async callback=>callback()),endSession:jest.fn()};
  const payments=[payment];
  const paymentQuery={session:jest.fn(async()=>payments)};
  const tenantQuery={session:jest.fn(async()=>tenant)};
  const context={
    app:{post:(url,callback)=>{if(url.endsWith('/void'))handler=callback;}},
    Payment:{
      db:{startSession:jest.fn(async()=>session)},
      findOne:jest.fn(()=>({session:jest.fn(async()=>payment)})),
      find:jest.fn(()=>paymentQuery),
      bulkWrite:jest.fn()
    },
    Tenant:{findById:jest.fn(()=>tenantQuery)}
  };
  require('../server/flows/payments')(context).post_api_properties_propertyId_payments_paymentId_void();
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
    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(session.endSession).toHaveBeenCalledTimes(1);
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
