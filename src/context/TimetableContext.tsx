import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  TimetableData,
  EMPTY_TIMETABLE_DATA,
  Slot2,
  LongLeave,
  SubstituteBoard,
  DAY_NAMES
} from '../types/timetable';
import {
  HistoryState,
  EMPTY_HISTORY,
  MAX_HISTORY,
  diffData,
  applyPatch,
  describeChange,
  newEntryId,
  loadHistory,
  saveHistory,
  clearSavedHistory
} from '../utils/changeLog';

interface ConflictItem {
  days: number[];
  classes: string[];
}

export interface TimetableIssue {
  level: 'error' | 'warn' | 'info';
  kind: string;
  period?: number;
  teacher?: string;
  text: string;
}

interface TimetableContextType {
  data: TimetableData;
  setData: React.Dispatch<React.SetStateAction<TimetableData>>;
  updateData: (
    updater: (prev: TimetableData) => TimetableData,
    silent?: boolean,
    meta?: { tag?: string; where?: string }
  ) => void;
  /** Saved list of changes (undo / redo). Survives a page refresh. */
  changeLog: HistoryState;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  savedFlash: boolean;
  darkMode: boolean;
  toggleDarkMode: () => void;
  getTeacherTotalPeriods: (teacher: string) => number;
  getTeacherPeriodsOnDay: (teacher: string, dayIndex: number) => number;
  computeConflicts: () => Record<string, ConflictItem>[];
  collectTimetableIssues: () => TimetableIssue[];
  teacherPeriodSummary: (teacher: string, periodIndex: number) => string;
  getLeavesForDate: (dateKey: string) => string[];
  setLeavesForDate: (dateKey: string, teachers: string[]) => void;
  getLongLeavesForDate: (dateKey: string) => LongLeave[];
  markConflictIntentional: (period: number, teacher: string, classes: string[], days: number[]) => void;
  removeConflictException: (index: number) => void;
  cascadeTeacherRename: (oldName: string, newName: string) => void;
  cascadeSubjectRename: (oldName: string, newName: string) => void;
  cascadeClassRename: (oldName: string, newName: string) => void;
  saveScenario: (name: string) => void;
  loadScenario: (name: string) => boolean;
  deleteScenario: (name: string) => void;
  getScenarioNames: () => string[];
  resetEverything: () => void;
  exportBackupJson: () => string;
  importBackupJson: (jsonString: string) => boolean;
}

const TimetableContext = createContext<TimetableContextType | null>(null);

const STORAGE_KEY = 'universalTimetable';
const SCENARIOS_KEY = 'utScenarios';

function normalize(raw: Partial<TimetableData>): TimetableData {
  const base = { ...EMPTY_TIMETABLE_DATA, ...raw };
  base.daysPerWeek = Math.max(1, Math.min(7, Math.floor(base.daysPerWeek || 5)));
  base.days = DAY_NAMES.slice(0, base.daysPerWeek);

  if (!Array.isArray(base.periods) || !base.periods.length) {
    base.periods = [1, 2, 3, 4, 5, 6, 7, 8];
  }

  if (!Array.isArray(base.periodTimes)) {
    base.periodTimes = base.periods.map(() => ({ start: "", end: "" }));
  }
  while (base.periodTimes.length < base.periods.length) {
    base.periodTimes.push({ start: "", end: "" });
  }
  base.periodTimes = base.periodTimes.slice(0, base.periods.length);

  base.classes = (base.classes || []).map(c => {
    const name = String(c[0] || "");
    const incharge = String(c[1] || "");
    const sec = String(c[2] || "");
    const subs = Array.isArray(c[3]) ? c[3].map(x => String(x || "")) : [];
    const teachers = Array.isArray(c[4]) ? c[4].map(x => String(x || "")) : [];
    while (subs.length < base.periods.length) subs.push("");
    while (teachers.length < base.periods.length) teachers.push("");

    let slot2Arr = Array.isArray(c[5]) ? c[5] : base.periods.map(() => null);
    while (slot2Arr.length < base.periods.length) slot2Arr.push(null);
    slot2Arr = slot2Arr.slice(0, base.periods.length).map(s => {
      if (!s || typeof s !== 'object') return null;
      const subj = String(s.subject || "").trim();
      const tea = String(s.teacher || "").trim();
      if (!subj && !tea) return null;
      const mode = s.mode === 'parallel' ? 'parallel' : (s.mode === 'same' ? 'same' : 'rotation');
      let days = Array.isArray(s.days) ? s.days.filter(d => Number.isInteger(d) && d >= 0 && d < base.daysPerWeek) : [];
      if (mode === 'rotation' && days.length === 0) days = [base.daysPerWeek - 1];
      return { subject: subj, teacher: tea, mode, days } as Slot2;
    });

    return [name, incharge, sec, subs.slice(0, base.periods.length), teachers.slice(0, base.periods.length), slot2Arr];
  });

  // Saved substitute boards: keep only well-formed entries
  const boards: Record<string, SubstituteBoard> = {};
  const rawBoards = (base.substituteBoards && typeof base.substituteBoards === 'object') ? base.substituteBoards : {};
  Object.keys(rawBoards).forEach(d => {
    const b = rawBoards[d];
    if (!b || typeof b !== 'object') return;
    const absent = Array.isArray(b.absent) ? b.absent.filter(t => typeof t === 'string') : [];
    const assigned: Record<string, Record<string, string>> = {};
    Object.keys(b.assigned || {}).forEach(a => {
      const per: Record<string, string> = {};
      Object.entries(b.assigned[a] || {}).forEach(([pi, t]) => {
        const idx = Number(pi);
        if (typeof t === 'string' && t && Number.isInteger(idx) && idx >= 0 && idx < base.periods.length) per[pi] = t;
      });
      if (Object.keys(per).length) assigned[a] = per;
    });
    if (absent.length || Object.keys(assigned).length) boards[d] = { absent, assigned };
  });
  base.substituteBoards = boards;

  return base;
}

/**
 * Shared helper: calculates teaching periods for a teacher on a given weekday.
 * - rotation: slot 1 teacher on non-rotation days, slot 2 teacher on listed days
 * - parallel: both teachers every day
 * - same: once per class
 * - deliberate overlap (covered by conflictExceptions): counts once
 */
export function getTeacherPeriodsForDay(data: TimetableData, teacher: string, dayIndex: number): number {
  if (dayIndex < 0 || dayIndex >= data.daysPerWeek || !teacher) return 0;
  let total = 0;

  for (let pi = 0; pi < data.periods.length; pi++) {
    const activeClasses: string[] = [];

    data.classes.forEach(c => {
      const className = c[0];
      const t1 = c[4]?.[pi];
      const s2 = c[5]?.[pi];

      if (s2 && s2.mode === 'rotation') {
        const slot2Active = Array.isArray(s2.days) && s2.days.includes(dayIndex);
        if (!slot2Active && t1 === teacher) {
          activeClasses.push(className);
        } else if (slot2Active && s2.teacher === teacher) {
          activeClasses.push(className);
        }
        return;
      }

      if (s2 && s2.mode === 'same') {
        const combinedTeacher = t1 || s2.teacher;
        if (combinedTeacher === teacher) {
          activeClasses.push(className);
        }
        return;
      }

      // parallel or no slot 2
      if (t1 === teacher) {
        activeClasses.push(className);
      }
      if (s2 && s2.teacher === teacher) {
        activeClasses.push(className);
      }
    });

    if (activeClasses.length === 0) continue;
    if (activeClasses.length === 1) {
      total += 1;
      continue;
    }

    // Deliberate overlap check: if covered by conflictExceptions for this day & period, counts as 1
    const isCovered = (data.conflictExceptions || []).some(ex => {
      if (ex.period !== pi || ex.teacher !== teacher || !ex.days.includes(dayIndex)) return false;
      if (ex.classes.length !== activeClasses.length) return false;
      return ex.classes.every(cn => activeClasses.includes(cn));
    });

    total += isCovered ? 1 : activeClasses.length;
  }

  return total;
}

export const TimetableProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = useState<TimetableData>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return normalize(JSON.parse(stored));
      }
    } catch (e) {
      console.warn("Could not load stored timetable:", e);
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) localStorage.setItem('utCorruptBackup', raw);
        setTimeout(() => {
          alert('Your saved data was corrupted and has been backed up to "utCorruptBackup" in localStorage. Starting fresh.');
        }, 500);
      } catch {}
    }
    return EMPTY_TIMETABLE_DATA;
  });

  const dataRef = useRef(data);
  dataRef.current = data;

  // Undo / redo list: saved on the device, so it is still there after a refresh
  const [hist, setHist] = useState<HistoryState>(() => {
    try {
      return loadHistory(localStorage.getItem(STORAGE_KEY) || '');
    } catch {
      return EMPTY_HISTORY;
    }
  });
  const histRef = useRef(hist);
  const commitHistory = useCallback((h: HistoryState, dataStr: string) => {
    const kept = saveHistory(h, dataStr);
    histRef.current = kept;
    setHist(kept);
  }, []);
  const [savedFlash, setSavedFlash] = useState(false);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('utDarkMode') === '1';
    } catch {
      return false;
    }
  });

  const notifyStorageError = useCallback((e: unknown) => {
    console.error("Storage error:", e);
    const isFull = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
    setStorageNotice(isFull ? "Browser storage is full. Please export a backup to free up space." : "Storage operation failed.");
    setTimeout(() => setStorageNotice(null), 5000);
  }, []);

  useEffect(() => {
    try {
      if (darkMode) {
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
        document.body.classList.remove('dark');
      }
      localStorage.setItem('utDarkMode', darkMode ? '1' : '0');
    } catch (e) {
      console.warn("Dark mode storage failed:", e);
    }
  }, [darkMode]);

  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => !prev);
  }, []);

  const triggerSaveIndicator = useCallback(() => {
    setSavedFlash(true);
    const timer = setTimeout(() => setSavedFlash(false), 900);
    return () => clearTimeout(timer);
  }, []);

  // Pure updater: computes next outside the updater, saves the data and records the change
  const updateData = useCallback((
    updater: (prev: TimetableData) => TimetableData,
    silent = false,
    meta?: { tag?: string; where?: string }
  ) => {
    const prev = dataRef.current;
    const nextRaw = updater(prev);
    const next = normalize(nextRaw);
    const patch = diffData(prev, next);
    if (!patch) return; // nothing really changed

    const nextStr = JSON.stringify(next);
    dataRef.current = next;
    setData(next);

    const entry = {
      id: newEntryId(),
      ts: Date.now(),
      ...describeChange(prev, next, patch, meta),
      patch
    };
    const h = histRef.current;

    try {
      localStorage.setItem(STORAGE_KEY, nextStr);
      if (!silent) {
        localStorage.setItem('utLastSaved', String(Date.now()));
        triggerSaveIndicator();
      }
    } catch (e) {
      notifyStorageError(e);
    }

    commitHistory({ undo: [...h.undo, entry].slice(-MAX_HISTORY), redo: [] }, nextStr);
  }, [triggerSaveIndicator, notifyStorageError, commitHistory]);

  const undo = useCallback(() => {
    const h = histRef.current;
    if (!h.undo.length) return;
    const entry = h.undo[h.undo.length - 1];
    try {
      const restored = normalize(applyPatch(dataRef.current, entry.patch, 'b'));
      const str = JSON.stringify(restored);
      dataRef.current = restored;
      setData(restored);
      localStorage.setItem(STORAGE_KEY, str);
      triggerSaveIndicator();
      commitHistory({ undo: h.undo.slice(0, -1), redo: [...h.redo, entry].slice(-MAX_HISTORY) }, str);
    } catch (e) {
      notifyStorageError(e);
    }
  }, [triggerSaveIndicator, notifyStorageError, commitHistory]);

  const redo = useCallback(() => {
    const h = histRef.current;
    if (!h.redo.length) return;
    const entry = h.redo[h.redo.length - 1];
    try {
      const restored = normalize(applyPatch(dataRef.current, entry.patch, 'a'));
      const str = JSON.stringify(restored);
      dataRef.current = restored;
      setData(restored);
      localStorage.setItem(STORAGE_KEY, str);
      triggerSaveIndicator();
      commitHistory({ undo: [...h.undo, entry].slice(-MAX_HISTORY), redo: h.redo.slice(0, -1) }, str);
    } catch (e) {
      notifyStorageError(e);
    }
  }, [triggerSaveIndicator, notifyStorageError, commitHistory]);

  // Shared workload map: guaranteed weekly sum equals sum of daily counts
  const teacherWorkloadMap = useMemo(() => {
    const dailyMap: Record<number, Record<string, number>> = {};
    const weeklyMap: Record<string, number> = {};

    data.teachers.forEach(t => {
      weeklyMap[t] = 0;
    });

    for (let d = 0; d < data.daysPerWeek; d++) {
      dailyMap[d] = {};
      data.teachers.forEach(t => {
        const dayCount = getTeacherPeriodsForDay(data, t, d);
        dailyMap[d][t] = dayCount;
        weeklyMap[t] = (weeklyMap[t] || 0) + dayCount;
      });
    }

    return { dailyMap, weeklyMap };
  }, [data]);

  const getTeacherPeriodsOnDay = useCallback((teacher: string, dayIndex: number): number => {
    return teacherWorkloadMap.dailyMap[dayIndex]?.[teacher] ?? getTeacherPeriodsForDay(data, teacher, dayIndex);
  }, [teacherWorkloadMap, data]);

  const getTeacherTotalPeriods = useCallback((teacher: string): number => {
    return teacherWorkloadMap.weeklyMap[teacher] ?? 0;
  }, [teacherWorkloadMap]);

  const computeConflicts = useCallback(() => {
    return data.periods.map((_, pi) => {
      const perDay: Record<number, Record<string, { ci: number; slot: number }[]>> = {};

      for (let d = 0; d < data.daysPerWeek; d++) {
        const teachers: Record<string, { ci: number; slot: number }[]> = {};
        data.classes.forEach((c, ci) => {
          const t1 = c[4][pi];
          const s2 = c[5] ? c[5][pi] : null;

          let slot1Active = true;
          if (s2 && s2.mode === 'rotation' && s2.days.includes(d)) slot1Active = false;

          if (t1 && slot1Active) {
            if (!teachers[t1]) teachers[t1] = [];
            teachers[t1].push({ ci, slot: 1 });
          }

          // Skip 'same' — same teacher on same class is intentional, not a conflict
          if (s2 && s2.mode !== 'same' && s2.teacher) {
            const slot2Active = s2.mode === 'parallel' || s2.days.includes(d);
            if (slot2Active) {
              if (!teachers[s2.teacher]) teachers[s2.teacher] = [];
              teachers[s2.teacher].push({ ci, slot: 2 });
            }
          }
        });
        perDay[d] = teachers;
      }

      const conflicts: Record<string, { days: Set<number>; classes: Set<string> }> = {};
      for (let d = 0; d < data.daysPerWeek; d++) {
        const teachers = perDay[d];
        Object.keys(teachers).forEach(t => {
          const entries = teachers[t];
          if (entries.length > 1) {
            const classNames = entries.map(e => data.classes[e.ci][0]);
            const isSuppressed = (data.conflictExceptions || []).some(ex => {
              if (ex.period !== pi || ex.teacher !== t || !ex.days.includes(d)) return false;
              const setA = new Set(classNames);
              if (ex.classes.length !== setA.size) return false;
              return ex.classes.every(cn => setA.has(cn));
            });
            if (isSuppressed) return;

            if (!conflicts[t]) conflicts[t] = { days: new Set(), classes: new Set() };
            conflicts[t].days.add(d);
            classNames.forEach(cn => conflicts[t].classes.add(cn));
          }
        });
      }

      const out: Record<string, ConflictItem> = {};
      Object.keys(conflicts).forEach(t => {
        out[t] = {
          days: Array.from(conflicts[t].days).sort((a, b) => a - b),
          classes: Array.from(conflicts[t].classes),
        };
      });
      return out;
    });
  }, [data.periods, data.daysPerWeek, data.classes, data.conflictExceptions]);

  const collectTimetableIssues = useCallback((): TimetableIssue[] => {
    const issues: TimetableIssue[] = [];

    // 1. Conflict warnings
    const conflicts = computeConflicts();
    conflicts.forEach((pConflicts, pi) => {
      Object.entries(pConflicts).forEach(([t, item]) => {
        const dStr = item.days.map(d => DAY_NAMES[d].slice(0, 3)).join(", ");
        issues.push({
          level: 'warn',
          kind: 'Conflict',
          period: pi,
          teacher: t,
          text: `Period ${data.periods[pi]}: ${t} is double-booked across ${item.classes.join(" + ")} on ${dStr}.`
        });
      });
    });

    // 2. Classes with unassigned slots
    data.classes.forEach(c => {
      const emptyCount = c[3].filter(s => !s).length;
      if (emptyCount > 0) {
        issues.push({
          level: 'info',
          kind: 'Unassigned',
          text: `${c[0]} has ${emptyCount} unassigned period${emptyCount > 1 ? 's' : ''}.`
        });
      }
    });

    // 3. Teachers with zero periods
    data.teachers.forEach(t => {
      if (getTeacherTotalPeriods(t) === 0) {
        issues.push({
          level: 'info',
          kind: 'Workload',
          teacher: t,
          text: `${t} has 0 teaching periods assigned.`
        });
      }
    });

    return issues;
  }, [computeConflicts, data.periods, data.classes, data.teachers, getTeacherTotalPeriods]);

  const teacherPeriodSummary = useCallback((teacher: string, periodIndex: number): string => {
    const matches: string[] = [];
    data.classes.forEach(c => {
      const t1 = c[4][periodIndex];
      const s2 = c[5] ? c[5][periodIndex] : null;

      if (s2 && s2.mode === 'same') {
        const combined = t1 || s2.teacher;
        if (combined === teacher) {
          const sub2 = s2.subject || "—";
          const sub1 = c[3][periodIndex] || "—";
          const dayStr = s2.days && s2.days.length > 0 ? ` (${s2.days.map(d => DAY_NAMES[d].slice(0, 3)).join(", ")})` : "";
          matches.push(`${c[0]}: ${sub1}/${sub2}${dayStr}`);
        }
        return;
      }

      if (t1 === teacher) {
        const sub = c[3][periodIndex] || "—";
        if (s2 && s2.mode === 'rotation') {
          const daysOther = (DAY_NAMES.slice(0, data.daysPerWeek).map((_, i) => i)).filter(d => !s2.days.includes(d));
          const dayStr = daysOther.length ? ` (${daysOther.map(d => DAY_NAMES[d].slice(0, 3)).join(", ")})` : "";
          matches.push(`${c[0]}: ${sub}${dayStr}`);
        } else {
          matches.push(`${c[0]}: ${sub}`);
        }
      }

      if (s2 && s2.teacher === teacher && s2.mode !== 'same') {
        const sub = s2.subject || "—";
        const dayStr = s2.mode === 'rotation' && s2.days && s2.days.length > 0
          ? ` (${s2.days.map(d => DAY_NAMES[d].slice(0, 3)).join(", ")})`
          : "";
        matches.push(`${c[0]}: ${sub}${dayStr}`);
      }
    });

    return matches.join(" | ") || "Free";
  }, [data.classes, data.daysPerWeek]);

  const getLongLeavesForDate = useCallback((dateKeyStr: string): LongLeave[] => {
    if (!data.longLeaves) return [];
    return data.longLeaves.filter(ll => {
      return dateKeyStr >= ll.from && (!ll.to || dateKeyStr <= ll.to);
    });
  }, [data.longLeaves]);

  const getLeavesForDate = useCallback((dateKeyStr: string): string[] => {
    const set = new Set<string>();
    if (data.teacherLeaves && data.teacherLeaves[dateKeyStr]) {
      data.teacherLeaves[dateKeyStr].forEach(t => set.add(t));
    }
    getLongLeavesForDate(dateKeyStr).forEach(ll => set.add(ll.teacher));
    return Array.from(set);
  }, [data.teacherLeaves, getLongLeavesForDate]);

  const setLeavesForDate = useCallback((dateKeyStr: string, teachers: string[]) => {
    updateData(prev => {
      const nextLeaves = { ...prev.teacherLeaves };
      if (!teachers.length) {
        delete nextLeaves[dateKeyStr];
      } else {
        nextLeaves[dateKeyStr] = teachers;
      }
      return { ...prev, teacherLeaves: nextLeaves };
    });
  }, [updateData]);

  const markConflictIntentional = useCallback((period: number, teacher: string, classes: string[], days: number[]) => {
    updateData(prev => {
      const exs = [...(prev.conflictExceptions || [])];
      const exists = exs.some(
        ex => ex.period === period && ex.teacher === teacher && ex.classes.length === classes.length && ex.classes.every(c => classes.includes(c))
      );
      if (exists) return prev;
      return {
        ...prev,
        conflictExceptions: [...exs, { period, teacher, classes: [...classes], days: [...days] }]
      };
    });
  }, [updateData]);

  const removeConflictException = useCallback((index: number) => {
    updateData(prev => {
      const exs = [...(prev.conflictExceptions || [])];
      exs.splice(index, 1);
      return { ...prev, conflictExceptions: exs };
    });
  }, [updateData]);

  const cascadeTeacherRename = useCallback((oldName: string, newName: string) => {
    if (!oldName || oldName === newName) return;
    const lower = newName.toLowerCase();
    // Refuse to merge into an existing teacher
    if (dataRef.current.teachers.some(t => t !== oldName && t.toLowerCase() === lower)) {
      console.warn(`Cannot rename teacher: "${newName}" already exists.`);
      return;
    }

    updateData(prev => {
      const nextClasses = prev.classes.map(c => {
        const incharge = c[1] === oldName ? newName : c[1];
        const teachers = c[4].map(t => t === oldName ? newName : t);
        const slot2s = (c[5] || []).map(s => {
          if (!s) return null;
          return s.teacher === oldName ? { ...s, teacher: newName } : s;
        });
        return [c[0], incharge, c[2], c[3], teachers, slot2s] as typeof c;
      });

      const nextLeaves: Record<string, string[]> = {};
      Object.keys(prev.teacherLeaves || {}).forEach(d => {
        nextLeaves[d] = prev.teacherLeaves[d].map(t => t === oldName ? newName : t);
      });

      const nextLongLeaves = (prev.longLeaves || []).map(ll => {
        return ll.teacher === oldName ? { ...ll, teacher: newName } : ll;
      });

      const nextExceptions = (prev.conflictExceptions || []).map(ex => {
        return ex.teacher === oldName ? { ...ex, teacher: newName } : ex;
      });

      const nextBoards: Record<string, SubstituteBoard> = {};
      Object.keys(prev.substituteBoards || {}).forEach(d => {
        const b = prev.substituteBoards[d];
        const assigned: Record<string, Record<string, string>> = {};
        Object.keys(b.assigned || {}).forEach(a => {
          const per: Record<string, string> = {};
          Object.entries(b.assigned[a]).forEach(([pi, t]) => { per[pi] = t === oldName ? newName : t; });
          assigned[a === oldName ? newName : a] = per;
        });
        nextBoards[d] = { absent: b.absent.map(t => t === oldName ? newName : t), assigned };
      });

      const nextInfo = { ...prev.teacherInfo };
      if (nextInfo[oldName]) {
        nextInfo[newName] = nextInfo[oldName];
        delete nextInfo[oldName];
      }

      const nextTeachers = prev.teachers.map(t => t === oldName ? newName : t);

      return {
        ...prev,
        teachers: nextTeachers,
        classes: nextClasses,
        teacherLeaves: nextLeaves,
        longLeaves: nextLongLeaves,
        substituteBoards: nextBoards,
        conflictExceptions: nextExceptions,
        teacherInfo: nextInfo
      };
    });
  }, [updateData]);

  const cascadeSubjectRename = useCallback((oldName: string, newName: string) => {
    if (!oldName || oldName === newName) return;
    updateData(prev => {
      const nextClasses = prev.classes.map(c => {
        const subjects = c[3].map(s => s === oldName ? newName : s);
        const slot2s = (c[5] || []).map(s => {
          if (!s) return null;
          return s.subject === oldName ? { ...s, subject: newName } : s;
        });
        return [c[0], c[1], c[2], subjects, c[4], slot2s] as typeof c;
      });
      const nextSubjects = prev.subjects.map(s => s === oldName ? newName : s);
      return { ...prev, classes: nextClasses, subjects: nextSubjects };
    });
  }, [updateData]);

  const cascadeClassRename = useCallback((oldName: string, newName: string) => {
    if (!oldName || oldName === newName) return;
    updateData(prev => {
      const nextClasses = prev.classes.map(c => {
        return c[0] === oldName ? [newName, c[1], c[2], c[3], c[4], c[5]] : c;
      }) as typeof prev.classes;
      const nextExceptions = (prev.conflictExceptions || []).map(ex => ({
        ...ex,
        classes: ex.classes.map(cn => cn === oldName ? newName : cn)
      }));
      return { ...prev, classes: nextClasses, conflictExceptions: nextExceptions };
    });
  }, [updateData]);

  const saveScenario = useCallback((name: string) => {
    try {
      const raw = localStorage.getItem(SCENARIOS_KEY);
      const scenarios = raw ? JSON.parse(raw) : {};
      scenarios[name] = dataRef.current;
      localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
    } catch (e) {
      notifyStorageError(e);
    }
  }, [notifyStorageError]);

  const loadScenario = useCallback((name: string): boolean => {
    try {
      const raw = localStorage.getItem(SCENARIOS_KEY);
      if (!raw) return false;
      const scenarios = JSON.parse(raw);
      if (!scenarios || !scenarios[name]) return false;
      updateData(() => normalize(scenarios[name]), false, { tag: 'SCENARIO', where: `Loaded scenario “${name}”` });
      return true;
    } catch (e) {
      console.error("Failed to load scenario:", e);
      return false;
    }
  }, [updateData]);

  const deleteScenario = useCallback((name: string) => {
    try {
      const raw = localStorage.getItem(SCENARIOS_KEY);
      if (!raw) return;
      const scenarios = JSON.parse(raw);
      delete scenarios[name];
      localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
    } catch (e) {
      console.error("Failed to delete scenario:", e);
    }
  }, []);

  const getScenarioNames = useCallback((): string[] => {
    try {
      const raw = localStorage.getItem(SCENARIOS_KEY);
      return raw ? Object.keys(JSON.parse(raw)).sort() : [];
    } catch (e) {
      console.error("Failed to get scenario names:", e);
      return [];
    }
  }, []);

  const resetEverything = useCallback(() => {
    const keysToClear = [
      STORAGE_KEY,
      SCENARIOS_KEY,
      'utAbsentTeacher',
      'utWorkloadOpen',
      'utHideGS',
      'utLastSaved',
      'utEditorClassIdx',
      'utEditorPeriodIdx',
      'utEditorMode',
      'utCurrentTab',
      'printStudioSecondHeaders',
      'utHistory'
    ];
    try {
      keysToClear.forEach(k => localStorage.removeItem(k));
    } catch (e) {
      console.warn("Storage clear error:", e);
    }
    dataRef.current = EMPTY_TIMETABLE_DATA;
    setData(EMPTY_TIMETABLE_DATA);
    clearSavedHistory();
    histRef.current = EMPTY_HISTORY;
    setHist(EMPTY_HISTORY);
  }, []);

  const exportBackupJson = useCallback((): string => {
    let scenarios: Record<string, unknown> = {};
    try {
      const scenariosRaw = localStorage.getItem(SCENARIOS_KEY);
      if (scenariosRaw) scenarios = JSON.parse(scenariosRaw);
    } catch {}
    return JSON.stringify({
      app: "TimetableGrid",
      version: 4,
      exportedAt: new Date().toISOString(),
      data: dataRef.current,
      scenarios
    }, null, 2);
  }, []);

  const importBackupJson = useCallback((jsonString: string): boolean => {
    try {
      const payload = JSON.parse(jsonString);
      if (!payload || typeof payload !== 'object') return false;

      let incomingData: TimetableData;

      // Validate the file shape before touching storage
      if (payload.app && payload.data) {
        if (!Array.isArray(payload.data.classes) || !Array.isArray(payload.data.teachers) || !Array.isArray(payload.data.periods)) {
          return false;
        }
        incomingData = normalize(payload.data);

        // Merge scenarios safely without overriding existing ones accidentally
        if (payload.scenarios && typeof payload.scenarios === 'object' && !Array.isArray(payload.scenarios)) {
          try {
            const raw = localStorage.getItem(SCENARIOS_KEY);
            const existing = raw ? JSON.parse(raw) : {};
            const merged = { ...existing, ...payload.scenarios };
            localStorage.setItem(SCENARIOS_KEY, JSON.stringify(merged));
          } catch (e) {
            notifyStorageError(e);
          }
        }
      } else if (Array.isArray(payload.classes) && Array.isArray(payload.teachers) && Array.isArray(payload.periods)) {
        incomingData = normalize(payload);
      } else {
        return false;
      }

      updateData(() => incomingData, false, { tag: 'IMPORT', where: 'Restored from backup file' });
      return true;
    } catch {
      return false;
    }
  }, [updateData, notifyStorageError]);

  return (
    <TimetableContext.Provider
      value={{
        data,
        setData,
        updateData,
        undo,
        redo,
        changeLog: hist,
        canUndo: hist.undo.length > 0,
        canRedo: hist.redo.length > 0,
        savedFlash,
        darkMode,
        toggleDarkMode,
        getTeacherTotalPeriods,
        getTeacherPeriodsOnDay,
        computeConflicts,
        collectTimetableIssues,
        teacherPeriodSummary,
        getLeavesForDate,
        setLeavesForDate,
        getLongLeavesForDate,
        markConflictIntentional,
        removeConflictException,
        cascadeTeacherRename,
        cascadeSubjectRename,
        cascadeClassRename,
        saveScenario,
        loadScenario,
        deleteScenario,
        getScenarioNames,
        resetEverything,
        exportBackupJson,
        importBackupJson,
      }}
    >
      {children}
      {storageNotice && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-rose-900 text-white text-xs font-bold rounded-xl shadow-lg border border-rose-700 animate-in fade-in duration-200">
          {storageNotice}
        </div>
      )}
    </TimetableContext.Provider>
  );
};

export const useTimetable = () => {
  const ctx = useContext(TimetableContext);
  if (!ctx) throw new Error("useTimetable must be used inside TimetableProvider");
  return ctx;
};