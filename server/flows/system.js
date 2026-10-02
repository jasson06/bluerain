// system flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {



function get_api_debug() {
// Debugging route to check server deployment status
serverContext.app.get('/api/debug', (req, res) => {
  res.json({
    success: true,
    message: 'API is working on Render!',
    environment: process.env.NODE_ENV,
    port: process.env.PORT,
  });
});
}

function get_() {
// [SECTION] Root routes and server startup

// Root Route
serverContext.app.get('/', (req, res) => {
  res.send('Server is running!');
});
}

return {
  get_api_debug,
  get_
};
};
