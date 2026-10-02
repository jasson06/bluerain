// Minimal sanity tests to satisfy Jest and validate first-month proration math

function daysInMonth(year, monthIndex) {
	return new Date(year, monthIndex + 1, 0).getDate();
}

function computeFirstMonthProratedBaseRent(tenant, dateLike) {
	const leaseStart = tenant.leaseStart ? new Date(tenant.leaseStart) : null;
	const d = new Date(dateLike);
	if (!leaseStart || isNaN(leaseStart) || isNaN(d)) return null;
	if (leaseStart.getFullYear() !== d.getFullYear() || leaseStart.getMonth() !== d.getMonth()) return null;
	const base = Number(tenant.baseRent) || 0;
	if (base <= 0) return 0;
	const totalDays = daysInMonth(d.getFullYear(), d.getMonth());
	const occupiedDays = Math.max(1, totalDays - (leaseStart.getDate() - 1));
	const daily = base / totalDays;
	return Number((occupiedDays * daily).toFixed(2));
}

test('prorates base rent correctly for mid-month start', () => {
	const tenant = { baseRent: 1000, leaseStart: '2025-11-10T12:00:00' };
	const result = computeFirstMonthProratedBaseRent(tenant, '2025-11-15T12:00:00');
	const totalDays = daysInMonth(2025, 10); // Nov 2025
	const occupiedDays = totalDays - (10 - 1);
	const expected = Number(((1000 / totalDays) * occupiedDays).toFixed(2));
	expect(result).toBe(expected);
});

test('returns null when not first month', () => {
	const tenant = { baseRent: 1000, leaseStart: '2025-10-10T12:00:00' };
	expect(computeFirstMonthProratedBaseRent(tenant, '2025-11-01T12:00:00')).toBeNull();
});

test('full month (start on 1st) equals base rent', () => {
	const tenant = { baseRent: 1200, leaseStart: '2025-11-01T12:00:00' };
	const result = computeFirstMonthProratedBaseRent(tenant, '2025-11-01T12:00:00');
	expect(result).toBe(1200);
});

