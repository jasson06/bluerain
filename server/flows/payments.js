// payments flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {
const paymentBalances = require('../payment-balances')(serverContext);
const paymentAllocations = require('../payment-allocations')(serverContext);
const tenantLifecycle = require('../tenant-lifecycle');
const creditValues = require('../payment-credit-values');
const paymentCredits = require('../payment-credits')(serverContext);

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
  if (!tenantLifecycle.isChargeableMonth(tenant, dateLike)) return 0;
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
    if (monthOverride.expectedRent != null && monthOverride.expectedRent !== '' && Number.isFinite(er) && er >= 0) return er;
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
    if(req.query?.allocationDetails==='1')return res.json(await paymentAllocations.details(payment));
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
    if(payment.postingStatus==='voided')return res.status(409).json({message:'A voided payment receipt cannot be sent'});

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
    if(payment.postingStatus==='voided')return res.status(409).json({message:'Voided payments are retained for audit and cannot be deleted'});
    if(payment.creditSourceId || creditValues.consumedCredit(payment)>0 || Number(payment.appliedCredit)>0)return res.status(409).json({message:'Payments with credit allocations are retained for audit and cannot be deleted'});
    if(payment.quickBooks?.manualAllocation)return res.status(409).json({message:'Use Allocate to change this split payment. Individual allocations cannot be deleted separately.'});

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

async function getPaymentActionGroup(payment, session) {
  const rootId=String(payment.quickBooks?.allocationRootId||payment._id);
  const isAllocation=!!(payment.quickBooks?.manualAllocation||payment.quickBooks?.allocationRootId);
  const group=isAllocation
    ?await serverContext.Payment.find({projectId:payment.projectId,'quickBooks.allocationRootId':rootId}).session(session)
    :[payment];
  if(!group.some(item=>String(item._id)===String(payment._id)))throw Object.assign(new Error('Payment allocation group not found'),{status:409});
  return group;
}

function post_api_properties_propertyId_payments_paymentId_void() {
serverContext.app.post('/api/properties/:propertyId/payments/:paymentId/void', async (req, res) => {
  const reason=String(req.body?.reason||'').trim();
  if(!reason||reason.length>500)return res.status(400).json({message:'Provide a void reason of up to 500 characters'});
  let session;
  try {
    session=await serverContext.Payment.db.startSession();
    let resultPayment=null;
    let voidedCount=0;
    await session.withTransaction(async()=>{
      const payment=await serverContext.Payment.findOne({_id:req.params.paymentId,projectId:req.params.propertyId}).session(session);
      if(!payment)throw Object.assign(new Error('Payment not found'),{status:404});
      if(payment.postingStatus==='voided')throw Object.assign(new Error('Payment is already voided'),{status:409});
      const group=await getPaymentActionGroup(payment,session);
      if(group.some(item=>item.postingStatus==='voided'))throw Object.assign(new Error('Part of this allocation is already voided; review the payment before continuing'),{status:409});
      if(group.some(item=>Number(item.amount)<0||Number(item.appliedCredit)>0||creditValues.consumedCredit(item)>0)) {
        throw Object.assign(new Error('Resolve any credits already used by this payment before voiding it'),{status:409});
      }
      const depositAmount=group.filter(item=>item.applyTo==='deposit').reduce((sum,item)=>sum+Math.max(0,Number(item.amount)||0),0);
      for(const item of group){
        item.preVoidPostingStatus=item.postingStatus||'posted';
        item.postingStatus='voided';
        item.voidedAt=new Date();
        item.voidReason=reason;
        item.reinstatedAt=null;
        await item.save({session});
      }
      if(depositAmount){
        const tenant=await serverContext.Tenant.findById(payment.tenantId).session(session);
        if(!tenant)throw Object.assign(new Error('Tenant not found for this deposit payment'),{status:404});
        tenant.depositPaid=Math.max(0,(Number(tenant.depositPaid)||0)-depositAmount);
        await tenant.save({session});
      }
      await paymentBalances.refreshTenant(payment.tenantId,session);
      resultPayment=payment.toObject();
      voidedCount=group.length;
    });
    return res.json({success:true,payment:resultPayment,voidedCount});
  } catch(error) {
    if(error.status)return res.status(error.status).json({message:error.message});
    console.error('Error voiding payment:',error);
    return res.status(500).json({message:'Unable to void payment'});
  } finally {
    if(session)await session.endSession();
  }
});
}

function post_api_properties_propertyId_payments_paymentId_reinstate() {
serverContext.app.post('/api/properties/:propertyId/payments/:paymentId/reinstate', async (req, res) => {
  let session;
  try {
    session=await serverContext.Payment.db.startSession();
    let resultPayment=null;
    let reinstatedCount=0;
    await session.withTransaction(async()=>{
      const payment=await serverContext.Payment.findOne({_id:req.params.paymentId,projectId:req.params.propertyId}).session(session);
      if(!payment)throw Object.assign(new Error('Payment not found'),{status:404});
      if(payment.postingStatus!=='voided')throw Object.assign(new Error('Only voided payments can be reinstated'),{status:409});
      const group=await getPaymentActionGroup(payment,session);
      if(group.some(item=>item.postingStatus!=='voided'))throw Object.assign(new Error('Part of this allocation is not voided; review the payment before continuing'),{status:409});
      const depositAmount=group.filter(item=>item.applyTo==='deposit').reduce((sum,item)=>sum+Math.max(0,Number(item.amount)||0),0);
      const reinstatedAt=new Date();
      for(const item of group){
        item.postingStatus=item.preVoidPostingStatus||'posted';
        item.reinstatedAt=reinstatedAt;
        await item.save({session});
      }
      if(depositAmount){
        const tenant=await serverContext.Tenant.findById(payment.tenantId).session(session);
        if(!tenant)throw Object.assign(new Error('Tenant not found for this deposit payment'),{status:404});
        tenant.depositPaid=(Number(tenant.depositPaid)||0)+depositAmount;
        await tenant.save({session});
      }
      await paymentBalances.refreshTenant(payment.tenantId,session);
      resultPayment=(await serverContext.Payment.findOne({_id:payment._id,projectId:payment.projectId}).session(session)).toObject();
      reinstatedCount=group.length;
    });
    return res.json({success:true,payment:resultPayment,reinstatedCount});
  } catch(error) {
    if(error.status)return res.status(error.status).json({message:error.message});
    console.error('Error reinstating payment:',error);
    return res.status(500).json({message:'Unable to reinstate payment'});
  } finally {
    if(session)await session.endSession();
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
    if (periodMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodMonth)) return res.status(400).json({message:'Choose a valid rent period (YYYY-MM)'});

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
    const chargeDate = periodMonth ? new Date(`${periodMonth}-15T12:00:00`) : new Date(date);
    if (Number.isNaN(chargeDate.getTime())) return res.status(400).json({message:'Choose a valid payment date'});
    if (applyTo === 'rent' && tenantLifecycle.isFormerTenant(tenant) && !tenantLifecycle.isChargeableMonth(tenant,chargeDate)) return res.status(400).json({message:'Apply this former-tenant receipt to a rent period within the ended lease. Review missing lease dates first.'});

    // Calculate expected payment amount based on tenant's rental details
  let expectedAmount = 0;
  let calculatedLateFee = 0;
  let overrideLateApplied = false;

  // Default: rent logic (compute expected amount before credits)
  if (applyTo === 'rent' && type === 'rent') {
      // Prorate base rent for the first month based on tenant.leaseStart; otherwise full monthly charges
      expectedAmount = (0, serverContext.computeExpectedRentForMonth)(tenant, chargeDate, 'rent');

      // Monthly override late fee takes precedence; when present, roll it into expectedAmount (do not attach per-payment late fee)
      const d = chargeDate;
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
      expectedAmount = tenantLifecycle.isChargeableMonth(tenant, chargeDate) ? Number(tenant.hubContribution) || 0 : 0;
    }
    // Use provided amount if specified, otherwise use calculated amount (for rent/hub)
    let finalAmount = (amount !== undefined && amount !== null && amount !== '') ? Number(amount) : expectedAmount;
    let appliedCredit = 0;

    const finalLateFee = calculatedLateFee;

    // Handle different applyTo behaviors
    if (applyTo === 'deposit') {
      // For deposit payments, compute deposit remaining and update tenant.depositPaid
      const expectedDeposit = Number(tenant.deposit) || 0;

      // Sum previous deposit payments
      const prevDepositPayments = (await serverContext.Payment.find({ tenantId, applyTo: 'deposit' })).filter(payment=>payment.postingStatus!=='voided');
      const totalPrevDeposit = prevDepositPayments.reduce((s, p) => s + creditValues.appliedValue(p), 0);

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
    const selectedRentPeriod = tenantLifecycle.paymentPeriod({periodMonth,date});
    const paymentDate = selectedRentPeriod ? new Date(Number(selectedRentPeriod.slice(0,4)), Number(selectedRentPeriod.slice(5,7))-1, 15) : new Date(date);
    const monthStart = new Date(paymentDate.getFullYear(), paymentDate.getMonth(), 1);
    const monthEnd = new Date(paymentDate.getFullYear(), paymentDate.getMonth() + 1, 0, 23, 59, 59, 999);

    // Get all payments for this tenant in the current month
    const paymentsThisMonth = (await serverContext.Payment.find({
      tenantId,
      applyTo: 'rent',
      $or: selectedRentPeriod ? [{ periodMonth: selectedRentPeriod }, { periodMonth: { $in: ['', null] }, date: { $gte: monthStart, $lte: monthEnd } }, { periodMonth: { $exists: false }, date: { $gte: monthStart, $lte: monthEnd } }] : [{ date: { $gte: monthStart, $lte: monthEnd } }]
    })).filter(payment => payment.postingStatus !== 'voided');

    // Calculate total paid (excluding this payment)
  const totalPaid = paymentsThisMonth.reduce((sum, p) => sum + creditValues.appliedValue(p), 0);

  // Calculate total late fees (excluding this payment)
  const totalLateFees = paymentsThisMonth.reduce((sum, p) => sum + (p.lateFee || 0), 0);

  // Calculate balance:
  // If override late fee was rolled into expectedAmount above, avoid double-counting by ignoring per-payment late fees
  const totalMonthlyCharges = overrideLateApplied ? expectedAmount : (expectedAmount + totalLateFees + finalLateFee);
  const balance = finalAmount < 0 ? -Math.abs(finalAmount) : totalMonthlyCharges - (totalPaid + finalAmount);

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
    const payment = await serverContext.Payment.findOne({_id:req.params.paymentId,projectId:req.params.propertyId});
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    if(payment.postingStatus==='voided')return res.status(409).json({message:'Voided payments cannot be edited'});
    if(payment.creditSourceId || creditValues.consumedCredit(payment)>0 || Number(payment.appliedCredit)>0)return res.status(409).json({message:'Payments with credit allocations cannot be edited; their source and application history must remain intact'});
    if(req.body.allocations!==undefined){
      const result=await paymentAllocations.save(payment,req.body);
      try{await paymentBalances.refreshTenant(result.tenantId);}catch(error){return res.json({success:true,rootId:result.rootId,warning:'Allocation saved. Refresh payments to finish recalculating balances.'});}
      return res.json({success:true,rootId:result.rootId});
    }
    if(payment.quickBooks?.manualAllocation)return res.status(409).json({message:'Use Allocate to edit this split payment so the total stays unchanged'});

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
    await paymentBalances.refreshTenant(payment.tenantId);
    return res.json({ payment });
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(req.body.allocations!==undefined?400:500).json({ message: req.body.allocations!==undefined?error.message:'Server error' });
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
  let session;
  try {
    const t = await serverContext.Tenant.findById(req.params.tenantId);
    if (!t) return res.status(404).json({ message: 'Tenant not found' });
    const { period } = req.params;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return res.status(400).json({message:'Choose a valid rent period (YYYY-MM)'});
    const changes = {};
    for (const key of ['expectedRent','lateFee']) {
      if (req.body[key] === undefined) continue;
      const raw = req.body[key];
      const value = raw === null || raw === '' ? null : Number(raw);
      if (value !== null && (!Number.isFinite(value) || value < 0 || !['number','string'].includes(typeof raw))) return res.status(400).json({message:`${key} must be a non-negative amount or null`});
      changes[key] = value;
    }
    if (req.body.lateFeeMode !== undefined) {
      if (!['amount','percent'].includes(req.body.lateFeeMode)) return res.status(400).json({message:'Choose amount or percent for late fees'});
      changes.lateFeeMode = req.body.lateFeeMode;
    }
    if (!Object.keys(changes).length) return res.status(400).json({message:'Provide an expected rent or late-fee change'});
    const date = new Date(`${period}-15T12:00:00`);
    if (!tenantLifecycle.isChargeableMonth(t,date)) return res.status(400).json({message:'Expected rent can only be edited for a month within the lease'});
    session = await serverContext.mongoose.startSession();
    let override, termination;
    await session.withTransaction(async () => {
      const tenant = await serverContext.Tenant.findById(req.params.tenantId).session(session);
      if (!tenant || !tenantLifecycle.isChargeableMonth(tenant,date)) throw new Error('The lease changed. Reload the tenant ledger before editing.');
      const previous = typeof tenant.monthlyOverrides?.get === 'function' ? tenant.monthlyOverrides.get(period) : tenant.monthlyOverrides?.[period];
      const val = {expectedRent:null,lateFee:null,lateFeeMode:'amount',...(previous?.toObject ? previous.toObject() : previous),...changes};
      const cleared = val.expectedRent === null && val.lateFee === null && req.body.lateFeeMode === undefined;
      if (cleared) {
        if (typeof tenant.monthlyOverrides?.delete === 'function') tenant.monthlyOverrides.delete(period);
        else if (tenant.monthlyOverrides) delete tenant.monthlyOverrides[period];
        override = null;
      } else {
        if (typeof tenant.monthlyOverrides?.set === 'function') tenant.monthlyOverrides.set(period,val);
        else {
          tenant.monthlyOverrides = tenant.monthlyOverrides || {};
          tenant.monthlyOverrides[period] = val;
        }
        override = val;
      }
      if (tenant.termination?.effectiveDate && tenantLifecycle.paymentPeriod({date:tenant.termination.effectiveDate}) === period && changes.expectedRent !== undefined) {
        tenant.termination.finalRent = (0,serverContext.computeExpectedRentForMonth)(tenant,date,'rent');
        tenant.termination.reviewedAt = new Date();
      }
      await tenant.save({session});
      await paymentBalances.refreshTenant(tenant._id,session);
      termination = tenant.termination;
    });
    res.json({ ok:true,override,termination });
  } catch (e) {
    console.error('Error saving monthly override:', e);
    res.status(500).json({ message: e.message || 'Unable to save monthly charges' });
  } finally {
    if (session) await session.endSession();
  }
});
}

function post_api_properties_propertyId_payments_creditPaymentId_apply_credit() {
// Keep source consumption, target allocation, and ledger balances in one transaction.
serverContext.app.post('/api/properties/:propertyId/payments/:creditPaymentId/apply-credit', async (req, res) => {
  try {
    const result = await paymentCredits.apply(req.params.propertyId, req.params.creditPaymentId, req.body);
    return res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({message: error.message});
    console.error('Error applying credit:', error);
    res.status(500).json({ message: 'Unable to apply credit. No changes were committed' });
  }
});
}

function post_api_properties_propertyId_payments_creditPaymentId_reconcile_credit() {
serverContext.app.post('/api/properties/:propertyId/payments/:creditPaymentId/reconcile-credit', async (req, res) => {
  try {
    const result = await paymentCredits.reconcile(req.params.propertyId, req.params.creditPaymentId, req.body);
    return res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({message: error.message});
    console.error('Error reconciling legacy credit:', error);
    res.status(500).json({ message: 'Unable to reconcile this credit. No changes were committed' });
  }
});
}

return {
  get_api_properties_propertyId_payments,
  get_api_properties_propertyId_payments_paymentId,
  post_api_properties_propertyId_payments_paymentId_send_receipt,
  delete_api_properties_propertyId_payments_paymentId,
  post_api_properties_propertyId_payments_paymentId_void,
  post_api_properties_propertyId_payments_paymentId_reinstate,
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
  post_api_properties_propertyId_payments_creditPaymentId_apply_credit,
  post_api_properties_propertyId_payments_creditPaymentId_reconcile_credit
};
};
