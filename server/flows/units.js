// units flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {



function get_api_properties_id_units() {
// Update these routes to handle both Project and Property models

// Get property/project units
// Update the routes to handle units directly
serverContext.app.get('/api/properties/:id/units', async (req, res) => {
  try {
    const { id } = req.params;

    // Find the project
    const project = await serverContext.Project.findById(id);
    if (!project) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // Find all units for this project
    const units = await serverContext.Unit.find({ projectId: id });

    res.json({ 
      property: {
        _id: project._id,
        name: project.name,
        type: "Multifamily",
        address: {
          line1: project.address?.addressLine1 || '',
          line2: project.address?.addressLine2 || '',
          city: project.address?.city || '',
          state: project.address?.state || '',
          zip: project.address?.zip || ''
        },
        units: units
      }
    });
  } catch (error) {
    console.error('Error fetching property units:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function post_api_properties_id_units() {
serverContext.app.post('/api/properties/:id/units', async (req, res) => {
    try {
        const { id } = req.params;
    const { number, floor, bedrooms, bathrooms, sqft, status, rent, amenities,
      utilityAccounts, profile, equipment, conditionDetails, turnover } = req.body;

        // Validate required fields
        if (!String(number || '').trim() || bedrooms === '' || bedrooms === undefined || bedrooms === null || bathrooms === '' || bathrooms === undefined || bathrooms === null) {
            return res.status(400).json({ 
                message: 'Missing required fields: number, bedrooms, and bathrooms are required' 
            });
        }

        // Validate project exists
        const project = await serverContext.Project.findById(id);
        if (!project) {
            return res.status(404).json({ message: 'Property not found' });
        }

        // Create new unit with validated data
        const unit = new serverContext.Unit({
            projectId: project._id,
            number: number.trim(),
            floor: parseInt(floor) || 1,
            bedrooms: parseFloat(bedrooms),
            bathrooms: parseFloat(bathrooms),
            sqft: parseInt(sqft) || 0,
          rent: typeof rent === 'number' ? rent : parseFloat(rent) || 0,
          status: status || 'vacant',
          amenities: Array.isArray(amenities) ? amenities : [],
          utilityAccounts: utilityAccounts || {},
          profile: profile || {},
          equipment: Array.isArray(equipment) ? equipment : [],
          conditionDetails: conditionDetails || {},
          turnover: turnover || {}
        });

        await unit.save();

        res.status(201).json({
            message: 'Unit added successfully',
            unit: unit
        });
    } catch (error) {
        console.error('Error adding unit:', error);
        res.status(500).json({ 
            message: 'Error adding unit',
            error: error.message 
        });
    }
});
}

function put_api_properties_propertyId_units_unitId() {
// Add route for updating units
serverContext.app.put('/api/properties/:propertyId/units/:unitId', async (req, res) => {
  try {
    const { propertyId, unitId } = req.params;
    const updateData = req.body;

    const unit = await serverContext.Unit.findOneAndUpdate(
      { _id: unitId, projectId: propertyId },
      updateData,
      { new: true }
    );

    if (!unit) {
      return res.status(404).json({ message: 'Unit not found' });
    }

    res.json({
      message: 'Unit updated successfully',
      unit: unit
    });
  } catch (error) {
    console.error('Error updating unit:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function delete_api_properties_propertyId_units_unitId() {
// Add DELETE endpoint for units
serverContext.app.delete('/api/properties/:propertyId/units/:unitId', async (req, res) => {
    try {
        const { propertyId, unitId } = req.params;

        // Find and delete the unit
        const deletedUnit = await serverContext.Unit.findOneAndDelete({ 
            _id: unitId, 
            projectId: propertyId 
        });

        if (!deletedUnit) {
            return res.status(404).json({ message: 'Unit not found' });
        }

        res.json({ message: 'Unit deleted successfully' });
    } catch (error) {
        console.error('Error deleting unit:', error);
        res.status(500).json({ message: 'Server error' });
    }
});
}

function get_api_public_availability() {
// Public availability endpoint for marketing site (Blue Rain)
// Returns multifamily and single-family projects with their units and backend statuses/rents
serverContext.app.get('/api/public/availability', async (req, res) => {
  try {
    // Include both multifamily and single-family rental projects
    const projects = await serverContext.Project.find({
      type: { $regex: /family/i }
    }).lean();

    if (!projects.length) {
      return res.json({ projects: [] });
    }

    const projectIds = projects.map(p => p._id);
    const units = await serverContext.Unit.find({ projectId: { $in: projectIds } }).lean();

    const unitsByProject = {};
    for (const unit of units) {
      const pid = String(unit.projectId);
      if (!unitsByProject[pid]) unitsByProject[pid] = [];
      unitsByProject[pid].push({
        _id: unit._id,
        number: unit.number,
        floor: unit.floor,
        bedrooms: unit.bedrooms,
        bathrooms: unit.bathrooms,
        sqft: unit.sqft,
        rent: unit.rent,
        status: unit.status
      });
    }

    const payload = projects.map(p => ({
      id: p._id,
      name: p.name,
      type: p.type,
      address: p.address,
      units: unitsByProject[String(p._id)] || []
    }));

    res.json({ projects: payload });
  } catch (error) {
    console.error('Error fetching public availability:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

return {
  get_api_properties_id_units,
  post_api_properties_id_units,
  put_api_properties_propertyId_units_unitId,
  delete_api_properties_propertyId_units_unitId,
  get_api_public_availability
};
};
