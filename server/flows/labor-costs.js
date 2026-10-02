// labor costs flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {

// Create a new labor item
// Small helper to normalize calcMode inputs coming from CSV/imports/UI
function normalizeCalcMode(val) {
  if (!val || typeof val !== 'string') return undefined;
  const s = val.toString().trim().toLowerCase();
  // Common synonyms
  if (['each', 'ea', 'unit', 'count', 'per item'].includes(s)) return 'each';
  if (['sqft', 'sf', 'sq ft', 'square foot', 'square feet'].includes(s)) return 'sqft';
  if (['lnft', 'lf', 'ln ft', 'linear ft', 'linear foot', 'linear feet'].includes(s)) return 'lnft';
  if (['hour', 'hr', 'hrs', 'hours'].includes(s)) return 'hour';
  // Domain-specific fallbacks (treat certain descriptors as per-each by default)
  if (['exhaust vent', 'vent', 'grille', 'register'].includes(s)) return 'each';
  return undefined; // let schema default apply or validation catch truly invalid values
}

function get_api_labor_costs() {
// Get all labor cost suggestions
serverContext.app.get('/api/labor-costs', async (req, res) => {
  try {
    const items = await serverContext.LaborCost.find().sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    console.error('Error fetching labor costs:', err);
    res.status(500).json({ error: 'Failed to fetch labor costs' });
  }
});
}

function post_api_labor_costs() {
serverContext.app.post('/api/labor-costs', async (req, res) => {
  try {
    const body = { ...req.body };
    // Normalize calcMode if provided or salvage from description-like values
    const normalized = (0, serverContext.normalizeCalcMode)(body.calcMode || body.unit || body.name || body.description);
    if (normalized) {
      body.calcMode = normalized;
    } else if (typeof body.calcMode !== 'undefined') {
      // Remove invalid value so schema default can apply
      delete body.calcMode;
    }

    const newItem = new serverContext.LaborCost(body);
    const saved = await newItem.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error('Error saving labor cost:', err);
    if (err && err.name === 'ValidationError') {
      return res.status(400).json({ error: 'Validation failed', details: err.errors || {} });
    }
    res.status(500).json({ error: 'Failed to save labor cost' });
  }
});
}

function put_api_labor_costs_id() {
// Update a labor item
serverContext.app.put('/api/labor-costs/:id', async (req, res) => {
  try {
    // Fetch existing doc so we can fall back to stored values when the request omits fields
    const existing = await serverContext.LaborCost.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Labor item not found' });

    const incoming = { ...(req.body || {}) };
    // Normalize calcMode if present
    if (typeof incoming.calcMode !== 'undefined') {
      const normalized = (0, serverContext.normalizeCalcMode)(incoming.calcMode);
      if (normalized) incoming.calcMode = normalized;
      else delete incoming.calcMode; // allow default
    }
    const laborRate = typeof incoming.laborRate !== 'undefined' ? Number(incoming.laborRate) : (existing.laborRate || 0);
    const laborHoursRaw = typeof incoming.laborHours !== 'undefined' ? Number(incoming.laborHours) : (existing.laborHours || 0);
    const materialRate = typeof incoming.materialRate !== 'undefined' ? Number(incoming.materialRate) : (existing.materialRate || 0);
    const materialQtyRaw = typeof incoming.materialQty !== 'undefined' ? Number(incoming.materialQty) : (existing.materialQty || 0);
    const markup = typeof incoming.markup !== 'undefined' ? Number(incoming.markup) : (existing.markup || 0);
    const markupMode = typeof incoming.markupMode !== 'undefined' ? incoming.markupMode : (existing.markupMode || 'percent');
    const baseRate = typeof incoming.baseRate !== 'undefined' ? Number(incoming.baseRate) : (existing.baseRate || 0);

    const hasLabor = !!(laborRate && laborRate !== 0);
    const hasMaterial = !!(materialRate && materialRate !== 0);
    const laborHours = hasLabor ? (laborHoursRaw ?? 1) : laborHoursRaw || 0;
    const materialQty = hasMaterial ? (materialQtyRaw ?? 1) : materialQtyRaw || 0;

    let laborCost = 0;
    let materialCost = 0;
    let baseSubtotal = 0;
    if (hasLabor || hasMaterial) {
      laborCost = (laborRate || 0) * laborHours;
      materialCost = (materialRate || 0) * materialQty;
      baseSubtotal = laborCost + materialCost;
    } else {
      // Manual base rate path
      baseSubtotal = baseRate || 0;
      laborCost = baseSubtotal;
      materialCost = 0;
    }

    const totalCost = (markupMode === 'amount')
      ? baseSubtotal + (markup || 0)
      : baseSubtotal * (1 + (markup || 0) / 100);

    // Build update object merging incoming fields but ensuring derived fields are correct
    const updateObj = Object.assign({}, incoming, {
      laborRate,
      laborHours,
      materialRate,
      materialQty,
      markup,
      markupMode,
      baseRate,
      laborCost,
      materialCost,
      totalCost
    });

    // Use findByIdAndUpdate with the merged update object and return the new doc
    const updated = await serverContext.LaborCost.findByIdAndUpdate(req.params.id, updateObj, { new: true, runValidators: true });
    res.json(updated);
  } catch (err) {
    console.error('Error updating labor cost:', err);
    if (err && err.name === 'ValidationError') {
      return res.status(400).json({ error: 'Validation failed', details: err.errors || {} });
    }
    res.status(500).json({ error: 'Failed to update labor cost' });
  }
});
}

function delete_api_labor_costs_id() {
// Delete a labor item
serverContext.app.delete('/api/labor-costs/:id', async (req, res) => {
  try {
    const deleted = await serverContext.LaborCost.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Labor item not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting labor cost:', err);
    res.status(500).json({ error: 'Failed to delete labor cost' });
  }
});
}

return {
  get_api_labor_costs,
  normalizeCalcMode,
  post_api_labor_costs,
  put_api_labor_costs_id,
  delete_api_labor_costs_id
};
};
