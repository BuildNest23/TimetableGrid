import React, { useState, useMemo, useCallback } from 'react';
import { useTimetable } from '../context/TimetableContext';
import { ActiveTab } from '../types/timetable';
import { dateKey } from '../utils/dates';
import { useNow } from '../hooks/useNow';
import {
  getLiveScheduleStatus,
  getClassAllocationsForPeriod,
  getSchoolDayIndex,
  getDaySchedule
} from '../utils/liveSchedule';
import {
  Users,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  CalendarDays,
  Clock,
  ArrowRight,
  BookOpen,
  Settings,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  Radio,
  UserX,
  Flame,
  Info
} from 'lucide-react';

interface DashboardViewProps {
  onNavigate: (tab: ActiveTab, context?: { period?: number; teacher?: string }) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const {
    data,
    getTeacherTotalPeriods,
    collectTimetableIssues,
    getLeavesForDate,
    getLongLeavesForDate
  } = useTimetable();

  // Real-time clock hook (updates every 10 seconds & on tab focus)
  const now = useNow(10000);

  // Today key for leaves
  const [todayKey, setTodayKey] = useState(() => dateKey());
  const [hideQuickStart, setHideQuickStart] = useState(() => localStorage.getItem('utHideGS') === '1');

  // Teacher Weekly Workload collapsible state (persisted in localStorage, collapsed by default)
  const [isWorkloadOpen, setIsWorkloadOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('utWorkloadOpen') === 'true';
    } catch {
      return false;
    }
  });

  const toggleWorkload = useCallback(() => {
    setIsWorkloadOpen(prev => {
      const next = !prev;
      try {
        localStorage.setItem('utWorkloadOpen', String(next));
      } catch (e) {
        console.warn('Could not save utWorkloadOpen:', e);
      }
      return next;
    });
  }, []);

  // Sync dateKey on visibility
  React.useEffect(() => {
    const onVis = () => setTodayKey(dateKey());
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const todayLeaves = useMemo(() => getLeavesForDate(todayKey), [getLeavesForDate, todayKey]);
  const longLeaves = useMemo(() => getLongLeavesForDate(todayKey), [getLongLeavesForDate, todayKey]);
  const issues = useMemo(() => collectTimetableIssues(), [collectTimetableIssues]);

  const errors = issues.filter(x => x.level === 'error');
  const warns = issues.filter(x => x.level === 'warn');

  const formattedDate = useMemo(() => {
    return now.toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }, [now]);

  const formattedTime = useMemo(() => {
    return now.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    });
  }, [now]);

  // Live schedule calculations
  const liveStatus = useMemo(() => {
    return getLiveScheduleStatus(data, now);
  }, [data, now]);

  // Manual period selection override for testing / browsing periods
  // null = live automatic following
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState<number | null>(null);

  // If user hasn't overridden, follow live period
  const effectivePeriodIndex = selectedPeriodIndex !== null ? selectedPeriodIndex : liveStatus.activePeriodIndex;
  const isViewingLive = selectedPeriodIndex === null || selectedPeriodIndex === liveStatus.activePeriodIndex;

  const currentDayIndex = useMemo(() => getSchoolDayIndex(now), [now]);
  const daySchedule = useMemo(() => getDaySchedule(data, currentDayIndex), [data, currentDayIndex]);

  // Search filter inside the Right Now class allocations
  const [classSearch, setClassSearch] = useState('');
  const [isClassGridCollapsed, setIsClassGridCollapsed] = useState(false);

  // Class allocations for the effective period
  const allocations = useMemo(() => {
    return getClassAllocationsForPeriod(
      data,
      currentDayIndex,
      effectivePeriodIndex,
      todayLeaves,
      longLeaves
    );
  }, [data, currentDayIndex, effectivePeriodIndex, todayLeaves, longLeaves]);

  // Filtered allocations
  const filteredAllocations = useMemo(() => {
    const q = classSearch.trim().toLowerCase();
    if (!q) return allocations;
    return allocations.filter(a =>
      a.className.toLowerCase().includes(q) ||
      a.teacher.toLowerCase().includes(q) ||
      a.subject.toLowerCase().includes(q) ||
      (a.slot2Teacher && a.slot2Teacher.toLowerCase().includes(q)) ||
      (a.slot2Subject && a.slot2Subject.toLowerCase().includes(q))
    );
  }, [allocations, classSearch]);

  const effectivePeriodNum = data.periods[effectivePeriodIndex] || (effectivePeriodIndex + 1);

  // Find slot for effective period to display time range
  const effectiveSlot = useMemo(() => {
    return daySchedule.periodSlots.find(s => s.periodIndex === effectivePeriodIndex);
  }, [daySchedule.periodSlots, effectivePeriodIndex]);

  return (
    <div className="space-y-4 sm:space-y-6 pb-12">
      {/* ---------------- 1. COMPACT TOP BAR ---------------- */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl p-4 sm:p-5 border border-stone-200 dark:border-stone-800 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider mb-0.5">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>TimetableGrid Engine</span>
            </div>
            <h1 className="text-lg sm:text-xl font-black text-stone-900 dark:text-stone-100 tracking-tight truncate">
              {data.schoolName || 'My School'}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-500 font-medium">
              <span>{data.academicYear ? `Academic Year ${data.academicYear}` : 'Academic Timetable'}</span>
              {data.printNote && <span>· {data.printNote}</span>}
              <span className="text-stone-400">·</span>
              <span className="text-[11px] text-stone-400">
                {(() => {
                  const t = Number(localStorage.getItem('utLastSaved') || 0);
                  if (!t) return 'No changes saved yet';
                  const diff = Date.now() - t;
                  const m = Math.floor(diff / 60000);
                  if (m < 1) return 'Saved just now';
                  if (m < 60) return `Saved ${m}m ago`;
                  const h = Math.floor(m / 60);
                  if (h < 24) return `Saved ${h}h ago`;
                  return `Saved ${Math.floor(h / 24)}d ago`;
                })()}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('editor')}
              className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 active:scale-95 cursor-pointer"
            >
              <span>Timetable Editor</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Quick Start Dismissible Banner */}
      {!hideQuickStart && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 rounded-2xl p-4 relative">
          <button
            type="button"
            onClick={() => {
              localStorage.setItem('utHideGS', '1');
              setHideQuickStart(true);
            }}
            className="absolute top-2 right-3 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 text-lg leading-none cursor-pointer p-1"
            title="Dismiss"
            aria-label="Dismiss quick start"
          >
            ×
          </button>
          <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-200 mb-1.5">👋 Welcome — Quick Start</h3>
          <ol className="text-xs space-y-0.5 list-decimal pl-5 text-emerald-900 dark:text-emerald-200">
            <li>Set school name, periods, days, and break in <b>School Setup</b>.</li>
            <li>Add teachers, subjects, and classes in <b>Master Data</b>.</li>
            <li>Assign subjects and teachers in the <b>Timetable Editor</b>.</li>
            <li>Preview every format in <b>View Timetables</b>.</li>
            <li>Print or export from <b>Print &amp; Export</b>.</li>
          </ol>
        </div>
      )}

      {/* ---------------- 2. NEW "RIGHT NOW" LIVE CARD ---------------- */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 sm:p-6 border border-stone-200 dark:border-stone-800 shadow-sm space-y-4">
        {/* Header: Clock, Active status, Live indicator */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  liveStatus.type === 'period'
                    ? 'bg-emerald-400'
                    : liveStatus.type === 'break'
                    ? 'bg-amber-400'
                    : 'bg-stone-400'
                }`} />
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  liveStatus.type === 'period'
                    ? 'bg-emerald-600'
                    : liveStatus.type === 'break'
                    ? 'bg-amber-600'
                    : 'bg-stone-500'
                }`} />
              </span>

              <h2 className="text-base sm:text-lg font-black text-stone-900 dark:text-stone-100 tracking-tight flex items-center gap-1.5">
                Right Now in School
              </h2>

              {daySchedule.isFridayTimings && (
                <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  {daySchedule.dayName} Timings
                </span>
              )}
            </div>

            <p className="text-xs text-stone-500 font-medium">
              {formattedDate} · <span className="font-semibold text-stone-700 dark:text-stone-300">{formattedTime}</span>
            </p>
          </div>

          {/* Current Live Session Badge & Countdown */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className={`px-3 py-1.5 rounded-2xl border text-xs font-bold flex items-center gap-2 shadow-2xs ${
              liveStatus.type === 'period'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800/80'
                : liveStatus.type === 'break'
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800/80'
                : liveStatus.type === 'assembly'
                ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200 border-sky-200 dark:border-sky-800/80'
                : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700'
            }`}>
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>{liveStatus.title}</span>
              {liveStatus.remainingMinutes > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-black/10 dark:bg-white/10 font-mono">
                  {liveStatus.remainingMinutes}m left
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Progress Bar for active running period/break/assembly */}
        {(liveStatus.type === 'period' || liveStatus.type === 'break' || liveStatus.type === 'assembly') && (
          <div className="space-y-1">
            <div className="h-1.5 w-full bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  liveStatus.type === 'break' ? 'bg-amber-500' : 'bg-emerald-600'
                }`}
                style={{ width: `${liveStatus.progressPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-stone-400">
              <span>{liveStatus.currentSlot?.startStr || '—'}</span>
              <span>{liveStatus.progressPercent}% completed</span>
              <span>{liveStatus.currentSlot?.endStr || '—'}</span>
            </div>
          </div>
        )}

        {/* Period Jumper / Testing Chips */}
        <div className="pt-1">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700 dark:text-stone-300">
              <Radio className="w-3.5 h-3.5 text-emerald-600" />
              <span>Period Jumper</span>
              {!isViewingLive && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-normal">
                  (Simulated preview)
                </span>
              )}
            </div>

            {!isViewingLive && (
              <button
                type="button"
                onClick={() => setSelectedPeriodIndex(null)}
                className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Jump back to Live</span>
                <Clock className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {/* Live indicator chip */}
            <button
              type="button"
              onClick={() => setSelectedPeriodIndex(null)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition cursor-pointer flex items-center gap-1.5 border ${
                isViewingLive
                  ? 'bg-emerald-800 text-white border-emerald-900 shadow-xs'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-200 dark:hover:bg-stone-700'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isViewingLive ? 'bg-emerald-300 animate-pulse' : 'bg-stone-400'}`} />
              <span>Live Clock</span>
            </button>

            {/* Individual Period chips */}
            {data.periods.map((pNum, pi) => {
              const slot = daySchedule.periodSlots.find(s => s.periodIndex === pi);
              const isSelected = effectivePeriodIndex === pi;
              const isLivePeriod = liveStatus.type === 'period' && liveStatus.activePeriodIndex === pi;

              return (
                <button
                  key={pNum}
                  type="button"
                  onClick={() => setSelectedPeriodIndex(pi)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition cursor-pointer flex flex-col items-center border ${
                    isSelected
                      ? 'bg-emerald-800 text-white border-emerald-900 shadow-xs'
                      : isLivePeriod
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                      : 'bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700'
                  }`}
                  title={slot ? `${slot.startStr} - ${slot.endStr}` : `Period ${pNum}`}
                >
                  <span className="leading-tight">P{pNum}</span>
                  {slot?.startStr && (
                    <span className={`text-[9px] font-normal leading-tight opacity-80 ${isSelected ? 'text-emerald-100' : 'text-stone-500 dark:text-stone-400'}`}>
                      {slot.startStr}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Class Allocations Section */}
        <div className="pt-2 border-t border-stone-100 dark:border-stone-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                <span>Classes in Period {effectivePeriodNum}</span>
                {effectiveSlot?.startStr && (
                  <span className="text-xs font-semibold text-stone-500">
                    ({effectiveSlot.startStr} – {effectiveSlot.endStr})
                  </span>
                )}
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 font-semibold">
                {filteredAllocations.length} of {allocations.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Search box for filtering classes */}
              <div className="relative min-w-[180px] sm:min-w-[220px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
                <input
                  type="text"
                  value={classSearch}
                  onChange={e => setClassSearch(e.target.value)}
                  placeholder="Filter class, subject, teacher..."
                  className="w-full pl-8 pr-7 py-1.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl text-xs text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-emerald-600 transition placeholder:text-stone-400"
                />
                {classSearch && (
                  <button
                    type="button"
                    onClick={() => setClassSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-0.5"
                    aria-label="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Collapse/Expand toggle */}
              <button
                type="button"
                onClick={() => setIsClassGridCollapsed(prev => !prev)}
                className="p-1.5 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer"
                title={isClassGridCollapsed ? 'Expand class grid' : 'Collapse class grid'}
                aria-label={isClassGridCollapsed ? 'Expand class grid' : 'Collapse class grid'}
              >
                {isClassGridCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Grid of compact class tiles */}
          {!isClassGridCollapsed && (
            filteredAllocations.length === 0 ? (
              <div className="text-center py-8 text-stone-400 text-xs bg-stone-50 dark:bg-stone-800/40 rounded-2xl">
                No classes match "{classSearch}"
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
                {filteredAllocations.map(alloc => (
                  <div
                    key={alloc.className}
                    className={`p-3 rounded-2xl border transition-all text-xs flex flex-col justify-between min-h-[96px] shadow-2xs ${
                      alloc.isTeacherOnLeave || alloc.isSlot2TeacherOnLeave
                        ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800/80 ring-1 ring-amber-400/30'
                        : alloc.isFree
                        ? 'bg-stone-50 dark:bg-stone-800/40 border-stone-200/80 dark:border-stone-800 text-stone-400'
                        : 'bg-white dark:bg-stone-800/80 border-stone-200 dark:border-stone-700 hover:border-emerald-500/60'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <span className="font-extrabold text-stone-900 dark:text-stone-100 truncate">
                          {alloc.className}
                        </span>
                        {alloc.section && (
                          <span className="text-[10px] text-stone-400 shrink-0 font-medium">
                            {alloc.section}
                          </span>
                        )}
                      </div>

                      {/* Subject Badge */}
                      <div className="mb-1.5">
                        <span className={`inline-block px-1.5 py-0.5 rounded-md font-semibold text-[11px] truncate max-w-full ${
                          alloc.isFree
                            ? 'bg-stone-100 dark:bg-stone-700 text-stone-500'
                            : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200'
                        }`}>
                          {alloc.subject}
                        </span>

                        {alloc.slot2Subject && (
                          <span className="inline-block px-1.5 py-0.5 rounded-md font-semibold text-[10px] bg-sky-100 dark:bg-sky-950/60 text-sky-900 dark:text-sky-200 ml-1 truncate max-w-full">
                            + {alloc.slot2Subject}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Teacher & Leave Status */}
                    <div className="pt-1 border-t border-stone-100 dark:border-stone-700/60">
                      {alloc.isTeacherOnLeave ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1 font-bold text-amber-900 dark:text-amber-300 truncate">
                            <UserX className="w-3 h-3 text-amber-600 shrink-0" />
                            <span className="truncate">{alloc.teacher}</span>
                          </div>
                          <div className="text-[10px] font-semibold text-amber-800 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded leading-tight">
                            On Leave · Needs Sub
                          </div>
                        </div>
                      ) : (
                        <div className="text-stone-600 dark:text-stone-300 font-medium truncate flex items-center gap-1">
                          <span className="truncate">{alloc.teacher}</span>
                        </div>
                      )}

                      {/* Slot 2 Teacher if present */}
                      {alloc.slot2Teacher && (
                        <div className={`text-[10px] truncate ${
                          alloc.isSlot2TeacherOnLeave ? 'text-amber-700 font-bold' : 'text-stone-500 dark:text-stone-400'
                        }`}>
                          + {alloc.slot2Teacher} {alloc.isSlot2TeacherOnLeave && '(Leave)'}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* ---------------- 3. TIMETABLE INTEGRITY / HEALTH BANNER ---------------- */}
      <div
        className={`rounded-2xl p-4 sm:p-5 border transition-colors ${
          errors.length
            ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60'
            : warns.length
            ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60'
            : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60'
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-white dark:bg-stone-900 shrink-0 shadow-xs">
            {errors.length ? (
              <AlertTriangle className="w-5 h-5 text-rose-600" />
            ) : warns.length ? (
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              {errors.length
                ? `${errors.length} Conflict(s) Detected`
                : warns.length
                ? `${warns.length} Incomplete Assignments`
                : 'Timetable Schedule is 100% Conflict-Free'}
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5">
              {errors.length
                ? 'Teachers are double-booked in multiple classrooms at the same period.'
                : warns.length
                ? 'Some periods are missing subject or teacher assignments.'
                : 'All periods, classrooms, and teacher assignments are harmonized.'}
            </p>

            {/* List first 3 errors/warns with jump-to-fix buttons */}
            {(errors.length > 0 || warns.length > 0) && (
              <ul className="mt-3 space-y-2">
                {[...errors, ...warns].slice(0, 3).map((issue, idx) => (
                  <li
                    key={idx}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs py-1.5 px-3 bg-white/80 dark:bg-stone-900/80 rounded-xl border border-stone-200/60 dark:border-stone-800"
                  >
                    <span className="font-semibold text-stone-800 dark:text-stone-200 truncate">
                      {issue.text}
                    </span>
                    {issue.kind === 'conflict' && issue.period !== undefined && issue.teacher && (
                      <button
                        type="button"
                        onClick={() =>
                          onNavigate('editor', { period: issue.period, teacher: issue.teacher })
                        }
                        className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[11px] font-bold shrink-0 transition cursor-pointer"
                      >
                        Fix in Editor →
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ---------------- 4. STAFF ON LEAVE TODAY ---------------- */}
      <div className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-200 dark:border-stone-800 shadow-xs">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 rounded-xl">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                Staff On Leave Today
              </h3>
              <p className="text-xs text-stone-500">{formattedDate}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('substitute')}
            className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Substitute Board →
          </button>
        </div>

        {todayLeaves.length === 0 ? (
          <div className="p-4 bg-stone-50 dark:bg-stone-800/40 rounded-xl text-xs text-stone-500 text-center font-medium">
            All teachers are present today. No substitutions required.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {todayLeaves.map(t => {
              const ll = longLeaves.find(x => x.teacher === t);
              return (
                <div
                  key={t}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs font-bold text-amber-900 dark:text-amber-300"
                >
                  <span>{t}</span>
                  {ll && (
                    <span className="text-[10px] font-medium opacity-80">
                      ({ll.reason || 'Long leave'})
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ---------------- 5. KEY METRIC CARDS ---------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-stone-900 rounded-2xl p-4 border border-stone-200 dark:border-stone-800">
          <div className="text-2xl sm:text-3xl font-black text-emerald-800 dark:text-emerald-400 tabular-nums">
            {data.classes.length}
          </div>
          <div className="text-xs font-bold text-stone-600 dark:text-stone-400 mt-1 flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" /> Classes
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-2xl p-4 border border-stone-200 dark:border-stone-800">
          <div className="text-2xl sm:text-3xl font-black text-emerald-800 dark:text-emerald-400 tabular-nums">
            {data.teachers.length}
          </div>
          <div className="text-xs font-bold text-stone-600 dark:text-stone-400 mt-1 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Teachers
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-2xl p-4 border border-stone-200 dark:border-stone-800">
          <div className="text-2xl sm:text-3xl font-black text-emerald-800 dark:text-emerald-400 tabular-nums">
            {data.periods.length}
          </div>
          <div className="text-xs font-bold text-stone-600 dark:text-stone-400 mt-1 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Periods / Day
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-2xl p-4 border border-stone-200 dark:border-stone-800">
          <div className="text-2xl sm:text-3xl font-black text-emerald-800 dark:text-emerald-400 tabular-nums">
            {data.subjects.length}
          </div>
          <div className="text-xs font-bold text-stone-600 dark:text-stone-400 mt-1 flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" /> Subjects
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-2xl p-4 border border-stone-200 dark:border-stone-800 col-span-2 sm:col-span-1">
          <div className="text-2xl sm:text-3xl font-black text-emerald-800 dark:text-emerald-400 tabular-nums">
            {data.daysPerWeek}
          </div>
          <div className="text-xs font-bold text-stone-600 dark:text-stone-400 mt-1 flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" /> Days / Week
          </div>
        </div>
      </div>

      {/* ---------------- 6. TEACHER WEEKLY WORKLOAD (COLLAPSED BY DEFAULT) ---------------- */}
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={toggleWorkload}
          aria-expanded={isWorkloadOpen}
          aria-controls="teacher-workload-content"
          className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-stone-50/70 dark:hover:bg-stone-800/40 transition cursor-pointer group"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-xl">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 group-hover:text-emerald-800 dark:group-hover:text-emerald-300 transition">
                Teacher Weekly Workload
              </h3>
              <p className="text-xs text-stone-500">
                {isWorkloadOpen
                  ? 'Total assigned teaching periods across the week'
                  : `Assigned teaching load for ${data.teachers.length} teachers (tap to expand)`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              onClick={e => {
                e.stopPropagation();
                onNavigate('roster');
              }}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  onNavigate('roster');
                }
              }}
              className="text-xs font-bold text-emerald-800 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              Full Roster →
            </span>

            <div
              className={`p-1 rounded-lg text-stone-400 group-hover:text-stone-700 dark:group-hover:text-stone-200 transition-transform duration-200 ${
                isWorkloadOpen ? 'rotate-180' : ''
              }`}
            >
              <ChevronDown className="w-5 h-5" />
            </div>
          </div>
        </button>

        {/* Collapsible Content */}
        <div
          id="teacher-workload-content"
          className={`grid transition-[grid-template-rows] duration-250 ease-in-out ${
            isWorkloadOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="overflow-hidden">
            <div className="p-4 sm:p-5 pt-0 border-t border-stone-100 dark:border-stone-800">
              <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50 dark:bg-stone-800 border-b border-stone-200 dark:border-stone-800">
                    <tr>
                      <th className="py-2.5 px-4 font-bold text-stone-700 dark:text-stone-300">Teacher</th>
                      <th className="py-2.5 px-4 font-bold text-stone-700 dark:text-stone-300">Group / Grade</th>
                      <th className="py-2.5 px-4 font-bold text-stone-700 dark:text-stone-300 text-right">Periods / Week</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60">
                    {data.teachers.map(t => {
                      const info = data.teacherInfo[t] || { qual: '', rank: '', desig: '' };
                      const count = getTeacherTotalPeriods(t);
                      return (
                        <tr key={t} className="hover:bg-stone-50/60 dark:hover:bg-stone-800/40">
                          <td className="py-2 px-4 font-bold text-stone-900 dark:text-stone-100">{t}</td>
                          <td className="py-2 px-4 text-stone-500">
                            {[info.rank, info.qual].filter(Boolean).join(' · ') || '—'}
                          </td>
                          <td className="py-2 px-4 text-right font-mono font-bold text-emerald-800 dark:text-emerald-400 tabular-nums">
                            {count}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- 7. QUICK ACTION BUTTONS ---------------- */}
      <div className="flex flex-wrap gap-2.5 pt-1">
        <button
          type="button"
          onClick={() => onNavigate('master')}
          className="flex-1 min-h-[44px] py-2.5 px-4 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-800 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
        >
          <BookOpen className="w-4 h-4 text-emerald-700" />
          <span>Manage Master Lists</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className="flex-1 min-h-[44px] py-2.5 px-4 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-800 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
        >
          <Settings className="w-4 h-4 text-emerald-700" />
          <span>School Setup &amp; Backup</span>
        </button>
      </div>
    </div>
  );
};
