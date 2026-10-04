// Shared with the manual payment Update action; preserves its charge rules.
module.exports = function paymentBalances(serverContext) {
  const tenantLifecycle = require('./tenant-lifecycle');
  function comparePayments(a,b) {
    const time = v => { const n = new Date(v || 0).getTime(); return Number.isFinite(n) ? n : 0; };
    return time(a.date)-time(b.date)
      || time(a.quickBooks?.paymentCreatedAt || a.createdAt)-time(b.quickBooks?.paymentCreatedAt || b.createdAt)
      || String(a.quickBooks?.parentPaymentId || a.quickBooks?.entityId || a._id || '').localeCompare(String(b.quickBooks?.parentPaymentId || b.quickBooks?.entityId || b._id || ''),undefined,{numeric:true})
      || String(a._id||'').localeCompare(String(b._id||''));
  }
  async function recalculate(payment, lateFee, loaded) {
    // Recalculate balance for rent payments only
    if (payment.applyTo === 'rent') {
      const periodMatch = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(payment.periodMonth || '');
      const paymentDate = periodMatch ? new Date(Number(periodMatch[1]),Number(periodMatch[2])-1,1,12) : new Date(payment.date);
      const monthStart = new Date(paymentDate.getFullYear(), paymentDate.getMonth(), 1);
      const monthEnd = new Date(paymentDate.getFullYear(), paymentDate.getMonth() + 1, 0, 23, 59, 59, 999);
      const tenantData = (loaded ? loaded.tenant : await serverContext.Tenant.findById(payment.tenantId));
  let expectedAmount = 0;
    let calculatedLateFee = 0;
    let overrideLateApplied = false;
  if (payment.type === 'rent') {
        // Recompute with proration for first month; otherwise full monthly charges
        expectedAmount = (0, serverContext.computeExpectedRentForMonth)(tenantData, paymentDate, 'rent');
        // Monthly late fee override takes precedence; else allow manual payment lateFee, else 0
        const period = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth()+1).padStart(2,'0')}`;
        const mo = tenantData?.monthlyOverrides;
        const ov = mo ? (typeof mo.get === 'function' ? mo.get(period) : mo[period]) : null;
        if (ov && (ov.lateFee != null)) {
          const mode = String(ov.lateFeeMode || 'amount').toLowerCase();
          const lfVal = Number(ov.lateFee);
          const overrideMonthlyLate = (mode === 'percent' && Number.isFinite(lfVal)) ? (expectedAmount * (lfVal/100)) : (Number.isFinite(lfVal) ? lfVal : 0);
          expectedAmount += overrideMonthlyLate; // roll into expected
          calculatedLateFee = 0;
          overrideLateApplied = true;
        } else if (lateFee !== undefined) {
          calculatedLateFee = Number(lateFee) || 0;
        } else if (payment.lateFee && payment.lateFee > 0) {
          calculatedLateFee = payment.lateFee;
        }
      } else if (payment.type === 'hub') {
        expectedAmount = tenantLifecycle.isChargeableMonth(tenantData, paymentDate) ? Number(tenantData.hubContribution) || 0 : 0;
        // Late fee override for month still applies to hub-type rent months; roll into expected
        const period = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth()+1).padStart(2,'0')}`;
        const mo = tenantData?.monthlyOverrides;
        const ov = mo ? (typeof mo.get === 'function' ? mo.get(period) : mo[period]) : null;
        if (ov && (ov.lateFee != null)) {
          const mode = String(ov.lateFeeMode || 'amount').toLowerCase();
          const lfVal = Number(ov.lateFee);
          const overrideMonthlyLate = (mode === 'percent' && Number.isFinite(lfVal)) ? (expectedAmount * (lfVal/100)) : (Number.isFinite(lfVal) ? lfVal : 0);
          expectedAmount += overrideMonthlyLate; // roll into expected
          calculatedLateFee = 0;
          overrideLateApplied = true;
        } else if (lateFee !== undefined) {
          calculatedLateFee = Number(lateFee) || 0;
        } else if (payment.lateFee && payment.lateFee > 0) {
          calculatedLateFee = payment.lateFee;
        }
      }
      if (!tenantLifecycle.isChargeableMonth(tenantData,paymentDate)) {
        expectedAmount = 0;
        calculatedLateFee = 0;
        overrideLateApplied = true;
      }
      const period = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth()+1).padStart(2,'0')}`;
      const tenantPayments = loaded ? loaded.payments.filter(p=>p.applyTo==='rent' && String(p._id)!==String(payment._id)) : await serverContext.Payment.find({
        tenantId: payment.tenantId,
        applyTo: 'rent',
        _id: { $ne: payment._id }
      });
      const paymentsThisMonth = tenantPayments.filter(p => p.periodMonth ? p.periodMonth === period : new Date(p.date) >= monthStart && new Date(p.date) <= monthEnd);
  const totalPaid = paymentsThisMonth.filter(p => comparePayments(p,payment) < 0).reduce((sum, p) => sum + Math.abs(p.amount || 0), 0);
      const totalLateFees = paymentsThisMonth.reduce((sum, p) => sum + (p.lateFee || 0), 0);
      const totalMonthlyCharges = overrideLateApplied ? expectedAmount : (expectedAmount + totalLateFees + calculatedLateFee);
      if (overrideLateApplied) {
        payment.lateFee = 0; // clear per-payment late fee when override controls month late fee
      }
  const balance = totalMonthlyCharges - (totalPaid + Math.abs(payment.amount));
  payment.balance = balance; // allow negative credit
    } else if (payment.applyTo === 'deposit') {
      // Set balance to remaining deposit
      const tenantData = (loaded ? loaded.tenant : await serverContext.Tenant.findById(payment.tenantId));
      const expectedDeposit = Number(tenantData.deposit) || 0;
      // Sum all deposit payments excluding this one (we already updated amount above)
      const otherDepositPayments = loaded ? loaded.payments.filter(p=>p.applyTo==='deposit' && String(p._id)!==String(payment._id)) : await serverContext.Payment.find({ tenantId: payment.tenantId, applyTo: 'deposit', _id: { $ne: payment._id } });
      const totalOther = otherDepositPayments.filter(p => comparePayments(p,payment) < 0).reduce((s, p) => s + (p.amount || 0), 0);
      const depositBalance = expectedDeposit - (totalOther + payment.amount);
  payment.balance = depositBalance; // can be negative if overpaid deposit
    } else {
      // Fee entries have no running balance
      payment.balance = 0;
    }

    return payment;
  }

  async function refreshTenant(tenantId, session) {
    const paymentsQuery = serverContext.Payment.find({tenantId}), tenantQuery = serverContext.Tenant.findById(tenantId);
    const [payments,tenant] = await Promise.all([session ? paymentsQuery.session(session) : paymentsQuery, session ? tenantQuery.session(session) : tenantQuery]);
    const writes = [];
    for (const payment of payments) {
      const previousBalance = payment.balance;
      const previousLateFee = payment.lateFee;
      await recalculate(payment, undefined, {payments,tenant});
      const changes = {};
      if (payment.balance !== previousBalance) changes.balance = payment.balance;
      if (payment.lateFee !== previousLateFee) changes.lateFee = payment.lateFee;
      if (Object.keys(changes).length) {
        writes.push({updateOne:{filter:{_id:payment._id},update:{$set:changes}}});
      }
    }
    if(writes.length) {
      if(serverContext.Payment.bulkWrite) await serverContext.Payment.bulkWrite(writes,{ordered:true,...(session ? {session} : {})});
      else for(const entry of writes) await serverContext.Payment.updateOne(entry.updateOne.filter,entry.updateOne.update,session ? {session} : {});
    }
  }
  return {recalculate, refreshTenant, comparePayments};
};
