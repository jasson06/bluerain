// clients flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {



function post_api_add_client() {
// [SECTION] Clients and estimates

// Add Client
serverContext.app.post('/api/add-client', async (req, res) => {
  try {
    const newClient = new serverContext.Client(req.body);
    await newClient.save();
    res.status(201).json({ success: true, message: 'Client added successfully', client: newClient });
  } catch (error) {
    console.error('Error adding client:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});
}

function get_api_clients() {
// GET /api/clients - Get all clients
serverContext.app.get('/api/clients', async (req, res) => {
  try {
    const clients = await serverContext.Client.find().sort({ name: 1 }); // optional sort by name
    res.json(clients);
  } catch (err) {
    console.error('Error fetching clients:', err);
    res.status(500).json({ error: 'Server error while fetching clients' });
  }
});
}

function put_api_clients_id() {
// PUT /api/clients/:id - Update a client
serverContext.app.put('/api/clients/:id', async (req, res) => {
  try {
    const updatedClient = await serverContext.Client.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedClient) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json(updatedClient);
  } catch (err) {
    console.error('Error updating client:', err);
    res.status(500).json({ error: 'Server error while updating client' });
  }
});
}

function delete_api_clients_id() {
// DELETE /api/clients/:id - Delete a client
serverContext.app.delete('/api/clients/:id', async (req, res) => {
  try {
    const deleted = await serverContext.Client.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting client:', err);
    res.status(500).json({ error: 'Server error while deleting client' });
  }
});
}

return {
  post_api_add_client,
  get_api_clients,
  put_api_clients_id,
  delete_api_clients_id
};
};
