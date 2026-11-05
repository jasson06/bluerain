const createSchedules = require('../server/flows/maintenance-schedules');

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test.each([
  ['save', 0], ['save', 1], ['save', 2],
  ['reminder', 0], ['reminder', 1], ['reminder', 2],
  ['sync', 0], ['sync', 1], ['sync', 2]
])('a %s failure at position %i does not stop other schedules due the same day', async (stage, failedIndex) => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 10, 5, 12));
  const schedules = Array.from({ length: 3 }, (_, index) => ({
    _id: `schedule-${index}`, title: `Maintenance ${index}`, status: 'pending',
    nextScheduledDate: new Date(2026, 10, 5, 10),
    save: jest.fn().mockResolvedValue(undefined)
  }));
  const failed = schedules[failedIndex];
  const failure = new Error(`${stage} failed`);
  const overdue = { _id: 'overdue-schedule' };
  const createdItems = [];
  const context = {
    MaintenanceSchedule: {
      find: jest.fn()
        .mockReturnValueOnce({ populate: async () => schedules })
        .mockReturnValueOnce({ populate: async () => [overdue] })
    }
  };
  Object.assign(context, createSchedules(context));
  context.sendTodayMaintenanceReminder = jest.fn(async schedule => {
    if (stage === 'reminder' && schedule === failed) throw failure;
  });
  context.syncMaintenanceScheduleToEstimate = jest.fn(async schedule => {
    if (stage === 'sync' && schedule === failed) throw failure;
    createdItems.push({ maintenanceScheduleId: schedule._id });
    return { itemCreated: true };
  });
  context.sendOverdueScheduleAlert = jest.fn();
  if (stage === 'save') failed.save.mockRejectedValue(failure);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});

  await expect(context.updateNextScheduledDates()).resolves.toBe(true);

  expect(context.MaintenanceSchedule.find).toHaveBeenNthCalledWith(1, {
    nextScheduledDate: {
      $gte: new Date(2026, 10, 5),
      $lt: new Date(2026, 10, 6)
    },
    status: { $ne: 'in-progress' }
  });
  for (const schedule of schedules) {
    expect(schedule.save).toHaveBeenCalledTimes(1);
    if (schedule !== failed) {
      expect(context.syncMaintenanceScheduleToEstimate).toHaveBeenCalledWith(
        schedule, { createIfMissing: true }
      );
    }
  }
  expect(createdItems).toEqual(
    schedules.filter(schedule => schedule !== failed).map(schedule => ({
      maintenanceScheduleId: schedule._id
    }))
  );
  expect(error).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalledWith(
    `Error activating maintenance schedule "${failed.title}" (${failed._id}):`, failure
  );
  expect(context.sendOverdueScheduleAlert).toHaveBeenCalledWith(overdue);
});

test('all failed activations are logged and do not report line item creation', async () => {
  const schedules = [{ _id: 'first', title: 'First' }, { _id: 'second', title: 'Second' }];
  const context = {
    MaintenanceSchedule: {
      find: jest.fn()
        .mockReturnValueOnce({ populate: async () => schedules })
        .mockReturnValueOnce({ populate: async () => [] })
    }
  };
  Object.assign(context, createSchedules(context));
  context.ensureScheduleActivatedForDate = jest.fn().mockRejectedValue(new Error('Activation failed'));
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});

  await expect(context.updateNextScheduledDates()).resolves.toBe(false);
  expect(context.ensureScheduleActivatedForDate).toHaveBeenCalledTimes(2);
  expect(error).toHaveBeenCalledTimes(2);
});
