import { useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { TimetableData } from '../types/timetable';
import { getDaySchedule, getClassAllocationsForPeriod } from './liveSchedule';
import { dateKey } from './dates';

/**
 * Home-screen widget bridge (Android only).
 *
 * The widget keeps working while the app is closed, so instead of sending "what is
 * running now" we send a compact snapshot of the whole week: the timed slots for each
 * school day, who teaches each class in each period, and the absent teachers (and their
 * substitutes) for today and the next few days. The native widget works out the running
 * period itself, every minute.
 */

interface TimetableWidgetPlugin {
  setSnapshot(options: { json: string }): Promise<void>;
}

const TimetableWidget = registerPlugin<TimetableWidgetPlugin>('TimetableWidget');

const LOOKAHEAD_DAYS = 8;

export interface WidgetSnapshot {
  v: 1;
  school: string;
  updated: number;
  /** dayIndex (0 = Monday) -> timed slots. Missing key = not a school day. */
  week: Record<string, { t: string; l: string; s: number; e: number; ss: string; es: string; pi: number }[]>;
  /** dayIndex -> periodIndex -> rows of [class, subject, teacher, subject2, teacher2, isFree] */
  alloc: Record<string, Record<string, [string, string, string, string, string, 0 | 1][]>>;
  /** "YYYY-MM-DD" -> { absentTeacher -> { periodIndex -> substitute } } */
  dates: Record<string, Record<string, Record<string, string>>>;
}

export function buildWidgetSnapshot(
  data: TimetableData,
  getLeavesForDate: (key: string) => string[],
  now: Date = new Date()
): WidgetSnapshot {
  const week: WidgetSnapshot['week'] = {};
  const alloc: WidgetSnapshot['alloc'] = {};

  for (let d = 0; d < Math.min(7, data.daysPerWeek); d++) {
    const sched = getDaySchedule(data, d);
    week[d] = sched.slots.map(s => ({
      t: s.type,
      l: s.label,
      s: s.startMins,
      e: s.endMins,
      ss: s.startStr,
      es: s.endStr,
      pi: s.periodIndex ?? -1
    }));

    const perPeriod: Record<string, [string, string, string, string, string, 0 | 1][]> = {};
    sched.periodSlots.forEach(ps => {
      const pi = ps.periodIndex as number;
      perPeriod[pi] = getClassAllocationsForPeriod(data, d, pi).map(a => [
        a.className,
        a.subject,
        a.teacher,
        a.slot2Subject || '',
        a.slot2Teacher || '',
        a.isFree ? 1 : 0
      ]);
    });
    alloc[d] = perPeriod;
  }

  const dates: WidgetSnapshot['dates'] = {};
  for (let i = 0; i < LOOKAHEAD_DAYS; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key = dateKey(day);
    const absent = getLeavesForDate(key);
    if (!absent.length) continue;
    const subs = data.substituteBoards?.[key]?.assigned || {};
    const entry: Record<string, Record<string, string>> = {};
    absent.forEach(t => { entry[t] = { ...(subs[t] || {}) }; });
    dates[key] = entry;
  }

  return { v: 1, school: data.schoolName || 'TimetableGrid', updated: Date.now(), week, alloc, dates };
}

/** Sends the snapshot to the Android home-screen widget whenever the timetable changes. */
export function useWidgetSync(
  data: TimetableData,
  getLeavesForDate: (key: string) => string[]
): void {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
    const timer = window.setTimeout(() => {
      try {
        const json = JSON.stringify(buildWidgetSnapshot(data, getLeavesForDate));
        TimetableWidget.setSnapshot({ json }).catch(() => { /* widget not available */ });
      } catch { /* never break the app because of the widget */ }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [data, getLeavesForDate]);

  // Day rolled over while the app stayed open: refresh the look-ahead.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const json = JSON.stringify(buildWidgetSnapshot(data, getLeavesForDate));
        TimetableWidget.setSnapshot({ json }).catch(() => {});
      } catch { /* ignore */ }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [data, getLeavesForDate]);
}
