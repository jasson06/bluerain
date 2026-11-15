// Share renewals within this process and conditionally persist only token fields.
module.exports = function createTokenRefresh(context) {
  const pending = new Map();
  const fields = '+encryptedAccessToken +encryptedRefreshToken';
  const fresh = doc => doc?.accessTokenExpiresAt && new Date(doc.accessTokenExpiresAt).getTime() > Date.now() + 300000;
  const usable = doc => doc && doc.status !== 'disconnected';
  function reconnect() {
    return Object.assign(new Error('QuickBooks authorization expired. Reconnect this property to QuickBooks.'), { code: 'QUICKBOOKS_RECONNECT_REQUIRED' });
  }
  async function renew(id) {
    const full = await context.QuickBooksConnection.findById(id).select(fields);
    if (!usable(full)) throw reconnect();
    if (fresh(full)) return full;
    const filter = { _id: id, status: { $ne: 'disconnected' },
      encryptedAccessToken: full.encryptedAccessToken, encryptedRefreshToken: full.encryptedRefreshToken };
    let response;
    try {
      response = await context.axios.post('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
        new URLSearchParams({ grant_type: 'refresh_token', refresh_token: context.decryptQbSecret(full.encryptedRefreshToken) }),
        { timeout: 20000, headers: { Authorization: 'Basic ' + Buffer.from(`${context.QB_CLIENT_ID}:${context.QB_CLIENT_SECRET}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded' } });
    } catch (error) {
      // Another process may have renewed while this request used the old token.
      const latest = await context.QuickBooksConnection.findById(id).select(fields);
      if (usable(latest) && fresh(latest) && latest.encryptedAccessToken !== full.encryptedAccessToken) return latest;
      if (error.response?.data?.error === 'invalid_grant') throw reconnect();
      throw Object.assign(new Error('Unable to renew QuickBooks access. Please retry.'), { code: 'QUICKBOOKS_REFRESH_FAILED' });
    }
    if (!response.data?.access_token) throw new Error('QuickBooks did not return an access token. Please retry.');
    const update = { encryptedAccessToken: context.encryptQbSecret(response.data.access_token),
      accessTokenExpiresAt: new Date(Date.now() + (Number(response.data.expires_in) || 3600) * 1000),
      lastRefreshAt: new Date(), lastError: '' };
    if (response.data.refresh_token) update.encryptedRefreshToken = context.encryptQbSecret(response.data.refresh_token);
    if (response.data.x_refresh_token_expires_in) update.refreshTokenExpiresAt = new Date(Date.now() + Number(response.data.x_refresh_token_expires_in) * 1000);
    const saved = await context.QuickBooksConnection.findOneAndUpdate(filter, { $set: update, $inc: { __v: 1 } }, { new: true }).select(fields);
    if (saved) return saved;
    const latest = await context.QuickBooksConnection.findById(id).select(fields);
    if (usable(latest) && fresh(latest)) return latest;
    if (!usable(latest)) throw reconnect();
    throw new Error('QuickBooks connection changed during renewal. Please retry.');
  }
  return async function refresh(connection) {
    if (!connection?._id) throw reconnect();
    const key = String(connection._id);
    if (pending.has(key)) return pending.get(key);
    // Re-read even when the caller holds a token: that document may be stale.
    const task = renew(connection._id);
    pending.set(key, task);
    try { return await task; }
    finally { if (pending.get(key) === task) pending.delete(key); }
  };
};
