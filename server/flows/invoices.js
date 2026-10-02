// invoices flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {

function normalizeInvoiceLineItems(lineItems = []) {
  return Array.isArray(lineItems) ? lineItems.map(item => {
    const total = (0, serverContext.deriveInvoiceLineItemTotal)(item);
    const rawQuantity = Number(item?.quantity);
    const quantity = rawQuantity > 0 ? rawQuantity : 1;
    const hasUnitPrice = item?.unitPrice !== undefined && item?.unitPrice !== null && item?.unitPrice !== '';
    const unitPrice = hasUnitPrice ? (Number(item.unitPrice) || 0) : (quantity > 0 ? total / quantity : total);

    return {
      ...item,
      projectId: String(item?.projectId || '').trim(),
      projectName: String(item?.projectName || '').trim(),
      projectAddress: String(item?.projectAddress || '').trim(),
      estimateId: (0, serverContext.normalizeOptionalObjectId)(item?.estimateId),
      itemId: (0, serverContext.normalizeOptionalObjectId)(item?.itemId || item?.lineItemId),
      lineItemId: (0, serverContext.normalizeOptionalObjectId)(item?.itemId || item?.lineItemId),
      name: item?.name || item?.description || 'Bill item',
      description: item?.description || '',
      costCode: item?.costCode || '',
      quantity,
      unitPrice,
      total,
      amount: total
    };
  }) : [];
}

function deriveInvoiceLineItemTotal(item = {}) {
  if (item?.total !== undefined && item?.total !== null && item?.total !== '') return Number(item.total) || 0;
  if (item?.amount !== undefined && item?.amount !== null && item?.amount !== '') return Number(item.amount) || 0;
  return (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
}

function deriveExpenseLineItemAmount(item = {}) {
  if (item?.amount !== undefined && item?.amount !== null && item?.amount !== '') return Number(item.amount) || 0;
  if (item?.total !== undefined && item?.total !== null && item?.total !== '') return Number(item.total) || 0;
  const quantity = Number(item?.quantity) || 0;
  const unitPrice = Number(item?.unitPrice) || 0;
  return quantity > 0 ? quantity * unitPrice : unitPrice;
}

function normalizeExpenseLineItems(lineItems = [], fallbackProjectId = '') {
  return Array.isArray(lineItems) ? lineItems.map(item => {
    const amount = (0, serverContext.deriveExpenseLineItemAmount)(item);
    const name = String(item?.name || item?.description || 'Receipt item').trim();
    const description = String(item?.description || item?.name || '').trim();
    return {
      projectId: String(item?.projectId || fallbackProjectId || '').trim() || undefined,
      itemId: (0, serverContext.normalizeOptionalObjectId)(item?.itemId || item?.lineItemId),
      estimateId: (0, serverContext.normalizeOptionalObjectId)(item?.estimateId),
      name,
      costCode: String(item?.costCode || '').trim(),
      description,
      amount
    };
  }).filter(item => (item.name || item.description) && Number.isFinite(item.amount)) : [];
}

function buildExpenseLineItemFromInvoiceItem(item = {}, fallbackProjectId) {
  const amount = (0, serverContext.deriveInvoiceLineItemTotal)(item);
  return {
    projectId: item.projectId || fallbackProjectId || undefined,
    itemId: item.itemId || item.lineItemId || undefined,
    estimateId: item.estimateId || undefined,
    projectName: item.projectName || '',
    projectAddress: item.projectAddress || '',
    name: item.name || item.description || 'Bill item',
    costCode: item.costCode || '',
    description: item.description || '',
    amount
  };
}

function buildInvoiceLineItemFromExpenseItem(item = {}, fallbackProjectId) {
  const total = (0, serverContext.deriveExpenseLineItemAmount)(item);
  const quantity = Math.max(1, Number(item?.quantity) || 1);
  const unitPrice = quantity > 0 ? total / quantity : total;
  return {
    projectId: item.projectId || fallbackProjectId || '',
    projectName: item.projectName || '',
    projectAddress: item.projectAddress || '',
    estimateId: item.estimateId || undefined,
    itemId: item.itemId || item.lineItemId || undefined,
    lineItemId: item.itemId || item.lineItemId || undefined,
    name: item.name || item.description || 'Expense item',
    description: item.description || '',
    costCode: item.costCode || '',
    quantity,
    unitPrice,
    total,
    amount: total
  };
}

function deriveExpenseTotals(lineItems = [], salesTax = 0, fallbackAmount = 0, fallbackReceiptTotal = 0) {
  const subtotal = Array.isArray(lineItems)
    ? lineItems.reduce((sum, item) => sum + (Number(item?.amount) || 0), 0)
    : 0;
  const normalizedSalesTax = Number(salesTax) || 0;
  const normalizedFallbackAmount = Number(fallbackAmount) || 0;
  const normalizedFallbackReceiptTotal = Number(fallbackReceiptTotal) || 0;
  const inferredSubtotalFromReceiptTotal = normalizedFallbackReceiptTotal > 0
    ? Math.max(normalizedFallbackReceiptTotal - normalizedSalesTax, 0)
    : 0;

  const subtotalAmount = subtotal > 0
    ? subtotal
    : (normalizedFallbackAmount || inferredSubtotalFromReceiptTotal);
  const receiptGrandTotal = normalizedFallbackReceiptTotal > 0
    ? normalizedFallbackReceiptTotal
    : subtotalAmount + normalizedSalesTax;
  const amountTotal = receiptGrandTotal > 0 ? receiptGrandTotal : subtotalAmount;

  return {
    amount: amountTotal,
    receiptTotal: receiptGrandTotal
  };
}

function resolveInvoiceAttachmentPath(invoice = {}) {
  return invoice?.attachmentPath || invoice?.receiptPath || invoice?.filePath || invoice?.pdfPath || invoice?.documentPath || invoice?.sourceFile || '';
}

function mapInvoiceStatusToExpenseStatus(status, hasAssignments) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'approved' || normalized === 'paid') return 'approved';
  if (normalized === 'rejected' || normalized === 'overdue') return 'rejected';
  return hasAssignments ? 'pending_review' : 'missing info';
}

function mapExpenseStatusToInvoiceStatus(status, lineItems = []) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'approved') return 'Approved';
  if (normalized === 'rejected' || normalized === 'archived') return 'Rejected';
  return (0, serverContext.invoiceLineItemsReadyForApproval)(lineItems) ? 'Pending' : 'Draft';
}

async function resolveInvoiceVendorName(vendorValue) {
  const rawValue = String(vendorValue || '').trim();
  if (!rawValue) return '';
  if (!serverContext.mongoose.Types.ObjectId.isValid(rawValue)) return rawValue;
  try {
    const vendor = await serverContext.Vendor.findById(rawValue).select('name vendorName companyName').lean();
    return vendor?.name || vendor?.vendorName || vendor?.companyName || rawValue;
  } catch {
    return rawValue;
  }
}

async function buildExpenseFromInvoice(invoice) {
  const normalizedLineItems = (0, serverContext.normalizeInvoiceLineItems)(invoice?.lineItems || []).map(item => (0, serverContext.buildExpenseLineItemFromInvoiceItem)(item, invoice?.projectId));
  const lineItems = normalizedLineItems.length ? normalizedLineItems : [{
    projectId: invoice?.projectId || undefined,
    name: invoice?.invoiceNumber || 'Bill item',
    costCode: '',
    description: '',
    amount: Number(invoice?.total) || 0
  }];
  const projectId = lineItems.find(item => item.projectId)?.projectId || invoice?.projectId || undefined;
  const vendorName = await (0, serverContext.resolveInvoiceVendorName)(invoice?.vendorId);
  const receiptTotal = Number(invoice?.total) || lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const salesTax = Number(invoice?.tax) || 0;
  const attachmentPath = (0, serverContext.resolveInvoiceAttachmentPath)(invoice);
  return {
    projectId,
    vendor: vendorName,
    category: 'Bill',
    description: invoice?.invoiceNumber ? `Re-categorized from bill ${invoice.invoiceNumber}` : 'Re-categorized from bill',
    amount: receiptTotal,
    receiptTotal,
    salesTax,
    date: invoice?.date || new Date().toISOString().slice(0, 10),
    status: (0, serverContext.mapInvoiceStatusToExpenseStatus)(invoice?.status, lineItems.some(item => item.projectId && item.estimateId && item.itemId)),
    ref: invoice?.invoiceNumber || '',
    invoiceNumber: invoice?.invoiceNumber || '',
    source: 'recategorized-bill',
    receiptPath: attachmentPath,
    lineItems,
    item: {
      itemId: lineItems[0]?.itemId,
      estimateId: lineItems[0]?.estimateId,
      name: lineItems[0]?.name || 'Bill item',
      costCode: lineItems[0]?.costCode || ''
    }
  };
}

function buildInvoiceFromExpense(expense) {
  const baseLineItems = Array.isArray(expense?.lineItems) && expense.lineItems.length
    ? expense.lineItems
    : [{
        projectId: expense?.projectId || '',
        quantity: 1,
        unitPrice: Number(expense?.amount) || 0,
        itemId: expense?.item?.itemId || '',
        estimateId: expense?.item?.estimateId || '',
        name: expense?.item?.name || 'Expense item',
        costCode: expense?.item?.costCode || '',
        description: expense?.description || '',
        amount: Number(expense?.amount) || 0
      }];
  const normalizedLineItems = (0, serverContext.normalizeInvoiceLineItems)(baseLineItems).map(item => (0, serverContext.buildInvoiceLineItemFromExpenseItem)(item, expense?.projectId));
  const tax = Number(expense?.salesTax) || 0;
  const subtotal = normalizedLineItems.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
  const total = subtotal + tax;
  return {
    projectId: normalizedLineItems.find(item => item.projectId)?.projectId || expense?.projectId || '',
    vendorId: String(expense?.vendor || '').trim(),
    invoiceNumber: String(expense?.invoiceNumber || expense?.ref || `EXP-${Date.now().toString().slice(-6)}`),
    date: expense?.date || new Date().toISOString().slice(0, 10),
    attachmentPath: expense?.receiptPath || '',
    tax,
    lineItems: normalizedLineItems,
    total,
    status: (0, serverContext.mapExpenseStatusToInvoiceStatus)(expense?.status, normalizedLineItems)
  };
}

async function ensureExpenseReceiptIndexAllowsLineItems() {
  try {
    const indexes = await serverContext.Expense.collection.indexes();
    const receiptIndex = indexes.find(index =>
      index.key && index.key.receiptPath === 1 && index.key.source === 1 && index.unique
    );
    if (receiptIndex) {
      await serverContext.Expense.collection.dropIndex(receiptIndex.name);
      await serverContext.Expense.collection.createIndex({ receiptPath: 1, source: 1 });
      console.log('Updated Expense receipt index to allow multiple line items per receipt.');
    }
  } catch (err) {
    console.warn('Could not verify Expense receipt index:', err.message);
  }
}

function post_api_send() {
// ✅ Send invoice via email (PDF attached)
serverContext.app.post('/api/send', serverContext.memoryUpload.single('pdf'), async (req, res) => {
  const { invoiceId } = req.body;
  const pdfFile = req.file;

  // 🛡 Validation
  if (!invoiceId) {
    console.warn("⚠️ Missing invoiceId");
    return res.status(400).json({ message: "Missing invoiceId" });
  }

  if (!pdfFile || !pdfFile.buffer) {
    console.warn("⚠️ Missing or invalid PDF file");
    return res.status(400).json({ message: "Missing PDF attachment" });
  }

  try {
    const invoice = await serverContext.Invoice.findById(invoiceId);
    if (!invoice) {
      console.warn(`❌ Invoice not found for ID: ${invoiceId}`);
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // ✅ Default recipients (hardcoded)
    const recipients = [
      "besf.jasson@gmail.com",
      "VonleoInc@adaptive.build"
    ];

    const mailOptions = {
      from: `"BESF Team" <${process.env.EMAIL_USER}>`,
      to: recipients,
      subject: `Invoice #${invoice.invoiceNumber}`,
      html: `
        <p>Hello,</p>
        <p>Please find attached invoice <strong>${invoice.invoiceNumber}</strong>.</p>
        <p>Thank you,<br><strong>BESF Team</strong></p>
      `,
      attachments: [
        {
          filename: `Invoice-${invoice.invoiceNumber}.pdf`,
          content: pdfFile.buffer,
          contentType: 'application/pdf'
        }
      ]
    };

    const info = await serverContext.transporter.sendMail(mailOptions);
    console.log(`✅ Invoice sent to: ${recipients.join(', ')} | ID: ${info.messageId}`);

    res.status(200).json({ message: `Invoice sent to: ${recipients.join(', ')}` });
  } catch (err) {
    console.error('❌ Failed to send invoice email:', err);
    res.status(500).json({ message: 'Failed to send invoice', error: err.message });
  }
});
}

function post_api_create() {
// Create a new invoice
serverContext.app.post('/api/create', async (req, res) => {
  try {
    const {
      projectId,
      email,
      invoiceNumber,
      date,
      lineItems,
      total,
      from,
      to,
      vendorId,
      attachmentPath
    } = req.body;

    if (!projectId || !invoiceNumber || !lineItems?.length) {
      return res.status(400).json({ message: 'Missing required invoice fields.' });
    }

    const normalizedLineItems = (0, serverContext.normalizeInvoiceLineItems)(lineItems).map(item => ({
      ...item,
      estimateId: item.estimateId ? item.estimateId : undefined,
      itemId: item.itemId ? item.itemId : undefined,
      lineItemId: item.itemId ? item.itemId : undefined,
      projectId: item.projectId || projectId || ''
    }));

    const primaryProjectId = normalizedLineItems.find(item => item.projectId)?.projectId || projectId;

    const invoice = new serverContext.Invoice({
      vendorId: vendorId || '',
      projectId: primaryProjectId,
      email,
      invoiceNumber,
      date,
      from,
      to,
      attachmentPath: attachmentPath || '',
      lineItems: normalizedLineItems,
      total: normalizedLineItems.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0),
      status: (0, serverContext.invoiceLineItemsReadyForApproval)(normalizedLineItems) ? 'Pending' : 'Draft'
    });

    const savedInvoice = await invoice.save();
    res.status(201).json(savedInvoice);
  } catch (err) {
    console.error('❌ Error saving invoice:', err);
    res.status(500).json({ message: 'Failed to create invoice', error: err.message });
  }
});
}

function get_api_invoices() {
// ✅ GET invoices filtered by projectId WITH project name
serverContext.app.get('/api/invoices', async (req, res) => {
  const { projectId } = req.query;

  try {
    let query = {};
    if (projectId) {
      query = {
        $or: [
          { projectId },
          { 'lineItems.projectId': projectId }
        ]
      };
    }

    // Populate both project name and vendor name
    const invoices = await serverContext.Invoice.find(query)
      .populate('projectId', 'name')
      .populate('vendorId', 'name'); // <-- This ensures vendorId is an object with .name

    res.json({ invoices });
  } catch (err) {
    console.error("❌ Error fetching invoices:", err);
    res.status(500).json({ message: "Server error" });
  }
});
}

function patch_api_invoices_id() {
// PATCH /api/invoices/:id
serverContext.app.patch('/api/invoices/:id', async (req, res) => {
  const { id } = req.params;
  const updateFields = {};
  let existingInvoice = null;
  // Only update fields that are present in the request body
  const allowedFields = [
    'status', 'projectId', 'vendorId', 'date', 'total', 'tax', 'lineItems', 'invoiceNumber', 'from', 'to', 'email', 'attachmentPath'
  ];
  for (const key of allowedFields) {
    if (req.body[key] !== undefined) {
      updateFields[key] = req.body[key];
    }
  }
  // If projectId or vendorId are present, convert to ObjectId
  if (updateFields.projectId) {
    try { updateFields.projectId = new serverContext.mongoose.Types.ObjectId(updateFields.projectId); } catch {}
  }
  if (updateFields.vendorId) {
    try { updateFields.vendorId = new serverContext.mongoose.Types.ObjectId(updateFields.vendorId); } catch {}
  }
  if (updateFields.lineItems) {
    updateFields.lineItems = (0, serverContext.normalizeInvoiceLineItems)(updateFields.lineItems);
    if (!updateFields.projectId) {
      updateFields.projectId = updateFields.lineItems.find(item => item.projectId)?.projectId || updateFields.projectId;
    }
    if (req.body.status === undefined) {
      existingInvoice = await serverContext.Invoice.findById(id).select('status').lean();
      const existingStatus = String(existingInvoice?.status || '').trim();
      updateFields.status = existingStatus || ((0, serverContext.invoiceLineItemsReadyForApproval)(updateFields.lineItems) ? 'Pending' : 'Draft');
    }
  }
  // If lineItems present, recalculate total if not explicitly set
  if (updateFields.lineItems && updateFields.total === undefined) {
    const subtotal = updateFields.lineItems.reduce((sum, i) => sum + ((typeof i.total !== 'undefined') ? Number(i.total) : (Number(i.quantity) * (parseFloat(i.unitPrice) || 0))), 0);
    updateFields.total = subtotal + (Number(updateFields.tax) || 0);
  }
  try {
    const updated = await serverContext.Invoice.findByIdAndUpdate(id, updateFields, { new: true });
    if (!updated) return res.status(404).json({ message: "Invoice not found" });

    // --- Update billed field for each estimate line item ---
    if (updateFields.lineItems) {
      // Get all unique estimateId/itemId pairs in this invoice
      const uniquePairs = Array.from(
        new Set(
          updateFields.lineItems
            .filter(li => li.estimateId && li.itemId)
            .map(li => `${li.estimateId}|${li.itemId}`)
        )
      );
      for (const pair of uniquePairs) {
        const [estimateId, itemId] = pair.split('|');
        // Calculate total billed for this item across all invoices
        const allInvoices = await serverContext.Invoice.find({
          "lineItems.estimateId": estimateId,
          "lineItems.itemId": itemId
        });
        const billedTotal = allInvoices.reduce((sum, inv) => {
          const item = (inv.lineItems || []).find(
            i => i.estimateId?.toString() === estimateId && i.itemId?.toString() === itemId
          );
          return sum + (item ? Number(item.total) : 0);
        }, 0);

        await serverContext.Estimate.updateOne(
          { _id: estimateId, "lineItems.items._id": itemId },
          { $set: { "lineItems.$[].items.$[item].billed": billedTotal } },
          { arrayFilters: [{ "item._id": itemId }] }
        );
      }
    }

    res.json({ success: true, invoice: updated });
  } catch (err) {
    console.error("Error updating invoice:", err);
    const isValidationError = err?.name === 'ValidationError' || err?.name === 'CastError';
    res.status(isValidationError ? 400 : 500).json({
      message: isValidationError
        ? 'Bill saved with missing assignments is allowed, but one or more line items contained invalid values. Please review the project, estimate, and line item selections and try again.'
        : 'Unable to save bill right now. Please try again.'
    });
  }
});
}

function delete_api_invoices_id() {
// DELETE invoice by ID
serverContext.app.delete('/api/invoices/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const deletedInvoice = await serverContext.Invoice.findByIdAndDelete(id);
    if (!deletedInvoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    res.json({ message: 'Invoice deleted successfully', deletedInvoice });
  } catch (err) {
    console.error('❌ Error deleting invoice:', err);
    res.status(500).json({ message: 'Failed to delete invoice', error: err.message });
  }
});
}

function post_api_invoices_id_recategorize_expense() {
serverContext.app.post('/api/invoices/:id/recategorize-expense', async (req, res) => {
  try {
    const invoice = await serverContext.Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    const expenseData = await (0, serverContext.buildExpenseFromInvoice)(invoice);
    const createdExpense = await serverContext.Expense.create(expenseData);

    try {
      await serverContext.Invoice.findByIdAndDelete(invoice._id);
    } catch (deleteErr) {
      await serverContext.Expense.findByIdAndDelete(createdExpense._id).catch(() => {});
      throw deleteErr;
    }

    res.json({
      success: true,
      expense: createdExpense,
      previousInvoiceId: String(invoice._id)
    });
  } catch (err) {
    console.error('Error recategorizing invoice as expense:', err);
    res.status(500).json({ message: 'Failed to re-categorize invoice as expense' });
  }
});
}

function get_api_invoices_by_number_invoiceNumber() {
// ✅ Get a single invoice by ID
serverContext.app.get('/api/invoices/by-number/:invoiceNumber', async (req, res) => {
  try {
    const invoice = await serverContext.Invoice.findOne({ invoiceNumber: req.params.invoiceNumber })
      .populate('projectId'); // populate project if needed

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    res.json({ invoice });
  } catch (err) {
    console.error('❌ Error fetching invoice:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function post_api_invoices() {
// Create Invoice (Bill) - Add missing POST /api/invoices endpoint
serverContext.app.post('/api/invoices', async (req, res) => {
  try {
    const { vendor, ref, date, lineItems, attachmentPath, tax, total } = req.body;
    if (!vendor || !date || !Array.isArray(lineItems) || lineItems.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const normalizedLineItems = (0, serverContext.normalizeInvoiceLineItems)(lineItems);
    const subtotal = normalizedLineItems.reduce((sum, li) => sum + (Number(li.total) || 0), 0);
    const normalizedTax = Number(tax) || 0;
    const normalizedTotal = Number(total) || (subtotal + normalizedTax);
    const projectId = normalizedLineItems.find(item => item.projectId)?.projectId || undefined;
    const invoice = new serverContext.Invoice({
      vendorId: vendor,
      projectId: projectId,
      invoiceNumber: ref,
      date,
      attachmentPath: attachmentPath || '',
      tax: normalizedTax,
      lineItems: normalizedLineItems.map(li => {
        return {
          projectId: li.projectId,
          estimateId: li.estimateId || undefined,
          itemId: li.itemId || li.lineItemId || undefined,
          name: li.name || li.description || 'Bill item',
          costCode: li.costCode || '',
          description: li.description,
          total: Number(li.total) || 0,
          quantity: Math.max(1, Number(li.quantity) || 1),
          unitPrice: Number(li.unitPrice) || 0
        };
      }),
      total: normalizedTotal,
      status: (0, serverContext.invoiceLineItemsReadyForApproval)(normalizedLineItems) ? 'Pending' : 'Draft',
      createdAt: new Date()
    });
    await invoice.save();
    res.status(201).json({ invoice });
  } catch (err) {
    console.error('❌ Error creating invoice:', err);
    const isValidationError = err?.name === 'ValidationError' || err?.name === 'CastError';
    res.status(isValidationError ? 400 : 500).json({
      error: isValidationError
        ? 'Bill could not be saved because one or more line items contained invalid values. Missing project, estimate, and line item assignments are allowed, but invalid IDs are not.'
        : 'Failed to create invoice'
    });
  }
});
}

function get_history() {
// Get invoice history
serverContext.app.get('/history', async (req, res) => {
  const { vendorId } = req.query;

  try {
    const query = vendorId ? { vendorId } : {}; // Filter if vendorId is passed
    const invoices = await serverContext.Invoice.find(query).sort({ createdAt: -1 });
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch invoice history', error: err });
  }
});
}

return {
  normalizeInvoiceLineItems,
  deriveInvoiceLineItemTotal,
  deriveExpenseLineItemAmount,
  normalizeExpenseLineItems,
  buildExpenseLineItemFromInvoiceItem,
  buildInvoiceLineItemFromExpenseItem,
  deriveExpenseTotals,
  resolveInvoiceAttachmentPath,
  mapInvoiceStatusToExpenseStatus,
  mapExpenseStatusToInvoiceStatus,
  resolveInvoiceVendorName,
  buildExpenseFromInvoice,
  buildInvoiceFromExpense,
  ensureExpenseReceiptIndexAllowsLineItems,
  post_api_send,
  post_api_create,
  get_api_invoices,
  patch_api_invoices_id,
  delete_api_invoices_id,
  post_api_invoices_id_recategorize_expense,
  get_api_invoices_by_number_invoiceNumber,
  post_api_invoices,
  get_history
};
};
