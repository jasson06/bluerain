'use strict';

// A separate collection: construction Expense records and estimate allocations
// must never be read or changed by the property-management expense workspace.
module.exports = function createPropertyExpenseModel(mongoose) {
  const schema = new mongoose.Schema({
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    quickBooksImportKey: { type: String, required: true, unique: true },
    date: { type: String, required: true },
    vendor: { type: String, default: '' },
    description: { type: String, default: '' },
    category: { type: String, default: 'Uncategorized' },
    amount: { type: Number, required: true },
    receiptTotal: { type: Number, required: true },
    salesTax: { type: Number, default: 0 },
    ref: { type: String, default: '' },
    status: { type: String, enum: ['approved', 'archived'], default: 'approved' },
    source: { type: String, default: 'quickbooks' },
    quickBooks: { type: mongoose.Schema.Types.Mixed, default: {} }
  }, { timestamps: true, collection: 'property_expenses' });
  schema.index({ projectId: 1, date: 1, status: 1 });
  return mongoose.model('PropertyExpense', schema);
};
