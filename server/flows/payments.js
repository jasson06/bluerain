// payments flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {
const paymentBalances = require('../payment-balances')(serverContext);

// POST a new payment (rent or HUB)
// Helper to normalize incoming payment type to enum values
function normalizePaymentTypeServer(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (t === 'rent') return 'rent';
  if (['hub', 'section8', 'voucher', 'subsidy'].includes(t)) return 'hub';
  if (['partial', 'adjustment', 'custom'].includes(t)) return t;
  return null;
}

// Utility: days in a given month/year
function daysInMonth(year, monthIndex) { // monthIndex: 0-11
  return new Date(year, monthIndex + 1, 0).getDate();
}

// Compute prorated base rent for the first lease month (baseRent only)
// Returns a number (rounded to 2 decimals) or null if not first month or data missing
function computeFirstMonthProratedBaseRent(tenant, dateLike) {
  try {
    if (!tenant) return null;
    const leaseStart = tenant.leaseStart ? new Date(tenant.leaseStart) : null;
    if (!leaseStart || isNaN(leaseStart.getTime())) return null;
    const d = new Date(dateLike);
    if (!d || isNaN(d.getTime())) return null;
    if (leaseStart.getFullYear() !== d.getFullYear() || leaseStart.getMonth() !== d.getMonth()) return null;
    const base = Number(tenant.baseRent) || 0;
    if (base <= 0) return 0;
    const totalDays = (0, serverContext.daysInMonth)(d.getFullYear(), d.getMonth());
    const startDay = leaseStart.getDate();
    const occupiedDays = Math.max(1, totalDays - (startDay - 1));
    const daily = base / totalDays;
    return Number((occupiedDays * daily).toFixed(2));
  } catch {
    return null;
  }
}

// Compute expected rent amount for a given month
// For the first lease month: prorate baseRent only per requirements
// For subsequent months: full baseRent + recurring monthly fees
function computeExpectedRentForMonth(tenant, dateLike, paymentType) {
  const d = new Date(dateLike);
  const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
  // Check for manual expected rent override for this month
  const mo = tenant?.monthlyOverrides;
  let monthOverride = null;
  if (mo) {
    // Support both Map and plain object
    monthOverride = typeof mo.get === 'function' ? mo.get(period) : mo[period];
  }
  if (monthOverride && paymentType === 'rent') {
    const er = Number(monthOverride.expectedRent);
    if (Number.isFinite(er) && er >= 0) return er;
  }
  const isRentType = (paymentType === 'rent');
  if (isRentType) {
    const prorated = (0, serverContext.computeFirstMonthProratedBaseRent)(tenant, d);
    if (prorated !== null) {
      return prorated; // base rent prorated for first month; exclude add-ons
    }
  }
  // Default full monthly charges
  return (
    (Number(tenant.baseRent) || 0) +
    (Number(tenant.waterFee) || 0) +
    (Number(tenant.trashFee) || 0) +
    (Number(tenant.adminFee) || 0) +
    (tenant.additionalFee?.amount || 0) +
    (tenant.pets?.hasPets ? (Number(tenant.pets.monthlyRent) || 0) : 0)
  );
}

function computeTenantPostedMonthlyRent(tenant) {
  if (!tenant) return 0;
  const postedBaseRent = Math.max(0, Number(tenant.baseRent) || 0);
  return (
    postedBaseRent +
    (Number(tenant.waterFee) || 0) +
    (Number(tenant.trashFee) || 0) +
    (Number(tenant.adminFee) || 0) +
    (Number(tenant.additionalFee?.amount) || 0) +
    (tenant.pets?.hasPets ? (Number(tenant.pets.monthlyRent) || 0) : 0)
  );
}

function get_api_properties_propertyId_payments() {
// GET all payments for a property
serverContext.app.get('/api/properties/:propertyId/payments', async (req, res) => {
  try {
    const existingConnection = await serverContext.QuickBooksConnection.findOne({ projectId: req.params.propertyId, status: { $ne: 'disconnected' } }).lean();
    const payments = existingConnection
      ? await (0, serverContext.autoResolveQuickBooksPaymentsForProperty)(req.params.propertyId).then(result => result.localPayments)
      : await serverContext.Payment.find({ projectId: req.params.propertyId }).sort({ date: -1 });
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function get_api_properties_propertyId_payments_paymentId() {
// GET a single payment (for exporting receipt)
serverContext.app.get('/api/properties/:propertyId/payments/:paymentId', async (req, res) => {
  try {
    const payment = await serverContext.Payment.findOne({
      _id: req.params.paymentId,
      projectId: req.params.propertyId
    });
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    res.json(payment);
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function post_api_properties_propertyId_payments_paymentId_send_receipt() {
// Send a payment receipt via email to the tenant
serverContext.app.post('/api/properties/:propertyId/payments/:paymentId/send-receipt', async (req, res) => {
  try {
    const { propertyId, paymentId } = req.params;

    const payment = await serverContext.Payment.findOne({ _id: paymentId, projectId: propertyId });
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const tenant = await serverContext.Tenant.findById(payment.tenantId).lean();
    if (!tenant || !tenant.email) {
      return res.status(400).json({ message: 'Tenant email not available for this payment' });
    }

    // Prefer a Property document if it exists, otherwise fall back to Project.
    // Use typeof guard so this route is safe even in environments where Property is not defined.
    let propertyDoc = null;
    try {
      if (typeof serverContext.Property !== 'undefined') {
        propertyDoc = await serverContext.Property.findById(propertyId).lean();
      }
    } catch (_) {
      propertyDoc = null;
    }
    const projectDoc = propertyDoc ? null : await serverContext.Project.findById(propertyId).lean().catch(() => null);

    const name = tenant.name || 'Tenant';

    // Helpers mirroring exportReceipt in property-management.html
    const formatCurrency = (n) => `$${(Number(n) || 0).toFixed(2)}`;
    const toTitle = (s) => {
      if (!s) return '';
      const str = String(s);
      return str.charAt(0).toUpperCase() + str.slice(1);
    };

    const formatDateDisplayServer = (value) => {
      if (!value) return '';
      try {
        const s = String(value);
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) {
          const y = Number(m[1]);
          const mo = Number(m[2]);
          const d = Number(m[3]);
          return new Date(y, mo - 1, d).toLocaleDateString('en-US');
        }
        const d = new Date(value);
        return d.toLocaleDateString('en-US');
      } catch {
        return String(value);
      }
    };

    const formatAddressLines = (doc) => {
      if (!doc) return [];
      const a = doc.address || {};
      const line1 = a.line1 || a.addressLine1 || a.street || doc.line1 || '';
      const line2 = a.line2 || a.addressLine2 || a.suite || doc.line2 || '';
      const city = a.city || doc.city || '';
      const state = a.state || doc.state || '';
      const zip = a.zip || a.postalCode || doc.zip || '';
      const lines = [];
      if (line1) lines.push(line1);
      if (line2) lines.push(line2);
      let last = '';
      if (city) last += city;
      if (state) last += (last ? ', ' : '') + state;
      if (zip) last += (last ? ' ' : '') + zip;
      if (last) lines.push(last);
      return lines;
    };

    const amount = Number(payment.amount) || 0;
    const late = Number(payment.lateFee) || 0;
    const totalPaid = amount + late;
    const balance = Number(payment.balance) || 0;
    const totalPaidLabel = totalPaid < 0 ? 'Credit Applied' : 'Total Paid';

    const receiptNo = (payment._id || '').toString().slice(-8).toUpperCase();
    const paymentIdShort = (payment._id || '').toString().substring(0, 12);
    const dateStr = formatDateDisplayServer(payment.date || new Date());

    const propDoc = propertyDoc || projectDoc;
    const propName = propDoc?.name || '';
    const addrLines = formatAddressLines(propDoc);

    const unit = await serverContext.Unit.findById(payment.unitId).lean().catch(() => null);

    const displayType = payment.type === 'custom'
      ? (payment.customType || 'Custom')
      : toTitle(payment.type || '');

    const paymentLines = [];
    // Omit explicit "Type" label row per UI request, keep only method/apply-to and reference
    paymentLines.push(`<tr><td style="padding:4px 0;color:#6b7280;">Method:</td><td style="padding:4px 0;text-align:right;color:#111827;">${toTitle(payment.method || '')}</td></tr>`);
    paymentLines.push(`<tr><td style="padding:4px 0;color:#6b7280;">Applied To:</td><td style="padding:4px 0;text-align:right;color:#111827;">${toTitle(payment.applyTo || 'rent')}</td></tr>`);
    if (payment.applyTo && ['water','electric','trash','admin','late','other'].includes(payment.applyTo)) {
      paymentLines.push(`<tr><td style="padding:4px 0;color:#6b7280;">Category</td><td style="padding:4px 0;text-align:right;color:#111827;">${toTitle(payment.applyTo)}</td></tr>`);
    }
    if (payment.applyTo === 'fee' && payment.feeType) {
      paymentLines.push(`<tr><td style="padding:4px 0;color:#6b7280;">Fee Type</td><td style="padding:4px 0;text-align:right;color:#111827;">${toTitle(payment.feeType)}</td></tr>`);
    }
    if (payment.applyTo === 'fee' && payment.feeLabel) {
      paymentLines.push(`<tr><td style="padding:4px 0;color:#6b7280;">Fee Label</td><td style="padding:4px 0;text-align:right;color:#111827;">${payment.feeLabel}</td></tr>`);
    }
    if (payment.periodMonth) {
      paymentLines.push(`<tr><td style="padding:4px 0;color:#6b7280;">Period</td><td style="padding:4px 0;text-align:right;color:#111827;">${payment.periodMonth}</td></tr>`);
    }
    paymentLines.push(`<tr><td style="padding:4px 0;color:#6b7280;">Reference</td><td style="padding:4px 0;text-align:right;color:#111827;">${receiptNo}</td></tr>`);

    const subject = `Payment Receipt - ${formatCurrency(amount)}`;
    const html = `
      <div style="margin:0;padding:24px;background:#f0f4f9;font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; color: #0f172a;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 20px 40px rgba(15,23,42,0.18);">
          <!-- Header -->
          <div style="padding:20px 24px 18px 24px;background:linear-gradient(135deg,#0f172a,#1d4ed8);color:#f9fafb;position:relative;">
            <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;opacity:0.9;">Payment Receipt</div>
            <div style="margin-top:4px;font-size:20px;font-weight:700;">Blue Rain MF LLC</div>
            <div style="margin-top:14px;display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;">
              <div>
                <div style="font-size:11px;opacity:0.9;text-transform:uppercase;letter-spacing:0.08em;">${totalPaidLabel}</div>
                <div style="margin-top:2px;font-size:26px;font-weight:700;">${formatCurrency(totalPaid)}</div>
              </div>
              <div style="text-align:right;min-width:150px;">
                <div style="font-size:11px;opacity:0.85;">Receipt #</div>
                <div style="font-size:13px;font-weight:600;letter-spacing:0.08em;">${receiptNo}</div>
                <div style="margin-top:4px;font-size:11px;opacity:0.9;">${dateStr}</div>
              </div>
            </div>
            <div style="position:absolute;right:24px;top:20px;background:#22c55e;color:#022c22;font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;letter-spacing:0.08em;text-transform:uppercase;box-shadow:0 4px 12px rgba(22,163,74,0.4);">Paid</div>
          </div>

          <!-- Meta + Property -->
          <div style="padding:18px 24px 8px 24px;border-bottom:1px solid #e5e7eb;display:flex;flex-wrap:wrap;gap:18px;justify-content:space-between;">
            <div style="flex:1;min-width:340px;">
              <div style="font-size:11px;font-weight:600;color:#6b7280;letter-spacing:0.12em;text-transform:uppercase;">Receipt Details</div>
              <div style="margin-top:6px;font-size:13px;color:#111827;line-height:1.5;">
                <div><span style="color:#6b7280;">Payment ID:</span> ${paymentIdShort}...</div>
                <div><span style="color:#6b7280;">Payment Date:</span> ${dateStr}</div>
                
              </div>
            </div>
            <div style="flex:1;min-width:210px;">
              <div style="font-size:11px;font-weight:600;color:#6b7280;letter-spacing:0.12em;text-transform:uppercase;">Property</div>
              <div style="margin-top:6px;font-size:13px;color:#111827;line-height:1.5;">
                ${propName ? `<div style=\"font-weight:600;\">${propName}</div>` : ''}
                ${addrLines.map(l => `<div style=\"color:#4b5563;\">${l}</div>`).join('')}
              </div>
            </div>
          </div>

          <!-- Payor & Payment columns -->
          <div style="padding:16px 24px 8px 24px;display:flex;flex-wrap:wrap;gap:12px;justify-content:flex-start;">
            <div style="flex:1;min-width:340px;max-width:360px;">
              <div style="font-size:12px;font-weight:600;color:#111827;margin-bottom:6px;">Payor Details</div>
              <table style="width:100%;max-width:260px;border-collapse:collapse;font-size:13px;">
                <tr><td style="padding:3px 0;color:#6b7280;">Tenant:</td><td style="padding:3px 0 3px 16px;color:#111827;white-space:nowrap;">${tenant.name || 'N/A'}</td></tr>
                <tr><td style="padding:3px 0;color:#6b7280;">Unit:</td><td style="padding:3px 0 3px 16px;color:#111827;white-space:nowrap;">${unit?.number || 'N/A'}</td></tr>
                ${tenant.email ? `<tr><td style=\"padding:3px 0;color:#6b7280;\">Email:</td><td style=\"padding:3px 0 3px 16px;color:#111827;white-space:nowrap;\">${tenant.email}</td></tr>` : ''}
                ${tenant.phone ? `<tr><td style=\"padding:3px 0;color:#6b7280;\">Phone:</td><td style=\"padding:3px 0 3px 16px;color:#111827;white-space:nowrap;\">${tenant.phone}</td></tr>` : ''}
              </table>
            </div>
            <div style="flex:1;min-width:140px;max-width:160px;">
              <div style="font-size:12px;font-weight:600;color:#111827;margin-bottom:6px;">Payment Details</div>
              <table style="width:100%;max-width:260px;border-collapse:collapse;font-size:13px;">
                ${paymentLines.join('').replace(/text-align:right/g,'padding:3px 0 3px 16px;color:#111827;white-space:nowrap;')}
              </table>
            </div>
          </div>

          <!-- Note -->
          ${payment.note ? `
          <div style="padding:6px 24px 4px 24px;">
            <div style="font-size:12px;font-weight:600;color:#111827;margin-bottom:4px;">Note</div>
            <div style="font-size:13px;color:#4b5563;line-height:1.6;white-space:pre-line;">${payment.note}</div>
          </div>` : ''}

          <!-- Summary card -->
          <div style="padding:16px 24px 20px 24px;">
            <div style="border-radius:12px;border:1px solid #dbeafe;background:linear-gradient(135deg,#eff6ff,#ffffff);padding:10px 16px;position:relative;overflow:hidden;">
              <div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:linear-gradient(180deg,#1d4ed8,#38bdf8);"></div>
              <div style="margin-left:10px;">
                <div style="font-size:13px;font-weight:600;color:#0f172a;margin-bottom:6px;">Payment Summary</div>
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                  <!-- Amount row removed per UI request; total and optional late fee remain -->
                  ${late ? `<tr><td style=\"padding:4px 0;color:#6b7280;\">Late Fee</td><td style=\"padding:4px 0;text-align:right;color:#111827;\">${formatCurrency(late)}</td></tr>` : ''}
                  <tr>
                    <td style="padding:6px 0;color:#111827;font-weight:600;border-top:1px dashed #cbd5f5;">${totalPaidLabel}</td>
                    <td style="padding:6px 0;text-align:right;color:#111827;font-weight:700;border-top:1px dashed #cbd5f5;">${formatCurrency(totalPaid)}</td>
                  </tr>
                  <!-- Remaining Balance row removed per UI request -->
                </table>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div style="padding:10px 24px 18px 24px;border-top:1px solid #e5e7eb;">
            <div style="margin-top:8px;font-size:13px;font-weight:600;color:#1d4ed8;text-align:center;">Thank you for your payment!</div>
            <div style="margin-top:4px;font-size:11px;color:#6b7280;text-align:center;">Generated by Bluerain MF LLC (210) 981-9251</div>
          </div>
        </div>
      </div>
    `;

    await serverContext.transporter.sendMail({
      from: `BESF <${process.env.EMAIL_USER}>`,
      to: tenant.email,
      subject,
      html
    });

    res.json({ success: true, message: 'Receipt emailed successfully' });
  } catch (error) {
    console.error('Error sending receipt email:', error);
    res.status(500).json({ message: 'Failed to send receipt email' });
  }
});
}

function delete_api_properties_propertyId_payments_paymentId() {
// DELETE a payment
serverContext.app.delete('/api/properties/:propertyId/payments/:paymentId', async (req, res) => {
  try {
    const payment = await serverContext.Payment.findOne({ _id: req.params.paymentId, projectId: req.params.propertyId });
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    // If payment applied to deposit, roll back tenant.depositPaid
    if (payment.applyTo === 'deposit') {
      try {
        const t = await serverContext.Tenant.findById(payment.tenantId);
        if (t) {
          t.depositPaid = Math.max(0, (t.depositPaid || 0) - (payment.amount || 0));
          await t.save();
        }
      } catch (err) {
        console.error('Error rolling back tenant.depositPaid on payment delete:', err);
      }
    }

  const wasCredit = (payment.amount || 0) < 0;
  await payment.deleteOne();
  res.json({ message: 'Payment deleted successfully', creditRemoved: wasCredit });
  } catch (error) {
    console.error('Error deleting payment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function post_api_properties_propertyId_payments() {
serverContext.app.post('/api/properties/:propertyId/payments', async (req, res) => {
  try {
    const { tenantId, unitId, amount, method, date, lateFee, note, customType, carryForward } = req.body;
    const lateFeeMode = (req.body.lateFeeMode || 'amount').toLowerCase(); // 'amount' | 'percent'
    const type = (0, serverContext.normalizePaymentTypeServer)(req.body.type);
    const applyTo = String(req.body.applyTo || 'rent').toLowerCase();
    const feeType = req.body.feeType || '';
    const feeLabel = req.body.feeLabel || '';
    const periodMonth = req.body.periodMonth || '';

    if (!type) {
      return res.status(400).json({ message: 'Invalid payment type. Allowed: rent, hub' });
    }
    if (!tenantId || !type || !method || !date) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    if (!['rent', 'deposit', 'fee', 'late', 'water', 'electric', 'trash', 'admin', 'other'].includes(applyTo)) {
      return res.status(400).json({ message: 'Invalid applyTo value. Allowed: rent, deposit, fee, late, water, electric, trash, admin, other' });
    }

    // Fetch tenant data to get rental details
    const tenant = await serverContext.Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    // Calculate expected payment amount based on tenant's rental details
  let expectedAmount = 0;
  let calculatedLateFee = 0;
  let overrideLateApplied = false;

  // Default: rent logic (compute expected amount before credits)
  if (applyTo === 'rent' && type === 'rent') {
      // Prorate base rent for the first month based on tenant.leaseStart; otherwise full monthly charges
      expectedAmount = (0, serverContext.computeExpectedRentForMonth)(tenant, date, 'rent');

      // Monthly override late fee takes precedence; when present, roll it into expectedAmount (do not attach per-payment late fee)
      const d = new Date(date);
      const period = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const mo = tenant?.monthlyOverrides;
      const ov = mo ? (typeof mo.get === 'function' ? mo.get(period) : mo[period]) : null;
      let overrideMonthlyLate = 0;
      if (ov && (ov.lateFee != null)) {
        const mode = String(ov.lateFeeMode || 'amount').toLowerCase();
        const lfVal = Number(ov.lateFee);
        if (mode === 'percent' && Number.isFinite(lfVal)) {
          overrideMonthlyLate = expectedAmount * (lfVal / 100);
        } else if (Number.isFinite(lfVal)) {
          overrideMonthlyLate = lfVal;
        }
      }
      if (overrideMonthlyLate > 0) {
        expectedAmount += overrideMonthlyLate;
        calculatedLateFee = 0; // do not store per-payment late fee when override exists
        overrideLateApplied = true;
      } else if (lateFee && Number.isFinite(Number(lateFee)) && Number(lateFee) > 0) {
        // Respect mode: amount (default) or percent (manual per-payment only when no override)
        const lf = Number(lateFee);
        if (lateFeeMode === 'percent') {
          calculatedLateFee = expectedAmount * (lf / 100);
        } else {
          calculatedLateFee = lf; // absolute dollar amount
        }
      }
    } else if (type === 'hub' && applyTo === 'rent') {
      // For HUB payments, use the HUB contribution amount
      expectedAmount = Number(tenant.hubContribution) || 0;
    }
    // Use provided amount if specified, otherwise use calculated amount (for rent/hub)
    let finalAmount = (amount !== undefined && amount !== null && amount !== '') ? Number(amount) : expectedAmount;
    let appliedCredit = 0;

    // Apply prior month credits automatically if first rent payment of the month
    if (applyTo === 'rent') {
      const selectedPeriod = /^\d{4}-\d{2}$/.test(String(periodMonth || '')) ? String(periodMonth) : '';
      const paymentDateObj = selectedPeriod ? new Date(Number(selectedPeriod.slice(0,4)), Number(selectedPeriod.slice(5,7))-1, 15) : new Date(date);
      const monthStart = new Date(paymentDateObj.getFullYear(), paymentDateObj.getMonth(), 1);
      const monthEnd = new Date(paymentDateObj.getFullYear(), paymentDateObj.getMonth() + 1, 0, 23, 59, 59, 999);
      const existingRentPaymentsThisMonth = await serverContext.Payment.find({
        tenantId,
        applyTo: 'rent',
        $or: selectedPeriod ? [{ periodMonth: selectedPeriod }, { periodMonth: { $in: ['', null] }, date: { $gte: monthStart, $lte: monthEnd } }, { periodMonth: { $exists: false }, date: { $gte: monthStart, $lte: monthEnd } }] : [{ date: { $gte: monthStart, $lte: monthEnd } }]
      });
      if (existingRentPaymentsThisMonth.length === 0) {
        // Gather prior credits marked carryForward
        const priorCredits = await serverContext.Payment.find({
          tenantId,
          applyTo: 'rent',
          carryForward: true,
          date: { $lt: monthStart }
        });
        const creditTotal = priorCredits.reduce((s, p) => {
          if (p.amount < 0) return s + Math.abs(p.amount);
          if (p.balance < 0) return s + Math.abs(p.balance);
          return s;
        }, 0);
        if (creditTotal > 0) {
          const originalExpected = expectedAmount;
          expectedAmount = Math.max(0, expectedAmount - creditTotal);
          appliedCredit = Math.min(creditTotal, originalExpected); // amount actually consumed
          // Adjust default finalAmount if user left amount blank (auto-calc scenario)
          if (amount === undefined || amount === null || amount === '') {
            finalAmount = expectedAmount; // after credit application
          }
        }
      }
    }
    const finalLateFee = calculatedLateFee;

    // Handle different applyTo behaviors
    if (applyTo === 'deposit') {
      // For deposit payments, compute deposit remaining and update tenant.depositPaid
      const expectedDeposit = Number(tenant.deposit) || 0;

      // Sum previous deposit payments
      const prevDepositPayments = await serverContext.Payment.find({ tenantId, applyTo: 'deposit' });
      const totalPrevDeposit = prevDepositPayments.reduce((s, p) => s + (p.amount || 0), 0);

      // If amount not provided, assume remaining deposit
      if (!amount) finalAmount = Math.max(0, expectedDeposit - totalPrevDeposit);

      const depositBalance = expectedDeposit - (totalPrevDeposit + finalAmount);

      const payment = new serverContext.Payment({
        projectId: req.params.propertyId,
        tenantId,
        unitId,
        type,
        applyTo: 'deposit',
        amount: finalAmount,
        method,
        date,
        lateFee: finalLateFee,
        balance: depositBalance, // can be negative if overpaid (credit)
        note: note || '',
        customType: type === 'custom' ? (customType || '').substring(0,60) : '',
        carryForward: Boolean(carryForward) && finalAmount < 0,
        appliedCredit
      });

      await payment.save();
      (0, serverContext.scheduleAutomaticQuickBooksPaymentSync)(payment);

      // Update tenant.depositPaid
      tenant.depositPaid = (tenant.depositPaid || 0) + finalAmount;
      await tenant.save();

      return res.status(201).json({
        payment,
        calculationDetails: {
          expectedDeposit,
          totalPrevDeposit,
          depositBalance
        }
      });
    }

    if (applyTo === 'fee') {
      // One-off fee payment: record feeType/label, no monthly balance
      const payment = new serverContext.Payment({
        projectId: req.params.propertyId,
        tenantId,
        unitId,
        type,
        applyTo: 'fee',
        feeType,
        feeLabel,
        periodMonth,
        amount: finalAmount,
        method,
        date,
        lateFee: finalLateFee,
        balance: 0,
        note: note || '',
        customType: type === 'custom' ? (customType || '').substring(0,60) : '',
        carryForward: Boolean(carryForward) && finalAmount < 0,
        appliedCredit
      });
      await payment.save();
      (0, serverContext.scheduleAutomaticQuickBooksPaymentSync)(payment);
      return res.status(201).json({ payment });
    }

    // Default: rent/hub monthly logic
    const selectedRentPeriod = /^\d{4}-\d{2}$/.test(String(periodMonth || '')) ? String(periodMonth) : '';
    const paymentDate = selectedRentPeriod ? new Date(Number(selectedRentPeriod.slice(0,4)), Number(selectedRentPeriod.slice(5,7))-1, 15) : new Date(date);
    const monthStart = new Date(paymentDate.getFullYear(), paymentDate.getMonth(), 1);
    const monthEnd = new Date(paymentDate.getFullYear(), paymentDate.getMonth() + 1, 0, 23, 59, 59, 999);

    // Get all payments for this tenant in the current month
    const paymentsThisMonth = await serverContext.Payment.find({
      tenantId,
      applyTo: 'rent',
      $or: selectedRentPeriod ? [{ periodMonth: selectedRentPeriod }, { periodMonth: { $in: ['', null] }, date: { $gte: monthStart, $lte: monthEnd } }, { periodMonth: { $exists: false }, date: { $gte: monthStart, $lte: monthEnd } }] : [{ date: { $gte: monthStart, $lte: monthEnd } }]
    });

    // Calculate total paid (excluding this payment)
  const totalPaid = paymentsThisMonth.reduce((sum, p) => sum + Math.abs(p.amount || 0), 0); // count credits positively

  // Calculate total late fees (excluding this payment)
  const totalLateFees = paymentsThisMonth.reduce((sum, p) => sum + (p.lateFee || 0), 0);

  // Calculate balance:
  // If override late fee was rolled into expectedAmount above, avoid double-counting by ignoring per-payment late fees
  const totalMonthlyCharges = overrideLateApplied ? expectedAmount : (expectedAmount + totalLateFees + finalLateFee);
  const balance = totalMonthlyCharges - (totalPaid + Math.abs(finalAmount));

    const payment = new serverContext.Payment({
      projectId: req.params.propertyId,
      tenantId,
      unitId,
      type,
      applyTo: 'rent',
      periodMonth: selectedRentPeriod,
      amount: finalAmount,
      method,
      date,
      lateFee: finalLateFee,
      balance, // allow negative (credit forward)
      note: note || '',
      customType: type === 'custom' ? (customType || '').substring(0,60) : '',
      carryForward: Boolean(carryForward) && finalAmount < 0,
      appliedCredit
    });

    await payment.save();
    (0, serverContext.scheduleAutomaticQuickBooksPaymentSync)(payment);

    res.status(201).json({
      payment,
      calculationDetails: {
        expectedAmount,
        calculatedLateFee: finalLateFee,
        totalMonthlyCharges,
        totalPaidPreviously: totalPaid,
        balance,
        appliedCredit
      }
    });
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function put_api_properties_propertyId_payments_paymentId() {
// --- Update PUT /api/properties/:propertyId/payments/:paymentId ---
serverContext.app.put('/api/properties/:propertyId/payments/:paymentId', async (req, res) => {
  try {
    const payment = await serverContext.Payment.findById(req.params.paymentId);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    // Normalize incoming fields
    const amount = req.body.amount;
    const method = req.body.method;
    const date = req.body.date;
  const lateFee = req.body.lateFee;
  const note = req.body.note;
  const customType = req.body.customType;
  const carryForward = req.body.carryForward;
    // Allow updating tenant and unit references
    const incomingTenantId = req.body.tenantId || payment.tenantId;
    const incomingUnitId = req.body.unitId !== undefined ? req.body.unitId : payment.unitId;
    const oldTenantId = payment.tenantId?.toString();
    const newTenantId = incomingTenantId?.toString();
    const newUnitId = incomingUnitId || undefined;
    const newType = (0, serverContext.normalizePaymentTypeServer)(req.body.type) || payment.type;
    const newApplyTo = String(req.body.applyTo || payment.applyTo || 'rent').toLowerCase();
    const newFeeType = req.body.feeType || payment.feeType || '';
    const newFeeLabel = req.body.feeLabel || payment.feeLabel || '';
    const newPeriodMonth = req.body.periodMonth || payment.periodMonth || '';

    // Adjust depositPaid on the correct tenant(s) if applyTo/amount/tenant changed
    const oldApplyTo = payment.applyTo || 'rent';
    const oldAmount = payment.amount || 0;
    const newAmount = amount !== undefined ? Number(amount) : oldAmount;

    // If tenant changed, revert effect on old tenant (if any) and apply on new tenant
    if (oldTenantId !== newTenantId) {
      if (oldTenantId) {
        const oldTenant = await serverContext.Tenant.findById(oldTenantId);
        if (!oldTenant) return res.status(404).json({ message: 'Old tenant not found' });
        if (oldApplyTo === 'deposit') {
          oldTenant.depositPaid = Math.max(0, (oldTenant.depositPaid || 0) - oldAmount);
          await oldTenant.save();
        }
      }
      if (newTenantId) {
        const newTenant = await serverContext.Tenant.findById(newTenantId);
        if (!newTenant) return res.status(404).json({ message: 'Tenant not found' });
        if (newApplyTo === 'deposit') {
          newTenant.depositPaid = (newTenant.depositPaid || 0) + newAmount;
          await newTenant.save();
        }
      }
    } else {
      // Tenant not changed: adjust on same tenant if applyTo changed or amount changed
      const tenant = await serverContext.Tenant.findById(payment.tenantId);
      if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
      if (oldApplyTo === 'deposit') {
        tenant.depositPaid = Math.max(0, (tenant.depositPaid || 0) - oldAmount);
      }
      if (newApplyTo === 'deposit') {
        tenant.depositPaid = (tenant.depositPaid || 0) + newAmount;
      }
      await tenant.save();
    }

    // Update payment fields
    if (newTenantId) payment.tenantId = newTenantId;
    payment.unitId = newUnitId; // can be undefined/null
    payment.type = newType;
    payment.applyTo = newApplyTo;
    payment.feeType = newFeeType;
    payment.feeLabel = newFeeLabel;
    payment.periodMonth = newPeriodMonth;
    if (amount !== undefined) payment.amount = newAmount;
    if (method) payment.method = method;
    if (date) payment.date = date;
  if (lateFee !== undefined) payment.lateFee = lateFee;
  if (note !== undefined) payment.note = note;
    if (payment.type === 'custom' && customType !== undefined) {
      payment.customType = (customType || '').substring(0,60);
    }
    if (carryForward !== undefined) {
      payment.carryForward = Boolean(carryForward) && payment.amount < 0;
    }

    await paymentBalances.recalculate(payment, lateFee);

    await payment.save();
    return res.json({ payment });
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function get_api_tenants_tenantId_monthly_overrides() {
// --- Monthly Overrides API ---
// Get all overrides for a tenant
serverContext.app.get('/api/tenants/:tenantId/monthly-overrides', async (req, res) => {
  try {
    const t = await serverContext.Tenant.findById(req.params.tenantId);
    if (!t) return res.status(404).json({ message: 'Tenant not found' });
    const mo = t.monthlyOverrides || {};
    // Convert Map to plain object if needed
    let data = {};
    if (typeof mo.forEach === 'function') {
      mo.forEach((v, k) => { data[k] = v; });
    } else {
      data = mo;
    }
    res.json({ overrides: data });
  } catch (e) {
    console.error('Error fetching monthly overrides:', e);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function get_api_tenants_tenantId_monthly_overrides_period() {
// Get override for a specific period YYYY-MM
serverContext.app.get('/api/tenants/:tenantId/monthly-overrides/:period', async (req, res) => {
  try {
    const t = await serverContext.Tenant.findById(req.params.tenantId);
    if (!t) return res.status(404).json({ message: 'Tenant not found' });
    const { period } = req.params;
    const mo = t.monthlyOverrides || {};
    const v = (typeof mo.get === 'function') ? mo.get(period) : mo[period];
    res.json({ period, override: v || null });
  } catch (e) {
    console.error('Error fetching monthly override:', e);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function put_api_tenants_tenantId_monthly_overrides_period() {
// Upsert override for a specific period; pass nulls to clear
serverContext.app.put('/api/tenants/:tenantId/monthly-overrides/:period', async (req, res) => {
  try {
    const t = await serverContext.Tenant.findById(req.params.tenantId);
    if (!t) return res.status(404).json({ message: 'Tenant not found' });
    const { period } = req.params;
    let { expectedRent, lateFee, lateFeeMode } = req.body;
    // Normalize numbers or nulls
    expectedRent = expectedRent === '' || expectedRent === undefined ? null : Number(expectedRent);
    lateFee = lateFee === '' || lateFee === undefined ? null : Number(lateFee);
    const mode = (lateFeeMode === 'percent' || lateFeeMode === 'amount') ? lateFeeMode : undefined;

    if ((expectedRent === null || Number.isNaN(expectedRent)) && (lateFee === null || Number.isNaN(lateFee)) && (mode === undefined)) {
      // remove override
      if (typeof t.monthlyOverrides?.delete === 'function') t.monthlyOverrides.delete(period);
      else if (t.monthlyOverrides) delete t.monthlyOverrides[period];
    } else {
      const val = {
        expectedRent: Number.isFinite(expectedRent) ? expectedRent : null,
        lateFee: Number.isFinite(lateFee) ? lateFee : null,
        lateFeeMode: mode || 'amount'
      };
      if (typeof t.monthlyOverrides?.set === 'function') t.monthlyOverrides.set(period, val);
      else {
        t.monthlyOverrides = t.monthlyOverrides || {};
        t.monthlyOverrides[period] = val;
      }
    }
    await t.save();
    res.json({ ok: true });
  } catch (e) {
    console.error('Error saving monthly override:', e);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function post_api_properties_propertyId_payments_creditPaymentId_apply_credit() {
// Apply a credit to a target (rent/deposit/fees) by creating an adjustment payment and consuming credit
serverContext.app.post('/api/properties/:propertyId/payments/:creditPaymentId/apply-credit', async (req, res) => {
  try {
    const { propertyId, creditPaymentId } = req.params;
    const { tenantId, unitId, amount, targetApplyTo, feeType, feeLabel, periodMonth, note } = req.body;
    const applyTo = String(targetApplyTo || 'rent').toLowerCase();
    if (!['rent','deposit','fee','late','water','electric','trash','admin','other'].includes(applyTo)) {
      return res.status(400).json({ message: 'Invalid target applyTo' });
    }
    if (!tenantId) return res.status(400).json({ message: 'tenantId is required' });

    const credit = await serverContext.Payment.findOne({ _id: creditPaymentId, projectId: propertyId, tenantId });
    if (!credit) return res.status(404).json({ message: 'Credit payment not found' });
    const creditBase = (credit.amount || 0) < 0
      ? Math.abs(credit.amount || 0)
      : ((credit.balance || 0) < 0 ? Math.abs(credit.balance || 0) : 0);
    const available = Math.max(0, creditBase - Math.abs(credit.appliedCredit || 0));
    if (available <= 0) return res.status(400).json({ message: 'No available credit to apply' });

    let applyAmount = Number(amount);
    if (!Number.isFinite(applyAmount) || applyAmount <= 0) applyAmount = available;
    if (applyAmount > available) applyAmount = available;

    const tenant = await serverContext.Tenant.findById(tenantId);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

    const today = new Date();
    // Determine unitId fallback: prefer provided, else credit.unitId, else tenant.unitId if stored
    let resolvedUnitId = unitId;
    if (!resolvedUnitId) {
      if (credit.unitId) resolvedUnitId = credit.unitId;
      else if (tenant.unitId) resolvedUnitId = tenant.unitId; // might be object or id
    } 
    const commonFields = {
      projectId: propertyId,
      tenantId,
      unitId: resolvedUnitId || undefined,
      type: 'adjustment',
      // Do NOT add to collected totals; represent credit allocation with amount=0
      amount: 0,
      method: 'online',
      date: today,
      lateFee: 0,
      note: (note ? String(note) + ' ' : '') + `(Applied from credit ${credit._id.toString().slice(-6)})`,
      customType: '',
      carryForward: false,
      // Track consumption of credit on this allocation entry
      appliedCredit: applyAmount
    };

    let newPayment;

    if (applyTo === 'deposit') {
      const expectedDeposit = Number(tenant.deposit) || 0;
      // Sum previous deposit payments
      const prevDepositPayments = await serverContext.Payment.find({ tenantId, applyTo: 'deposit' });
      const totalPrevDeposit = prevDepositPayments.reduce((s, p) => s + (p.amount || 0), 0);
      const depositBalance = expectedDeposit - (totalPrevDeposit + applyAmount);
      newPayment = new serverContext.Payment({
        ...commonFields,
        applyTo: 'deposit',
        balance: depositBalance
      });
      await newPayment.save();
      tenant.depositPaid = (tenant.depositPaid || 0) + applyAmount;
      await tenant.save();
    } else if (applyTo === 'fee' || ['late','water','electric','trash','admin','other'].includes(applyTo)) {
      // Record fee category payment
      newPayment = new serverContext.Payment({
        ...commonFields,
        applyTo,
        feeType: feeType || '',
        feeLabel: feeLabel || '',
        periodMonth: periodMonth || '',
        balance: 0
      });
      await newPayment.save();
    } else {
      // applyTo === 'rent' : compute balance like POST /payments
      let expectedAmount = 0;
      // For adjustment toward rent, treat like rent components
      expectedAmount =
        (Number(tenant.baseRent) || 0) +
        (Number(tenant.waterFee) || 0) +
        (Number(tenant.trashFee) || 0) +
        (Number(tenant.adminFee) || 0) +
        (tenant.additionalFee?.amount || 0) +
        (tenant.pets?.hasPets ? (Number(tenant.pets.monthlyRent) || 0) : 0);

      const paymentDate = today;
      const monthStart = new Date(paymentDate.getFullYear(), paymentDate.getMonth(), 1);
      const monthEnd = new Date(paymentDate.getFullYear(), paymentDate.getMonth() + 1, 0, 23, 59, 59, 999);
      const paymentsThisMonth = await serverContext.Payment.find({ tenantId, applyTo: 'rent', date: { $gte: monthStart, $lte: monthEnd } });
      const totalPaid = paymentsThisMonth.reduce((sum, p) => sum + Math.abs(p.amount || 0), 0);
      const totalLateFees = paymentsThisMonth.reduce((sum, p) => sum + (p.lateFee || 0), 0);
      const totalMonthlyCharges = expectedAmount + totalLateFees;
      const balance = totalMonthlyCharges - (totalPaid + Math.abs(applyAmount));

      newPayment = new serverContext.Payment({
        ...commonFields,
        applyTo: 'rent',
        balance
      });
      await newPayment.save();
    }

    // Consume credit using the same base we used to compute availability
    const newApplied = Math.min(creditBase, Math.abs(credit.appliedCredit || 0) + applyAmount);
    credit.appliedCredit = newApplied;
    // If the credit originated from an overpaid balance (negative balance), bring that balance toward zero
    if ((credit.amount || 0) >= 0 && (credit.balance || 0) < 0) {
      const remainingAfter = Math.max(0, creditBase - newApplied);
      credit.balance = -remainingAfter; // 0 when fully consumed, still negative if partial
    }
    await credit.save();

    return res.status(201).json({
      applied: applyAmount,
      fromCreditId: credit._id,
      newPayment
    });
  } catch (error) {
    console.error('Error applying credit:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

return {
  get_api_properties_propertyId_payments,
  get_api_properties_propertyId_payments_paymentId,
  post_api_properties_propertyId_payments_paymentId_send_receipt,
  delete_api_properties_propertyId_payments_paymentId,
  normalizePaymentTypeServer,
  daysInMonth,
  computeFirstMonthProratedBaseRent,
  computeExpectedRentForMonth,
  computeTenantPostedMonthlyRent,
  post_api_properties_propertyId_payments,
  put_api_properties_propertyId_payments_paymentId,
  get_api_tenants_tenantId_monthly_overrides,
  get_api_tenants_tenantId_monthly_overrides_period,
  put_api_tenants_tenantId_monthly_overrides_period,
  post_api_properties_propertyId_payments_creditPaymentId_apply_credit
};
};
