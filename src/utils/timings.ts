import { TimetableData, DAY_NAMES } from '../types/timetable';

export interface PeriodTimeInfo {
  period: number;
  periodIndex: number;
  /** Normal time string (e.g. "08:00 - 08:40"), or "" if not configured */
  normal: string;
  /**
   * Friday time string (e.g. "08:00 - 08:35"), or null if Friday timings are
   * disabled, missing, or identical to the normal time for that period.
   */
  friday: string | null;
}

export interface BreakInfo {
  breakAfter: number;
  time: string;
  label: string;
}

export interface TimingsData {
  periods: PeriodTimeInfo[];
  normalBreak: BreakInfo;
  fridayBreak: BreakInfo;
  assemblyTime: string;
  /** Normal-day assembly time (e.g. "07:45 AM - 08:00 AM"), or "" if not set */
  normalAssemblyTime: string;
  fridayEnabled: boolean;
  fridayDayName: string;
  fridayDayShort: string;
  hasDifferingPeriods: boolean;
  hasAnyDifference: boolean;
  differingBreakNote?: string;
  cardSubtitle: string;
  fridayNote?: string;
}

/**
 * Shared helper that returns period timing information and break details.
 * Used across the View page strip, popups, and printed/exported cards.
 */
export function getPeriodTimes(data: TimetableData): TimingsData {
  const ft = data.fridayTimings;
  // Friday times are used whenever Friday period times have been entered.
  // (ft.enabled / ft.combined only control how School Timings are PRINTED.)
  const fridayEnabled = !!(ft && Array.isArray(ft.periodTimes) && ft.periodTimes.some(pt => pt && (pt.start || pt.end)));
  const dayName = ft ? (DAY_NAMES[ft.dayIndex] || data.days[ft.dayIndex] || 'Friday') : 'Friday';
  const dayShort = dayName.slice(0, 3);

  // Normal break
  const normalBreakAfter = data.breakAfter;
  const nbStart = data.periodTimes?.[normalBreakAfter - 1]?.end;
  const nbEnd = data.periodTimes?.[normalBreakAfter]?.start;
  const normalBreakTime = (nbStart || nbEnd) ? `${nbStart || '—'} - ${nbEnd || '—'}` : '';

  const normalBreak: BreakInfo = {
    breakAfter: normalBreakAfter,
    time: normalBreakTime,
    label: 'Break'
  };

  // Friday break
  const fridayBreakAfter = (ft && ft.breakAfter > 0) ? ft.breakAfter : normalBreakAfter;
  const fbStart = ft?.periodTimes?.[fridayBreakAfter - 1]?.end;
  const fbEnd = ft?.periodTimes?.[fridayBreakAfter]?.start;
  const fridayBreakTime = (fbStart || fbEnd) ? `${fbStart || '—'} - ${fbEnd || '—'}` : normalBreakTime;

  const fridayBreak: BreakInfo = {
    breakAfter: fridayBreakAfter,
    time: fridayBreakTime,
    label: ft?.breakLabel?.trim() || 'Break'
  };

  // Assembly time
  const assemblyTime = (ft && ft.enabled && ft.assemblyTime && (ft.assemblyTime.start || ft.assemblyTime.end))
    ? `${ft.assemblyTime.start || '—'} - ${ft.assemblyTime.end || '—'}`
    : '';

  // Normal assembly time
  const na = data.assemblyTime;
  const normalAssemblyTime = (na && (na.start || na.end)) ? `${na.start || '—'} - ${na.end || '—'}` : '';

  // Periods
  const periods: PeriodTimeInfo[] = data.periods.map((p, pi) => {
    const pt = data.periodTimes?.[pi];
    const normal = (pt && (pt.start || pt.end)) ? `${pt.start || '—'} - ${pt.end || '—'}` : '';

    let friday: string | null = null;
    if (fridayEnabled && ft) {
      const fpt = ft.periodTimes?.[pi];
      const friTime = (fpt && (fpt.start || fpt.end)) ? `${fpt.start || '—'} - ${fpt.end || '—'}` : '';
      if (friTime && friTime !== normal) {
        friday = friTime;
      }
    }

    return {
      period: p,
      periodIndex: pi,
      normal,
      friday
    };
  });

  const hasDifferingPeriods = periods.some(p => p.friday !== null);

  const hasAnyDifference = fridayEnabled && (
    hasDifferingPeriods ||
    normalBreak.breakAfter !== fridayBreak.breakAfter ||
    normalBreak.time !== fridayBreak.time ||
    !!assemblyTime
  );

  let differingBreakNote: string | undefined;
  if (fridayEnabled && normalBreakAfter !== fridayBreakAfter && fridayBreakAfter > 0) {
    differingBreakNote = `Friday break comes after period ${fridayBreakAfter}`;
  }

  const cardSubtitle = hasDifferingPeriods ? 'Normal and Friday timings' : 'Normal timings';

  return {
    periods,
    normalBreak,
    fridayBreak,
    assemblyTime,
    normalAssemblyTime,
    fridayEnabled,
    fridayDayName: dayName,
    fridayDayShort: dayShort,
    hasDifferingPeriods,
    hasAnyDifference,
    differingBreakNote,
    cardSubtitle,
    fridayNote: ft?.note?.trim() || undefined
  };
}

/**
 * Returns true if Friday timings are enabled AND at least one period differs,
 * or break position/time or assembly differs.
 */
export function hasDifferingFridayTimings(data: TimetableData): boolean {
  return getPeriodTimes(data).hasAnyDifference;
}
