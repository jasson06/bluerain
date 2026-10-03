// Expand a received payment into invoice allocations without changing its date.
module.exports = function invoicePeriods(context) {
  async function expand(records, connection) {
    const cache = new Map();
    const readInvoice = async id => {
      if (!cache.has(id)) cache.set(id, context.qbRequest(connection, 'get', `invoice/${encodeURIComponent(id)}`).then(r => r.Invoice));
      return cache.get(id);
    };
    // Cache is request-scoped: no stale invoice dates survive a refresh.
    const ids=[...new Set(records.filter(r=>r.sourceType==='Payment').flatMap(r=>(r.raw?.Line||[]).flatMap(l=>(l.LinkedTxn||[]).filter(x=>x.TxnType==='Invoice'&&x.TxnId).map(x=>String(x.TxnId)))))];
    let cursor=0;
    await Promise.all(Array.from({length:Math.min(4,ids.length)},async()=>{
      while(cursor<ids.length){const id=ids[cursor++];try{await readInvoice(id);}catch(_){/* expand supplies the review message */}}
    }));
    const result = [];
    for (const record of records) {
      if (record.sourceType !== 'Payment') { result.push(record); continue; }
      const allocations = new Map();
      let error = '';
      for (const line of record.raw?.Line || []) {
        const amount = Math.round(Number(line.Amount || 0) * 100);
        if (!amount) continue;
        const links = line.LinkedTxn || [];
        if (amount < 0 || links.length !== 1 || links[0].TxnType !== 'Invoice' || !links[0].TxnId) {
          error = 'Payment contains credits or ambiguous invoice allocations. Review in QuickBooks.'; break;
        }
        const id = String(links[0].TxnId);
        allocations.set(id, (allocations.get(id) || 0) + amount);
      }
      if (!error && (!allocations.size || [...allocations.values()].reduce((a,b)=>a+b,0) !== Math.round(record.totalAmt*100))) {
        error = 'Invoice allocations do not equal the payment total. Apply the remaining amount to invoices in QuickBooks.';
      }
      const parts = [];
      if (!error) for (const [id, cents] of [...allocations].sort(([a],[b])=>a.localeCompare(b))) {
        let invoice;
        try { invoice = await readInvoice(id); } catch (_) { error = `Unable to read invoice ${id}. Retry after checking QuickBooks access.`; break; }
        const date = String(invoice?.TxnDate || '');
        if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) { error = `Invoice ${id} has no valid invoice date.`; break; }
        if (String(invoice?.CustomerRef?.value || '') !== String(record.customerId)) { error = `Invoice ${id} belongs to a different customer. Review this payment.`; break; }
        parts.push({...record, id: parts.length ? `${record.id}:invoice:${id}` : record.id,
          parentPaymentId: record.id, invoiceId: id, invoiceDate: date,
          invoiceNumber: String(invoice.DocNumber || id), periodMonth: date.slice(0,7),
          totalAmt: cents/100, parentPaymentTotal: record.totalAmt});
      }
      result.push(...(error ? [{...record, periodError: error}] : parts));
    }
    return result;
  }
  function metadata(record) {
    return record.invoiceId ? {parentPaymentId:record.parentPaymentId,invoiceId:record.invoiceId,invoiceDate:record.invoiceDate,invoiceNumber:record.invoiceNumber,parentPaymentTotal:record.parentPaymentTotal,periodSource:'invoice-date',paymentCreatedAt:record.raw?.MetaData?.CreateTime || ''} : {};
  }
  return {expand, metadata};
};
