// expenses flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {



function delete_api_expenses_delete_receipt_file() {
// [SECTION] Expenses, invoices, and accounting sync

// Delete an uploaded expense receipt file
serverContext.app.delete('/api/expenses/delete-receipt-file', async (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'Missing filePath' });

    // Normalize and resolve the file path
    const absolutePath = (0, serverContext.resolveStoredUploadPath)(filePath);
    if (serverContext.fs.existsSync(absolutePath)) {
      serverContext.fs.unlinkSync(absolutePath);
      return res.json({ success: true, message: 'File deleted successfully.' });
    } else {
      return res.status(404).json({ error: 'File not found.' });
    }
  } catch (err) {
    console.error('Error deleting file:', err);
    res.status(500).json({ error: 'Failed to delete file.' });
  }
});
}

function get_api_expenses_missing_info() {
// GET /api/expenses/missing-info
// Returns all expenses with status "missing info" (auto-created from email/OCR)
serverContext.app.get('/api/expenses/missing-info', async (req, res) => {
  try {
    // Optionally filter by projectId if provided
    const { projectId } = req.query;
    const filter = { status: 'missing info' };
    if (projectId) filter.$or = [{ projectId }, { 'lineItems.projectId': projectId }];

    const expenses = await serverContext.Expense.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, expenses });
  } catch (err) {
    console.error('Error fetching missing info expenses:', err);
    res.status(500).json({ message: 'Failed to fetch missing info expenses.' });
  }
});
}

function post_api_expenses() {
// POST /api/expenses
serverContext.app.post("/api/expenses", async (req, res) => {
  try {
    const { projectId, item, lineItems, salesTax, date, vendor, category, description, amount, receiptTotal, status, ref, invoiceNumber, duplicateWarning, duplicateCandidates, receiptPath, receiptHash, source } = req.body;
    const cleanSource = String(source || "").trim();
    const hasAmount = amount !== undefined && amount !== null && amount !== "" && !Number.isNaN(Number(amount));
    const hasCoreParsedData = Boolean(vendor && hasAmount && date);
    const assignedProjectId = projectId || (Array.isArray(lineItems) ? lineItems.find(li => li && li.projectId)?.projectId : "") || "";
    const cleanLineItems = (0, serverContext.normalizeExpenseLineItems)(lineItems, assignedProjectId);
    const hasExpenseDetails = Boolean((item && (item.name || item.itemId || item.costCode)) || cleanLineItems.length || description);
    const isOcrLike = Boolean(receiptPath || cleanSource === "imap" || cleanSource === "ocr" || cleanSource === "ocr-upload" || status === "missing info");

    // Project assignment is optional. Incomplete/unassigned expenses are allowed in Missing Info;
    // complete saves move to Waiting for Review (pending_review) for a final user check.
    if (!isOcrLike && (!hasCoreParsedData || !hasExpenseDetails)) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const isPlaceholderCapture = isOcrLike && !projectId && (!item || (!item.itemId && !item.name));
    if (isPlaceholderCapture && receiptPath && cleanSource) {
      const exists = await serverContext.Expense.findOne({ receiptPath, source: cleanSource, status: 'missing info' });
      if (exists) {
        return res.status(409).json({ message: 'Expense already exists for this receipt.', expense: exists });
      }
    }

    const derivedTotals = (0, serverContext.deriveExpenseTotals)(cleanLineItems, salesTax, amount, receiptTotal);



    const expenseData = {


      vendor: vendor || "",
      category: category || "Uncategorized",
      description: description || "",
      amount: derivedTotals.amount,
      receiptTotal: derivedTotals.receiptTotal,
      salesTax: Number(salesTax) || 0,
      lineItems: cleanLineItems,
      date: date || new Date().toISOString().slice(0, 10),
      status: status || (assignedProjectId && hasCoreParsedData ? "pending_review" : "missing info"),
      ref: ref || invoiceNumber || "",
      invoiceNumber: invoiceNumber || ref || "",
      duplicateWarning: Boolean(duplicateWarning),
      duplicateCandidates: Array.isArray(duplicateCandidates) ? duplicateCandidates.slice(0, 5) : [],
      receiptHash: receiptHash || ""
    };

    if (receiptPath) expenseData.receiptPath = receiptPath;
    if (cleanSource) expenseData.source = cleanSource;
    if (assignedProjectId) expenseData.projectId = assignedProjectId;
    if (item && (item.itemId || item.estimateId || item.name || item.costCode)) {
      expenseData.item = {
        name: item.name || description || "Receipt item",
        costCode: item.costCode || ""
      };
      if (item.itemId) expenseData.item.itemId = item.itemId;
      if (item.estimateId) expenseData.item.estimateId = item.estimateId;
    } else if (cleanLineItems.length) {
      const firstLineItem = cleanLineItems[0];
      expenseData.item = {
        name: firstLineItem.name || firstLineItem.description || "Receipt items",
        costCode: firstLineItem.costCode || ""
      };
      if (firstLineItem.itemId) expenseData.item.itemId = firstLineItem.itemId;
      if (firstLineItem.estimateId) expenseData.item.estimateId = firstLineItem.estimateId;
    }

    const expense = await serverContext.Expense.create(expenseData);

    res.status(201).json({ success: true, expense });
  } catch (err) {
    // Handle duplicate key error from MongoDB unique index
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Expense already exists for this receipt.' });
    }
    console.error("Error creating expense:", err);
    res.status(500).json({ message: "Server error" });
  }
});
}

function get_api_expenses() {
// GET /api/expenses?projectId=123
serverContext.app.get("/api/expenses", async (req, res) => {
  try {
    const { projectId, receiptPath, source, status } = req.query;
    let filter = {};

    if (projectId) {
      filter.$or = [{ projectId }, { 'lineItems.projectId': projectId }];
    }
    if (receiptPath) {
      filter.receiptPath = receiptPath;
    }
    if (source) {
      filter.source = source;
    }
    if (status) {
      filter.status = status;
    }

    const expenses = await serverContext.Expense.find(filter).sort({ date: -1 });
    res.json({ expenses });
  } catch (err) {
    console.error("Error fetching expenses:", err);
    res.status(500).json({ message: "Server error" });
  }
});
}

function get_api_expenses_duplicates() {
// GET /api/expenses/duplicates?date=YYYY-MM-DD&amount=123.45&ref=INV-123
serverContext.app.get("/api/expenses/duplicates", async (req, res) => {
  try {
    const { date, amount, ref, vendor } = req.query;
    const or = [];
    const reasons = [];

    if (ref) {
      const escapedRef = String(ref).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const refRegex = new RegExp(`^${escapedRef}$`, 'i');
      or.push({ ref: refRegex }, { invoiceNumber: refRegex });
      reasons.push('invoice number');
    }

    const numericAmount = Number(amount);
    if (date && Number.isFinite(numericAmount)) {
      or.push({ date: String(date), amount: { $gte: numericAmount - 0.01, $lte: numericAmount + 0.01 } });
      or.push({ date: String(date), receiptTotal: { $gte: numericAmount - 0.01, $lte: numericAmount + 0.01 } });
      reasons.push('date and amount');
    }

    if (!or.length) return res.json({ success: true, duplicates: [] });

    const matches = await serverContext.Expense.find({ $or: or }).sort({ createdAt: -1 }).limit(10).lean();
    const duplicates = matches.map(exp => {
      const matchedReasons = [];
      if (ref && [exp.ref, exp.invoiceNumber].some(v => String(v || '').toLowerCase() === String(ref).toLowerCase())) {
        matchedReasons.push('invoice number');
      }
      if (date && Number.isFinite(numericAmount) && exp.date === String(date) && (
        Math.abs((Number(exp.amount) || 0) - numericAmount) <= 0.01 ||
        Math.abs((Number(exp.receiptTotal) || 0) - numericAmount) <= 0.01
      )) {
        matchedReasons.push('date and amount');
      }
      if (vendor && exp.vendor && String(exp.vendor).toLowerCase() === String(vendor).toLowerCase()) {
        matchedReasons.push('vendor');
      }
      return {
        expenseId: String(exp._id),
        vendor: exp.vendor || '',
        date: exp.date || '',
        amount: Number(exp.receiptTotal || exp.amount) || 0,
        ref: exp.ref || exp.invoiceNumber || '',
        reason: matchedReasons.length ? matchedReasons.join(', ') : reasons.join(', ')
      };
    });

    res.json({ success: true, duplicates });
  } catch (err) {
    console.error('Error checking duplicate expenses:', err);
    res.status(500).json({ success: false, message: 'Failed to check duplicate expenses.' });
  }
});
}

function get_api_expenses_id() {
serverContext.app.get("/api/expenses/:id", async (req, res) => {
  try {
    const expense = await serverContext.Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ message: "Expense not found" });

    res.json({ success: true, expense });
  } catch (err) {
    console.error("Error fetching expense:", err);
    res.status(500).json({ message: "Server error" });
  }
});
}

function put_api_expenses_id() {
serverContext.app.put("/api/expenses/:id", async (req, res) => {
  try {
    const { projectId, item, lineItems, salesTax, date, vendor, category, description, amount, receiptTotal, status, ref, invoiceNumber, duplicateWarning, duplicateCandidates, receiptPath, source, receiptHash } = req.body;
    const updateObj = {};

    const assignedProjectId = projectId || (Array.isArray(lineItems) ? lineItems.find(li => li && li.projectId)?.projectId : "") || "";
    const cleanLineItems = (0, serverContext.normalizeExpenseLineItems)(lineItems, assignedProjectId);
    const derivedTotals = (0, serverContext.deriveExpenseTotals)(cleanLineItems, salesTax, amount, receiptTotal);
    if (assignedProjectId) updateObj.projectId = assignedProjectId;
    if (date !== undefined) updateObj.date = date || new Date().toISOString().slice(0, 10);
    if (vendor !== undefined) updateObj.vendor = vendor || "";
    if (category !== undefined) updateObj.category = category || "Uncategorized";
    if (description !== undefined) updateObj.description = description || "";
    if (lineItems !== undefined || amount !== undefined) updateObj.amount = derivedTotals.amount;
    if (lineItems !== undefined || receiptTotal !== undefined || salesTax !== undefined) updateObj.receiptTotal = derivedTotals.receiptTotal;
    if (salesTax !== undefined && salesTax !== null && salesTax !== "") updateObj.salesTax = Number(salesTax) || 0;
    if (lineItems !== undefined) updateObj.lineItems = cleanLineItems;
    if (ref !== undefined) updateObj.ref = ref;
    if (invoiceNumber !== undefined) updateObj.invoiceNumber = invoiceNumber || ref || "";
    if (duplicateWarning !== undefined) updateObj.duplicateWarning = Boolean(duplicateWarning);
    if (duplicateCandidates !== undefined) updateObj.duplicateCandidates = Array.isArray(duplicateCandidates) ? duplicateCandidates.slice(0, 5) : [];
    if (receiptPath !== undefined) updateObj.receiptPath = receiptPath || "";
    if (source !== undefined) updateObj.source = String(source || "").trim();
    if (receiptHash !== undefined) updateObj.receiptHash = receiptHash || "";
    if (status) updateObj.status = status;

    if (item && (item.itemId || item.estimateId || item.name || item.costCode)) {
      updateObj.item = {
        name: item.name || description || "Receipt item",
        costCode: item.costCode || ""
      };
      if (item.itemId) updateObj.item.itemId = item.itemId;
      if (item.estimateId) updateObj.item.estimateId = item.estimateId;
    }

    if (Object.keys(updateObj).length === 0) {
      return res.status(400).json({ message: "No update fields provided" });
    }
 
    const updated = await serverContext.Expense.findByIdAndUpdate(
      req.params.id,
      updateObj,
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ message: "Expense not found" });

    res.json({ success: true, expense: updated });
  } catch (err) {
    console.error("Error updating expense:", err);
    res.status(500).json({ message: "Server error" });
  }
});
}

function delete_api_expenses_id() {
serverContext.app.delete("/api/expenses/:id", async (req, res) => {
  try {
    const deleted = await serverContext.Expense.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Expense not found" });

    res.json({ success: true, message: "Expense deleted" });
  } catch (err) {
    console.error("Error deleting expense:", err);
    res.status(500).json({ message: "Server error" });
  }
});
}

function post_api_expenses_id_recategorize_bill() {
serverContext.app.post('/api/expenses/:id/recategorize-bill', async (req, res) => {
  try {
    const expense = await serverContext.Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found' });

    const invoiceData = (0, serverContext.buildInvoiceFromExpense)(expense);
    const createdInvoice = await serverContext.Invoice.create(invoiceData);

    try {
      await serverContext.Expense.findByIdAndDelete(expense._id);
    } catch (deleteErr) {
      await serverContext.Invoice.findByIdAndDelete(createdInvoice._id).catch(() => {});
      throw deleteErr;
    }

    res.json({
      success: true,
      invoice: createdInvoice,
      previousExpenseId: String(expense._id)
    });
  } catch (err) {
    console.error('Error recategorizing expense as bill:', err);
    res.status(500).json({ message: 'Failed to re-categorize expense as bill' });
  }
});
}

function post_api_expenses_id_auto_ocr() {
// Auto-OCR endpoint: update expense with parsed OCR data from frontend
serverContext.app.post('/api/expenses/:id/auto-ocr', async (req, res) => {
  try {
    const { id } = req.params;
    const parsed = req.body;
    if (!id) return res.status(400).json({ success: false, message: 'Expense ID required.' });
    const expense = await serverContext.Expense.findById(id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });

    // Update fields if present in parsed data
    if (parsed.vendor) expense.vendor = parsed.vendor;
    if (parsed.category) expense.category = parsed.category;
    if (parsed.description) expense.description = parsed.description;
    if (parsed.amount) expense.amount = parsed.amount;
    if (parsed.date) expense.date = parsed.date;
    if (parsed.projectId) expense.projectId = parsed.projectId;
    if (parsed.item) expense.item = parsed.item;
    // If all required fields are present, move out of 'missing info'
    if (expense.vendor && expense.amount && expense.date) {
      expense.status = expense.projectId ? 'pending_review' : 'missing info';
    }
    await expense.save();
    res.json({ success: true, expense });
  } catch (err) {
    console.error('Auto-OCR expense update error:', err);
    res.status(500).json({ success: false, message: 'Failed to update expense with OCR data.' });
  }
});
}

function post_api_expenses_upload_receipt() {
serverContext.app.post('/api/expenses/upload-receipt', serverContext.upload.single('receipt'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ path: `/uploads/${req.file.filename}` });
});
}

return {
  delete_api_expenses_delete_receipt_file,
  get_api_expenses_missing_info,
  post_api_expenses,
  get_api_expenses,
  get_api_expenses_duplicates,
  get_api_expenses_id,
  put_api_expenses_id,
  delete_api_expenses_id,
  post_api_expenses_id_recategorize_bill,
  post_api_expenses_id_auto_ocr,
  post_api_expenses_upload_receipt
};
};
