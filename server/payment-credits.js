const values = require('./payment-credit-values');
const lifecycle = require('./tenant-lifecycle');

module.exports = function paymentCredits(context) {
  const balances = require('./payment-balances')(context);
  const fail = (message, status = 400) => Object.assign(new Error(message), {status});
  const money = value => {
    if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') throw fail('Enter a positive credit amount');
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100)) || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001) {
      throw fail('Enter a positive credit amount with at most two decimal places');
    }
    return Math.round(amount * 100);
  };

  async function allocate(propertyId, sourceId, body = {}, reconcileLegacy = false) {
    const amountCents = money(body.amount);
    const applyTo = body.targetApplyTo;
    const period = body.periodMonth;
    if (!['rent', 'deposit', 'fee', 'late', 'water', 'electric', 'trash', 'admin', 'other'].includes(applyTo)) throw fail('Choose a valid credit category');
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period || '')) throw fail('Choose an applied month (YYYY-MM)');
    if (!body.tenantId) throw fail('tenantId is required');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId || '')) throw fail('Reopen the credit dialog before applying credit');
    if (String(body.feeLabel || '').length > 200 || String(body.note || '').length > 1200) throw fail('Credit description is too long');

    const session = await context.Payment.db.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const existing = await context.Payment.findOne({projectId: propertyId, creditApplicationKey: body.requestId}).session(session);
        if (existing) {
          if (String(existing.creditSourceId) !== String(sourceId) || String(existing.tenantId) !== String(body.tenantId)
            || existing.applyTo !== applyTo || existing.periodMonth !== period || Math.round(existing.appliedCredit * 100) !== amountCents) {
            throw fail('This credit request was already used for a different allocation', 409);
          }
          result = {
            applied: existing.appliedCredit, fromCreditId: existing.creditSourceId,
            newPayment: existing, duplicate: true, reconciled: reconcileLegacy
          };
          return;
        }
        let credit = await context.Payment.findOne({_id: sourceId, projectId: propertyId, tenantId: body.tenantId}).session(session);
        if (!credit) throw fail('Credit payment not found', 404);
        if (credit.postingStatus === 'voided') throw fail('A voided payment cannot be used as a credit', 409);
        if (credit.creditSourceId) throw fail('An applied credit cannot be used as a new source', 409);
        if (Number(credit.amount) >= 0 && credit.applyTo === applyTo
          && (applyTo === 'deposit' || lifecycle.paymentPeriod(credit) === period)) {
          throw fail('This overpayment is already assigned to that category and period. Choose a different destination');
        }
        const hasAmbiguousLegacyHistory = Number(credit.amount) >= 0
          && credit.creditConsumed == null && Number(credit.appliedCredit) > 0;
        if (hasAmbiguousLegacyHistory && !reconcileLegacy) {
          throw fail('This legacy payment has ambiguous credit history. Reconcile it before applying more credit', 409);
        }
        if (reconcileLegacy) {
          if (!hasAmbiguousLegacyHistory) throw fail('This payment no longer needs legacy credit reconciliation', 409);
          const legacyCents = Math.round(Number(credit.appliedCredit) * 100);
          const balanceCents = Math.max(0, Math.round(-(Number(credit.balance) || 0) * 100));
          if (legacyCents !== amountCents || balanceCents !== amountCents) {
            throw fail('The legacy credit marker and remaining balance do not match. Review this payment with an administrator', 409);
          }
          const linkedAllocation = await context.Payment.findOne({
            projectId: propertyId, tenantId: body.tenantId, creditSourceId: credit._id
          }).session(session);
          if (linkedAllocation) {
            throw fail('This payment already has linked credit history. Review its allocations before reconciling it', 409);
          }
        }
        const tenant = await context.Tenant.findOne({_id: body.tenantId, projectId: propertyId}).session(session);
        if (!tenant) throw fail('Tenant not found for this property', 404);
        const targetDate = new Date(`${period}-15T12:00:00`);
        if (applyTo === 'rent' && !lifecycle.isChargeableMonth(tenant, targetDate)) throw fail('Apply credit to a rent period within the lease');
        if (!reconcileLegacy) await balances.refreshTenant(body.tenantId, session);
        credit = await context.Payment.findOne({_id: sourceId, projectId: propertyId, tenantId: body.tenantId}).session(session);
        if (!reconcileLegacy) {
          const availableCents = Math.round(values.availableCredit(credit) * 100);
          if (!availableCents) throw fail('No available credit to apply', 409);
          if (amountCents > availableCents) throw fail(`Only $${(availableCents / 100).toFixed(2)} credit remains. Reload and review the amount`, 409);
        }
        if (applyTo === 'rent' || applyTo === 'deposit') {
          const tenantPayments = await context.Payment.find({tenantId: body.tenantId}).session(session);
          const outstanding = applyTo === 'rent'
            ? lifecycle.tenantMonthTotals(tenant, targetDate, tenantPayments, context.computeExpectedRentForMonth).outstanding
            : Math.max(0, (Number(tenant.deposit) || 0) - (Number(tenant.depositPaid) || 0));
          if (amountCents > Math.round(outstanding * 100)) {
            throw fail(`Only $${outstanding.toFixed(2)} is outstanding for this ${applyTo === 'rent' ? 'rent month' : 'deposit'}. Reduce the credit amount`, 409);
          }
        }

        const amount = amountCents / 100;
        credit.creditConsumed = reconcileLegacy
          ? amount
          : (Math.round(values.consumedCredit(credit) * 100) + amountCents) / 100;
        if (reconcileLegacy || Number(credit.amount) < 0) credit.appliedCredit = 0;
        await credit.save({session});
        const sourcePeriod = lifecycle.paymentPeriod(credit);
        const sourcePeriodLabel = new Date(`${sourcePeriod}-01T00:00:00Z`)
          .toLocaleDateString('en-US', {month: 'short', year: '2-digit', timeZone: 'UTC'})
          .replace(' ', '-').toUpperCase();
        const allocation = new context.Payment({
          projectId: propertyId, tenantId: body.tenantId,
          unitId: tenant.unitId || credit.unitId || undefined,
          type: 'adjustment', applyTo, amount: 0, appliedCredit: amount,
          creditConsumed: 0, creditSourceId: credit._id, creditApplicationKey: body.requestId,
          method: 'online', date: new Date(), periodMonth: period, lateFee: 0, balance: 0,
          feeType: String(body.feeType || '').slice(0, 60), feeLabel: String(body.feeLabel || '').trim(),
          note: [String(body.note || '').trim(), `(Credit applied from ${sourcePeriodLabel})`].filter(Boolean).join(' '),
          carryForward: false
        });
        await allocation.save({session});
        const sourceDeposit = credit.applyTo === 'deposit' && Number(credit.amount) > 0 ? amount : 0;
        const targetDeposit = applyTo === 'deposit' ? amount : 0;
        if (sourceDeposit || targetDeposit) {
          tenant.depositPaid = Math.max(0, (Number(tenant.depositPaid) || 0) - sourceDeposit + targetDeposit);
          await tenant.save({session});
        }
        await balances.refreshTenant(body.tenantId, session);
        const saved = await context.Payment.findOne({_id: allocation._id, projectId: propertyId}).session(session);
        result = {
          applied: amount, fromCreditId: credit._id, newPayment: saved,
          duplicate: false, reconciled: reconcileLegacy
        };
      });
      return result;
    } finally {
      await session.endSession();
    }
  }
  return {
    apply: (propertyId, sourceId, body) => allocate(propertyId, sourceId, body, false),
    reconcile: (propertyId, sourceId, body) => allocate(propertyId, sourceId, body, true)
  };
};
