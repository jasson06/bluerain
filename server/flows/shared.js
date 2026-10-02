// shared flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {

// Logger Middleware
function logger(req, res, next) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
}

// [SECTION] Shared model utilities and financial normalization helpers

function normalizeOptionalObjectId(value) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized ? normalized : undefined;
}

function invoiceLineItemsReadyForApproval(lineItems = []) {
  return Array.isArray(lineItems) && lineItems.length > 0 && lineItems.every(item => item && item.projectId && item.estimateId && item.itemId);
}



return {
  logger,
  normalizeOptionalObjectId,
  invoiceLineItemsReadyForApproval
};
};
