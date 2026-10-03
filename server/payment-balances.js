// Shared with the manual payment Update action; preserves its charge rules.
module.exports = function paymentBalances(serverContext) {
  async function recalculate(payment, lateFee) {
    // Recalculate balance for rent payments only
    if (payment.applyTo === 'rent') {
      const paymentDate = new Date(payment.date);
      const monthStart = new Date(paymentDate.getFullYear(), paymentDate.getMonth(), 1);
      const monthEnd = new Date(paymentDate.getFullYear(), paymentDate.getMonth() + 1, 0, 23, 59, 59, 999);
      const tenantData = await serverContext.Tenant.findById(payment.tenantId);
  let expectedAmount = 0;
    let calculatedLateFee = 0;
    let overrideLateApplied = false;
  if (payment.type === 'rent') {
        // Recompute with proration for first month; otherwise full monthly charges
        expectedAmount = (0, serverContext.computeExpectedRentForMonth)(tenantData, payment.date, 'rent');
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
        expectedAmount = Number(tenantData.hubContribution) || 0;
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
      const paymentsThisMonth = await serverContext.Payment.find({
        tenantId: payment.tenantId,
        applyTo: 'rent',
        date: { $gte: monthStart, $lte: monthEnd },
        _id: { $ne: payment._id }
      });
  const totalPaid = paymentsThisMonth.reduce((sum, p) => sum + Math.abs(p.amount || 0), 0);
      const totalLateFees = paymentsThisMonth.reduce((sum, p) => sum + (p.lateFee || 0), 0);
      const totalMonthlyCharges = overrideLateApplied ? expectedAmount : (expectedAmount + totalLateFees + calculatedLateFee);
      if (overrideLateApplied) {
        payment.lateFee = 0; // clear per-payment late fee when override controls month late fee
      }
  const balance = totalMonthlyCharges - (totalPaid + Math.abs(payment.amount));
  payment.balance = balance; // allow negative credit
    } else if (payment.applyTo === 'deposit') {
      // Set balance to remaining deposit
      const tenantData = await serverContext.Tenant.findById(payment.tenantId);
      const expectedDeposit = Number(tenantData.deposit) || 0;
      // Sum all deposit payments excluding this one (we already updated amount above)
      const otherDepositPayments = await serverContext.Payment.find({ tenantId: payment.tenantId, applyTo: 'deposit', _id: { $ne: payment._id } });
      const totalOther = otherDepositPayments.reduce((s, p) => s + (p.amount || 0), 0);
      const depositBalance = expectedDeposit - (totalOther + payment.amount);
  payment.balance = depositBalance; // can be negative if overpaid deposit
    } else {
      // Fee entries have no running balance
      payment.balance = 0;
    }

    return payment;
  }

  async function refreshTenant(tenantId) {
    const payments = await serverContext.Payment.find({tenantId});
    for (const payment of payments) {
      const previousBalance = payment.balance;
      const previousLateFee = payment.lateFee;
      await recalculate(payment);
      const changes = {};
      if (payment.balance !== previousBalance) changes.balance = payment.balance;
      if (payment.lateFee !== previousLateFee) changes.lateFee = payment.lateFee;
      if (Object.keys(changes).length) {
        await serverContext.Payment.updateOne({_id: payment._id}, {$set: changes});
      }
    }
  }
  return {recalculate, refreshTenant};
};
