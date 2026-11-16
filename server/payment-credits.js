const values = require('./payment-credit-values');
const lifecycle = require('./tenant-lifecycle');
const {createHash} = require('crypto');

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

  async function apply(propertyId, sourceId, body = {}) {
    const items = body.allocations === undefined ? [body] : body.allocations;
    if (!Array.isArray(items) || !items.length || items.length > 40) throw fail('Choose between 1 and 40 credit allocations');
    const allocations = items.map(item => {
      if (!item || typeof item !== 'object') throw fail('Choose a valid credit allocation');
      const amountCents = money(item.amount);
      const applyTo = item.targetApplyTo;
      const period = item.periodMonth;
      if (!['rent', 'deposit', 'fee', 'late', 'water', 'electric', 'trash', 'admin', 'other'].includes(applyTo)) throw fail('Choose a valid credit category');
      if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period || '')) throw fail('Choose an applied month (YYYY-MM)');
      if (String(item.feeLabel || '').length > 200 || String(item.note || '').length > 1200) throw fail('Credit description is too long');
      return {amountCents, applyTo, period, feeType: String(item.feeType || '').slice(0, 60), feeLabel: String(item.feeLabel || '').trim(), note: String(item.note || '').trim()};
    });
    const amountCents = allocations.reduce((sum, item) => sum + item.amountCents, 0);
    if (!Number.isSafeInteger(amountCents)) throw fail('Credit amount is too large');
    if (!body.tenantId) throw fail('tenantId is required');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId || '')) throw fail('Reopen the credit dialog before applying credit');
    const fingerprint = createHash('sha256').update(JSON.stringify([String(sourceId), String(body.tenantId), allocations])).digest('hex');

    const session = await context.Payment.db.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const existing = await context.Payment.findOne({projectId: propertyId, creditApplicationKey: body.requestId}).session(session);
        if (existing) {
          const first = allocations[0];
          const legacyMatch = allocations.length === 1 && String(existing.creditSourceId) === String(sourceId)
            && String(existing.tenantId) === String(body.tenantId) && existing.applyTo === first.applyTo
            && existing.periodMonth === first.period && Math.round(existing.appliedCredit * 100) === first.amountCents;
          if (existing.creditApplicationFingerprint ? existing.creditApplicationFingerprint !== fingerprint : !legacyMatch) {
            throw fail('This credit request was already used for a different allocation', 409);
          }
          result = {applied: amountCents / 100, fromCreditId: existing.creditSourceId, newPayment: existing, duplicate: true};
          return;
        }
        let credit = await context.Payment.findOne({_id: sourceId, projectId: propertyId, tenantId: body.tenantId}).session(session);
        if (!credit) throw fail('Credit payment not found', 404);
        if (credit.postingStatus === 'voided') throw fail('A voided payment cannot be used as a credit', 409);
        if (credit.creditSourceId) throw fail('An applied credit cannot be used as a new source', 409);
        if (Number(credit.amount) >= 0 && credit.creditConsumed == null && Number(credit.appliedCredit) > 0) {
          throw fail('This legacy payment has ambiguous credit history. Reconcile it before applying more credit', 409);
        }
        const tenant = await context.Tenant.findOne({_id: body.tenantId, projectId: propertyId}).session(session);
        if (!tenant) throw fail('Tenant not found for this property', 404);
        for (const {applyTo, period} of allocations) {
          if (Number(credit.amount) >= 0 && credit.applyTo === applyTo
            && (applyTo === 'deposit' || lifecycle.paymentPeriod(credit) === period)) {
            throw fail('This overpayment is already assigned to that category and period. Choose a different destination');
          }
          if (applyTo === 'rent' && !lifecycle.isChargeableMonth(tenant, new Date(`${period}-15T12:00:00`))) throw fail('Apply credit to a rent period within the lease');
        }
        await balances.refreshTenant(body.tenantId, session);
        credit = await context.Payment.findOne({_id: sourceId, projectId: propertyId, tenantId: body.tenantId}).session(session);
        const availableCents = Math.round(values.availableCredit(credit) * 100);
        if (!availableCents) throw fail('No available credit to apply', 409);
        if (amountCents > availableCents) throw fail(`Only $${(availableCents / 100).toFixed(2)} credit remains. Reload and review the amount`, 409);
        const tenantPayments = await context.Payment.find({tenantId: body.tenantId}).session(session);
        const allocatedByTarget = new Map();
        for (const item of allocations) {
          const {applyTo, period} = item;
          if (applyTo !== 'rent' && applyTo !== 'deposit') continue;
          const target = applyTo === 'deposit' ? 'deposit' : `rent:${period}`;
          const outstanding = applyTo === 'rent'
            ? lifecycle.tenantMonthTotals(tenant, new Date(`${period}-15T12:00:00`), tenantPayments, context.computeExpectedRentForMonth).outstanding
            : Math.max(0, (Number(tenant.deposit) || 0) - (Number(tenant.depositPaid) || 0));
          const remaining = Math.max(0, Math.round(outstanding * 100) - (allocatedByTarget.get(target) || 0));
          if (item.amountCents > remaining) {
            throw fail(`Only $${(remaining / 100).toFixed(2)} is outstanding for this ${applyTo === 'rent' ? 'rent month' : 'deposit'}. Reduce the credit amount`, 409);
          }
          allocatedByTarget.set(target, (allocatedByTarget.get(target) || 0) + item.amountCents);
        }

        const amount = amountCents / 100;
        credit.creditConsumed = (Math.round(values.consumedCredit(credit) * 100) + amountCents) / 100;
        if (Number(credit.amount) < 0) credit.appliedCredit = 0;
        await credit.save({session});
        const sourcePeriod = lifecycle.paymentPeriod(credit);
        const sourcePeriodLabel = new Date(`${sourcePeriod}-01T00:00:00Z`)
          .toLocaleDateString('en-US', {month: 'short', year: '2-digit', timeZone: 'UTC'})
          .replace(' ', '-').toUpperCase();
        const savedAllocations = [];
        for (let index = 0; index < allocations.length; index++) {
          const item = allocations[index];
          const allocation = new context.Payment({
            projectId: propertyId, tenantId: body.tenantId,
            unitId: tenant.unitId || credit.unitId || undefined,
            type: 'adjustment', applyTo: item.applyTo, amount: 0, appliedCredit: item.amountCents / 100,
            creditConsumed: 0, creditSourceId: credit._id, creditApplicationKey: index ? `${body.requestId}:${index}` : body.requestId,
            creditApplicationFingerprint: index ? undefined : fingerprint,
            method: 'online', date: new Date(), periodMonth: item.period, lateFee: 0, balance: 0,
            feeType: item.feeType, feeLabel: item.feeLabel,
            note: [item.note, `(Credit applied from ${sourcePeriodLabel})`].filter(Boolean).join(' '),
            carryForward: false
          });
          await allocation.save({session});
          savedAllocations.push(allocation);
        }
        const sourceDeposit = credit.applyTo === 'deposit' && Number(credit.amount) > 0 ? amount : 0;
        const targetDeposit = allocations.reduce((sum, item) => sum + (item.applyTo === 'deposit' ? item.amountCents : 0), 0) / 100;
        if (sourceDeposit || targetDeposit) {
          tenant.depositPaid = Math.max(0, (Number(tenant.depositPaid) || 0) - sourceDeposit + targetDeposit);
          await tenant.save({session});
        }
        await balances.refreshTenant(body.tenantId, session);
        const saved = await context.Payment.findOne({_id: savedAllocations[0]._id, projectId: propertyId}).session(session);
        result = {applied: amount, fromCreditId: credit._id, newPayment: saved, duplicate: false};
      });
      return result;
    } finally {
      await session.endSession();
    }
  }
  return {apply};
};
