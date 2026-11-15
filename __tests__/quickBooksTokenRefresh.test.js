const createRefresh = require('../server/quickbooks-token-refresh');
function setup() {
  let doc = { _id: 'connection', status: 'connected', encryptedAccessToken: 'old-access', encryptedRefreshToken: 'old-refresh', accessTokenExpiresAt: new Date(0), mappings: { keep: true } };
  const query = value => ({ select: async () => value });
  const context = {
    QuickBooksConnection: {
      findById: jest.fn(() => query(doc && { ...doc })),
      findOneAndUpdate: jest.fn((filter, update) => {
        if (!doc || doc.status === 'disconnected' || doc.encryptedAccessToken !== filter.encryptedAccessToken || doc.encryptedRefreshToken !== filter.encryptedRefreshToken) return query(null);
        doc = { ...doc, ...update.$set }; return query(doc);
      })
    }, axios: { post: jest.fn(async () => ({ data: { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 } })) },
    encryptQbSecret: value => value, decryptQbSecret: value => value
  };
  return { context, refresh: createRefresh(context), get: () => doc, set: value => { doc = value; } };
}
test('parallel renewals share one request and stale callers reload the saved token', async () => {
  const s = setup(), stale = { ...s.get() };
  const results = await Promise.all(Array.from({ length: 10 }, () => s.refresh(stale)));
  expect(s.context.axios.post).toHaveBeenCalledTimes(1);
  expect(results.every(row => row.encryptedAccessToken === 'new-access')).toBe(true);
  expect((await s.refresh(stale)).encryptedAccessToken).toBe('new-access');
  expect(s.context.axios.post).toHaveBeenCalledTimes(1);
  expect(s.get().mappings).toEqual({ keep: true });
});
test('disconnect during renewal cannot be undone', async () => {
  const s = setup();
  s.context.axios.post.mockImplementation(async () => {
    s.set({ ...s.get(), status: 'disconnected' });
    return { data: { access_token: 'new' } };
  });
  await expect(s.refresh(s.get())).rejects.toMatchObject({ code: 'QUICKBOOKS_RECONNECT_REQUIRED' });
  expect(s.get().status).toBe('disconnected');
  expect(s.get().encryptedAccessToken).toBe('old-access');
});
test('a different process winning the update preserves its tokens', async () => {
  const s = setup();
  s.context.axios.post.mockImplementation(async () => {
    s.set({ ...s.get(), encryptedAccessToken: 'winner', encryptedRefreshToken: 'winner-refresh', accessTokenExpiresAt: new Date(Date.now() + 3600000) });
    return { data: { access_token: 'loser' } };
  });
  expect((await s.refresh(s.get())).encryptedAccessToken).toBe('winner');
});
test('revoked access is a controlled reconnect error and a later request can retry', async () => {
  const s = setup();
  s.context.axios.post.mockRejectedValueOnce({ response: { data: { error: 'invalid_grant' } } });
  await expect(s.refresh(s.get())).rejects.toMatchObject({ code: 'QUICKBOOKS_RECONNECT_REQUIRED' });
  await expect(s.refresh(s.get())).resolves.toMatchObject({ encryptedAccessToken: 'new-access' });
});
test('temporary failures do not expose secrets or claim sign-in is required', async () => {
  const s = setup();
  s.context.axios.post.mockRejectedValueOnce(new Error('secret request details'));
  await expect(s.refresh(s.get())).rejects.toMatchObject({ code: 'QUICKBOOKS_REFRESH_FAILED', message: 'Unable to renew QuickBooks access. Please retry.' });
});
test('workspace handles connection rejection before starting reconciliation', async () => {
  let handler;
  const context = { app: { get: (path, fn) => { handler = fn; } },
    QuickBooksConnection: { findOne: () => ({ lean: async () => ({ _id: 'connection' }) }) },
    getQbConnection: jest.fn(async () => { throw new Error('renewal failed'); }),
    autoResolveQuickBooksPaymentsForProperty: jest.fn(), QuickBooksSyncLog: {},
  };
  require('../server/flows/quickbooks')(context).get_api_properties_propertyId_quickbooks_payment_workspace();
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await handler({ params: { propertyId: 'property' } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(context.autoResolveQuickBooksPaymentsForProperty).not.toHaveBeenCalled();
});
