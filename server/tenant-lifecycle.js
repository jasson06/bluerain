function leaseEndForCharges(tenant) {
  const dates = [tenant?.leaseEnd, tenant?.termination?.effectiveDate].filter(Boolean).map(value => new Date(value));
  return dates.length ? new Date(Math.min(...dates.map(date => date.getTime()))) : null;
}

function isFormerTenant(tenant) {
  return ['terminated', 'expired'].includes(tenant?.leaseStatus);
}

function isChargeableMonth(tenant, dateLike) {
  const date = new Date(dateLike);
  const start = tenant?.leaseStart ? new Date(tenant.leaseStart) : null;
  const end = leaseEndForCharges(tenant);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid rent period');
  if (isFormerTenant(tenant) && !end) return false;
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return (!start || start < nextMonth) && (!end || end >= monthStart);
}

function paymentPeriod(payment) {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(payment.periodMonth || '')) return payment.periodMonth;
  const date = new Date(payment.date);
  if (Number.isNaN(date.getTime())) throw new Error('Payment has an invalid date');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function tenantMonthTotals(tenant, date, payments, computeExpected) {
  const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const rows = payments.filter(payment => String(payment.tenantId?._id || payment.tenantId) === String(tenant._id)
    && (payment.applyTo || 'rent') === 'rent' && paymentPeriod(payment) === period);
  const paid = rows.reduce((sum, payment) => sum + Math.max(0, Number(payment.amount) || 0)
    + Math.max(0, Number(payment.appliedCredit) || 0), 0);
  let expected = 0;
  if (isChargeableMonth(tenant, date)) {
    expected = computeExpected(tenant, date, 'rent');
    const overrides = tenant.monthlyOverrides;
    const override = overrides && (typeof overrides.get === 'function' ? overrides.get(period) : overrides[period]);
    const lateFee = override?.lateFee;
    expected += lateFee != null ? (override.lateFeeMode === 'percent' ? expected * Number(lateFee) / 100 : Number(lateFee))
      : rows.reduce((sum, payment) => sum + Math.max(0, Number(payment.lateFee) || 0), 0);
  }
  return {expected, paid: Math.min(expected, paid), outstanding: Math.max(0, expected - paid)};
}

function reviewedTermination(tenant, input, now = new Date()) {
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const effectiveDate = new Date(input?.effectiveDate);
  const reason = String(input?.reason || '').trim();
  const finalRent = input?.finalRent;
  if (!tenant.leaseStart) throw new Error('Record the lease start date before reviewing termination');
  if (!input?.effectiveDate || Number.isNaN(effectiveDate.getTime()) || effectiveDate >= endOfToday) throw new Error('Choose a valid termination date that is not in the future');
  if (tenant.leaseStart && effectiveDate < new Date(tenant.leaseStart)) throw new Error('Termination cannot precede the lease start');
  if (tenant.leaseEnd && effectiveDate > new Date(tenant.leaseEnd)) throw new Error('Termination cannot follow the lease end');
  if (!reason || reason.length > 1200) throw new Error('Provide a termination reason (up to 1200 characters)');
  if (typeof finalRent !== 'number' || !Number.isFinite(finalRent) || finalRent < 0) throw new Error('Review and confirm a non-negative final rent charge');
  if (typeof input.possessionReturned !== 'boolean') throw new Error('Confirm whether possession has been returned');
  let returnedAt = null;
  if (input.possessionReturned) {
    returnedAt = new Date(input.returnedAt);
    if (!input.returnedAt || Number.isNaN(returnedAt.getTime()) || returnedAt >= endOfToday || (tenant.leaseStart && returnedAt < new Date(tenant.leaseStart))) throw new Error('Choose a valid possession return date');
    if (!['vacant', 'maintenance'].includes(input.unitDisposition)) throw new Error('Choose vacant or maintenance for the released unit');
  }
  return {
    effectiveDate, reason, finalRent: Math.round(finalRent * 100) / 100,
    possessionReturned: input.possessionReturned, returnedAt,
    unitDisposition: input.possessionReturned ? input.unitDisposition : null, reviewedAt: now
  };
}

module.exports = {leaseEndForCharges, isFormerTenant, isChargeableMonth, paymentPeriod, tenantMonthTotals, reviewedTermination};
