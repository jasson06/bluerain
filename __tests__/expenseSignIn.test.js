const fs = require('fs');
const vm = require('vm');
const path = require('path');
function setup(responses) {
  const context = vm.createContext({
    document: { addEventListener: jest.fn() }, fetch: jest.fn(), localStorage: { getItem: () => 'old-token' },
  });
  for (const file of ['maintenance-requests.js', 'expense-mappings.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/property-management/js', file), 'utf8'), context);
  }
  context.reauthenticateMaintenanceManager = jest.fn(async () => 'renewed-token');
  responses.forEach(response => context.fetch.mockResolvedValueOnce(response));
  return context;
}
test('expenses reuse the maintenance modal and retry once with the renewed token', async () => {
  const c = setup([{ status: 401 }, { status: 200 }]);
  expect((await vm.runInContext("expenseMappingFetch('/expenses', { method: 'POST', body: 'range' })", c)).status).toBe(200);
  expect(c.reauthenticateMaintenanceManager).toHaveBeenCalledTimes(1);
  expect(c.fetch.mock.calls[1][1]).toMatchObject({ method: 'POST', body: 'range', headers: { Authorization: 'Bearer renewed-token' } });
});
test('failed sign-in does not loop', async () => {
  const c = setup([{ status: 401 }, { status: 401 }]);
  expect((await vm.runInContext("expenseMappingFetch('/expenses')", c)).status).toBe(401);
  expect(c.fetch).toHaveBeenCalledTimes(2);
});
test('cancelling sign-in stops the request', async () => {
  const c = setup([{ status: 401 }]);
  c.reauthenticateMaintenanceManager.mockRejectedValue(new Error('Sign-in cancelled'));
  await expect(vm.runInContext("expenseMappingFetch('/expenses')", c)).rejects.toThrow('Sign-in cancelled');
  expect(c.fetch).toHaveBeenCalledTimes(1);
});
test('QuickBooks failures do not prompt for the manager password', async () => {
  const c = setup([{ status: 400 }]);
  await vm.runInContext("expenseMappingFetch('/expenses')", c);
  expect(c.reauthenticateMaintenanceManager).not.toHaveBeenCalled();
});
