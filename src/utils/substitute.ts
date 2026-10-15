import { TimetableData } from '../types/timetable';

/**
 * Pure helpers for the Substitute Board: who teaches when, who can cover,
 * how candidates are ranked, and auto-fill. No React in here.
 */

export type Assigned = Record<string, Record<string, string>>; // absent -> period index -> substitute

export interface SubRules {
  workload: boolean;
  group: boolean;
  nonTeaching: boolean;
}

/** Day index of a date within the school week, or -1 for a weekend / outside the school week. */
export function dayIndexForDate(data: TimetableData, key: string): number {
  if (!key) return -1;
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return -1;
  const dow = new Date(y, m - 1, d).getDay(); // 0 = Sun
  const idx = dow === 0 ? 6 : dow - 1;
  return idx < data.daysPerWeek ? idx : -1;
}

export function nextSchoolDayFrom(data: TimetableData, startKey: string): string {
  const [y, m, d] = startKey.split('-').map(Number);
  if (!y || !m || !d) return startKey;
  const cur = new Date(y, m - 1, d);
  for (let i = 0; i < 14; i++) {
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
    if (dayIndexForDate(data, key) >= 0) return key;
    cur.setDate(cur.getDate() + 1);
  }
  return startKey;
}

/**
 * What a teacher teaches in one period on one weekday, as "Subject (Class)" strings.
 * Empty array = free. Mirrors the slot rules of the timetable (parallel, rotation, same).
 */
export function teachingAt(data: TimetableData, teacher: string, pi: number, dayIdx: number): string[] {
  const out: string[] = [];
  if (!teacher || dayIdx < 0) return out;
  data.classes.forEach(c => {
    const t1 = c[4][pi];
    const s2 = c[5] ? c[5][pi] : null;
    const label = (subject: string) => `${subject || '—'} (${c[0]})`;

    if (s2 && s2.mode === 'same') {
      if ((t1 || s2.teacher) === teacher) out.push(label(c[3][pi]));
      return;
    }
    const slot1Active = !(s2 && s2.mode === 'rotation' && s2.days.includes(dayIdx));
    if (t1 === teacher && slot1Active) out.push(label(c[3][pi]));
    if (s2 && s2.teacher === teacher) {
      const slot2Active = s2.mode === 'parallel' || s2.days.includes(dayIdx);
      if (slot2Active) out.push(label(s2.subject));
    }
  });
  return out;
}

/** Group / grade closeness: 0 best … 5 none. Uses the teacher's Group (qual) and Grade (rank). */
export function matchTier(data: TimetableData, absent: string, cand: string): number {
  const a = data.teacherInfo[absent] || { qual: '', rank: '', desig: '' };
  const b = data.teacherInfo[cand] || { qual: '', rank: '', desig: '' };
  const sameRank = !!(a.rank && b.rank && a.rank === b.rank);
  const sameQual = !!(a.qual && b.qual && a.qual === b.qual);
  if (sameRank && sameQual) return 0;
  if (sameRank) return 1;
  if (sameQual) return 2;
  if (a.rank && !b.rank) return 3;
  if (a.qual && !b.qual) return 4;
  return 5;
}

export const tierLabel = (tier: number): string =>
  tier === 0 ? 'Same grade & group' : tier === 1 ? 'Same grade' : tier === 2 ? 'Same group' : '';

export interface Candidate {
  teacher: string;
  /** What they teach this period ("" when free) */
  busyWith: string;
  /** Absent teacher this person already covers in this same period ("" when none) */
  takenFor: string;
  /** Covers already assigned to them on this date (not counting this cell) */
  coversToday: number;
  /** Weekly periods */
  load: number;
  tier: number;
  available: boolean;
}

export interface CandidateArgs {
  data: TimetableData;
  absentTeacher: string;
  pi: number;
  dayIdx: number;
  absentList: string[];
  onLeave: string[];
  assigned: Assigned;
  rules: SubRules;
  getLoad: (t: string) => number;
}

/** Everyone who could be shown for a period, best first, unavailable ones last. */
export function candidatesFor(a: CandidateArgs): Candidate[] {
  const { data, absentTeacher, pi, dayIdx, absentList, onLeave, assigned, rules, getLoad } = a;

  const coverCount: Record<string, number> = {};
  const takenAt: Record<string, string> = {};
  Object.keys(assigned).forEach(abs => {
    Object.entries(assigned[abs]).forEach(([p, t]) => {
      if (abs === absentTeacher && Number(p) === pi) return; // the cell being edited
      coverCount[t] = (coverCount[t] || 0) + 1;
      if (Number(p) === pi) takenAt[t] = abs;
    });
  });

  const list: Candidate[] = data.teachers
    .filter(t => !absentList.includes(t) && !onLeave.includes(t) && (rules.nonTeaching || getLoad(t) > 0))
    .map(t => {
      const busyWith = teachingAt(data, t, pi, dayIdx).join(', ');
      const takenFor = takenAt[t] || '';
      return {
        teacher: t,
        busyWith,
        takenFor,
        coversToday: coverCount[t] || 0,
        load: getLoad(t),
        tier: matchTier(data, absentTeacher, t),
        available: !busyWith && !takenFor
      };
    });

  return list.sort((x, y) => {
    if (x.available !== y.available) return x.available ? -1 : 1;
    if (rules.group && x.tier !== y.tier) return x.tier - y.tier;
    const sx = rules.workload ? x.load + x.coversToday : x.coversToday;
    const sy = rules.workload ? y.load + y.coversToday : y.coversToday;
    return sx - sy || x.teacher.localeCompare(y.teacher);
  });
}

/** Periods (0-based indexes) the teacher teaches on that weekday, i.e. periods that need cover. */
export function periodsNeedingCover(data: TimetableData, teacher: string, dayIdx: number): number[] {
  if (dayIdx < 0) return [];
  return data.periods.map((_, pi) => pi).filter(pi => teachingAt(data, teacher, pi, dayIdx).length > 0);
}

/** Fill every empty period with the best available teacher, spreading covers evenly. */
export function autoFillAssignments(
  base: Omit<CandidateArgs, 'absentTeacher' | 'pi' | 'assigned'>,
  current: Assigned
): Assigned {
  const next: Assigned = {};
  Object.keys(current).forEach(k => { next[k] = { ...current[k] }; });

  // Period by period, so the same free teacher is not handed everything
  base.data.periods.forEach((_, pi) => {
    base.absentList.forEach(abs => {
      if (next[abs]?.[pi]) return;
      if (teachingAt(base.data, abs, pi, base.dayIdx).length === 0) return;
      const best = candidatesFor({ ...base, absentTeacher: abs, pi, assigned: next }).find(c => c.available);
      if (best) {
        next[abs] = { ...(next[abs] || {}), [pi]: best.teacher };
      }
    });
  });
  return next;
}
