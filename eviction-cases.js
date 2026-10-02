'use strict';
const STAGES = ['review','notices','resolution','court','judgment','possession','closed'];
const FIELDS = {
  notice:['title','noticeType','status','occurredAt','dueAt','method','recipient','server','amount','notes','documentId'],
  communication:['title','channel','recipient','occurredAt','notes','documentId'],
  task:['title','owner','dueAt','status','notes'],
  court:['title','eventType','occurredAt','dueAt','location','caseNumber','court','attendees','outcome','notes','documentId'],
  expense:['title','occurredAt','category','vendor','amount','status','expenseId','notes','documentId'],
  closeout:['title','eventType','occurredAt','amount','notes','documentId'],
  correction:['title','supersedes','notes']
};
function cleanEntry(kind, input) {
  if(!FIELDS[kind]) throw Error('Invalid record type.');
  const result={kind};
  for(const key of [...FIELDS[kind],'supersedes']) {
    const value=input[key]; if(value===undefined||value===null||value==='')continue;
    if(key==='amount'){const n=Number(value);if(!Number.isFinite(n)||n<0)throw Error('Amount must be zero or positive.');result[key]=n;}
    else if(['occurredAt','dueAt'].includes(key)){const date=new Date(value);if(!Number.isFinite(date.getTime()))throw Error('Invalid date.');result[key]=date.toISOString();}
    else {if(typeof value!=='string'||value.length>(key==='notes'?10000:500))throw Error('Invalid '+key);result[key]=value.trim();}
  }
  if(!result.title)throw Error('Title is required.');
  if(kind==='notice'&&!['draft','approved','sent','served','failed','withdrawn'].includes(result.status))throw Error('Select notice status.');
  if(kind==='notice'&&result.status==='served'&&(!result.documentId||!result.method||!result.recipient||!result.server||!result.occurredAt))throw Error('Served notices require a document, method, recipient, server and service date.');
  if(kind==='task'&&(!result.owner||!result.dueAt||!['open','completed'].includes(result.status)))throw Error('Tasks require an owner, due date and status.');
  if(kind==='court'&&(!result.eventType||!result.occurredAt))throw Error('Court records require an event type and date.');
  if(kind==='expense'&&(!result.expenseId||!result.category))throw Error('Choose an existing expense and category.');
  if(kind==='correction'&&(!result.supersedes||!result.notes))throw Error('Corrections require a record ID and explanation.');
  return result;
}
function activeEntries(c){const removed=new Set(c.entries.filter(e=>e.supersedes).map(e=>e.supersedes));return c.entries.filter(e=>!removed.has(String(e._id)));}
function validateStage(c, stage, fields={}) {
  if(!STAGES.includes(stage))throw Error('Invalid case stage.');
  const entries=activeEntries(c);
  if(stage==='court'&&!entries.some(e=>e.kind==='notice'&&e.status==='served'))throw Error('Record service of the approved notice before court stage.');
  if(stage==='judgment'&&!entries.some(e=>e.kind==='court'&&e.eventType==='judgment'&&e.documentId))throw Error('Upload and record the signed judgment first.');
  if(stage==='possession'&&!entries.some(e=>e.kind==='closeout'&&['voluntary-surrender','authorized-enforcement'].includes(e.eventType)&&e.occurredAt&&e.documentId))throw Error('Record possession evidence first.');
  if(stage==='closed'&&(!fields.closureReason||!fields.closureNotes))throw Error('Closure requires a reason and final accounting/resolution notes.');
  if(fields.hold==='on-hold'&&stage!==c.stage)throw Error('Resolve the hold before changing stage.');
}
module.exports=function installEvictionCases({app,mongoose,Tenant,Project,Expense,Manager,authenticateManagerProfile,multer}){
  const schema=new mongoose.Schema({
    managerId:{type:mongoose.Schema.Types.ObjectId,default:null,index:true},tenantId:{type:mongoose.Schema.Types.ObjectId,required:true,index:true},projectId:{type:mongoose.Schema.Types.ObjectId,required:true,index:true},
    snapshot:mongoose.Schema.Types.Mixed,stage:{type:String,enum:STAGES,default:'review'},active:{type:Boolean,default:true},revision:{type:Number,default:0},
    reason:String,owner:String,attorney:String,county:String,precinct:String,leaseNoticeClause:String,priorDelinquency:String,nextAction:String,dueAt:Date,
    hold:{type:String,default:'active'},holdReason:String,closureReason:String,closureNotes:String,
    entries:{type:[mongoose.Schema.Types.Mixed],default:[]},audit:{type:[mongoose.Schema.Types.Mixed],default:[]}
  },{timestamps:true});
  schema.index({managerId:1,tenantId:1},{unique:true,partialFilterExpression:{active:true}});
  const Case=mongoose.model('EvictionCase',schema);
  const File=mongoose.model('EvictionCaseFile',new mongoose.Schema({caseId:{type:mongoose.Schema.Types.ObjectId,index:true},managerId:mongoose.Schema.Types.ObjectId,name:String,mime:String,data:{type:Buffer,select:false},size:Number},{timestamps:true}));
  // Shared workspace: case access follows the existing property API (no separate manager sign-in).
  const auth=[(req,res,next)=>{req.caseActor={name:'Property workspace',identityVerified:false};next();}];
  const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e.code===11000?409:e.status||400).json({error:e.code===11000?'An active case already exists for this tenant.':e.message});}};
  const find=async req=>{if(!mongoose.isValidObjectId(req.params.id))throw Error('Invalid case ID.');const c=await Case.findOne({_id:req.params.id}).lean();if(!c){const e=Error('Case not found.');e.status=404;throw e;}return c;};
  const audit=(req,action,details)=>({_id:new mongoose.Types.ObjectId(),at:new Date(),actor:req.caseActor,action,details});
  const commit=async(req,res,c,set,entry,action)=>{
    if(Number(req.body.revision)!==c.revision)return res.status(409).json({error:'Case changed. Reload before saving.'});
    const update={$set:set,$inc:{revision:1},$push:{audit:audit(req,action,set)}};
    if(entry)update.$push.entries={...entry,_id:new mongoose.Types.ObjectId(),recordedAt:new Date(),actor:req.caseActor};
    const updated=await Case.findOneAndUpdate({_id:c._id,revision:c.revision},update,{new:true,runValidators:true});
    if(!updated)return res.status(409).json({error:'Case changed. Reload before saving.'});res.json(updated);
  };
  app.get('/api/eviction-cases',...auth,wrap(async(req,res)=>{
    const query={};if(req.query.tenantId){if(!mongoose.isValidObjectId(req.query.tenantId))throw Error('Invalid tenant.');query.tenantId=req.query.tenantId;}
    res.json(await Case.find(query).select('-entries -audit').sort({updatedAt:-1}).lean());
  }));
  app.post('/api/eviction-cases',...auth,wrap(async(req,res)=>{
    if(!mongoose.isValidObjectId(req.body.tenantId))throw Error('Select a tenant.');
    const tenant=await Tenant.findById(req.body.tenantId).lean();if(!tenant)throw Error('Tenant not found.');
    if(tenant.leaseType!=='fmr'||req.body.privateMarketConfirmed!==true)throw Error('Only confirmed private-market tenants are supported. Section 8 and unknown programs require a separate workflow.');
    const property=await Project.findById(tenant.projectId).lean();if(!property)throw Error('Property not found.');
    if(!['TX','TEXAS'].includes(String(property.address?.state||'').toUpperCase()))throw Error('This workflow is configured for Texas properties only.');
    const text=key=>String(req.body[key]||'').trim().slice(0,2000);
    if(!text('reason')||!text('owner')||!text('county')||!text('precinct'))throw Error('Reason, owner, county and precinct are required.');
    await Case.init();
    if(await Case.findOne({tenantId:tenant._id,active:true}).lean()){const e=Error('An active case already exists for this tenant.');e.status=409;throw e;}
    res.status(201).json(await Case.create({managerId:null,tenantId:tenant._id,projectId:tenant.projectId,reason:text('reason'),owner:text('owner'),county:text('county'),precinct:text('precinct'),
      snapshot:{tenantName:tenant.name,propertyName:property.name,address:property.address,unitId:tenant.unitId,leaseStart:tenant.leaseStart,leaseEnd:tenant.leaseEnd,leaseType:tenant.leaseType,baseRent:tenant.baseRent,createdAt:new Date()},
      audit:[audit(req,'Case opened',{reason:text('reason')})]}));
  }));
  app.get('/api/eviction-cases/:id',...auth,wrap(async(req,res)=>res.json(await find(req))));
  app.patch('/api/eviction-cases/:id',...auth,wrap(async(req,res)=>{
    const c=await find(req),set={};
    for(const key of ['owner','attorney','county','precinct','leaseNoticeClause','priorDelinquency','nextAction','holdReason','closureReason','closureNotes'])if(req.body[key]!==undefined){if(typeof req.body[key]!=='string'||req.body[key].length>5000)throw Error('Invalid '+key);set[key]=req.body[key].trim();}
    if(req.body.dueAt!==undefined){set.dueAt=req.body.dueAt?new Date(req.body.dueAt):null;if(set.dueAt&&!Number.isFinite(set.dueAt.getTime()))throw Error('Invalid due date.');}
    if(req.body.hold!==undefined){if(!['active','on-hold','payment-agreement'].includes(req.body.hold))throw Error('Invalid hold status.');set.hold=req.body.hold;}
    if((set.hold||c.hold)==='on-hold'&&!(set.holdReason||c.holdReason))throw Error('Hold reason required.');
    if(req.body.stage!==undefined&&req.body.stage!=='closed'&&!c.active&&await Case.findOne({tenantId:c.tenantId,active:true,_id:{$ne:c._id}}).lean()){const e=Error('Another active case exists for this tenant.');e.status=409;throw e;}
    if(req.body.stage!==undefined){validateStage(c,req.body.stage,{...c,...set});set.stage=req.body.stage;set.active=req.body.stage!=='closed';}
    await commit(req,res,c,set,null,'Case updated');
  }));
  app.post('/api/eviction-cases/:id/entries',...auth,wrap(async(req,res)=>{
    const c=await find(req);if(!c.active)throw Error('Reopen the case before adding records.');const entry=cleanEntry(req.body.kind,req.body);
    if(entry.documentId&&(!mongoose.isValidObjectId(entry.documentId)||!await File.exists({_id:entry.documentId,caseId:c._id})))throw Error('Choose a document from this case.');
    if(entry.supersedes&&!activeEntries(c).some(e=>String(e._id)===entry.supersedes&&e.kind!=='correction'&&(entry.kind==='correction'||e.kind===entry.kind)))throw Error('Original active record not found.');
    if(entry.kind==='expense'){
      if(!mongoose.isValidObjectId(entry.expenseId))throw Error('Invalid expense.');
      const expense=await Expense.findOne({_id:entry.expenseId,$or:[{projectId:c.projectId},{'lineItems.projectId':c.projectId}]}).lean();if(!expense)throw Error('Expense does not belong to this property.');
      if(activeEntries(c).some(e=>e.kind==='expense'&&e.expenseId===entry.expenseId))throw Error('Expense already linked.');
      const lines=(expense.lineItems||[]).filter(l=>String(l.projectId)===String(c.projectId));
      entry.amount=lines.length?lines.reduce((s,l)=>s+(Number(l.amount)||0),0):Number(expense.receiptTotal??expense.amount??0);entry.occurredAt=expense.date||expense.createdAt;entry.status=expense.status;entry.title=expense.description||entry.title;entry.vendor=expense.vendor;
    }
    await commit(req,res,c,{},entry,'Added '+entry.kind);
  }));
  app.post('/api/eviction-cases/:id/expenses',...auth,wrap(async(req,res)=>{
    const c=await find(req);if(!c.active)throw Error('Reopen the case before adding an expense.');
    const {creationId,documentId}=req.body;
    if(!/^[a-f0-9]{24}$/.test(String(creationId||'')))throw Error('Invalid expense request. Reload the form.');
    // The client keeps this ID across retries; a repeated request cannot create a second ledger entry.
    if(activeEntries(c).some(e=>e.kind==='expense'&&e.expenseId===creationId))return res.json(c);
    if(Number(req.body.revision)!==c.revision)return res.status(409).json({error:'Case changed. Refresh the case before adding this expense.'});
    const title=String(req.body.title||'').trim(),vendor=String(req.body.vendor||'').trim(),category=String(req.body.category||'').trim();
    const amount=Number(req.body.amount),date=new Date(req.body.occurredAt);
    if(!title||title.length>500||!vendor||vendor.length>500||!['filing','service','attorney','mediation','enforcement','storage','turnover','other'].includes(category))throw Error('Description, vendor and category are required.');
    if(!req.body.occurredAt||req.body.amount==='' ||req.body.amount==null||!Number.isFinite(amount)||amount<0||!Number.isFinite(date.getTime()))throw Error('Enter a valid date and amount.');
    if(documentId&&(!mongoose.isValidObjectId(documentId)||!await File.exists({_id:documentId,caseId:c._id})))throw Error('Choose a receipt from this case.');
    const expense=await Expense.findOneAndUpdate({_id:creationId,projectId:c.projectId,source:'eviction-case',ref:String(c._id)},{$setOnInsert:{
      projectId:c.projectId,source:'eviction-case',ref:String(c._id),date:date.toISOString(),vendor,category:'Legal / eviction — '+category,description:title,
      amount,receiptTotal:amount,status:'pending_review',lineItems:[{projectId:c.projectId,name:title,description:title,costCode:'Legal / eviction',amount}]
    }},{new:true,upsert:true,runValidators:true});
    const entry=cleanEntry('expense',{title:expense.description,category,expenseId:creationId,documentId,notes:req.body.notes||'',vendor:expense.vendor,amount:expense.receiptTotal,occurredAt:expense.date,status:expense.status});
    await commit(req,res,c,{},entry,'Expense created and linked');
  }));

  app.get('/api/eviction-cases/:id/expenses',...auth,wrap(async(req,res)=>{const c=await find(req);res.json(await Expense.find({$or:[{projectId:c.projectId},{'lineItems.projectId':c.projectId}]}).select('description vendor date createdAt category status amount receiptTotal lineItems').sort({createdAt:-1}).lean());}));
  app.post('/api/eviction-cases/:id/tasks/:entryId/complete',...auth,wrap(async(req,res)=>{
    const c=await find(req);if(!c.active)throw Error('Reopen the case first.');
    const original=activeEntries(c).find(e=>String(e._id)===req.params.entryId&&e.kind==='task'&&e.status==='open');
    if(!original)throw Error('Open task not found.');
    const entry=cleanEntry('task',{...original,status:'completed'});entry.supersedes=String(original._id);
    await commit(req,res,c,{},entry,'Task completed');
  }));
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024},fileFilter:(req,file,cb)=>cb(null,['application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.mimetype))}).single('file');
  app.get('/api/eviction-cases/:id/files',...auth,wrap(async(req,res)=>{const c=await find(req);res.json(await File.find({caseId:c._id}).select('-data').lean());}));
  app.post('/api/eviction-cases/:id/files',...auth,(req,res)=>upload(req,res,async err=>{
    if(err)return res.status(400).json({error:err.message});
    return wrap(async(req,res)=>{const c=await find(req);if(!c.active)throw Error('Reopen the case before uploading.');if(!req.file)throw Error('Choose PDF, PNG, JPEG or DOCX, up to 5 MB.');
      const f=await File.create({caseId:c._id,name:req.file.originalname.slice(0,200),mime:req.file.mimetype,size:req.file.size,data:req.file.buffer});
      await Case.updateOne({_id:c._id},{$push:{audit:audit(req,'Document uploaded',{id:f._id,name:f.name})},$inc:{revision:1}});res.status(201).json({id:f._id,name:f.name});
    })(req,res);
  }));
  app.get('/api/eviction-cases/:id/files/:fileId',...auth,wrap(async(req,res)=>{const c=await find(req);if(!mongoose.isValidObjectId(req.params.fileId))throw Error('Invalid file.');const f=await File.findOne({_id:req.params.fileId,caseId:c._id}).select('+data');if(!f)throw Error('Document not found.');res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');res.attachment(f.name);res.type(f.mime);res.send(f.data);}));
};
module.exports.cleanEntry=cleanEntry;module.exports.validateStage=validateStage;module.exports.activeEntries=activeEntries;
