function consumedCredit(payment) {
  if (payment.creditConsumed != null) return Math.max(0, Number(payment.creditConsumed) || 0);
  return Number(payment.amount) < 0 ? Math.max(0, Number(payment.appliedCredit) || 0) : 0;
}

function appliedValue(payment) {
  if (payment.postingStatus === 'voided') return 0;
  const amount = Math.max(0, Number(payment.amount) || 0);
  const allocated = Number(payment.amount) >= 0 ? Math.max(0, Number(payment.appliedCredit) || 0) : 0;
  return Math.max(0, amount - consumedCredit(payment)) + allocated;
}

function availableCredit(payment) {
  if (!payment || payment.postingStatus === 'voided' || payment.creditSourceId) return 0;
  const amount = Number(payment.amount) || 0;
  if (amount < 0) return Math.max(0, Math.abs(amount) - consumedCredit(payment));
  return Math.max(0, Math.min(amount - consumedCredit(payment), -(Number(payment.balance) || 0)));
}

module.exports = {consumedCredit, appliedValue, availableCredit};
