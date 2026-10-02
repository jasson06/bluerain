// tenants flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {



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
  try {
    // Ensure leaseHolders is always an array of objects
    const leaseHolders = Array.isArray(req.body.leaseHolders)
      ? req.body.leaseHolders.filter(h => h && h.name)
      : [];

    const tenant = await serverContext.Tenant.findByIdAndUpdate(
      req.params.tenantId,
      { ...req.body, leaseHolders }, // override with validated array
      { new: true }
    );
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    res.json(tenant);
  } catch (error) {
    console.error('Error updating tenant:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function delete_api_properties_propertyId_tenants_tenantId() {
// Add this route with your other tenant routes
serverContext.app.delete('/api/properties/:propertyId/tenants/:tenantId', async (req, res) => {
    try {
        const { propertyId, tenantId } = req.params;

        // Find tenant to get unitId before deletion
        const tenant = await serverContext.Tenant.findById(tenantId);
        if (!tenant) {
            return res.status(404).json({ message: 'Tenant not found' });
        }

        // Store unitId for updating unit status
        const unitId = tenant.unitId;

        // Delete the tenant
        await serverContext.Tenant.findByIdAndDelete(tenantId);

        // If tenant was assigned to a unit, update unit status to vacant
        if (unitId) {
            await serverContext.Unit.findByIdAndUpdate(unitId, {
                status: 'vacant',
                tenant: null // Remove tenant reference
            });
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
