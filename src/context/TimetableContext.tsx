import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  TimetableData,
  EMPTY_TIMETABLE_DATA,
  Slot2,
  ConflictException,
  LongLeave,
  TeacherInfo,
  DAY_NAMES
} from '../types/timetable';

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
  updateData: (updater: (prev: TimetableData) => TimetableData, silent?: boolean) => void;
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
const MAX_HISTORY = 30;

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

  return base;
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

  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [savedFlash, setSavedFlash] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('utDarkMode') === '1';
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
    localStorage.setItem('utDarkMode', darkMode ? '1' : '0');
  }, [darkMode]);

  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => !prev);
  }, []);

  const triggerSaveIndicator = useCallback(() => {
    setSavedFlash(true);
    const timer = setTimeout(() => setSavedFlash(false), 900);
    return () => clearTimeout(timer);
  }, []);

  const updateData = useCallback((updater: (prev: TimetableData) => TimetableData, silent = false) => {
    setData(prev => {
      const nextRaw = updater(prev);
      const next = normalize(nextRaw);
      const prevStr = JSON.stringify(prev);
      const nextStr = JSON.stringify(next);

      if (prevStr !== nextStr) {
        setHistoryStack(hs => {
          const newStack = [...hs, prevStr];
          if (newStack.length > MAX_HISTORY) newStack.shift();
          return newStack;
        });
        setRedoStack([]);

        try {
          localStorage.setItem(STORAGE_KEY, nextStr);
          if (!silent) {
            localStorage.setItem('utLastSaved', String(Date.now()));
            triggerSaveIndicator();
          }
        } catch (e) {
          console.error("Storage save failed:", e);
        }
      }
      return next;
    });
  }, [triggerSaveIndicator]);

  const undo = useCallback(() => {
    if (!historyStack.length) return;
    const prevStr = historyStack[historyStack.length - 1];
    setHistoryStack(hs => hs.slice(0, -1));
    setRedoStack(rs => [...rs, JSON.stringify(data)]);
    const restored = normalize(JSON.parse(prevStr));
    setData(restored);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
    triggerSaveIndicator();
  }, [historyStack, data, triggerSaveIndicator]);

  const redo = useCallback(() => {
    if (!redoStack.length) return;
    const nextStr = redoStack[redoStack.length - 1];
    setRedoStack(rs => rs.slice(0, -1));
    setHistoryStack(hs => [...hs, JSON.stringify(data)]);
    const restored = normalize(JSON.parse(nextStr));
    setData(restored);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
    triggerSaveIndicator();
  }, [redoStack, data, triggerSaveIndicator]);

  // Load map: total weekly periods per teacher.
  // For "same" mode both subjects share one teacher — count once, not twice.
  const loadMap = useMemo(() => {
    const m: Record<string, number> = {};
    data.teachers.forEach(t => { m[t] = 0; });

    for (let pi = 0; pi < data.periods.length; pi++) {
      const byTeacher: Record<string, Set<number>> = {};
      data.classes.forEach((c, ci) => {
        const t1 = c[4][pi];
        const s2 = c[5] ? c[5][pi] : null;

        if (t1) {
          if (!byTeacher[t1]) byTeacher[t1] = new Set();
          byTeacher[t1].add(ci);
        }
        if (s2 && s2.teacher && s2.mode !== 'same') {
          if (!byTeacher[s2.teacher]) byTeacher[s2.teacher] = new Set();
          byTeacher[s2.teacher].add(ci);
        }
      });

      for (const t in byTeacher) {
        const set = byTeacher[t];
        if (set.size === 0) continue;
        if (set.size === 1) {
          m[t] = (m[t] || 0) + 1;
          continue;
        }
        const names = Array.from(set).map(ci => data.classes[ci][0]);
        const covered = (data.conflictExceptions || []).some(
          ex => ex.period === pi && ex.teacher === t && ex.classes.length === names.length && ex.classes.every(cn => names.includes(cn))
        );
        m[t] = (m[t] || 0) + (covered ? 1 : set.size);
      }
    }
    return m;
  }, [data.teachers, data.classes, data.periods.length, data.conflictExceptions]);

  const getTeacherTotalPeriods = useCallback((teacher: string) => {
    return loadMap[teacher] || 0;
  }, [loadMap]);

  // Count how many periods this teacher teaches on a given weekday.
  // - rotation: only slot2 teacher teaches on the listed days (slot1 teacher teaches the other days)
  // - parallel: both teachers teach every day
  // - same:     same teacher teaches the combined subject — count once per class
  const getTeacherPeriodsOnDay = useCallback((teacher: string, dayIndex: number) => {
    if (dayIndex < 0 || dayIndex >= data.daysPerWeek) return 0;
    let n = 0;
    data.classes.forEach((c) => {
      for (let pi = 0; pi < data.periods.length; pi++) {
        const t1 = c[4][pi];
        const s2 = c[5] ? c[5][pi] : null;

        if (s2 && s2.mode === 'rotation') {
          const slot2Active = s2.days.includes(dayIndex);
          if (!slot2Active && t1 === teacher) { n++; continue; }
          if (slot2Active && s2.teacher === teacher) { n++; continue; }
          continue;
        }

        if (s2 && s2.mode === 'same') {
          // Same-teacher mode: teacher teaches every day —
          // slot1's subject on non-listed days, slot2's subject on listed days.
          const combinedTeacher = t1 || s2.teacher;
          if (combinedTeacher === teacher) n++;
          continue;
        }

        // parallel or no slot2
        if (t1 === teacher) { n++; continue; }
        if (s2 && s2.teacher === teacher) { n++; continue; }
      }
    });
    return n;
  }, [data.daysPerWeek, data.classes, data.periods.length]);

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
    data.classes.forEach(c => {
      data.periods.forEach((p, i) => {
        const sub = (c[3][i] || "").trim();
        const tea = (c[4][i] || "").trim();
        if (!sub && !tea) {
          issues.push({ level: 'warn', kind: 'empty', text: `${c[0]} · Period ${p}: no subject or teacher assigned.` });
        } else if (!sub) {
          issues.push({ level: 'warn', kind: 'no-subject', text: `${c[0]} · Period ${p}: teacher "${tea}" set, but no subject.` });
        } else if (!tea) {
          issues.push({ level: 'warn', kind: 'no-teacher', text: `${c[0]} · Period ${p}: subject "${sub}" set, but no teacher.` });
        }

        const s2 = c[5] ? c[5][i] : null;
        if (s2) {
          const s2sub = (s2.subject || "").trim();
          const s2tea = (s2.teacher || "").trim();
          if (!s2sub) {
            issues.push({ level: 'warn', kind: 'slot2-sub', text: `${c[0]} · Period ${p}: 2nd slot has no subject.` });
          }
          if (s2.mode !== 'same' && !s2tea) {
            issues.push({ level: 'warn', kind: 'slot2-tea', text: `${c[0]} · Period ${p}: 2nd subject "${s2sub}" has no teacher.` });
          }
          if (s2.mode === 'rotation' && (!Array.isArray(s2.days) || s2.days.length === 0)) {
            issues.push({ level: 'warn', kind: 'slot2-days', text: `${c[0]} · Period ${p}: rotation slot has no active days.` });
          }
        }
      });
    });

    const conflicts = computeConflicts();
    conflicts.forEach((bad, pi) => {
      Object.keys(bad).forEach(t => {
        const info = bad[t];
        const dayTxt = info.days.map(d => (DAY_NAMES[d] || "").slice(0, 3)).join(", ");
        issues.push({
          level: 'error',
          kind: 'conflict',
          period: pi,
          teacher: t,
          text: `Period ${data.periods[pi]}: ${t} double-booked in ${info.classes.join(", ")} (${dayTxt || 'every day'}).`
        });
      });
    });

    data.periodTimes.forEach((pt, i) => {
      if (!pt.start || !pt.end) {
        issues.push({ level: 'info', kind: 'time', text: `Period ${data.periods[i]}: time slot not configured.` });
      }
    });

    data.classes.forEach(c => {
      if (!(c[1] || "").trim()) {
        issues.push({ level: 'info', kind: 'incharge', text: `${c[0]}: no incharge assigned.` });
      }
    });

    return issues;
  }, [data.classes, data.periods, data.periodTimes, computeConflicts]);

  // Teacher summary — how each period's assignments look for a teacher.
  // - rotation: only the slot2 teacher teaches on the listed days
  // - parallel: both teachers teach every day
  // - same:     same teacher teaches a combined subject (e.g. "Maths/Bio - Mr. X")
  const teacherPeriodSummary = useCallback((teacher: string, periodIndex: number): string => {
    const map = new Map<string, { subject: string; className: string; days: Set<number> }>();

    data.classes.forEach((c) => {
      for (let d = 0; d < data.daysPerWeek; d++) {
        const t1 = c[4][periodIndex];
        const s2 = c[5] ? c[5][periodIndex] : null;

        let hit = false;
        let subj = "";

        if (s2 && s2.mode === 'rotation') {
          const slot2Active = s2.days.includes(d);
          if (slot2Active) {
            if (s2.teacher === teacher) {
              hit = true;
              subj = s2.subject || "—";
            }
          } else {
            if (t1 === teacher) {
              hit = true;
              subj = c[3][periodIndex] || "—";
            }
          }
        } else if (s2 && s2.mode === 'same') {
          // Combined subject taught by the same teacher.
          // If specific days are set, tag the subject with those days —
          // e.g. "Urdu/Lib (Mon)" — so it matches the Whole School view.
          const combinedTeacher = t1 || s2.teacher;
          if (combinedTeacher === teacher) {
            hit = true;
            const sub1 = c[3][periodIndex] || "—";
            const sub2 = s2.subject || "—";
            const hasMask = Array.isArray(s2.days) && s2.days.length > 0;
            if (hasMask) {
              const dayStr = s2.days
                .slice()
                .sort((a, b) => a - b)
                .map(d => (DAY_NAMES[d] || "").slice(0, 3))
                .join(", ");
              subj = `${sub1}/${sub2} (${dayStr})`;
            } else {
              subj = `${sub1}/${sub2}`;
            }
          }
        } else {
          // parallel or no slot2 — the common case.
          if (t1 === teacher) {
            hit = true;
            subj = c[3][periodIndex] || "—";
          }
          if (s2 && s2.teacher === teacher) {
            const sub2 = s2.subject || "—";
            if (hit) subj = `${subj}/${sub2}`;
            else { hit = true; subj = sub2; }
          }
        }

        if (hit) {
          const key = `${subj}||${c[0]}`;
          if (!map.has(key)) {
            map.set(key, { subject: subj, className: c[0], days: new Set() });
          }
          map.get(key)!.days.add(d);
        }
      }
    });

    if (map.size === 0) return "Free";

    const parts: string[] = [];
    map.forEach(entry => {
      const base = `${entry.subject} - ${entry.className}`;
      if (entry.days.size === data.daysPerWeek) {
        parts.push(base);
      } else {
        const dayStr = Array.from(entry.days).sort((a, b) => a - b).map(d => (DAY_NAMES[d] || "").slice(0, 3)).join(", ");
        parts.push(`${base} (${dayStr})`);
      }
    });

    return parts.join(", ");
  }, [data.classes, data.daysPerWeek]);

  const getLongLeavesForDate = useCallback((dateKey: string): LongLeave[] => {
    return (data.longLeaves || []).filter(ll => ll && ll.from && dateKey >= ll.from && (!ll.to || dateKey <= ll.to));
  }, [data.longLeaves]);

  const getLeavesForDate = useCallback((dateKey: string): string[] => {
    const set = new Set<string>();
    if (data.teacherLeaves && data.teacherLeaves[dateKey]) {
      data.teacherLeaves[dateKey].forEach(t => set.add(t));
    }
    getLongLeavesForDate(dateKey).forEach(ll => set.add(ll.teacher));
    return Array.from(set);
  }, [data.teacherLeaves, getLongLeavesForDate]);

  const setLeavesForDate = useCallback((dateKey: string, teachers: string[]) => {
    updateData(prev => {
      const nextLeaves = { ...prev.teacherLeaves };
      if (!teachers.length) {
        delete nextLeaves[dateKey];
      } else {
        nextLeaves[dateKey] = teachers;
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
    const raw = localStorage.getItem(SCENARIOS_KEY);
    const scenarios = raw ? JSON.parse(raw) : {};
    scenarios[name] = data;
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
  }, [data]);

  const loadScenario = useCallback((name: string): boolean => {
    const raw = localStorage.getItem(SCENARIOS_KEY);
    if (!raw) return false;
    const scenarios = JSON.parse(raw);
    if (!scenarios[name]) return false;
    updateData(() => normalize(scenarios[name]));
    return true;
  }, [updateData]);

  const deleteScenario = useCallback((name: string) => {
    const raw = localStorage.getItem(SCENARIOS_KEY);
    if (!raw) return;
    const scenarios = JSON.parse(raw);
    delete scenarios[name];
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
  }, []);

  const getScenarioNames = useCallback((): string[] => {
    const raw = localStorage.getItem(SCENARIOS_KEY);
    return raw ? Object.keys(JSON.parse(raw)).sort() : [];
  }, []);

  const resetEverything = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SCENARIOS_KEY);
    setData(EMPTY_TIMETABLE_DATA);
    setHistoryStack([]);
    setRedoStack([]);
  }, []);

  const exportBackupJson = useCallback((): string => {
    const scenariosRaw = localStorage.getItem(SCENARIOS_KEY);
    const scenarios = scenariosRaw ? JSON.parse(scenariosRaw) : {};
    return JSON.stringify({
      app: "ClassGrid",
      version: 4,
      exportedAt: new Date().toISOString(),
      data,
      scenarios
    }, null, 2);
  }, [data]);

  const importBackupJson = useCallback((jsonString: string): boolean => {
    try {
      const payload = JSON.parse(jsonString);
      let incomingData: TimetableData;
      if (payload.app && payload.data) {
        incomingData = normalize(payload.data);
        if (payload.scenarios) {
          localStorage.setItem(SCENARIOS_KEY, JSON.stringify(payload.scenarios));
        }
      } else if (payload.classes && payload.teachers && payload.periods) {
        incomingData = normalize(payload);
      } else {
        return false;
      }
      updateData(() => incomingData);
      return true;
    } catch {
      return false;
    }
  }, [updateData]);

  return (
    <TimetableContext.Provider
      value={{
        data,
        setData,
        updateData,
        undo,
        redo,
        canUndo: historyStack.length > 0,
        canRedo: redoStack.length > 0,
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
    </TimetableContext.Provider>
  );
};

export const useTimetable = () => {
  const ctx = useContext(TimetableContext);
  if (!ctx) throw new Error("useTimetable must be used inside TimetableProvider");
  return ctx;
};