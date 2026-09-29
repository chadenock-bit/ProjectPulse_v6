// capacity.js — pure calculation helpers for capacity-based Billing.
// No API calls here; everything is derived from data already in hand
// (Holiday rows + a BillingPeriod's month/year) so it's trivially testable
// and reusable between BillingFormPanel and the Holiday calendar screen.

// Weekdays (Mon-Fri) in a given month/year, minus any active Holiday that
// falls on a weekday in that month. A holiday landing on a weekend doesn't
// subtract anything extra — weekends are never counted as working days
// regardless.
// Timezone-safe local ISO date string ("YYYY-MM-DD") — never use
// Date.prototype.toISOString() here, it converts to UTC and silently
// shifts a locally-constructed midnight Date back one calendar day in
// any timezone ahead of UTC (e.g. IST, UTC+5:30), which breaks holiday
// matching. Mirrors the isoOf()/pad() helper already used in HolidayPage.jsx.
function isoOf(year, month, day) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function getWorkingDays(month, year, holidays = []) {
  if (!month || !year) return 0;
  const daysInMonth = new Date(Number(year), Number(month), 0).getDate();
  const holidaySet = new Set(
    (holidays || [])
      .filter((h) => h.active !== false)
      .map((h) => String(h.holidayDate || "").slice(0, 10))
  );
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(Number(year), Number(month) - 1, d);
    const dow = date.getDay(); // 0 = Sun, 6 = Sat
    if (dow === 0 || dow === 6) continue;
    const iso = isoOf(Number(year), Number(month), d);
    if (holidaySet.has(iso)) continue;
    count++;
  }
  return count;
}

// Same logic as getWorkingDays but returns the full breakdown (weekdays,
// holidays actually subtracted, and which holiday dates/names hit) so the
// UI can show "22 weekdays − 1 holiday = 21 working days" for reference
// instead of just the final number.
export function getWorkingDaysBreakdown(month, year, holidays = []) {
  if (!month || !year) return { weekdays: 0, holidayCount: 0, workingDays: 0, holidayHits: [] };
  const daysInMonth = new Date(Number(year), Number(month), 0).getDate();
  const activeHolidays = (holidays || []).filter((h) => h.active !== false);
  const holidayByDate = new Map(
    activeHolidays.map((h) => [String(h.holidayDate || "").slice(0, 10), h])
  );

  let weekdays = 0;
  const holidayHits = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(Number(year), Number(month) - 1, d);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;
    weekdays++;
    const iso = isoOf(Number(year), Number(month), d);
    const holiday = holidayByDate.get(iso);
    if (holiday) holidayHits.push({ date: iso, name: holiday.holidayName || "Holiday" });
  }

  return {
    weekdays,
    holidayCount: holidayHits.length,
    workingDays: weekdays - holidayHits.length,
    holidayHits,
  };
}

// Maximum monthly capacity for one resource = workingDays * 8, always at
// the fixed 8hr/day standard regardless of what any individual project's
// HoursPerDay is set to — that's the FSD rule ("Maximum monthly capacity =
// Working Days x 8"), not workingDays * that resource's HoursPerDay on this
// particular project.
export function getMaxCapacity(workingDays) {
  return Number(workingDays || 0) * 8;
}

// Sums this resource's Planned Hours across every OTHER BillingResource row
// in the same billing period (i.e. every other project they're billed on
// this month), excluding the row(s) belonging to the billing record
// currently being edited (excludeBillingId) so editing an existing record
// doesn't double count itself.
export function sumOtherPlannedHours(billingResources, { userId, billingPeriodId, excludeBillingId, billingIdToPeriodId }) {
  return (billingResources || [])
    .filter((r) =>
      String(r.userId) === String(userId) &&
      String(billingIdToPeriodId[r.billingId]) === String(billingPeriodId) &&
      String(r.billingId) !== String(excludeBillingId || "")
    )
    .reduce((sum, r) => sum + (Number(r.plannedHours) || 0), 0);
}