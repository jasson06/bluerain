// quotes flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {



function post_api_quotes() {
// Create a new quote
serverContext.app.post('/api/quotes',  async (req, res) => {
  try {
    // Ensure laborCost and materialCost are set for each line item (preserve markup)
    if (Array.isArray(req.body.lineItems)) {
      req.body.lineItems = req.body.lineItems.map(item => {
        let laborCost = item.laborCost;
        let materialCost = item.materialCost;
        const markup = typeof item.markup !== 'undefined' ? Number(item.markup) : 0;
        if (typeof laborCost === 'undefined' && typeof item.laborRate !== 'undefined' && typeof item.laborHours !== 'undefined') {
          laborCost = (item.laborRate || 0) * (item.laborHours || 0);
        }
        if (typeof materialCost === 'undefined' && typeof item.materialRate !== 'undefined' && typeof item.materialQty !== 'undefined') {
          materialCost = (item.materialRate || 0) * (item.materialQty || 0);
        }
        return { ...item, markup, laborCost, materialCost };
      });
    }
    // Ensure paymentTerms exists with percentages if provided by client
    if (req.body.paymentTerms && Array.isArray(req.body.paymentTerms.percentages)) {
      const cleaned = req.body.paymentTerms.percentages
        .map(n => Number(n))
        .filter(n => Number.isFinite(n))
        .map(n => Math.max(0, Math.min(100, n)));
      req.body.paymentTerms = { percentages: cleaned };
    }
    const newQuote = new serverContext.Quote(req.body);
    const savedQuote = await newQuote.save();
    res.status(201).json(savedQuote);
  } catch (err) {
    console.error('Error saving quote:', err);
    res.status(500).json({ error: 'Failed to save quote' });
  }
});
}

function get_api_quotes() {
// Get all quotes
serverContext.app.get('/api/quotes', async (req, res) => {
  try {
    const quotes = await serverContext.Quote.find().sort({ createdAt: -1 });
    res.json(quotes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch quotes' });
  }
});
}

function get_api_quotes_id() {
// Get quote by ID
serverContext.app.get('/api/quotes/:id', async (req, res) => {
  try {
    const quote = await serverContext.Quote.findById(req.params.id);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

    // If paymentSchedules is missing or empty, convert legacy payments
    if ((!quote.paymentSchedules || quote.paymentSchedules.length === 0) && quote.payments && quote.payments.length > 0) {
      quote.paymentSchedules = [
        {
          name: "Default Schedule",
          description: "Imported from legacy payments",
          payments: quote.payments
        }
      ];
    }

    res.json(quote);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});
}

function post_api_quotes_id_signature() {
// Save client signature for a quote (public link endpoint)
serverContext.app.post('/api/quotes/:id/signature', async (req, res) => {
  try {
    const { name, type, imageData } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Signature name is required.' });
    }

    const normalizedType = (type === 'drawn' || type === 'typed') ? type : 'typed';

    // Optional basic size guard for data URL payloads
    if (normalizedType === 'drawn' && imageData && imageData.length > 2_000_000) {
      return res.status(400).json({ error: 'Signature image is too large.' });
    }

    const quote = await serverContext.Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    quote.signature = {
      name: name.trim(),
      type: normalizedType,
      imageData: imageData || null,
      signedAt: new Date()
    };

    // Optionally mark quote as approved when signed
    if (quote.status !== 'Approved') {
      quote.status = 'Approved';
    }

    await quote.save();

    res.json({
      message: 'Signature saved successfully.',
      quoteId: quote._id,
      status: quote.status
    });
  } catch (err) {
    console.error('Error saving quote signature:', err);
    res.status(500).json({ error: 'Failed to save signature' });
  }
});
}

function delete_api_quotes_id() {
// Delete a quote by ID
serverContext.app.delete('/api/quotes/:id', async (req, res) => {
  try {
    const deletedQuote = await serverContext.Quote.findByIdAndDelete(req.params.id);
    if (!deletedQuote) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    res.status(200).json({ message: 'Quote deleted successfully' });
  } catch (err) {
    console.error('Error deleting quote:', err);
    res.status(500).json({ error: 'Failed to delete quote' });
  }
});
}

function put_api_quotes_id() {
// Update a quote
serverContext.app.put('/api/quotes/:id', async (req, res) => {
  try {
    const quoteId = req.params.id;
    const original = await serverContext.Quote.findById(quoteId).lean();
    if (!original) return res.status(404).json({ error: 'Quote not found' });
    if (original.status !== 'Draft' || original.signature?.signedAt) {
      return res.status(409).json({ error: 'Issued or signed quote is locked. Create an editable revision.' });
    }
    const {
      to, from, quoteNumber, date, validTill, notes, lineItems, status, totals, paymentSchedules, paymentTerms // 👈 include paymentTerms
    } = req.body;

    if (!to?.name || !Array.isArray(lineItems) || lineItems.length === 0) {
      return res.status(400).json({ message: 'Missing required fields: client name or line items' });
    }

    // Ensure laborCost and materialCost are set for each line item (preserve markup)
    let processedLineItems = Array.isArray(lineItems) ? lineItems.map(item => {
      let laborCost = item.laborCost;
      let materialCost = item.materialCost;
      const markup = typeof item.markup !== 'undefined' ? Number(item.markup) : 0;
      if ((laborCost === null || typeof laborCost === 'undefined') && typeof item.laborRate !== 'undefined' && typeof item.laborHours !== 'undefined') {
        laborCost = (item.laborRate || 0) * (item.laborHours || 0);
      }
      if ((materialCost === null || typeof materialCost === 'undefined') && typeof item.materialRate !== 'undefined' && typeof item.materialQty !== 'undefined') {
        materialCost = (item.materialRate || 0) * (item.materialQty || 0);
      }
      return { ...item, markup, laborCost, materialCost };
    }) : [];

    // Same validated calculation for create/update; tax rate and amount are distinct.
    const { subtotal, discount, taxRate, taxAmount, total } = req.body.totals;

    const updateFields = {
      to, from, quoteNumber, date, validTill, notes, lineItems: processedLineItems,
      totals: { subtotal, discount, taxRate, taxAmount, tax: taxAmount, total },
      propertyDetails: req.body.propertyDetails, calculationVersion: 2
    };
    if (status) updateFields.status = status;
    if (paymentSchedules) updateFields.paymentSchedules = paymentSchedules; // 👈 add this
    if (paymentTerms && Array.isArray(paymentTerms.percentages)) {
      const cleaned = paymentTerms.percentages
        .map(n => Number(n))
        .filter(n => Number.isFinite(n))
        .map(n => Math.max(0, Math.min(100, n)));
      updateFields.paymentTerms = { percentages: cleaned };
      // 🔁 Auto-regenerate base payments schedule (legacy payments array) ONLY if no payments are Paid yet
      // and client did not explicitly send a payments array in this request.
      // This keeps existing paid history intact but syncs future milestone amounts to new percentages.
      if (!req.body.payments) {
          const existing = await serverContext.Quote.findById(quoteId).select('payments paymentTerms totals paymentSchedules').lean();
          if (existing) {
            const anyPaidLegacy = Array.isArray(existing.payments) && existing.payments.some(p => p.status === 'Paid');
            const anyPaidSchedules = Array.isArray(existing.paymentSchedules) && existing.paymentSchedules.some(s => Array.isArray(s.payments) && s.payments.some(p => p.status === 'Paid'));
            const anyPaid = anyPaidLegacy || anyPaidSchedules;
            if (!anyPaid) {
              const percsForSchedule = cleaned.slice(0, 4);
              const totalForSchedule = Number(updateFields.totals?.total || existing.totals?.total || 0);
              const stageSuffixes = [
                'at project start',
                'at 50% completion',
                'at 75% completion',
                'at final completion'
              ];
              const regeneratedPayments = percsForSchedule.map((pct, i) => ({
                label: `${pct}% ${stageSuffixes[i] || 'milestone'}`,
                amount: +(totalForSchedule * (pct / 100)).toFixed(2),
                status: 'Pending',
                date: ''
              }));
              updateFields.payments = regeneratedPayments;
              updateFields.paymentSchedules = [
                {
                  name: 'Payment Schedule',
                  description: 'Auto-generated from payment terms',
                  payments: regeneratedPayments
                }
              ];
            }
          }
      }
    }

    const updatedQuote = await serverContext.Quote.findOneAndUpdate({ _id: quoteId, status: 'Draft', 'signature.signedAt': null }, updateFields, { new: true, runValidators: true });

    if (!updatedQuote) {
      return res.status(404).json({ message: 'Quote not found' });
    }

    res.json(updatedQuote);
  } catch (err) {
    console.error('Error updating quote:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
}

function post_api_quotes_id_convert_to_job() {
// Updated /convert-to-job endpoint to proceed with job creation even if address data is incomplete
serverContext.app.post("/api/quotes/:id/convert-to-job", async (req, res) => {
  try {
    // ✅ Get raw quote data with lean()
    const quote = await serverContext.Quote.findById(req.params.id).lean();
    if (!quote) return res.status(404).json({ error: "Quote not found" });

    const fullAddress = quote.to?.address || "";
    const parsedAddress = (0, serverContext.parseAddress)(fullAddress);

    const projectName = `${parsedAddress.street.split(" ").slice(1).join(" ")} ${parsedAddress.street.split(" ")[0] || ""}`.trim() || "Unnamed Project";

    // Proceed even with incomplete address data
    const project = await serverContext.Project.create({
      name: projectName,
      code: "1111",
      type: "residential",
      status: "in-progress",
      address: {
        addressLine1: parsedAddress.street,
        addressLine2: '',
        city: parsedAddress.city,
        state: parsedAddress.state,
        zip: parsedAddress.zip
      },
      client: {
        name: quote.to?.name || "Client",
        email: quote.to?.email || "",
        phone: quote.to?.phone || "",
      },
      fromQuoteId: quote._id
    });

       // ✅ Helper to capitalize each word
       function capitalizeWords(str) {
        return str.replace(/\b\w/g, char => char.toUpperCase());
      }
  
      // ✅ Group line items by extracted room name
      const groupedByRoom = {};
  
      quote.lineItems.forEach(item => {
        let category = "General"; // Default category if no room detected
        let cleanedName = item.name.trim();
  
        if (item.name.includes("-")) {
          const parts = item.name.split("-");
          if (parts.length > 1) {
            category = capitalizeWords(parts[1].trim().toLowerCase());
            cleanedName = parts[0].trim(); // ✅ Remove room part from item name
          }
        }
  
        if (!groupedByRoom[category]) groupedByRoom[category] = [];
  
        groupedByRoom[category].push({
          type: "item",
          name: cleanedName, // ✅ Save cleaned name here
          description: item.description || "",
          costCode: item.costCode || "Uncategorized",
          quantity: item.qty || 1,
          unitPrice: item.rate || 0,
          // ✅ Treat quote labor/material fields as RATES and convert to TOTALS for estimate (rate * qty)
          laborCost: (typeof item.laborCost !== 'undefined' ? Number(item.laborCost) : 0) * (item.qty || 1),
          materialCost: (typeof item.materialCost !== 'undefined' ? Number(item.materialCost) : 0) * (item.qty || 1),
          total: (item.qty || 1) * (item.rate || 0),
          status: "in-progress",
          assignedTo: null,
          photos: {},
          startDate: null,
          endDate: null
        });
      });
  
      // ✅ Format nicely to save to estimate
      const formattedLineItems = Object.entries(groupedByRoom)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, items]) => ({
          type: "category",
          category, // Keep category as nicely formatted room name
          status: "in-progress",
          items
        }));
  


    // ✅ Create Estimate
    const estimate = await serverContext.Estimate.create({
      projectId: project._id,
      invoiceNumber: `INV-${Date.now()}`,
      title: `Estimate from Quote ${quote.quoteNumber || 'N/A'}`,
      total: quote.totals?.total || 0,
      tax: quote.totals?.tax || 0,
      status: "draft",
      lineItems: formattedLineItems,
      createdFromQuote: quote._id
    });

    // ✅ Return success
    res.status(200).json({
      success: true,
      message: "Quote converted to project and estimate",
      projectId: project._id,
      estimateId: estimate._id,
      redirectUrl: `/details/projects/${project._id}`
    });

  } catch (err) {
    console.error("Error converting quote:", err);
    res.status(500).json({ error: "Failed to convert quote" });
  }
});
}

function put_api_quotes_id_payments() {
// Update only the payments schedule for a quote
serverContext.app.put('/api/quotes/:id/payments', async (req, res) => {
  try {
    const { payments } = req.body;
    if (!Array.isArray(payments)) {
      return res.status(400).json({ message: "Payments must be an array." });
    }
    const updated = await serverContext.Quote.findByIdAndUpdate(
      req.params.id,
      { payments },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: "Quote not found" });
    res.json({ success: true, payments: updated.payments });
  } catch (err) {
    console.error("Error updating payments:", err);
    res.status(500).json({ message: "Failed to update payments" });
  }
});
}

function patch_api_quotes_id_payment_terms() {
// Update only the payment terms percentages for a quote
serverContext.app.patch('/api/quotes/:id/payment-terms', async (req, res) => {
  try {
    const { id } = req.params;
    const percs = req.body?.percentages;
    if (!Array.isArray(percs)) {
      return res.status(400).json({ message: 'percentages array is required' });
    }
    const cleaned = percs
      .map(n => Number(n))
      .filter(n => Number.isFinite(n))
      .map(n => Math.max(0, Math.min(100, n)));

  // Retrieve existing to decide whether to regenerate payments and schedules
  const existing = await serverContext.Quote.findById(id).select('payments totals paymentTerms paymentSchedules').lean();
    if (!existing) return res.status(404).json({ message: 'Quote not found' });
    const anyPaidLegacy = Array.isArray(existing.payments) && existing.payments.some(p => p.status === 'Paid');
    const anyPaidSchedules = Array.isArray(existing.paymentSchedules) && existing.paymentSchedules.some(s => Array.isArray(s.payments) && s.payments.some(p => p.status === 'Paid'));
    const anyPaid = anyPaidLegacy || anyPaidSchedules;
    const updateOps = { 'paymentTerms.percentages': cleaned };
    if (!anyPaid) {
      const totalForSchedule = Number(existing.totals?.total || 0);
      const stageSuffixes = [
        'at project start',
        'at 50% completion',
        'at 75% completion',
        'at final completion'
      ];
      const regenerated = cleaned.slice(0, 4).map((pct, i) => ({
        label: `${pct}% ${stageSuffixes[i] || 'milestone'}`,
        amount: +(totalForSchedule * (pct / 100)).toFixed(2),
        status: 'Pending',
        date: ''
      }));
      updateOps['payments'] = regenerated;
      updateOps['paymentSchedules'] = [{ name: 'Payment Schedule', description: 'Auto-generated from payment terms', payments: regenerated }];
    }

  const updated = await serverContext.Quote.findByIdAndUpdate(id, { $set: updateOps }, { new: true });
  if (!updated) return res.status(404).json({ message: 'Quote not found' });
  res.json({ paymentTerms: updated.paymentTerms || { percentages: [] }, payments: updated.payments || [], paymentSchedules: updated.paymentSchedules || [] });
  } catch (err) {
    console.error('Error updating payment terms:', err);
    res.status(500).json({ message: 'Failed to update payment terms' });
  }
});
}

return {
  post_api_quotes,
  get_api_quotes,
  get_api_quotes_id,
  post_api_quotes_id_signature,
  delete_api_quotes_id,
  put_api_quotes_id,
  post_api_quotes_id_convert_to_job,
  put_api_quotes_id_payments,
  patch_api_quotes_id_payment_terms
};
};
