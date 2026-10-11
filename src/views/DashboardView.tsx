import React, { useMemo } from 'react';
import { useTimetable } from '../context/TimetableContext';
import { ActiveTab } from '../types/timetable';
import { dateKey } from '../utils/dates';
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
  Sparkles
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

  const [todayKey, setTodayKey] = React.useState(() => dateKey());
  const [hideQuickStart, setHideQuickStart] = React.useState(() => localStorage.getItem('utHideGS') === '1');
  React.useEffect(() => {
    const onVis = () => setTodayKey(dateKey());
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  const todayLeaves = useMemo(() => getLeavesForDate(todayKey), [getLeavesForDate, todayKey]);
  const issues = useMemo(() => collectTimetableIssues(), [collectTimetableIssues]);

  const errors = issues.filter(x => x.level === 'error');
  const warns = issues.filter(x => x.level === 'warn');

  const formattedDate = useMemo(() => {
    return new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }, []);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Welcome Banner */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 sm:p-6 border border-stone-200 dark:border-stone-800 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider mb-1">
              <Sparkles className="w-3.5 h-3.5" /> TimetableGrid Engine
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-stone-900 dark:text-stone-100 tracking-tight">
              {data.schoolName || "My School"}
            </h2>
            <p className="text-xs sm:text-sm text-stone-500 font-medium mt-0.5">
              {data.academicYear ? `Academic Year ${data.academicYear}` : "Academic Timetable"}
              {data.printNote ? ` · ${data.printNote}` : ""}
            </p>            <p className="text-[11px] text-stone-400 mt-1">
                              {(() => {
                                const t = Number(localStorage.getItem('utLastSaved') || 0);
                                if (!t) return 'No changes saved yet.';
                                const diff = Date.now() - t;
                                const m = Math.floor(diff / 60000);
                                if (m < 1) return 'Saved just now';
                                if (m < 60) return `Saved ${m} minute${m === 1 ? '' : 's'} ago`;
                                const h = Math.floor(m / 60);
                                if (h < 24) return `Saved ${h} hour${h === 1 ? '' : 's'} ago`;
                                const d = Math.floor(h / 24);
                                return `Saved ${d} day${d === 1 ? '' : 's'} ago`;
                              })()}
                            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('editor')}
              className="min-h-[44px] px-4 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-2xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 active:scale-95"
            >
              <span>Open Timetable Editor</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      {!hideQuickStart && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 rounded-2xl p-4 relative">
          <button
            type="button"
            onClick={() => { localStorage.setItem('utHideGS', '1'); setHideQuickStart(true); }}
            className="absolute top-2 right-3 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 text-lg leading-none cursor-pointer"
            title="Dismiss"
          >×</button>
          <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-200 mb-2">👋 Welcome — Quick Start</h3>
          <ol className="text-xs space-y-1 list-decimal pl-5 text-emerald-900 dark:text-emerald-200">
            <li>Set school name, periods, days, and break in <b>School Setup</b>.</li>
            <li>Add teachers, subjects, and classes in <b>Master Data</b>.</li>
            <li>Assign subjects and teachers in the <b>Timetable Editor</b>.</li>
            <li>Preview every format in <b>View Timetables</b>.</li>
            <li>Print or export from <b>Print &amp; Export</b>.</li>
          </ol>
        </div>
      )}
      {/* Key Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
        </div>        <div className="bg-white dark:bg-stone-900 rounded-2xl p-4 border border-stone-200 dark:border-stone-800">
                        <div className="text-2xl sm:text-3xl font-black text-emerald-800 dark:text-emerald-400 tabular-nums">
                          {data.subjects.length}
                        </div>
                        <div className="text-xs font-bold text-stone-600 dark:text-stone-400 mt-1 flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5" /> Subjects
                        </div>
                      </div>

        <div className="bg-white dark:bg-stone-900 rounded-2xl p-4 border border-stone-200 dark:border-stone-800">
          <div className="text-2xl sm:text-3xl font-black text-emerald-800 dark:text-emerald-400 tabular-nums">
            {data.daysPerWeek}
          </div>
          <div className="text-xs font-bold text-stone-600 dark:text-stone-400 mt-1 flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" /> Days / Week
          </div>
        </div>
      </div>

      {/* Timetable Integrity / Health Banner */}
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
                : "Timetable Schedule is 100% Conflict-Free"}
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5">
              {errors.length
                ? "Teachers are double-booked in multiple classrooms at the same period."
                : warns.length
                ? "Some periods are missing subject or teacher assignments."
                : "All periods, classrooms, and teacher assignments are harmonized."}
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
                        className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[11px] font-bold shrink-0 transition"
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

      {/* Today's Leaves & Substitutions Card */}
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
            className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold transition"
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
              const longLeaves = getLongLeavesForDate(todayKey);
              const ll = longLeaves.find(x => x.teacher === t);
              return (
                <div
                  key={t}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs font-bold text-amber-900 dark:text-amber-300"
                >
                  <span>{t}</span>
                  {ll && (
                    <span className="text-[10px] font-medium opacity-80">
                      ({ll.reason || "Long leave"})
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Teacher Workload Matrix Preview */}
      <div className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-200 dark:border-stone-800 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              Teacher Weekly Workload
            </h3>
            <p className="text-xs text-stone-500">Total assigned teaching periods across the week</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('roster')}
            className="text-xs font-bold text-emerald-800 dark:text-emerald-400 hover:underline"
          >
            Full Roster →
          </button>
        </div>

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
                const info = data.teacherInfo[t] || { qual: "", rank: "", desig: "" };
                const count = getTeacherTotalPeriods(t);
                return (
                  <tr key={t} className="hover:bg-stone-50/60 dark:hover:bg-stone-800/40">
                    <td className="py-2 px-4 font-bold text-stone-900 dark:text-stone-100">{t}</td>
                    <td className="py-2 px-4 text-stone-500">
                      {[info.rank, info.qual].filter(Boolean).join(" · ") || "—"}
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

      {/* Quick Setup / Navigation Action Bar */}
      <div className="flex flex-wrap gap-2.5 pt-1">
        <button
          type="button"
          onClick={() => onNavigate('master')}
          className="flex-1 min-h-[44px] py-2.5 px-4 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-800 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
        >
          <BookOpen className="w-4 h-4 text-emerald-700" />
          <span>Manage Master Lists</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className="flex-1 min-h-[44px] py-2.5 px-4 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-800 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
        >
          <Settings className="w-4 h-4 text-emerald-700" />
          <span>School Setup &amp; Backup</span>
        </button>
      </div>
    </div>
  );
};
