import type { PeriodsDisplay } from '../types/timetable';

// Heading for the periods column, based on the School Setup choice.
export const periodsHeading = (mode: PeriodsDisplay = 'both'): string =>
  mode === 'day' ? 'Periods D' : mode === 'week' ? 'Periods W' : 'Periods D/W';

// Value for the periods column: per day, per week, or "perDay/perWeek" (e.g. 3/15).
export const formatPeriodsDW = (
  weekTotal: number,
  daysPerWeek: number,
  mode: PeriodsDisplay = 'both'
): string => {
  const days = Math.max(1, daysPerWeek || 1);
  const perDay = Math.round((weekTotal / days) * 10) / 10;
  if (mode === 'day') return String(perDay);
  if (mode === 'week') return String(weekTotal);
  return `${perDay}/${weekTotal}`;
};
