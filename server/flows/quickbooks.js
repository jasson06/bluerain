// quickbooks flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {
const paymentBalances = require('../payment-balances')(serverContext);

function encryptQbSecret(value) { const iv=serverContext.crypto.randomBytes(12),cipher=serverContext.crypto.createCipheriv('aes-256-gcm',serverContext.QB_TOKEN_KEY,iv);const encrypted=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`; }

function decryptQbSecret(value) { const [iv,tag,encrypted]=String(value||'').split('.');const decipher=serverContext.crypto.createDecipheriv('aes-256-gcm',serverContext.QB_TOKEN_KEY,Buffer.from(iv,'base64url'));decipher.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([decipher.update(Buffer.from(encrypted,'base64url')),decipher.final()]).toString('utf8'); }

function createQbState(projectId) { const payload=Buffer.from(JSON.stringify({projectId:String(projectId),nonce:serverContext.crypto.randomBytes(18).toString('hex'),exp:Date.now()+10*60*1000})).toString('base64url');const sig=serverContext.crypto.createHmac('sha256',serverContext.JWT_SECRET).update(payload).digest('base64url');return `${payload}.${sig}`; }

function verifyQbState(state) { const [payload,sig]=String(state||'').split('.');const expected=serverContext.crypto.createHmac('sha256',serverContext.JWT_SECRET).update(payload||'').digest();const provided=Buffer.from(sig||'','base64url');if(provided.length!==expected.length||!serverContext.crypto.timingSafeEqual(provided,expected))throw new Error('Invalid OAuth state');const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));if(!data.projectId||Date.now()>data.exp)throw new Error('Expired OAuth state');return data; }

function qbBaseUrl(connection) { return connection.environment==='production'?'https://quickbooks.api.intuit.com':'https://sandbox-quickbooks.api.intuit.com'; }

async function refreshQbConnection(connection) { const full=connection.encryptedAccessToken?connection:await serverContext.QuickBooksConnection.findById(connection._id).select('+encryptedAccessToken +encryptedRefreshToken');if(full.accessTokenExpiresAt&&full.accessTokenExpiresAt.getTime()>Date.now()+5*60*1000)return full;const params=new URLSearchParams({grant_type:'refresh_token',refresh_token:(0, serverContext.decryptQbSecret)(full.encryptedRefreshToken)});const response=await serverContext.axios.post('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',params,{headers:{Authorization:'Basic '+Buffer.from(`${serverContext.QB_CLIENT_ID}:${serverContext.QB_CLIENT_SECRET}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'}});full.encryptedAccessToken=(0, serverContext.encryptQbSecret)(response.data.access_token);if(response.data.refresh_token)full.encryptedRefreshToken=(0, serverContext.encryptQbSecret)(response.data.refresh_token);full.accessTokenExpiresAt=new Date(Date.now()+(Number(response.data.expires_in)||3600)*1000);if(response.data.x_refresh_token_expires_in)full.refreshTokenExpiresAt=new Date(Date.now()+Number(response.data.x_refresh_token_expires_in)*1000);full.lastRefreshAt=new Date();full.status='connected';full.lastError='';await full.save();return full; }

async function getQbConnection(projectId) { const connection=await serverContext.QuickBooksConnection.findOne({projectId,status:{$ne:'disconnected'}}).select('+encryptedAccessToken +encryptedRefreshToken');if(!connection)throw new Error('This property is not connected to QuickBooks');return (0, serverContext.refreshQbConnection)(connection); }

async function qbRequest(connection,method,pathPart,data) { const current=await (0, serverContext.refreshQbConnection)(connection);const response=await (0, serverContext.axios)({method,url:`${(0, serverContext.qbBaseUrl)(current)}/v3/company/${current.realmId}/${pathPart}${pathPart.includes('?')?'&':'?'}minorversion=75`,data,headers:{Authorization:`Bearer ${(0, serverContext.decryptQbSecret)(current.encryptedAccessToken)}`,Accept:'application/json','Content-Type':'application/json'}});return response.data; }

function normalizeQbPaymentDate(value) { const date=new Date(value);return Number.isNaN(date.getTime())?'':date.toISOString().slice(0,10); }

function buildQuickBooksPaymentRecord(record,sourceType) { return {sourceType,id:String(record?.Id||''),docNumber:String(record?.DocNumber||record?.PaymentRefNum||''),txnDate:String(record?.TxnDate||''),totalAmt:(0, serverContext.normalizeQbPaymentAmount)(record?.TotalAmt??record?.Amount??record?.UnappliedAmt??0),privateNote:String(record?.PrivateNote||''),customerId:String(record?.CustomerRef?.value||''),customerName:String(record?.CustomerRef?.name||''),paymentMethodName:String(record?.PaymentMethodRef?.name||''),depositAccountName:String(record?.DepositToAccountRef?.name||record?.ARAccountRef?.name||''),raw:record}; }

function inferApplyToFromQuickBooksPaymentRecord(record) {
  const text = (0, serverContext.normalizeQbPaymentText)([record?.privateNote, record?.docNumber].filter(Boolean).join(' '));
  if (!text) return 'rent';
  if (/security deposit|\bdeposit\b/.test(text)) return 'deposit';
  if (/\blate\b/.test(text)) return 'late';
  if (/\bwater\b/.test(text)) return 'water';
  if (/\belectric|electricity\b/.test(text)) return 'electric';
  if (/\btrash\b|\bsewer\b/.test(text)) return 'trash';
  if (/\badmin\b|\badministrative\b/.test(text)) return 'admin';
  if (/\bfee\b/.test(text)) return 'fee';
  return 'rent';
}

function inferMethodFromQuickBooksPaymentRecord(record) {
  const text = (0, serverContext.normalizeQbPaymentText)(record?.paymentMethodName);
  if (!text) return 'online';
  if (text.includes('check')) return 'check';
  if (text.includes('cash')) return 'cash';
  if (text.includes('bank') || text.includes('ach')) return 'bank';
  return 'online';
}

function inferTypeFromQuickBooksPaymentRecord(record) {
  return (0, serverContext.inferApplyToFromQuickBooksPaymentRecord)(record) === 'rent' ? 'rent' : 'custom';
}

function inferPeriodMonthFromQuickBooksPaymentRecord(record) {
  const directDate = (0, serverContext.normalizeQbPaymentDate)(record?.txnDate || record?.raw?.TxnDate || '');
  const fallbackYear = directDate ? Number(directDate.slice(0, 4)) : new Date().getFullYear();
  const combinedText = String([record?.privateNote, record?.docNumber, record?.customerName].filter(Boolean).join(' '));
  const yyyyMmMatch = combinedText.match(/\b(20\d{2})[-\/](0[1-9]|1[0-2])\b/);
  if (yyyyMmMatch) return `${yyyyMmMatch[1]}-${yyyyMmMatch[2]}`;
  const mmYyyyMatch = combinedText.match(/\b(0?[1-9]|1[0-2])[\/-](20\d{2})\b/);
  if (mmYyyyMatch) return `${mmYyyyMatch[2]}-${String(mmYyyyMatch[1]).padStart(2, '0')}`;
  const monthNameMatch = combinedText.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b(?:\s+of)?\s*(20\d{2})?/i);
  if (monthNameMatch) {
    const monthMap = {
      jan: 1, january: 1,
      feb: 2, february: 2,
      mar: 3, march: 3,
      apr: 4, april: 4,
      may: 5,
      jun: 6, june: 6,
      jul: 7, july: 7,
      aug: 8, august: 8,
      sep: 9, sept: 9, september: 9,
      oct: 10, october: 10,
      nov: 11, november: 11,
      dec: 12, december: 12
    };
    const monthNumber = monthMap[String(monthNameMatch[1] || '').toLowerCase()];
    const year = Number(monthNameMatch[2] || fallbackYear);
    if (monthNumber && year) return `${year}-${String(monthNumber).padStart(2, '0')}`;
  }
  return directDate ? directDate.slice(0, 7) : '';
}

function mappedQbCustomers(link = {}) {
  const customers = Array.isArray(link.customers) ? link.customers : [];
  const all = link.customerId ? [{customerId: link.customerId, customerDisplayName: link.customerDisplayName || ''}, ...customers] : customers;
  return [...new Map(all.filter(c => c?.customerId).map(c => [String(c.customerId), {...c, customerId: String(c.customerId)}])).values()];
}

function matchTenantForQuickBooksPaymentRecord(record, tenants = [], unitById = new Map(), connectionId = '') {
  const customerId = String(record?.customerId || '');
  const customerName = (0, serverContext.normalizeQbPaymentText)(record?.customerName);
  const links = tenant => connectionId ? [tenant.quickBooks?.[String(connectionId)] || {}] : Object.values(tenant.quickBooks || {});
  const exact = tenants.filter(tenant => customerId && links(tenant).some(link => mappedQbCustomers(link).some(c => c.customerId === customerId)));
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  if (!customerName) return null;
  const candidates = tenants.filter(tenant => {
    // An explicit mapping must not be expanded by a similar display name.
    if (links(tenant).some(link => mappedQbCustomers(link).length)) return false;
    const name = (0, serverContext.normalizeQbPaymentText)(tenant.name || `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim());
    if (!name) return false;
    const unit = unitById.get(String(tenant.unitId?._id || tenant.unitId || ''));
    const display = (0, serverContext.normalizeQbPaymentText)(`${name} - ${unit?.number != null ? `Unit ${unit.number}` : 'Tenant'}`);
    return customerName === name || customerName === display || customerName.startsWith(`${name} -`);
  });
  return candidates.length === 1 ? candidates[0] : null;
}

function buildQuickBooksImportNote(record) {
  const parts = ['Imported from QuickBooks'];
  if (record?.docNumber) parts.push(record.docNumber);
  if (record?.privateNote) parts.push(String(record.privateNote).trim());
  return parts.filter(Boolean).join(' · ').slice(0, 1000);
}

async function autoResolveQuickBooksPaymentsForProperty(propertyId, connection = null) {
  const existingConnection = connection || await serverContext.QuickBooksConnection.findOne({ projectId: propertyId, status: { $ne: 'disconnected' } }).lean();
  if (!existingConnection) {
    return { connection: null, localPayments: [], qbPayments: [], tenants: [], unitById: new Map() };
  }
  const liveConnection = connection ? await (0, serverContext.refreshQbConnection)(connection) : await (0, serverContext.getQbConnection)(propertyId);
  const [localPayments, qbPayments, tenants] = await Promise.all([
    serverContext.Payment.find({ projectId: propertyId }).sort({ date: -1, createdAt: -1 }).lean(),
    (0, serverContext.fetchQuickBooksPaymentRecords)(liveConnection),
    serverContext.Tenant.find({ projectId: propertyId }).populate('unitId', 'number').select('_id name firstName lastName email phone unitId quickBooks').sort({ name: 1 }).lean()
  ]);
  const unitById = new Map((tenants || []).map(tenant => {
    const unit = tenant?.unitId && typeof tenant.unitId === 'object' ? tenant.unitId : null;
    const unitId = unit?._id || tenant?.unitId || '';
    return [String(unitId), unit || null];
  }).filter(([unitId]) => unitId));
  const records = (0, serverContext.attachQuickBooksPaymentMatches)(localPayments, qbPayments);
  const matchedIds = new Set(localPayments.filter(payment => payment?.quickBooks?.entityId).map(payment => `${payment.quickBooks.entityType || 'Payment'}:${payment.quickBooks.entityId}`));
  const key = String(liveConnection._id);

  for (const record of records) {
    const recordKey = `${record.sourceType}:${record.id}`;
    if (!record?.id || record.localPaymentId || matchedIds.has(recordKey)) continue;
    const tenant = (0, serverContext.matchTenantForQuickBooksPaymentRecord)(record, tenants, unitById, key);
    if (!tenant) continue;

    const applyTo = (0, serverContext.inferApplyToFromQuickBooksPaymentRecord)(record);
    const periodMonth = (0, serverContext.inferPeriodMonthFromQuickBooksPaymentRecord)(record);
    const normalizedDate = (0, serverContext.normalizeQbPaymentDate)(record.txnDate);
    const amount = (0, serverContext.normalizeQbPaymentAmount)(record.totalAmt);
    if (!(amount > 0)) continue;

    const candidateLocalPayment = localPayments.find(payment => {
      if (payment?.quickBooks?.entityId) return false;
      if (String(payment.tenantId || '') !== String(tenant._id || '')) return false;
      if ((0, serverContext.normalizeQbPaymentAmount)(payment.amount) !== amount) return false;
      const paymentDate = (0, serverContext.normalizeQbPaymentDate)(payment.date);
      const paymentPeriod = String(payment.periodMonth || '');
      if (normalizedDate && paymentDate === normalizedDate) return true;
      if (periodMonth && paymentPeriod === periodMonth) return true;
      return false;
    });

    if (candidateLocalPayment) {
      await serverContext.Payment.updateOne(
        { _id: candidateLocalPayment._id, $or: [{ 'quickBooks.entityId': { $exists: false } }, { 'quickBooks.entityId': '' }, { quickBooks: { $exists: false } }] },
        {
          $set: {
            source: candidateLocalPayment.source || 'local',
            postingStatus: 'posted',
            'quickBooks.connectionId': liveConnection._id,
            'quickBooks.realmId': liveConnection.realmId,
            'quickBooks.entityType': record.sourceType,
            'quickBooks.entityId': record.id,
            'quickBooks.docNumber': record.docNumber || '',
            'quickBooks.customerId': record.customerId || '',
            'quickBooks.syncStatus': 'synced',
            'quickBooks.syncedAt': new Date(),
            'quickBooks.matchMethod': 'automatic-tenant-match',
            'quickBooks.lastError': ''
          }
        }
      );
      record.localPaymentId = String(candidateLocalPayment._id);
      matchedIds.add(recordKey);
      continue;
    }

    try {
      const created = await serverContext.Payment.create({
        projectId: propertyId,
        tenantId: tenant._id,
        unitId: tenant.unitId?._id || tenant.unitId || undefined,
        type: (0, serverContext.inferTypeFromQuickBooksPaymentRecord)(record),
        applyTo,
        amount,
        method: (0, serverContext.inferMethodFromQuickBooksPaymentRecord)(record),
        date: normalizedDate || record.txnDate || new Date(),
        periodMonth,
        note: (0, serverContext.buildQuickBooksImportNote)(record),
        lateFee: 0,
        balance: 0,
        source: 'quickbooks',
        postingStatus: 'posted',
        quickBooks: {
          connectionId: liveConnection._id,
          realmId: liveConnection.realmId,
          entityType: record.sourceType,
          entityId: record.id,
          docNumber: record.docNumber || '',
          customerId: record.customerId || '',
          syncStatus: 'synced',
          syncedAt: new Date(),
          matchMethod: 'automatic-tenant-import',
          lastError: ''
        }
      });
      if (record.customerId) {
        await serverContext.Tenant.updateOne(
          { _id: tenant._id, [`quickBooks.${key}.customerId`]: { $in: [null, ''] } },
          {
            $set: {
              [`quickBooks.${key}.customerId`]: record.customerId,
              [`quickBooks.${key}.customerDisplayName`]: record.customerName || '',
              [`quickBooks.${key}.verifiedAt`]: new Date(),
              [`quickBooks.${key}.matchMethod`]: 'automatic-qb-payment-import'
            }
          }
        );
      }
      localPayments.unshift(created.toObject());
      record.localPaymentId = String(created._id);
      matchedIds.add(recordKey);
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const existing = await serverContext.Payment.findOne({ projectId: propertyId, 'quickBooks.entityType': record.sourceType, 'quickBooks.entityId': record.id }).lean();
      if (existing) {
        record.localPaymentId = String(existing._id);
        matchedIds.add(recordKey);
      }
    }
  }

  // Includes older imports whose balances were saved as zero, and runs after
  // the full import batch so each tenant's final totals include every payment.
  const linkedPayments = await serverContext.Payment.find({projectId: propertyId, 'quickBooks.connectionId': liveConnection._id}).select('tenantId').lean();
  for (const tenantId of new Set(linkedPayments.filter(p => p.tenantId).map(p => String(p.tenantId)))) {
    await paymentBalances.refreshTenant(tenantId);
  }
  const refreshedLocalPayments = await serverContext.Payment.find({ projectId: propertyId }).sort({ date: -1, createdAt: -1 }).lean();
  return {
    connection: liveConnection,
    localPayments: refreshedLocalPayments,
    qbPayments: (0, serverContext.attachQuickBooksPaymentMatches)(refreshedLocalPayments, qbPayments),
    tenants,
    unitById
  };
}

function buildUnifiedQuickBooksPaymentEntries({ localPayments = [], qbRecords = [], tenants = [], unitById = new Map(), projectId = '', connectionId = '' }) {
  const localPaymentsWithTenantNames = (localPayments || []).map(payment => ({
    ...payment,
    tenantName: (tenants || []).find(tenant => String(tenant?._id || '') === String(payment?.tenantId || ''))?.name || ''
  }));
  const matchedRecords = (0, serverContext.attachQuickBooksPaymentMatches)(localPaymentsWithTenantNames, qbRecords || []);
  return matchedRecords
    .filter(record => !record?.localPaymentId)
    .map(record => {
      const tenant = (0, serverContext.matchTenantForQuickBooksPaymentRecord)(record, tenants, unitById, connectionId);
      return {
        _id: `quickbooks:${record.sourceType}:${record.id}`,
        projectId,
        tenantId: tenant?._id || '',
        unitId: tenant?.unitId || '',
        type: 'payment',
        amount: (0, serverContext.normalizeQbPaymentAmount)(record.totalAmt),
        method: (0, serverContext.normalizeQbPaymentText)(record.paymentMethodName),
        date: record.txnDate || null,
        note: String(record.privateNote || ''),
        applyTo: (0, serverContext.inferApplyToFromQuickBooksPaymentRecord)(record),
        appliedCredit: 0,
        quickBooks: {
          entityType: record.sourceType,
          entityId: record.id,
          docNumber: record.docNumber,
          syncStatus: 'synced',
          sourceOnly: true
        }
      };
    });
}

async function fetchQuickBooksPaymentRecords(connection) { const [salesReceiptsResponse,paymentsResponse]=await Promise.all([(0, serverContext.qbRequest)(connection,'get',`query?query=${encodeURIComponent("select * from SalesReceipt maxresults 1000")}`),(0, serverContext.qbRequest)(connection,'get',`query?query=${encodeURIComponent("select * from Payment maxresults 1000")}`)]);return [...(salesReceiptsResponse.QueryResponse?.SalesReceipt||[]).map(record=>(0, serverContext.buildQuickBooksPaymentRecord)(record,'SalesReceipt')),...(paymentsResponse.QueryResponse?.Payment||[]).map(record=>(0, serverContext.buildQuickBooksPaymentRecord)(record,'Payment'))].sort((left,right)=>new Date(right.txnDate||0)-new Date(left.txnDate||0)); }

function matchQuickBooksRecordForLocalPayment(payment,qbRecords,usedRecordIds=new Set()) { const quickBooks=payment?.quickBooks||{},entityId=String(quickBooks.entityId||''),docNumber=String(quickBooks.docNumber||''),paymentDate=(0, serverContext.normalizeQbPaymentDate)(payment?.date),paymentAmount=(0, serverContext.normalizeQbPaymentAmount)(payment?.amount),paymentNote=(0, serverContext.normalizeQbPaymentText)(payment?.note),tenantName=(0, serverContext.normalizeQbPaymentText)(payment?.tenantId?.name||payment?.tenantName||'');const availableRecords=(qbRecords||[]).filter(record=>record?.id&&!usedRecordIds.has(`${record.sourceType}:${record.id}`));if(entityId){const directEntityMatch=availableRecords.find(record=>record.id===entityId);if(directEntityMatch)return directEntityMatch;}if(docNumber){const directDocMatch=availableRecords.find(record=>record.docNumber===docNumber);if(directDocMatch)return directDocMatch;}let bestRecord=null,bestScore=0;for(const record of availableRecords){if((0, serverContext.normalizeQbPaymentDate)(record.txnDate)!==paymentDate)continue;if((0, serverContext.normalizeQbPaymentAmount)(record.totalAmt)!==paymentAmount)continue;const recordNote=(0, serverContext.normalizeQbPaymentText)(record.privateNote),recordCustomer=(0, serverContext.normalizeQbPaymentText)(record.customerName);let score=0;if(paymentNote&&recordNote&&paymentNote===recordNote)score+=60;if(tenantName&&recordCustomer&&(recordCustomer===tenantName||recordCustomer.startsWith(`${tenantName} -`)||recordCustomer.includes(tenantName)))score+=25;if(docNumber&&record.docNumber&&record.docNumber===docNumber)score+=20;if(score>bestScore){bestScore=score;bestRecord=record;}}return bestScore>=25?bestRecord:null; }

function attachQuickBooksPaymentMatches(localPayments,qbRecords) { const usedRecordIds=new Set(),matchedLocalIds=new Map();const prioritized=[...(localPayments||[])].sort((left,right)=>{const leftRank=(left?.quickBooks?.entityId?2:0)+(left?.quickBooks?.docNumber?1:0),rightRank=(right?.quickBooks?.entityId?2:0)+(right?.quickBooks?.docNumber?1:0);return rightRank-leftRank;});for(const payment of prioritized){const match=(0, serverContext.matchQuickBooksRecordForLocalPayment)(payment,qbRecords,usedRecordIds);if(!match)continue;usedRecordIds.add(`${match.sourceType}:${match.id}`);matchedLocalIds.set(`${match.sourceType}:${match.id}`,String(payment._id));}return (qbRecords||[]).map(record=>({...record,localPaymentId:matchedLocalIds.get(`${record.sourceType}:${record.id}`)||''})); }

async function ensureQbCustomer(connection,tenant) { const existingId=tenant.quickBooks?.[String(connection._id)]?.customerId;if(existingId)return existingId;const displayName=`${tenant.name} - ${tenant.unitId?.number?`Unit ${tenant.unitId.number}`:'Tenant'}`.slice(0,100);const query=await (0, serverContext.qbRequest)(connection,'get',`query?query=${encodeURIComponent(`select * from Customer where DisplayName = '${(0, serverContext.escapeQbQuery)(displayName)}' maxresults 2`)}`);let customer=query.QueryResponse?.Customer?.[0];if(!customer){const created=await (0, serverContext.qbRequest)(connection,'post','customer',{DisplayName:displayName,PrimaryEmailAddr:tenant.email?{Address:tenant.email}:undefined,PrimaryPhone:tenant.phone?{FreeFormNumber:tenant.phone}:undefined});customer=created.Customer;}tenant.quickBooks=tenant.quickBooks||{};tenant.quickBooks[String(connection._id)]={customerId:customer.Id,customerDisplayName:customer.DisplayName,syncedAt:new Date()};tenant.markModified('quickBooks');await tenant.save();return customer.Id; }

function scheduleAutomaticQuickBooksPaymentSync(payment) { setImmediate(async()=>{try{const connection=await serverContext.QuickBooksConnection.findOne({projectId:payment.projectId,status:'connected'}).lean();if(connection?.settings?.paymentSyncMode==='automatic')await (0, serverContext.syncPaymentToQuickBooks)(payment._id);}catch(error){console.warn('Automatic QuickBooks payment sync deferred:',error.message);}}); }

async function syncPaymentToQuickBooks(paymentId) { const payment=await serverContext.Payment.findById(paymentId).populate({path:'tenantId',populate:{path:'unitId'}});if(!payment)throw new Error('Payment not found');await paymentBalances.refreshTenant(payment.tenantId?._id || payment.tenantId);if(Number(payment.amount)<=0)throw new Error('Credits and refunds require a separate QuickBooks workflow');const connection=await (0, serverContext.getQbConnection)(payment.projectId);const externalKey=`BRP-${String(payment._id).slice(-16)}`;const hash=serverContext.crypto.createHash('sha256').update(JSON.stringify({amount:payment.amount,date:payment.date,applyTo:payment.applyTo,tenant:String(payment.tenantId?._id)})).digest('hex');let log=await serverContext.QuickBooksSyncLog.findOne({connectionId:connection._id,externalKey});if(log?.status==='synced'&&log.quickBooksEntityId)return {entityId:log.quickBooksEntityId,duplicate:true};log=await serverContext.QuickBooksSyncLog.findOneAndUpdate({connectionId:connection._id,externalKey},{$set:{projectId:payment.projectId,localEntityType:'Payment',localEntityId:payment._id,operation:'create',quickBooksEntityType:'SalesReceipt',requestHash:hash,status:'syncing',lastError:''},$inc:{attempts:1}},{upsert:true,new:true,setDefaultsOnInsert:true});try{const incomeMappings=connection.mappings?.incomeItems||{},applyTo=payment.applyTo||'rent';const item=incomeMappings[applyTo]||(applyTo==='rent'?incomeMappings.rent:applyTo==='deposit'?incomeMappings.deposit:applyTo==='late'?incomeMappings.late:incomeMappings.other);if(!item?.value)throw new Error(`QuickBooks item mapping is required for ${applyTo}`);const customerId=await (0, serverContext.ensureQbCustomer)(connection,payment.tenantId);const qbRecords=await (0, serverContext.fetchQuickBooksPaymentRecords)(connection);const matchedRecord=(0, serverContext.matchQuickBooksRecordForLocalPayment)(payment,qbRecords);let quickBooksRecord=matchedRecord?.raw||null,quickBooksEntityType=matchedRecord?.sourceType||'SalesReceipt',matchedExisting=!!matchedRecord;if(!quickBooksRecord){const method=connection.mappings?.paymentMethods?.[payment.method];const deposit=connection.mappings?.depositAccounts?.[applyTo]||connection.mappings?.depositAccounts?.default;const result=await (0, serverContext.qbRequest)(connection,'post','salesreceipt',{DocNumber:externalKey,CustomerRef:{value:customerId},TxnDate:new Date(payment.date).toISOString().slice(0,10),PaymentMethodRef:method?.value?method:undefined,DepositToAccountRef:deposit?.value?deposit:undefined,Line:[{Amount:Number(payment.amount),Description:`${applyTo} payment${payment.periodMonth?` - ${payment.periodMonth}`:''}`,DetailType:'SalesItemLineDetail',SalesItemLineDetail:{ItemRef:item}}],PrivateNote:String(payment.note||'')});quickBooksRecord=result.SalesReceipt;}log.status='synced';log.quickBooksEntityId=quickBooksRecord.Id;log.quickBooksEntityType=quickBooksEntityType;log.syncedAt=new Date();log.responseSummary={DocNumber:quickBooksRecord.DocNumber||quickBooksRecord.PaymentRefNum||externalKey,TotalAmt:quickBooksRecord.TotalAmt,Source:quickBooksEntityType};await log.save();payment.quickBooks={connectionId:connection._id,realmId:connection.realmId,entityType:quickBooksEntityType,entityId:quickBooksRecord.Id,docNumber:quickBooksRecord.DocNumber||quickBooksRecord.PaymentRefNum||externalKey,syncStatus:'synced',syncedAt:new Date(),requestHash:hash,lastError:''};payment.markModified('quickBooks');await payment.save();await serverContext.QuickBooksConnection.findByIdAndUpdate(connection._id,{$set:{lastSuccessfulSyncAt:new Date(),lastError:''}});return {entityId:quickBooksRecord.Id,duplicate:matchedExisting,matchedExisting,entityType:quickBooksEntityType};}catch(error){log.status='failed';log.lastError=String(error.response?.data?.Fault?.Error?.[0]?.Message||error.message||'QuickBooks sync failed').slice(0,1000);await log.save();payment.quickBooks={...(payment.quickBooks||{}),connectionId:connection._id,syncStatus:'failed',lastAttemptAt:new Date(),lastError:log.lastError};payment.markModified('quickBooks');await payment.save();throw error;} }

async function syncExpenseToQuickBooks(expenseId,projectId) { const expense=await serverContext.Expense.findOne({_id:expenseId,$or:[{projectId},{'lineItems.projectId':projectId}]});if(!expense)throw new Error('Expense not found for this property');if(!['approved','submitted'].includes(expense.status))throw new Error('Only submitted or approved expenses can sync');const connection=await (0, serverContext.getQbConnection)(projectId),externalKey=`BRE-${String(expense._id).slice(-16)}`;let log=await serverContext.QuickBooksSyncLog.findOne({connectionId:connection._id,externalKey});if(log?.status==='synced')return {entityId:log.quickBooksEntityId,duplicate:true};const matching=(expense.lineItems||[]).filter(line=>String(line.projectId||'')===String(projectId));const amount=matching.length?matching.reduce((sum,line)=>sum+(Number(line.amount)||0),0):(Number(expense.receiptTotal)||Number(expense.amount)||(expense.lineItems||[]).reduce((sum,line)=>sum+(Number(line.amount)||0),0));const account=connection.mappings?.expenseAccounts?.[expense.category]||connection.mappings?.expenseAccounts?.default,paymentAccount=connection.mappings?.defaultExpensePaymentAccount;if(!account?.value)throw new Error('Default QuickBooks expense account mapping is required');if(!paymentAccount?.value)throw new Error('QuickBooks expense payment account mapping is required');log=await serverContext.QuickBooksSyncLog.findOneAndUpdate({connectionId:connection._id,externalKey},{$set:{projectId,localEntityType:'Expense',localEntityId:expense._id,operation:'create',quickBooksEntityType:'Purchase',status:'syncing',lastError:''},$inc:{attempts:1}},{upsert:true,new:true,setDefaultsOnInsert:true});try{const result=await (0, serverContext.qbRequest)(connection,'post','purchase',{DocNumber:externalKey,TxnDate:new Date(expense.date||expense.createdAt).toISOString().slice(0,10),PaymentType:'Cash',AccountRef:paymentAccount,PrivateNote:`Bluerain Expense ${expense._id}; ${expense.description||''}`,Line:[{Amount:amount,Description:expense.description||expense.category||'Property expense',DetailType:'AccountBasedExpenseLineDetail',AccountBasedExpenseLineDetail:{AccountRef:account}}]});const purchase=result.Purchase;if(!purchase?.Id)throw new Error('QuickBooks did not return a Purchase ID');log.status='synced';log.quickBooksEntityId=purchase.Id;log.syncedAt=new Date();await log.save();expense.quickBooks={connectionId:connection._id,realmId:connection.realmId,entityType:'Purchase',entityId:purchase.Id,docNumber:externalKey,syncStatus:'synced',syncedAt:new Date(),lastError:''};expense.markModified('quickBooks');await expense.save();return {entityId:purchase.Id,duplicate:false};}catch(error){log.status='failed';log.lastError=String(error.response?.data?.Fault?.Error?.[0]?.Message||error.message).slice(0,1000);await log.save();throw error;} }

async function resolveWorkspaceQbRecord(connection,sourceType,entityId){if(!['Payment','SalesReceipt'].includes(sourceType)||!entityId)throw new Error('Select a valid QuickBooks transaction');const record=(await (0, serverContext.fetchQuickBooksPaymentRecords)(connection)).find(item=>item.sourceType===sourceType&&String(item.id)===String(entityId));if(!record)throw new Error('QuickBooks transaction not found');return record;}

function get_api_properties_propertyId_quickbooks_connect() {
serverContext.app.get('/api/properties/:propertyId/quickbooks/connect', async (req,res)=>{try{if(!serverContext.QB_CLIENT_ID||!serverContext.QB_CLIENT_SECRET||!serverContext.QB_REDIRECT_URI||!serverContext.QB_TOKEN_ENCRYPTION_CONFIGURED)return res.status(503).json({message:'QuickBooks environment configuration is incomplete'});const property=await serverContext.Project.findById(req.params.propertyId).select('_id');if(!property)return res.status(404).json({message:'Property not found'});const state=(0, serverContext.createQbState)(property._id);const url=`https://appcenter.intuit.com/connect/oauth2?client_id=${encodeURIComponent(serverContext.QB_CLIENT_ID)}&redirect_uri=${encodeURIComponent(serverContext.QB_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(serverContext.QB_SCOPE)}&state=${encodeURIComponent(state)}`;res.json({url});}catch(error){res.status(500).json({message:'Unable to start QuickBooks connection'});}});
}

function get_api_qb_callback() {
serverContext.app.get('/api/qb/callback',async(req,res)=>{try{const state=(0, serverContext.verifyQbState)(req.query.state),code=req.query.code,realmId=String(req.query.realmId||'');if(!code||!realmId)throw new Error('Missing authorization response');const params=new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:serverContext.QB_REDIRECT_URI});const tokenResponse=await serverContext.axios.post('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',params,{headers:{Authorization:'Basic '+Buffer.from(`${serverContext.QB_CLIENT_ID}:${serverContext.QB_CLIENT_SECRET}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'}});const environment=serverContext.QB_ENVIRONMENT==='production'?'production':'sandbox';const temp={environment,realmId,encryptedAccessToken:(0, serverContext.encryptQbSecret)(tokenResponse.data.access_token),accessTokenExpiresAt:new Date(Date.now()+(Number(tokenResponse.data.expires_in)||3600)*1000)};const companyResponse=await serverContext.axios.get(`${(0, serverContext.qbBaseUrl)(temp)}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=75`,{headers:{Authorization:`Bearer ${tokenResponse.data.access_token}`,Accept:'application/json'}});const companyName=companyResponse.data?.CompanyInfo?.CompanyName||'';const existingRealm=await serverContext.QuickBooksConnection.findOne({realmId,projectId:{$ne:state.projectId}});if(existingRealm)return res.status(409).send('This QuickBooks company is already connected to another property.');const update={realmId,companyName,environment,encryptedAccessToken:temp.encryptedAccessToken,encryptedRefreshToken:(0, serverContext.encryptQbSecret)(tokenResponse.data.refresh_token),accessTokenExpiresAt:temp.accessTokenExpiresAt,refreshTokenExpiresAt:new Date(Date.now()+(Number(tokenResponse.data.x_refresh_token_expires_in)||8726400)*1000),scopes:String(tokenResponse.data.scope||serverContext.QB_SCOPE).split(' '),status:'connected',connectedAt:new Date(),lastError:'',disconnectedAt:null};await serverContext.QuickBooksConnection.findOneAndUpdate({projectId:state.projectId},{$set:update,$setOnInsert:{mappings:{},settings:{}}},{upsert:true,new:true,setDefaultsOnInsert:true});res.send(`<script>window.opener&&window.opener.postMessage({type:'quickbooks-connected',projectId:${JSON.stringify(state.projectId)}},window.location.origin);window.close();</script><p>QuickBooks connected to ${String(companyName).replace(/[<>]/g,'')}. You may close this window.</p>`);}catch(error){console.error('QuickBooks OAuth callback failed:',error.response?.data||error.message);res.status(500).send('QuickBooks connection failed. Please close this window and try again.');}});
}

function get_api_properties_propertyId_quickbooks_status() {
serverContext.app.get('/api/properties/:propertyId/quickbooks/status',async(req,res)=>{const connection=await serverContext.QuickBooksConnection.findOne({projectId:req.params.propertyId}).lean();if(!connection)return res.json({connected:false,status:'not-connected'});delete connection.encryptedAccessToken;delete connection.encryptedRefreshToken;res.json({connected:connection.status==='connected',connection});});
}

function delete_api_properties_propertyId_quickbooks_connection() {
serverContext.app.delete('/api/properties/:propertyId/quickbooks/connection',async(req,res)=>{const connection=await serverContext.QuickBooksConnection.findOneAndUpdate({projectId:req.params.propertyId},{$set:{status:'disconnected',disconnectedAt:new Date(),encryptedAccessToken:'disconnected',encryptedRefreshToken:'disconnected'}},{new:true});res.json({success:!!connection});});
}

function get_api_properties_propertyId_quickbooks_catalog() {
serverContext.app.get('/api/properties/:propertyId/quickbooks/catalog',async(req,res)=>{try{const connection=await (0, serverContext.getQbConnection)(req.params.propertyId);const [items,accounts,methods]=await Promise.all([(0, serverContext.qbRequest)(connection,'get',`query?query=${encodeURIComponent("select * from Item where Active = true maxresults 1000")}`),(0, serverContext.qbRequest)(connection,'get',`query?query=${encodeURIComponent("select * from Account where Active = true maxresults 1000")}`),(0, serverContext.qbRequest)(connection,'get',`query?query=${encodeURIComponent("select * from PaymentMethod where Active = true maxresults 1000")}`)]);res.json({items:items.QueryResponse?.Item||[],accounts:accounts.QueryResponse?.Account||[],paymentMethods:methods.QueryResponse?.PaymentMethod||[]});}catch(error){res.status(400).json({message:error.message||'Unable to load QuickBooks catalog'});}});
}

function put_api_properties_propertyId_quickbooks_mappings() {
serverContext.app.put('/api/properties/:propertyId/quickbooks/mappings',async(req,res)=>{const allowed={mappings:req.body.mappings||{},settings:req.body.settings||{}};const connection=await serverContext.QuickBooksConnection.findOneAndUpdate({projectId:req.params.propertyId},{$set:allowed},{new:true,runValidators:true}).lean();if(!connection)return res.status(404).json({message:'QuickBooks connection not found'});delete connection.encryptedAccessToken;delete connection.encryptedRefreshToken;res.json({connection});});
}

function post_api_properties_propertyId_payments_paymentId_sync_quickbooks() {
serverContext.app.post('/api/properties/:propertyId/payments/:paymentId/sync-quickbooks',async(req,res)=>{try{const payment=await serverContext.Payment.findOne({_id:req.params.paymentId,projectId:req.params.propertyId});if(!payment)return res.status(404).json({message:'Payment not found for this property'});res.json({success:true,...await (0, serverContext.syncPaymentToQuickBooks)(payment._id)});}catch(error){res.status(400).json({message:error.message||'QuickBooks sync failed'});}});
}

function post_api_properties_propertyId_expenses_expenseId_sync_quickbooks() {
serverContext.app.post('/api/properties/:propertyId/expenses/:expenseId/sync-quickbooks',async(req,res)=>{try{res.json({success:true,...await (0, serverContext.syncExpenseToQuickBooks)(req.params.expenseId,req.params.propertyId)});}catch(error){res.status(400).json({message:error.message||'QuickBooks expense sync failed'});}});
}

function get_api_properties_propertyId_quickbooks_sync_log() {
serverContext.app.get('/api/properties/:propertyId/quickbooks/sync-log',async(req,res)=>{const logs=await serverContext.QuickBooksSyncLog.find({projectId:req.params.propertyId}).sort({createdAt:-1}).limit(200).lean();res.json({logs});});
}

function get_api_properties_propertyId_quickbooks_payments() {
serverContext.app.get('/api/properties/:propertyId/quickbooks/payments',async(req,res)=>{try{const resolved=await (0, serverContext.autoResolveQuickBooksPaymentsForProperty)(req.params.propertyId);if(!resolved.connection)return res.json({connected:false,payments:[]});res.json({connected:resolved.connection.status==='connected',payments:resolved.qbPayments});}catch(error){res.status(400).json({message:error.message||'Unable to load QuickBooks payments'});}});
}

function get_api_properties_propertyId_quickbooks_payment_workspace() {
serverContext.app.get('/api/properties/:propertyId/quickbooks/payment-workspace',async(req,res)=>{try{
  const existingConnection=await serverContext.QuickBooksConnection.findOne({projectId:req.params.propertyId,status:{$ne:'disconnected'}}).lean();
  if(!existingConnection)return res.json({connected:false,summary:{unmatched:0,conflicts:0,unmappedCustomers:0},unmatched:[],conflicts:[],customers:[],activity:[],mappingHealth:{}});
  const [resolved,logs,customerResponse]=await Promise.all([
    (0, serverContext.autoResolveQuickBooksPaymentsForProperty)(req.params.propertyId),
    serverContext.QuickBooksSyncLog.find({projectId:req.params.propertyId}).sort({updatedAt:-1}).limit(200).lean(),
    (0, serverContext.qbRequest)(await (0, serverContext.getQbConnection)(req.params.propertyId),'get',`query?query=${encodeURIComponent("select * from Customer where Active = true maxresults 1000")}`)
  ]);
  const live=resolved.connection;
  const localPayments=resolved.localPayments;
  const tenants=resolved.tenants;
  const records=resolved.qbPayments;
  const unmatched=records.filter(record=>!record.localPaymentId),failedLogs=logs.filter(log=>['failed','conflict'].includes(log.status));
  const failedPayments=localPayments.filter(payment=>['failed','conflict'].includes(payment.quickBooks?.syncStatus)).map(payment=>({_id:`payment:${payment._id}`,kind:'payment',status:payment.quickBooks.syncStatus,message:payment.quickBooks.lastError||'Payment synchronization failed',localEntityId:payment._id,updatedAt:payment.quickBooks.lastAttemptAt||payment.updatedAt}));
  const key=String(live._id),qbCustomers=customerResponse.QueryResponse?.Customer||[],customers=tenants.map(tenant=>{const link=tenant.quickBooks?.[key]||{};return{tenantId:tenant._id,tenantName:tenant.name,unitNumber:tenant.unitId?.number||'',email:tenant.email||'',customerId:link.customerId||'',customerDisplayName:link.customerDisplayName||'',customers:mappedQbCustomers(link),mapped:!!link.customerId};});
  const mapping=live.mappings||{},mappingHealth={incomeItems:['rent','late','other','deposit'].map(k=>({key:k,label:`${k[0].toUpperCase()+k.slice(1)} item`,mapped:!!mapping.incomeItems?.[k]?.value,name:mapping.incomeItems?.[k]?.name||''})),accounts:[{key:'deposit',label:'Deposit account',mapped:!!mapping.depositAccounts?.default?.value,name:mapping.depositAccounts?.default?.name||''},{key:'expense',label:'Expense account',mapped:!!mapping.expenseAccounts?.default?.value,name:mapping.expenseAccounts?.default?.name||''},{key:'expense-payment',label:'Expense payment account',mapped:!!mapping.defaultExpensePaymentAccount?.value,name:mapping.defaultExpensePaymentAccount?.name||''}]};
  const conflicts=[...failedPayments,...failedLogs.map(log=>({_id:`log:${log._id}`,kind:'sync-log',status:log.status,message:log.lastError||'QuickBooks synchronization failed',localEntityId:log.localEntityId,operation:log.operation,updatedAt:log.updatedAt}))];
  res.json({connected:true,localPayments,companyName:live.companyName||'',summary:{unmatched:unmatched.length,conflicts:conflicts.length,unmappedCustomers:customers.filter(x=>!x.mapped).length},unmatched,conflicts,customers,qbCustomers:qbCustomers.map(c=>({id:c.Id,name:c.DisplayName||c.FullyQualifiedName||c.Name||''})),activity:logs,mappingHealth});
}catch(error){res.status(400).json({message:error.message||'Unable to load the payment workspace'});}});
}

function put_api_properties_propertyId_quickbooks_customer_mapping_tenantId() {
serverContext.app.put('/api/properties/:propertyId/quickbooks/customer-mapping/:tenantId',async(req,res)=>{try{
  const connection=await (0, serverContext.getQbConnection)(req.params.propertyId),tenant=await serverContext.Tenant.findOne({_id:req.params.tenantId,projectId:req.params.propertyId});if(!tenant)return res.status(404).json({message:'Tenant not found'});
  const customerId=String(req.body.customerId||'').trim();
  if (req.body.customerIds !== undefined && !Array.isArray(req.body.customerIds)) return res.status(400).json({message:'customerIds must be an array'});
  const customerIds=[...new Set((req.body.customerIds === undefined ? (customerId ? [customerId] : []) : req.body.customerIds).map(id=>String(id).trim()).filter(Boolean))];
  if (customerIds.length > 50) return res.status(400).json({message:'Select no more than 50 customers per tenant'});
  if ((customerIds.length && !customerIds.includes(customerId)) || (!customerIds.length && customerId)) return res.status(400).json({message:'Select an outgoing default from the mapped customers'});
  const key=String(connection._id);
  tenant.quickBooks=tenant.quickBooks||{};
  if(!customerIds.length) delete tenant.quickBooks[key];
  else {
    const existing=await serverContext.Tenant.findOne({projectId:req.params.propertyId,_id:{$ne:tenant._id},$or:[{[`quickBooks.${key}.customerId`]:{$in:customerIds}},{[`quickBooks.${key}.customers.customerId`]:{$in:customerIds}}]}).select('name').lean();
    if(existing)return res.status(409).json({message:`A selected QuickBooks customer is already mapped to ${existing.name}`});
    const customers=[];
    for (const id of customerIds) {
      const response=await (0, serverContext.qbRequest)(connection,'get',`query?query=${encodeURIComponent(`select * from Customer where Id = '${(0, serverContext.escapeQbQuery)(id)}' maxresults 1`)}`);
      const customer=response.QueryResponse?.Customer?.[0];
      if(!customer)return res.status(404).json({message:'QuickBooks customer not found'});
      customers.push({customerId:String(customer.Id),customerDisplayName:customer.DisplayName||customer.FullyQualifiedName||''});
    }
    const primary=customers.find(c=>c.customerId===customerId);
    tenant.quickBooks[key]={...(tenant.quickBooks[key]||{}),...primary,customers,verifiedAt:new Date(),matchMethod:'manual-payments-workspace'};
  }
  tenant.markModified('quickBooks');await tenant.save();res.json({success:true});
}catch(error){res.status(400).json({message:error.message||'Unable to save customer mapping'});}});
}

function post_api_properties_propertyId_quickbooks_payment_workspace_link() {
serverContext.app.post('/api/properties/:propertyId/quickbooks/payment-workspace/link',async(req,res)=>{try{
  const connection=await (0, serverContext.getQbConnection)(req.params.propertyId),payment=await serverContext.Payment.findOne({_id:req.body.paymentId,projectId:req.params.propertyId});if(!payment)return res.status(404).json({message:'Local payment not found'});if(payment.quickBooks?.entityId)return res.status(409).json({message:'This local payment is already linked'});
  const sourceType=String(req.body.sourceType||''),entityId=String(req.body.entityId||''),duplicate=await serverContext.Payment.findOne({projectId:req.params.propertyId,'quickBooks.entityType':sourceType,'quickBooks.entityId':entityId});if(duplicate)return res.status(409).json({message:'That QuickBooks transaction is already linked'});const record=await (0, serverContext.resolveWorkspaceQbRecord)(connection,sourceType,entityId);if(Math.abs(Number(payment.amount||0)-Number(record.totalAmt||0))>.005)return res.status(409).json({message:'Amounts must match before linking'});
  payment.quickBooks={connectionId:connection._id,realmId:connection.realmId,entityType:sourceType,entityId,docNumber:record.docNumber||'',syncStatus:'synced',syncedAt:new Date(),matchMethod:'manual-payments-workspace',lastError:''};payment.postingStatus='posted';payment.markModified('quickBooks');await payment.save();await paymentBalances.refreshTenant(payment.tenantId);await paymentBalances.recalculate(payment);res.json({success:true,payment});
}catch(error){res.status(error?.code===11000?409:400).json({message:error.message||'Unable to link payment'});}});
}

function post_api_properties_propertyId_quickbooks_payment_workspace_import() {
serverContext.app.post('/api/properties/:propertyId/quickbooks/payment-workspace/import',async(req,res)=>{try{
  const connection=await (0, serverContext.getQbConnection)(req.params.propertyId),tenant=await serverContext.Tenant.findOne({_id:req.body.tenantId,projectId:req.params.propertyId});if(!tenant)return res.status(404).json({message:'Select a tenant before importing'});
  const sourceType=String(req.body.sourceType||''),entityId=String(req.body.entityId||''),duplicate=await serverContext.Payment.findOne({projectId:req.params.propertyId,'quickBooks.entityType':sourceType,'quickBooks.entityId':entityId});if(duplicate)return res.status(409).json({message:'That QuickBooks transaction is already imported'});const record=await (0, serverContext.resolveWorkspaceQbRecord)(connection,sourceType,entityId);
  const payment=await serverContext.Payment.create({projectId:req.params.propertyId,tenantId:tenant._id,unitId:tenant.unitId||undefined,type:(0, serverContext.inferTypeFromQuickBooksPaymentRecord)(record),applyTo:String(req.body.applyTo||(0, serverContext.inferApplyToFromQuickBooksPaymentRecord)(record)||'rent'),amount:Number(record.totalAmt)||0,method:(0, serverContext.inferMethodFromQuickBooksPaymentRecord)(record),date:record.txnDate||new Date(),periodMonth:(0, serverContext.inferPeriodMonthFromQuickBooksPaymentRecord)(record),note:(0, serverContext.buildQuickBooksImportNote)(record),balance:0,source:'quickbooks',postingStatus:'posted',quickBooks:{connectionId:connection._id,realmId:connection.realmId,entityType:sourceType,entityId,docNumber:record.docNumber||'',customerId:record.customerId||'',syncStatus:'synced',syncedAt:new Date(),matchMethod:'manual-import',lastError:''}});
  await paymentBalances.refreshTenant(tenant._id);
  await paymentBalances.recalculate(payment);
  res.status(201).json({success:true,payment});
}catch(error){res.status(error?.code===11000?409:400).json({message:error.message||'Unable to import payment'});}});
}

return {
  encryptQbSecret,
  decryptQbSecret,
  createQbState,
  verifyQbState,
  qbBaseUrl,
  refreshQbConnection,
  getQbConnection,
  qbRequest,
  normalizeQbPaymentDate,
  buildQuickBooksPaymentRecord,
  inferApplyToFromQuickBooksPaymentRecord,
  inferMethodFromQuickBooksPaymentRecord,
  inferTypeFromQuickBooksPaymentRecord,
  inferPeriodMonthFromQuickBooksPaymentRecord,
  matchTenantForQuickBooksPaymentRecord,
  buildQuickBooksImportNote,
  autoResolveQuickBooksPaymentsForProperty,
  buildUnifiedQuickBooksPaymentEntries,
  fetchQuickBooksPaymentRecords,
  matchQuickBooksRecordForLocalPayment,
  attachQuickBooksPaymentMatches,
  get_api_properties_propertyId_quickbooks_connect,
  get_api_qb_callback,
  get_api_properties_propertyId_quickbooks_status,
  delete_api_properties_propertyId_quickbooks_connection,
  get_api_properties_propertyId_quickbooks_catalog,
  put_api_properties_propertyId_quickbooks_mappings,
  ensureQbCustomer,
  scheduleAutomaticQuickBooksPaymentSync,
  syncPaymentToQuickBooks,
  post_api_properties_propertyId_payments_paymentId_sync_quickbooks,
  syncExpenseToQuickBooks,
  post_api_properties_propertyId_expenses_expenseId_sync_quickbooks,
  get_api_properties_propertyId_quickbooks_sync_log,
  get_api_properties_propertyId_quickbooks_payments,
  get_api_properties_propertyId_quickbooks_payment_workspace,
  put_api_properties_propertyId_quickbooks_customer_mapping_tenantId,
  resolveWorkspaceQbRecord,
  post_api_properties_propertyId_quickbooks_payment_workspace_link,
  post_api_properties_propertyId_quickbooks_payment_workspace_import
};
};
