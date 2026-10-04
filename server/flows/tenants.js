// tenants flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {
const tenantLifecycle = require('../tenant-lifecycle');
const paymentBalances = require('../payment-balances')(serverContext);


function get_api_properties_propertyId_tenants() {
// Tenant Routes
serverContext.app.get('/api/properties/:propertyId/tenants', async (req, res) => {
  try {
    const tenants = await serverContext.Tenant.find({ projectId: req.params.propertyId })
      .populate('unitId');
    res.json(tenants);
  } catch (error) {
    console.error('Error fetching tenants:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function post_api_properties_propertyId_tenants() {
serverContext.app.post('/api/properties/:propertyId/tenants', async (req, res) => {
  try {
    if (req.body.leaseStatus === 'terminated') return res.status(400).json({ message: 'Create the tenant first, then use Terminate lease to review the final charge and possession' });
    // Ensure leaseHolders is always an array of objects
    const leaseHolders = Array.isArray(req.body.leaseHolders)
      ? req.body.leaseHolders.filter(h => h && h.name)
      : [];

    const tenant = new serverContext.Tenant({
      projectId: req.params.propertyId,
      ...req.body,
      leaseHolders // override with validated array
    });
    await tenant.save();

    // Update unit's tenant reference if unitId is provided
    if (req.body.unitId) {
      await serverContext.Unit.findByIdAndUpdate(req.body.unitId, {
        status: 'occupied',
        tenant: tenant._id
      });
    }

    res.status(201).json(tenant);
  } catch (error) {
    console.error('Error creating tenant:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function put_api_properties_propertyId_tenants_tenantId() {
serverContext.app.put('/api/properties/:propertyId/tenants/:tenantId', async (req, res) => {
  let session;
  try {
    const scope = { _id: req.params.tenantId, projectId: req.params.propertyId };
    const existing = await serverContext.Tenant.findOne(scope);
    if (!existing) return res.status(404).json({ message: 'Tenant not found' });
    if (req.body.termination !== undefined) {
      let termination;
      try { termination = tenantLifecycle.reviewedTermination(existing, req.body.termination); }
      catch (error) { return res.status(400).json({ message: error.message }); }
      session = await serverContext.mongoose.startSession();
      await session.withTransaction(async () => {
        const tenant = await serverContext.Tenant.findOne(scope).session(session);
        if (!tenant) throw new Error('Tenant no longer exists');
        termination = tenantLifecycle.reviewedTermination(tenant, req.body.termination);
        if (tenant.termination?.possessionReturned && !termination.possessionReturned) throw new Error('Possession return cannot be undone through termination');
        if (tenant.termination?.effectiveDate && new Date(tenant.termination.effectiveDate).getTime() !== termination.effectiveDate.getTime()) throw new Error('The reviewed termination date cannot be changed');
        tenant.termination = termination;
        tenant.leaseStatus = 'terminated';
        tenant.leaseRenewal = 'terminate';
        const period = `${termination.effectiveDate.getFullYear()}-${String(termination.effectiveDate.getMonth() + 1).padStart(2, '0')}`;
        if (!tenant.monthlyOverrides) tenant.monthlyOverrides = new Map();
        const previous = tenant.monthlyOverrides.get(period);
        tenant.monthlyOverrides.set(period, { ...(previous?.toObject ? previous.toObject() : previous), expectedRent: termination.finalRent });
        await tenant.save({ session });
        if (termination.possessionReturned && tenant.unitId) {
          await serverContext.Unit.updateOne(
            { _id: tenant.unitId, projectId: req.params.propertyId, tenant: tenant._id },
            { $set: { status: termination.unitDisposition, tenant: null } }, { session }
          );
        }
        await paymentBalances.refreshTenant(tenant._id, session);
      });
      return res.json(await serverContext.Tenant.findOne(scope));
    }
    if (req.body.leaseStatus === 'terminated' && existing.leaseStatus !== 'terminated') return res.status(400).json({ message: 'Use Terminate lease to review the final charge and possession' });
    if (existing.termination?.effectiveDate && req.body.leaseStatus && req.body.leaseStatus !== 'terminated') return res.status(400).json({ message: 'Create a new lease record instead of reactivating a terminated lease' });
    if (existing.termination?.effectiveDate) {
      const changedHistory = ['unitId','leaseStart','leaseEnd','baseRent','waterFee','trashFee','adminFee'].some(key => {
        if (req.body[key] === undefined) return false;
        if (key === 'leaseStart' || key === 'leaseEnd') return String(req.body[key] || '').slice(0,10) !== (existing[key] ? new Date(existing[key]).toISOString().slice(0,10) : '');
        return String(req.body[key] ?? '') !== String(existing[key] ?? '');
      });
      const oldRent = serverContext.computeTenantPostedMonthlyRent(existing);
      const newRent = serverContext.computeTenantPostedMonthlyRent({...existing.toObject(),...req.body});
      if (changedHistory || oldRent !== newRent) return res.status(400).json({message:'Keep the terminated lease charges and unit history unchanged. Use Review termination for final rent or possession.'});
    }
    const desiredUnit = req.body.unitId === undefined ? existing.unitId : req.body.unitId;
    const desiredStatus = req.body.leaseStatus || existing.leaseStatus;
    if (desiredUnit && !['terminated','expired'].includes(desiredStatus)) {
      const unit = await serverContext.Unit.findOne({_id:desiredUnit,projectId:req.params.propertyId});
      if (!unit || (unit.tenant && String(unit.tenant) !== String(existing._id))) return res.status(409).json({message:'Choose a unit in this property that is not assigned to another tenant'});
    }
    // Ensure leaseHolders is always an array of objects
    const leaseHolders = Array.isArray(req.body.leaseHolders)
      ? req.body.leaseHolders.filter(h => h && h.name)
      : (existing.leaseHolders || []);

    session = await serverContext.mongoose.startSession();
    let tenant;
    await session.withTransaction(async () => {
      const current = await serverContext.Tenant.findOne(scope).session(session);
      if (!current) throw new Error('Tenant no longer exists');
      if (current.termination?.effectiveDate && (!existing.termination?.effectiveDate || desiredStatus !== 'terminated')) throw new Error('The lease was terminated. Reload the tenant before editing.');
      tenant = await serverContext.Tenant.findOneAndUpdate(
        scope, { ...req.body, leaseHolders }, { new: true, runValidators: true, session }
      );
      const oldUnitId = String(current.unitId || ''), newUnitId = String(tenant.unitId || '');
      if (oldUnitId !== newUnitId && oldUnitId && !tenantLifecycle.isFormerTenant(current)) {
        await serverContext.Unit.updateOne({ _id: oldUnitId, projectId: req.params.propertyId, tenant: current._id }, { $set: { status: 'vacant', tenant: null } }, {session});
      }
      if (newUnitId && !tenantLifecycle.isFormerTenant(tenant)) {
        const result = await serverContext.Unit.updateOne(
          { _id: newUnitId, projectId: req.params.propertyId, $or: [{ tenant: tenant._id }, { tenant: null }] },
          { $set: { status: 'occupied', tenant: tenant._id } }, {session}
        );
        if (!result.matchedCount) throw new Error('Unit belongs to another tenant. No changes were saved.');
      }
    });
    res.json(tenant);
  } catch (error) {
    console.error('Error updating tenant:', error);
    res.status(500).json({ message: error.message || 'Unable to update tenant' });
  } finally {
    if (session) await session.endSession();
  }
});
}

function delete_api_properties_propertyId_tenants_tenantId() {
// Add this route with your other tenant routes
serverContext.app.delete('/api/properties/:propertyId/tenants/:tenantId', async (req, res) => {
    try {
        const { propertyId, tenantId } = req.params;

        // Find tenant to get unitId before deletion
        const tenant = await serverContext.Tenant.findOne({_id:tenantId,projectId:propertyId});
        if (!tenant) {
            return res.status(404).json({ message: 'Tenant not found' });
        }
        if (tenantLifecycle.isFormerTenant(tenant) || await serverContext.Payment.exists({tenantId:tenant._id})) return res.status(409).json({message:'Keep tenants with former leases or payment history. Use termination instead of deleting the ledger.'});

        // Store unitId for updating unit status
        const unitId = tenant.unitId;

        // Delete the tenant
        await serverContext.Tenant.findByIdAndDelete(tenantId);

        // If tenant was assigned to a unit, update unit status to vacant
        if (unitId) {
            await serverContext.Unit.updateOne({_id:unitId,projectId:propertyId,tenant:tenant._id}, {$set:{status:'vacant',tenant:null}});
        }

        res.json({ message: 'Tenant deleted successfully' });
    } catch (error) {
        console.error('Error deleting tenant:', error);
        res.status(500).json({ message: 'Server error' });
    }
});
}

function post_api_tenants_id_notes() {
// Tenant Notes Routes (portfolio-level, not scoped by property)
serverContext.app.post('/api/tenants/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    let { text } = req.body || {};
    text = (text || '').trim();
    if (!text) {
      return res.status(400).json({ message: 'Note text is required' });
    }

    const updated = await serverContext.Tenant.findByIdAndUpdate(
      id,
      { $push: { notesHistory: { text, createdAt: new Date() } } },
      { new: true }
    ).select('notesHistory').lean();

    if (!updated) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    return res.json({ notes: updated.notesHistory || [] });
  } catch (err) {
    console.error('Append tenant note error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
}

function delete_api_tenants_id_notes_noteId() {
serverContext.app.delete('/api/tenants/:id/notes/:noteId', async (req, res) => {
  try {
    const { id, noteId } = req.params;
    const updated = await serverContext.Tenant.findByIdAndUpdate(
      id,
      { $pull: { notesHistory: { _id: noteId } } },
      { new: true }
    ).select('notesHistory').lean();

    if (!updated) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    return res.json({ notes: updated.notesHistory || [] });
  } catch (err) {
    console.error('Delete tenant note error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
}

function put_api_tenants_id_move_in_checklist() {
// PUT: update move-in readiness checklist for a tenant
serverContext.app.put('/api/tenants/:id/move-in-checklist', async (req, res) => {
  try {
    const { id } = req.params;
    const { completedIds, notes } = req.body || {};

    const update = {};
    if (Array.isArray(completedIds)) {
      update.moveInChecklistCompleted = completedIds.filter(v => typeof v === 'string' && v.trim().length > 0);
    }
    if (notes && typeof notes === 'object') {
      const cleanNotes = {};
      for (const [key, val] of Object.entries(notes)) {
        if (typeof val === 'string') {
          const trimmed = val.trim();
          if (trimmed) cleanNotes[key] = trimmed;
        }
      }
      update.moveInChecklistNotes = cleanNotes;
    }

    const updated = await serverContext.Tenant.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true }
    ).select('moveInChecklistCompleted moveInChecklistNotes');

    if (!updated) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    return res.json({
      message: 'Move-in checklist updated',
      completedIds: updated.moveInChecklistCompleted || [],
      notes: updated.moveInChecklistNotes || {}
    });
  } catch (err) {
    console.error('Update tenant move-in checklist error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
}

return {
  get_api_properties_propertyId_tenants,
  post_api_properties_propertyId_tenants,
  put_api_properties_propertyId_tenants_tenantId,
  delete_api_properties_propertyId_tenants_tenantId,
  post_api_tenants_id_notes,
  delete_api_tenants_id_notes_noteId,
  put_api_tenants_id_move_in_checklist
};
};
