import { TimetableData, DAY_NAMES, LongLeave } from '../types/timetable';
import { getPeriodTimes } from './timings';

export const JS_DAY_TO_DAY_INDEX: Record<number, number> = {
  1: 0, // Monday
  2: 1, // Tuesday
  3: 2, // Wednesday
  4: 3, // Thursday
  5: 4, // Friday
  6: 5, // Saturday
  0: 6  // Sunday
};

/**
 * Returns the 0-indexed day number (0 = Monday, 1 = Tuesday ... 6 = Sunday)
 */
export function getSchoolDayIndex(date: Date): number {
  return JS_DAY_TO_DAY_INDEX[date.getDay()] ?? 0;
}

/**
 * Parses time strings formatted like "08:00", "8:30 AM", "1:15 PM" to minutes from midnight.
 */
export function parseTimeToMinutes(timeStr?: string): number | null {
  if (!timeStr) return null;
  const cleaned = timeStr.trim().toUpperCase();
  const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!match) return null;

  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const meridiem = match[3];

  if (meridiem === 'PM' && h < 12) h += 12;
  if (meridiem === 'AM' && h === 12) h = 0;

  return h * 60 + m;
}

/**
 * Formats minutes from midnight to a 24-hr or 12-hr string (e.g. "08:30")
 */
export function formatMinutes(mins: number): string {
  const norm = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface DaySlot {
  type: 'assembly' | 'period' | 'break';
  label: string;
  periodNum?: number;
  periodIndex?: number;
  startStr: string;
  endStr: string;
  startMins: number;
  endMins: number;
}

export interface DaySchedule {
  dayIndex: number;
  dayName: string;
  isSchoolDay: boolean;
  isFridayTimings: boolean;
  slots: DaySlot[];
  periodSlots: DaySlot[];
}

/**
 * Build the sequence of timed events (Assembly, Periods, Break) for the given day index.
 */
export function getDaySchedule(data: TimetableData, dayIndex: number): DaySchedule {
  const isSchoolDay = dayIndex < data.daysPerWeek;
  const dayName = DAY_NAMES[dayIndex] || `Day ${dayIndex + 1}`;

  const ft = data.fridayTimings;
  const hasFriTimes = !!(ft && Array.isArray(ft.periodTimes) && ft.periodTimes.some(pt => pt && (pt.start || pt.end)));
  const targetFriDayIndex = typeof ft?.dayIndex === 'number' ? ft.dayIndex : 4;
  const isFridayTimings = hasFriTimes && (targetFriDayIndex === dayIndex);

  const timingsData = getPeriodTimes(data);
  const breakInfo = isFridayTimings ? timingsData.fridayBreak : timingsData.normalBreak;
  const breakAfter = breakInfo.breakAfter;

  const rawTimes = isFridayTimings ? ft.periodTimes : data.periodTimes;
  const assemblyTime = isFridayTimings ? ft.assemblyTime : data.assemblyTime;

  const slots: DaySlot[] = [];
  const periodSlots: DaySlot[] = [];

  // 1. Assembly slot (if defined)
  if (assemblyTime && (assemblyTime.start || assemblyTime.end)) {
    const sMins = parseTimeToMinutes(assemblyTime.start);
    const eMins = parseTimeToMinutes(assemblyTime.end);
    if (sMins !== null && eMins !== null && eMins > sMins) {
      slots.push({
        type: 'assembly',
        label: 'Assembly',
        startStr: assemblyTime.start,
        endStr: assemblyTime.end,
        startMins: sMins,
        endMins: eMins
      });
    }
  }

  // 2. Periods & Break slots
  data.periods.forEach((pNum, pi) => {
    const pt = (isFridayTimings && rawTimes?.[pi]?.start)
      ? rawTimes[pi]
      : (data.periodTimes?.[pi] || { start: '', end: '' });
    const sMins = parseTimeToMinutes(pt.start);
    const eMins = parseTimeToMinutes(pt.end);

    let periodSlot: DaySlot | null = null;
    if (sMins !== null && eMins !== null && eMins > sMins) {
      periodSlot = {
        type: 'period',
        label: `Period ${pNum}`,
        periodNum: pNum,
        periodIndex: pi,
        startStr: pt.start,
        endStr: pt.end,
        startMins: sMins,
        endMins: eMins
      };
      slots.push(periodSlot);
      periodSlots.push(periodSlot);
    }

    // Check if break comes after this period
    if (breakAfter === pNum && pi < data.periods.length - 1) {
      const nextPt = rawTimes?.[pi + 1];
      const breakStartStr = pt.end;
      const breakEndStr = nextPt?.start;
      const bsMins = parseTimeToMinutes(breakStartStr);
      const beMins = parseTimeToMinutes(breakEndStr);

      if (bsMins !== null && beMins !== null && beMins > bsMins) {
        slots.push({
          type: 'break',
          label: breakInfo.label || 'Break',
          startStr: breakStartStr,
          endStr: breakEndStr,
          startMins: bsMins,
          endMins: beMins
        });
      }
    }
  });

  return {
    dayIndex,
    dayName,
    isSchoolDay,
    isFridayTimings,
    slots,
    periodSlots
  };
}

export type LiveStatusType =
  | 'period'
  | 'assembly'
  | 'break'
  | 'passing'
  | 'before_school'
  | 'after_school'
  | 'weekend'
  | 'no_timings';

export interface LiveScheduleStatus {
  type: LiveStatusType;
  title: string;
  subtitle: string;
  currentSlot?: DaySlot;
  nextSlot?: DaySlot;
  progressPercent: number; // 0 - 100
  elapsedMinutes: number;
  remainingMinutes: number;
  activePeriodIndex: number; // Defaults to closest or 0
  activePeriodNum: number;
  daySchedule: DaySchedule;
  nowMinutes: number;
}

/**
 * Determine live school status for a given timestamp.
 */
export function getLiveScheduleStatus(
  data: TimetableData,
  date: Date
): LiveScheduleStatus {
  const dayIndex = getSchoolDayIndex(date);
  const daySchedule = getDaySchedule(data, dayIndex);
  const nowMinutes = date.getHours() * 60 + date.getMinutes();

  const defaultPeriodIndex = 0;
  const defaultPeriodNum = data.periods[0] || 1;

  if (!daySchedule.isSchoolDay) {
    return {
      type: 'weekend',
      title: 'School Closed Today',
      subtitle: `${daySchedule.dayName} is not a regular school day`,
      progressPercent: 0,
      elapsedMinutes: 0,
      remainingMinutes: 0,
      activePeriodIndex: defaultPeriodIndex,
      activePeriodNum: defaultPeriodNum,
      daySchedule,
      nowMinutes
    };
  }

  if (daySchedule.slots.length === 0) {
    return {
      type: 'no_timings',
      title: 'Timings Not Configured',
      subtitle: 'Set up period start and end times in School Setup to enable live tracking',
      progressPercent: 0,
      elapsedMinutes: 0,
      remainingMinutes: 0,
      activePeriodIndex: defaultPeriodIndex,
      activePeriodNum: defaultPeriodNum,
      daySchedule,
      nowMinutes
    };
  }

  const firstSlot = daySchedule.slots[0];
  const lastSlot = daySchedule.slots[daySchedule.slots.length - 1];

  // 1. Before school starts
  if (nowMinutes < firstSlot.startMins) {
    const untilStart = firstSlot.startMins - nowMinutes;
    return {
      type: 'before_school',
      title: 'Before School Hours',
      subtitle: `${firstSlot.label} begins at ${firstSlot.startStr} (${untilStart}m remaining)`,
      nextSlot: firstSlot,
      progressPercent: 0,
      elapsedMinutes: 0,
      remainingMinutes: untilStart,
      activePeriodIndex: daySchedule.periodSlots[0]?.periodIndex ?? defaultPeriodIndex,
      activePeriodNum: daySchedule.periodSlots[0]?.periodNum ?? defaultPeriodNum,
      daySchedule,
      nowMinutes
    };
  }

  // 2. After school ends
  if (nowMinutes >= lastSlot.endMins) {
    return {
      type: 'after_school',
      title: 'School Day Concluded',
      subtitle: `All periods have concluded for ${daySchedule.dayName}`,
      progressPercent: 100,
      elapsedMinutes: 0,
      remainingMinutes: 0,
      activePeriodIndex: daySchedule.periodSlots[daySchedule.periodSlots.length - 1]?.periodIndex ?? defaultPeriodIndex,
      activePeriodNum: daySchedule.periodSlots[daySchedule.periodSlots.length - 1]?.periodNum ?? defaultPeriodNum,
      daySchedule,
      nowMinutes
    };
  }

  // 3. Check inside slots
  for (let i = 0; i < daySchedule.slots.length; i++) {
    const slot = daySchedule.slots[i];
    if (nowMinutes >= slot.startMins && nowMinutes < slot.endMins) {
      const duration = Math.max(1, slot.endMins - slot.startMins);
      const elapsed = nowMinutes - slot.startMins;
      const remaining = slot.endMins - nowMinutes;
      const progress = Math.min(100, Math.max(0, Math.round((elapsed / duration) * 100)));
      const nextSlot = daySchedule.slots[i + 1];

      let activePIdx = defaultPeriodIndex;
      let activePNum = defaultPeriodNum;

      if (slot.type === 'period' && slot.periodIndex !== undefined) {
        activePIdx = slot.periodIndex;
        activePNum = slot.periodNum ?? (slot.periodIndex + 1);
      } else {
        // If assembly or break, point to the upcoming or adjacent period
        const upcomingPeriod = daySchedule.slots.slice(i + 1).find(s => s.type === 'period');
        if (upcomingPeriod && upcomingPeriod.periodIndex !== undefined) {
          activePIdx = upcomingPeriod.periodIndex;
          activePNum = upcomingPeriod.periodNum ?? (upcomingPeriod.periodIndex + 1);
        }
      }

      return {
        type: slot.type,
        title: slot.type === 'period' ? slot.label : slot.type === 'break' ? slot.label : 'Morning Assembly',
        subtitle: `${slot.startStr} – ${slot.endStr} · ${remaining} min left`,
        currentSlot: slot,
        nextSlot,
        progressPercent: progress,
        elapsedMinutes: elapsed,
        remainingMinutes: remaining,
        activePeriodIndex: activePIdx,
        activePeriodNum: activePNum,
        daySchedule,
        nowMinutes
      };
    }

    // Between slots (passing period)
    const nextSlot = daySchedule.slots[i + 1];
    if (nextSlot && nowMinutes >= slot.endMins && nowMinutes < nextSlot.startMins) {
      const gapRemaining = nextSlot.startMins - nowMinutes;
      const targetPIdx = nextSlot.periodIndex ?? defaultPeriodIndex;
      const targetPNum = nextSlot.periodNum ?? defaultPeriodNum;

      return {
        type: 'passing',
        title: 'Class Transition',
        subtitle: `${nextSlot.label} starts in ${gapRemaining} min (${nextSlot.startStr})`,
        nextSlot,
        progressPercent: 100,
        elapsedMinutes: nowMinutes - slot.endMins,
        remainingMinutes: gapRemaining,
        activePeriodIndex: targetPIdx,
        activePeriodNum: targetPNum,
        daySchedule,
        nowMinutes
      };
    }
  }

  return {
    type: 'after_school',
    title: 'School Day Concluded',
    subtitle: `All scheduled periods have ended`,
    progressPercent: 100,
    elapsedMinutes: 0,
    remainingMinutes: 0,
    activePeriodIndex: defaultPeriodIndex,
    activePeriodNum: defaultPeriodNum,
    daySchedule,
    nowMinutes
  };
}

export interface ClassLiveAllocation {
  className: string;
  incharge: string;
  section: string;
  subject: string;
  teacher: string;
  slot2Subject?: string;
  slot2Teacher?: string;
  isTeacherOnLeave: boolean;
  isSlot2TeacherOnLeave: boolean;
  leaveReason?: string;
  isFree: boolean;
}

/**
 * Extracts class allocations for a specific period index and day index.
 */
export function getClassAllocationsForPeriod(
  data: TimetableData,
  dayIndex: number,
  periodIndex: number,
  leavesToday: string[] = [],
  longLeaves: LongLeave[] = []
): ClassLiveAllocation[] {
  const leavesSet = new Set(leavesToday);

  return data.classes.map(c => {
    const className = c[0] || 'Untitled Class';
    const incharge = c[1] || '';
    const section = c[2] || '';

    let subject = c[3]?.[periodIndex] || '';
    let teacher = c[4]?.[periodIndex] || '';

    const slot2 = c[5]?.[periodIndex];
    let slot2Subject: string | undefined;
    let slot2Teacher: string | undefined;

    if (slot2 && (slot2.subject || slot2.teacher)) {
      if (slot2.mode === 'rotation') {
        const appliesToday = Array.isArray(slot2.days) && slot2.days.includes(dayIndex);
        if (appliesToday) {
          // On rotation days, slot2 takes effect
          if (slot2.subject) subject = slot2.subject;
          if (slot2.teacher) teacher = slot2.teacher;
        }
      } else if (slot2.mode === 'parallel' || slot2.mode === 'same') {
        slot2Subject = slot2.subject;
        slot2Teacher = slot2.teacher;
      }
    }

    const isFree = (!subject && !teacher) || teacher === 'Free' || subject === 'Free';

    const isTeacherOnLeave = Boolean(teacher && teacher !== 'Free' && leavesSet.has(teacher));
    const isSlot2TeacherOnLeave = Boolean(slot2Teacher && slot2Teacher !== 'Free' && leavesSet.has(slot2Teacher));

    let leaveReason: string | undefined;
    if (isTeacherOnLeave) {
      const ll = longLeaves.find(x => x.teacher === teacher);
      leaveReason = ll?.reason || 'On Leave Today';
    }

    return {
      className,
      incharge,
      section,
      subject: subject || 'Free / Unassigned',
      teacher: teacher || '—',
      slot2Subject,
      slot2Teacher,
      isTeacherOnLeave,
      isSlot2TeacherOnLeave,
      leaveReason,
      isFree
    };
  });
}
