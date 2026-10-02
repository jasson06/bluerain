const {cleanEntry,validateStage,activeEntries}=require('../eviction-cases');
describe('eviction case records',()=>{
  test('requires proof and service details for a served notice',()=>{
    expect(()=>cleanEntry('notice',{title:'Notice',status:'served'})).toThrow(/require/);
    expect(cleanEntry('notice',{title:'Notice',status:'served',documentId:'doc',method:'hand delivery',recipient:'Tenant',server:'Server',occurredAt:'2026-09-30T10:00:00Z',amount:0}).amount).toBe(0);
  });
  test('rejects invalid amounts, dates, kinds, and missing title',()=>{
    expect(()=>cleanEntry('notice',{title:'Notice',status:'draft',amount:-1})).toThrow();
    expect(()=>cleanEntry('court',{title:'Hearing',eventType:'hearing',occurredAt:'invalid'})).toThrow();
    expect(()=>cleanEntry('unknown',{title:'Test'})).toThrow();
    expect(()=>cleanEntry('communication',{})).toThrow();
  });
  test('allows only declared fields',()=>{
    const e=cleanEntry('communication',{title:'Call',notes:'Recorded call',managerId:'attacker',stage:'closed'});
    expect(e.managerId).toBeUndefined();expect(e.stage).toBeUndefined();
  });
  test('expense links require an existing ledger ID',()=>{
    expect(()=>cleanEntry('expense',{title:'Filing',category:'filing',amount:100})).toThrow(/existing expense/);
  });
  test('tasks require assignment and due date',()=>{
    expect(()=>cleanEntry('task',{title:'Follow up',status:'open'})).toThrow();
    expect(cleanEntry('task',{title:'Follow up',status:'open',owner:'Manager',dueAt:'2026-10-01'}).owner).toBe('Manager');
  });
});
describe('case progression',()=>{
  const base=()=>({stage:'review',entries:[]});
  test('court requires recorded service',()=>{
    expect(()=>validateStage(base(),'court')).toThrow(/service/);
    expect(()=>validateStage({entries:[{kind:'notice',status:'served'}]},'court')).not.toThrow();
  });
  test('superseded service does not satisfy court gate',()=>{
    expect(()=>validateStage({entries:[{_id:'1',kind:'notice',status:'served'},{kind:'correction',supersedes:'1'}]},'court')).toThrow();
  });
  test('judgment requires signed document',()=>{
    expect(()=>validateStage({entries:[{kind:'court',eventType:'judgment'}]},'judgment')).toThrow();
    expect(()=>validateStage({entries:[{kind:'court',eventType:'judgment',documentId:'file'}]},'judgment')).not.toThrow();
  });
  test('possession needs actual possession evidence',()=>{
    expect(()=>validateStage({entries:[{kind:'court',eventType:'judgment',documentId:'file'}]},'possession')).toThrow();
    expect(()=>validateStage({entries:[{kind:'closeout',eventType:'voluntary-surrender',documentId:'file',occurredAt:'2026-10-01'}]},'possession')).not.toThrow();
  });
  test('hold prevents stage advancement',()=>expect(()=>validateStage(base(),'notices',{hold:'on-hold'})).toThrow(/hold/));
  test('closure requires explicit resolution',()=>{
    expect(()=>validateStage(base(),'closed')).toThrow();
    expect(()=>validateStage(base(),'closed',{closureReason:'Resolved',closureNotes:'Paid in full; no possession change.'})).not.toThrow();
  });
  test('task completion preserves history while superseding open task',()=>{
    const c={entries:[{_id:'a',kind:'task',status:'open'},{_id:'b',kind:'task',status:'completed',supersedes:'a'}]};
    expect(activeEntries(c)).toHaveLength(1);expect(c.entries).toHaveLength(2);
  });
});
