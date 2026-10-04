// properties flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {



function post_api_properties() {
// Property Management API Routes


// Add new property
serverContext.app.post('/api/properties', async (req, res) => {
  try {
    const property = new serverContext.Property(req.body);
    await property.save();
    res.status(201).json(property);
  } catch (error) {
    console.error('Error creating property:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function get_api_properties_id() {
// Get property details
serverContext.app.get('/api/properties/:id', async (req, res) => {
  try {
    const property = await serverContext.Property.findById(req.params.id)
      .populate('units');
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }
    res.json(property);
  } catch (error) {
    console.error('Error fetching property:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function get_api_properties_multifamily() {
// Update the property routes
serverContext.app.get('/api/properties/multifamily', async (req, res) => {
  try {
    console.log('Fetching multifamily properties...');
    
    const properties = await serverContext.Property.find({ type: 'Multifamily' })
      .populate({
        path: 'units',
        populate: [
          { path: 'tenant' },
          { path: 'lease' }
        ]
      });

    console.log(`Found ${properties.length} multifamily properties`);
    res.json(properties);
  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function put_api_properties_id_profile() {
// Update the rental-specific profile for a Project-backed property.
serverContext.app.put('/api/properties/:id/profile', async (req, res) => {
  try {
    if (!serverContext.mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid property ID' });
    }
    const propertyProfile = req.body?.propertyProfile || {};
    const buildingEquipment = Array.isArray(req.body?.buildingEquipment) ? req.body.buildingEquipment : [];
    const property = await serverContext.Project.findByIdAndUpdate(
      req.params.id,
      { $set: { propertyProfile, buildingEquipment } },
      { new: true, runValidators: true }
    );
    if (!property) return res.status(404).json({ message: 'Property not found' });
    res.json({ message: 'Property profile updated', property });
  } catch (error) {
    console.error('Error updating property profile:', error);
    res.status(500).json({ message: 'Unable to update property profile' });
  }
});
}

function get_api_properties_id_overview() {
// Consolidated operational snapshot for the interactive property dashboard.
serverContext.app.get('/api/properties/:id/overview', async (req, res) => {
  try {
    const { id } = req.params;
    if (!serverContext.mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid property ID' });
    const property = await serverContext.Project.findById(id).lean();
    if (!property) return res.status(404).json({ message: 'Property not found' });

    const now = new Date();
    const from = req.query.from ? new Date(req.query.from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = req.query.to ? new Date(req.query.to) : new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const in90Days = new Date(now.getTime() + 90 * 86400000);
    const units = await serverContext.Unit.find({ projectId: id }).lean();
    const unitIds = units.map(unit => unit._id).filter(Boolean);
    const maintenanceScopeQuery = unitIds.length
      ? { $or: [{ projectId: id }, { unitId: { $in: unitIds } }] }
      : { projectId: id };
    const [tenants, localPaymentsToDate, maintenance, schedules, tasks, expenses] = await Promise.all([
      serverContext.Tenant.find({ projectId: id }).lean(),
      serverContext.Payment.find({ projectId: id, date: { $lt: to } }).lean(),
      serverContext.MaintenanceRequest.find(maintenanceScopeQuery).sort({ createdAt: -1 }).lean(),
      serverContext.MaintenanceSchedule.find(maintenanceScopeQuery).sort({ nextScheduledDate: 1 }).lean(),
      serverContext.PortfolioTask.find({ projectId: id }).sort({ pinned: -1, dueDate: 1, createdAt: -1 }).lean(),
      serverContext.Expense.find({ $or: [{ projectId: id }, { 'lineItems.projectId': id }], status: { $nin: ['rejected', 'archived', 'missing info'] } }).lean()
    ]);

    const amountOrZero = value => Math.max(0, Number(value) || 0);
    const isDateWithinPeriod = value => {
      const date = value ? new Date(value) : null;
      return !!date && !Number.isNaN(date.getTime()) && date >= from && date < to;
    };
    const activeTenants = tenants.filter(t => ['active', 'pending'].includes(t.leaseStatus || 'active'));
    // Rent metrics include active leases only; pending tenants remain in operational lists.
    const rentTenants = tenants.filter(tenant => String(tenant.leaseStatus || 'active').toLowerCase() === 'active');
    const rentedUnitIds = new Set(rentTenants.filter(tenant => tenant.unitId)
      .map(tenant => String(tenant.unitId._id || tenant.unitId)));
    const unitById = new Map(units.map(unit => [String(unit._id), unit]));
    const localPeriodPayments = (localPaymentsToDate || []).filter(payment => isDateWithinPeriod(payment?.date));
    let quickBooksConnection = await serverContext.QuickBooksConnection.findOne({ projectId: id }).lean();
    let quickBooksOnlyPaymentsToDate = [];
    if (quickBooksConnection?.status === 'connected') {
      try {
        const connection = await (0, serverContext.getQbConnection)(id);
        const qbRecords = await (0, serverContext.fetchQuickBooksPaymentRecords)(connection);
        quickBooksOnlyPaymentsToDate = (0, serverContext.buildUnifiedQuickBooksPaymentEntries)({
          localPayments: localPaymentsToDate,
          qbRecords,
        connectionId: connection._id,
          tenants,
          unitById,
          projectId: id
        }).filter(payment => {
          const paymentDate = payment?.date ? new Date(payment.date) : null;
          return !!paymentDate && !Number.isNaN(paymentDate.getTime()) && paymentDate < to;
        });
      } catch (error) {
        console.warn(`Unable to include QuickBooks-only payments in overview for property ${id}:`, error.message);
      }
    }
    const payments = [...localPeriodPayments, ...quickBooksOnlyPaymentsToDate.filter(payment => isDateWithinPeriod(payment?.date))];
    const historicalRentPayments = [...localPaymentsToDate, ...quickBooksOnlyPaymentsToDate].filter(payment => {
      const paymentDate = payment?.date ? new Date(payment.date) : null;
      if (!paymentDate || Number.isNaN(paymentDate.getTime()) || paymentDate >= to) return false;
      if (!String(payment?.tenantId || '')) return false;
      return (payment.applyTo || 'rent') === 'rent';
    });
    const periodMonths = Math.max(1, Math.round((to - from) / (30.4375 * 86400000)));
    // Contract rent (base plus recurring fees) is the rent roll and expected rent.
    // A zero-rent tenant still occupies the unit: never substitute its asking rent.
    const monthlyRentRoll = rentTenants.reduce((sum, tenant) => sum + (0, serverContext.computeTenantPostedMonthlyRent)(tenant), 0);
    const monthlyGrossPotentialRent = monthlyRentRoll + units.reduce((sum, unit) =>
      sum + (rentedUnitIds.has(String(unit._id)) ? 0 : amountOrZero(unit.rent)), 0);
    let expectedRent = 0;
    let grossPotentialRent = 0;
    let cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    while (cursor < to) {
      expectedRent += monthlyRentRoll;
      grossPotentialRent += monthlyGrossPotentialRent;
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    const rentRoll = monthlyRentRoll;
    const scheduledRent = monthlyRentRoll;
    const rentPayments = payments.filter(p => (p.applyTo || 'rent') === 'rent');
    const nonDepositPayments = payments.filter(p => (p.applyTo || 'rent') !== 'deposit');
    const rentCollected = rentPayments.reduce((sum, payment) => sum + amountOrZero(payment.amount), 0);
    const rentalIncome = rentCollected;
    const otherIncome = nonDepositPayments
      .filter(payment => (payment.applyTo || 'rent') !== 'rent')
      .reduce((sum, payment) => sum + amountOrZero(payment.amount), 0);
    const depositCollections = payments
      .filter(payment => (payment.applyTo || 'rent') === 'deposit')
      .reduce((sum, payment) => sum + amountOrZero(payment.amount), 0);
    const expenseAmountForProperty = expense => {
      const matchingLines = (expense.lineItems || []).filter(line => String(line.projectId || '') === String(id));
      if (matchingLines.length) return matchingLines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
      if (String(expense.projectId || '') !== String(id)) return 0;
      if (Number.isFinite(Number(expense.receiptTotal))) return Number(expense.receiptTotal);
      if (Number.isFinite(Number(expense.amount))) return Number(expense.amount);
      return (expense.lineItems || []).reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
    };
    const periodExpenses = expenses.filter(expense => {
      const date = new Date(expense.date || expense.createdAt);
      return !Number.isNaN(date.getTime()) && date >= from && date < to;
    });
    const postedExpenses = periodExpenses.reduce((sum, expense) => sum + expenseAmountForProperty(expense), 0);
    const maintenancePattern = /maintenance|repair|hvac|plumb|electrical|appliance|turnover|make[- ]?ready/i;
    const isMaintenanceExpense = expense => maintenancePattern.test([
      expense.category, expense.description, expense.item?.name, expense.item?.costCode,
      ...(expense.lineItems || []).flatMap(line => [line.name, line.costCode, line.description])
    ].filter(Boolean).join(' '));
    const postedMaintenanceExpenses = periodExpenses.filter(isMaintenanceExpense).reduce((sum, expense) => sum + expenseAmountForProperty(expense), 0);
    const propertyProfile = property.propertyProfile || {};
    const managementFeeRate = Number.isFinite(Number(propertyProfile.managementFeeRate)) ? Math.max(0, Number(propertyProfile.managementFeeRate)) : 3;
    const vacancyLossRate = Number.isFinite(Number(propertyProfile.vacancyLossRate)) ? Math.max(0, Number(propertyProfile.vacancyLossRate)) : 3;
    const propertyExpenseBreakdown = {
      contractServices: amountOrZero(propertyProfile.contractServicesMonthly) * periodMonths,
      payroll: amountOrZero(propertyProfile.payrollMonthly) * periodMonths,
      administrative: amountOrZero(propertyProfile.administrativeMonthly) * periodMonths,
      monthlyDebt: amountOrZero(propertyProfile.monthlyDebt) * periodMonths,
      propertyTax: (amountOrZero(propertyProfile.annualPropertyTax) / 12) * periodMonths,
      insurance: (amountOrZero(propertyProfile.insurancePremium) / 12) * periodMonths
    };
    const loggedUtilityExpensesByType = units.reduce((totals, unit) => {
      (unit.utilityBills || []).forEach(bill => {
        if (!isDateWithinPeriod(bill?.dueDate)) return;
        const utilityType = String(bill?.type || '').toLowerCase();
        const responsibility = String(bill?.paidBy || unit.utilityAccounts?.[utilityType]?.under || '').toLowerCase();
        if (responsibility !== 'landlord') return;
        if (!Object.prototype.hasOwnProperty.call(totals, utilityType)) totals[utilityType] = 0;
        totals[utilityType] += amountOrZero(bill.amount);
      });
      return totals;
    }, { electricity: 0, water: 0, gas: 0 });
    const utilityExpenseBreakdown = {
      electricity: Math.max(amountOrZero(propertyProfile.electricalMonthly) * periodMonths, loggedUtilityExpensesByType.electricity || 0),
      water: Math.max(amountOrZero(propertyProfile.waterMonthly) * periodMonths, loggedUtilityExpensesByType.water || 0),
      trashSewer: amountOrZero(propertyProfile.trashSewerMonthly) * periodMonths,
      gas: Math.max(amountOrZero(propertyProfile.gasMonthly) * periodMonths, loggedUtilityExpensesByType.gas || 0),
      internet: amountOrZero(propertyProfile.internetMonthly) * periodMonths
    };
    const landlordUtilityExpenses = Object.values(utilityExpenseBreakdown).reduce((sum, amount) => sum + amountOrZero(amount), 0);
    const trackedMaintenanceRequestExpenses = maintenance.reduce((sum, item) => {
      if (!Number.isFinite(Number(item?.cost)) || Number(item.cost) <= 0) return sum;
      const activityDate = item.completedAt || item.scheduledFor || item.updatedAt || item.createdAt;
      return isDateWithinPeriod(activityDate) ? sum + amountOrZero(item.cost) : sum;
    }, 0);
    const sameCompletionStamp = (left, right) => {
      const leftDate = left ? new Date(left) : null;
      const rightDate = right ? new Date(right) : null;
      if (!leftDate || !rightDate || Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) return false;
      return leftDate.getTime() === rightDate.getTime();
    };
    const scheduleCompletionEntries = schedule => {
      const history = (Array.isArray(schedule?.history) ? schedule.history : []).filter(entry => entry?.completedAt);
      const entries = history.map(entry => ({completedAt:entry.completedAt,cost:amountOrZero(entry.cost)}));
      // Older schedules may have a completion without a history entry.
      if (schedule?.completedAt && !history.some(entry => sameCompletionStamp(entry.completedAt,schedule.completedAt))) {
        entries.push({completedAt:schedule.completedAt,cost:amountOrZero(schedule.cost),legacy:true});
      }
      return entries;
    };
    const scheduleCompletionCostTotal = (schedule, matcher = null) => scheduleCompletionEntries(schedule)
      .filter(entry => !matcher || matcher(entry.completedAt))
      .reduce((sum,entry) => sum + entry.cost, 0);
    const trackedMaintenanceScheduleExpenses = schedules.reduce((sum, item) => sum + scheduleCompletionCostTotal(item, isDateWithinPeriod), 0);
    const trackedMaintenanceExpenses = trackedMaintenanceRequestExpenses + trackedMaintenanceScheduleExpenses;
    const maintenanceExpensesInPeriod = trackedMaintenanceExpenses + postedMaintenanceExpenses;
    const maintenanceExpenses = maintenanceExpensesInPeriod;
    const nonMaintenancePostedExpenses = Math.max(0, postedExpenses - postedMaintenanceExpenses);
    const totalOperatingIncome = rentalIncome + otherIncome;
    const managementFeeExpense = totalOperatingIncome * (managementFeeRate / 100);
    const vacancyLossExpense = grossPotentialRent * (vacancyLossRate / 100);
    const recurringPropertyExpenses = Object.values(propertyExpenseBreakdown).reduce((sum, amount) => sum + amountOrZero(amount), 0) + managementFeeExpense + vacancyLossExpense;
    const operatingExpenses = nonMaintenancePostedExpenses + recurringPropertyExpenses + landlordUtilityExpenses + maintenanceExpenses;
    const expenseDetails = periodExpenses.map(expense => ({
      date: expense.date || expense.createdAt, description: expense.description || expense.item?.name || 'Expense',
      source: 'Expense ledger', category: isMaintenanceExpense(expense) ? 'Maintenance' : expense.category || 'Other',
      status: expense.status, amount: expenseAmountForProperty(expense)
    }));
    maintenance.forEach(item => {
      const date = item.completedAt || item.scheduledFor || item.updatedAt || item.createdAt;
      if (amountOrZero(item.cost) > 0 && isDateWithinPeriod(date)) expenseDetails.push({date, description:item.title || item.issue || 'Maintenance request',source:'Maintenance request',category:'Maintenance',status:item.status,amount:amountOrZero(item.cost)});
    });
    schedules.forEach(schedule => scheduleCompletionEntries(schedule).forEach(entry => {
      if (isDateWithinPeriod(entry.completedAt)) expenseDetails.push({date:entry.completedAt,description:schedule.title || 'Recurring maintenance',source:entry.legacy?'Recurring maintenance (legacy cost)':'Recurring maintenance completion',category:'Maintenance',status:'completed',amount:amountOrZero(entry.cost)});
    }));
    const addCalculatedExpense = (description,amount,source='Property assumption',category='Operating expense') => {
      if (amount) expenseDetails.push({date:null,description,source,category,status:'Calculated for period',amount});
    };
    const expenseLabels={contractServices:'Contract services',payroll:'Payroll',administrative:'Administrative',monthlyDebt:'Debt service',propertyTax:'Property tax',insurance:'Insurance'};
    Object.entries(propertyExpenseBreakdown).forEach(([key,amount])=>addCalculatedExpense(expenseLabels[key]||key,amount));
    addCalculatedExpense(`Management fee (${managementFeeRate}%)`,managementFeeExpense);
    addCalculatedExpense(`Vacancy loss (${vacancyLossRate}%)`,vacancyLossExpense);
    Object.entries(utilityExpenseBreakdown).forEach(([key,amount])=>addCalculatedExpense(key,amount,'Utility total (saved assumption or logged bills)','Utilities'));
    // Preserve the existing non-maintenance expense floor in the displayed reconciliation.
    addCalculatedExpense('Non-maintenance ledger floor adjustment',nonMaintenancePostedExpenses-(postedExpenses-postedMaintenanceExpenses),'Calculation adjustment');

    const annualOperatingBudget = Number(property.propertyProfile?.annualOperatingBudget) || 0;
    const operatingBudget = annualOperatingBudget ? annualOperatingBudget / 12 * periodMonths : null;
    const estimatedNOI = rentalIncome + otherIncome - operatingExpenses;
    const budgetVariance = operatingBudget === null ? null : operatingBudget - operatingExpenses;

    const asOf = new Date(Math.min(now.getTime(), to.getTime() - 1));
    const chargeLedger = await require('../tenant-charge-ledger')(serverContext).overview(id, tenants, localPaymentsToDate, asOf);
    const delinquencyRows = chargeLedger.tenants.filter(t=>t.balance>0).map(t=>({...t,unitNumber:unitById.get(String(t.unitId||''))?.number||''}));
    const aging = chargeLedger.aging;
    const delinquentTotal = chargeLedger.summary.totalOutstanding;
    const equipment = units.flatMap(unit => (unit.equipment || []).map(item => ({ ...item, unitId: unit._id, unitNumber: unit.number })));
    const openMaintenance = maintenance.filter(item => !['completed', 'closed', 'cancelled'].includes(String(item.status || '').toLowerCase()));
    const unitsRequiringAttention = units.map(unit => {
      const reasons = [];
      if (unit.status === 'vacant') reasons.push('Vacant');
      if (unit.status === 'maintenance') reasons.push('Offline for maintenance');
      if (!unit.profile?.condition) reasons.push('Condition not rated');
      const due = (unit.equipment || []).filter(item => item.nextServiceDate && new Date(item.nextServiceDate) <= in90Days).length;
      if (due) reasons.push(`${due} equipment service item${due === 1 ? '' : 's'} due`);
      return reasons.length ? { unitId: unit._id, number: unit.number, status: unit.status, rent: unit.rent, condition: unit.profile?.condition || '', reasons } : null;
    }).filter(Boolean);

    const quickBooksSyncedPayments = localPeriodPayments.filter(payment => payment.quickBooks?.syncStatus === 'synced');
    const quickBooksFailedPayments = localPeriodPayments.filter(payment => payment.quickBooks?.syncStatus === 'failed');
    const quickBooksPendingPayments = localPeriodPayments.filter(payment => !['synced', 'failed'].includes(payment.quickBooks?.syncStatus));
    const quickBooksOnlyPaymentsInPeriod = quickBooksOnlyPaymentsToDate.filter(payment => isDateWithinPeriod(payment?.date));

    res.json({
      chargeLedger, generatedAt: new Date(), range: { from, to }, property, expenseDetails,
      summary: {
        totalUnits: units.length,
        occupied: units.filter(u => u.status === 'occupied').length,
        vacant: units.filter(u => u.status === 'vacant').length,
        maintenanceUnits: units.filter(u => u.status === 'maintenance').length,
        occupancyRate: units.length ? Math.round(units.filter(u => u.status === 'occupied').length / units.length * 100) : 0,
        rentRoll, expectedRent, periodMonths, rentCollected, rentOutstanding: chargeLedger.summary.rentOwed,
        collectionRate: expectedRent ? Math.min(100, Math.round(rentCollected / expectedRent * 100)) : 0,
        openMaintenance: openMaintenance.length,
        urgentMaintenance: openMaintenance.filter(item => item.priority === 'urgent').length,
        activeTenants: activeTenants.length,
        expiringLeases90: activeTenants.filter(t => t.leaseEnd && new Date(t.leaseEnd) >= now && new Date(t.leaseEnd) <= in90Days).length,
        equipmentServiceDue90: equipment.filter(item => item.nextServiceDate && new Date(item.nextServiceDate) <= in90Days).length,
        warrantiesExpiring90: equipment.filter(item => item.warrantyExpires && new Date(item.warrantyExpires) <= in90Days).length
      },
      financials: {
        rentalIncome,
        otherIncome,
        depositCollections,
        operatingExpenses,
        maintenanceExpenses,
        estimatedNOI,
        operatingBudget,
        budgetVariance,
        expenseCount: periodExpenses.length,
        postedExpenses,
        postedMaintenanceExpenses,
        recurringPropertyExpenses,
        landlordUtilityExpenses,
        trackedMaintenanceExpenses,
        maintenanceExpensesInPeriod,
        expenseBreakdown: {
          contractServices: propertyExpenseBreakdown.contractServices,
          payroll: propertyExpenseBreakdown.payroll,
          managementFee: managementFeeExpense,
          vacancyLoss: vacancyLossExpense,
          administrative: propertyExpenseBreakdown.administrative,
          monthlyDebt: propertyExpenseBreakdown.monthlyDebt,
          propertyTax: propertyExpenseBreakdown.propertyTax,
          insurance: propertyExpenseBreakdown.insurance,
          electrical: utilityExpenseBreakdown.electricity,
          water: utilityExpenseBreakdown.water,
          trashSewer: utilityExpenseBreakdown.trashSewer,
          gas: utilityExpenseBreakdown.gas,
          internet: utilityExpenseBreakdown.internet,
          utilitiesTotal: landlordUtilityExpenses,
          recurringFixedTotal: recurringPropertyExpenses,
          scheduledRent,
          grossPotentialRent,
          managementFeeRate,
          vacancyLossRate
        }
      },
      delinquency: { total: delinquentTotal, tenantCount: delinquencyRows.length, aging, tenants: delinquencyRows },
      quickBooks: {
        connected: quickBooksConnection?.status === 'connected',
        status: quickBooksConnection?.status || 'not-connected',
        companyName: quickBooksConnection?.companyName || '',
        lastSuccessfulSyncAt: quickBooksConnection?.lastSuccessfulSyncAt || null,
        syncedPayments: quickBooksSyncedPayments.length,
        pendingPayments: quickBooksPendingPayments.length,
        failedPayments: quickBooksFailedPayments.length,
        localPaymentTotal: localPeriodPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0),
        syncedPaymentTotal: quickBooksSyncedPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0),
        quickBooksOnlyPaymentTotal: quickBooksOnlyPaymentsInPeriod.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0),
        effectivePaymentTotal: payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)
      },
      tenants: activeTenants,
      payments, maintenance, schedules, equipment, tasks, unitsRequiringAttention
    });
  } catch (error) {
    console.error('Error building property overview:', error);
    res.status(500).json({ message: 'Unable to build property overview' });
  }
});
}

return {
  post_api_properties,
  get_api_properties_id,
  get_api_properties_multifamily,
  put_api_properties_id_profile,
  get_api_properties_id_overview
};
};
