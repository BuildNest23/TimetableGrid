import React, { useState } from 'react';
import { useTimetable } from '../context/TimetableContext';
import { createTimetableCanvas, shareOrDownloadCanvas } from '../utils/canvasExport';
import { DAY_NAMES } from '../types/timetable';
import {
  Download,
  Share2,
  Maximize2,
  Calendar,
  Users,
  Clock,
  School,
  UserCheck
} from 'lucide-react';

/* ---------------------------------------------------------------
   Calculate duration in minutes between two "H:MM AM/PM" strings.
   Returns "—" if either is blank or unparseable.
   --------------------------------------------------------------- */
function calculateDuration(start: string, end: string): string {
  if (!start || !end) return "—";
  const parse = (s: string): number | null => {
    const m = String(s).trim().toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ampm = m[3];
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return h * 60 + min;
  };
  const s = parse(start);
  const e = parse(end);
  if (s === null || e === null) return "—";
  let diff = e - s;
  if (diff < 0) diff += 24 * 60;
  return diff + " min";
}

export const ViewTimetablesView: React.FC = () => {
  const {
    data,
    updateData,
    teacherPeriodSummary,
    getTeacherTotalPeriods,
    getLeavesForDate
  } = useTimetable();

  const [activeSection, setActiveSection] = useState<'whole' | 'allteachers' | 'timings' | 'class' | 'teacher'>('whole');
  const [selectedClass, setSelectedClass] = useState<string>(data.classes[0]?.[0] || "");
  const [selectedTeacher, setSelectedTeacher] = useState<string>(data.teachers[0] || "");
  const [fullscreenMode, setFullscreenMode] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const currentClass = data.classes.find(c => c[0] === selectedClass) || data.classes[0];
  const currentTeacher = selectedTeacher || data.teachers[0];

  const handleExportImage = async (share = false) => {
    setIsExporting(true);
    try {
      const canvas = await createTimetableCanvas(activeSection, data, {
        selectedClass,
        selectedTeacher,
        teacherPeriodSummary,
        teacherTotalPeriods: getTeacherTotalPeriods,
        getLeavesForDate
      });

      const stamp = new Date().toISOString().slice(0, 10);
      const title = `${data.schoolName} — ${activeSection.toUpperCase()}`;
      const fileName = `ClassGrid-${activeSection}-${stamp}.png`;

      await shareOrDownloadCanvas(canvas, fileName, title);
    } catch (err) {
      console.error("Export error:", err);
      alert("Failed to export image.");
    } finally {
      setIsExporting(false);
    }
  };

  const sections = [
    { id: 'whole' as const, label: '1. Whole School', icon: School },
    { id: 'allteachers' as const, label: '2. All Teachers', icon: Users },
    { id: 'timings' as const, label: '3. School Timings', icon: Clock },
    { id: 'class' as const, label: '4. Class Wise', icon: Calendar },
    { id: 'teacher' as const, label: '5. Teacher Wise', icon: UserCheck },
  ];

  /* ---------------------------------------------------------------
     Timings helpers — shared between non-fullscreen and fullscreen.
     Handles merge mode (Friday inline with a divider) and separate
     mode (second table below the main one) based on fridayTimings.enabled.
     --------------------------------------------------------------- */
  const buildTimingsMeta = () => {
    const ft = data.fridayTimings;
    const fridayHasAnyData = !!(
      ft &&
      ((ft.assemblyTime?.start || ft.assemblyTime?.end) ||
        (Array.isArray(ft.periodTimes) && ft.periodTimes.some(pt => pt && (pt.start || pt.end))))
    );
    return {
      ft,
      fridayHasAnyData,
      mergeMode: fridayHasAnyData && !ft.enabled,
      separateMode: fridayHasAnyData && !!ft.enabled,
      fridayDayName: ft ? (DAY_NAMES[ft.dayIndex]?.toUpperCase() || "FRIDAY") : "FRIDAY"
    };
  };

  const weekdayTimingsRows = (
    <>
      {data.assemblyTime && (data.assemblyTime.start || data.assemblyTime.end) && (
        <tr className="bg-stone-50/50 dark:bg-stone-800/40">
          <td className="py-2.5 px-4 font-bold">Assembly</td>
          <td className="py-2.5 px-4">
            {data.assemblyTime.start || "—"} - {data.assemblyTime.end || "—"}
          </td>
          <td className="py-2.5 px-4 font-semibold text-emerald-800 dark:text-emerald-400">
            {calculateDuration(data.assemblyTime.start, data.assemblyTime.end)}
          </td>
        </tr>
      )}
      {data.periods.map((p, i) => (
        <React.Fragment key={p}>
          <tr>
            <td className="py-2.5 px-4 font-bold">{p}</td>
            <td className="py-2.5 px-4">
              {data.periodTimes[i]?.start || "—"} - {data.periodTimes[i]?.end || "—"}
            </td>
            <td className="py-2.5 px-4 font-semibold text-emerald-800 dark:text-emerald-400">
              {calculateDuration(data.periodTimes[i]?.start || "", data.periodTimes[i]?.end || "")}
            </td>
          </tr>
          {data.breakAfter === p && i < data.periods.length - 1 && (
            <tr className="bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 font-bold">
              <td className="py-2 px-4">BREAK</td>
              <td className="py-2 px-4">
                {data.periodTimes[i]?.end || "—"} - {data.periodTimes[i + 1]?.start || "—"}
              </td>
              <td className="py-2 px-4">
                {calculateDuration(
                  data.periodTimes[i]?.end || "",
                  data.periodTimes[i + 1]?.start || ""
                )}
              </td>
            </tr>
          )}
        </React.Fragment>
      ))}
    </>
  );

  const buildFridayTimingsRows = () => {
    const ft = data.fridayTimings;
    if (!ft) return null;
    return (
      <>
        {ft.assemblyTime && (ft.assemblyTime.start || ft.assemblyTime.end) && (
          <tr className="bg-stone-50/50 dark:bg-stone-800/40">
            <td className="py-2 px-4 font-bold">Assembly</td>
            <td className="py-2 px-4">
              {ft.assemblyTime.start || "—"} - {ft.assemblyTime.end || "—"}
            </td>
            <td className="py-2 px-4 font-semibold text-emerald-800 dark:text-emerald-400">
              {calculateDuration(ft.assemblyTime.start || "", ft.assemblyTime.end || "")}
            </td>
          </tr>
        )}
        {data.periods.map((p, i) => {
          const pt = ft.periodTimes?.[i];
          if (!pt || (!pt.start && !pt.end)) return null;
          return (
            <React.Fragment key={p}>
              <tr>
                <td className="py-2 px-4 font-bold">{p}</td>
                <td className="py-2 px-4">{pt.start || "—"} - {pt.end || "—"}</td>
                <td className="py-2 px-4 font-semibold text-emerald-800 dark:text-emerald-400">
                  {calculateDuration(pt.start || "", pt.end || "")}
                </td>
              </tr>
              {ft.breakAfter === p && i < data.periods.length - 1 && (
                <tr className="bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 font-bold">
                  <td className="py-2 px-4">{ft.breakLabel || "BREAK"}</td>
                  <td className="py-2 px-4">
                    {pt.end || "—"} - {ft.periodTimes?.[i + 1]?.start || "—"}
                  </td>
                  <td className="py-2 px-4">
                    {calculateDuration(pt.end || "", ft.periodTimes?.[i + 1]?.start || "")}
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </>
    );
  };

  const timingsMeta = buildTimingsMeta();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
        {sections.map(s => {
          const Icon = s.icon;
          const isActive = activeSection === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSection(s.id)}
              className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
                isActive
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-800 hover:bg-stone-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-2xl p-4 border border-stone-200 dark:border-stone-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {activeSection === 'class' && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-stone-500">Class:</label>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="px-3 py-1.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-xs font-bold text-stone-800 dark:text-stone-200"
              >
                {data.classes.map(c => (
                  <option key={c[0]} value={c[0]}>{c[0]}</option>
                ))}
              </select>
            </div>
          )}

          {activeSection === 'teacher' && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-stone-500">Teacher:</label>
              <select
                value={selectedTeacher}
                onChange={(e) => setSelectedTeacher(e.target.value)}
                className="px-3 py-1.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-xs font-bold text-stone-800 dark:text-stone-200"
              >
                {data.teachers.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          {activeSection === 'allteachers' && (
            <label className="flex items-center gap-2 text-xs font-bold text-stone-600 dark:text-stone-300 cursor-pointer">
              <input
                type="checkbox"
                checked={data.hideEmptyTeachersInTT}
                onChange={(e) => updateData(prev => ({ ...prev, hideEmptyTeachersInTT: e.target.checked }))}
                className="rounded text-emerald-800 focus:ring-emerald-700"
              />
              <span>Hide empty teachers</span>
            </label>
          )}

        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleExportImage(false)}
            disabled={isExporting}
            className="px-3 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 active:scale-95"
            title="Download PNG image"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Save Image</span>
          </button>

          <button
            type="button"
            onClick={() => handleExportImage(true)}
            disabled={isExporting}
            className="px-3 py-2 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 active:scale-95"
            title="Share PNG via WhatsApp or Android Share Sheet"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Share</span>
          </button>

          <button
            type="button"
            onClick={() => setFullscreenMode(true)}
            className="p-2 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl transition"
            title="Fullscreen Mode"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-sm overflow-hidden">
        <div className="text-center pb-4 mb-4 border-b border-stone-200 dark:border-stone-800">
          <h2 className="text-lg sm:text-xl font-black text-stone-900 dark:text-stone-100 tracking-tight">
            {data.schoolName}
          </h2>
          <div className="text-xs text-stone-500 font-semibold mt-1">
            {[data.academicYear, data.printNote].filter(Boolean).join(" · ")}
          </div>
          <div className="text-xs font-bold text-emerald-800 dark:text-emerald-400 mt-1 uppercase tracking-wider">
            {activeSection === 'whole' && data.wholeTitle}
            {activeSection === 'allteachers' && data.allTeachersTitle}
            {activeSection === 'timings' && data.schoolTimingsTitle}
            {activeSection === 'class' && `${currentClass[0]} Timetable ${currentClass[1] ? `(Incharge: ${currentClass[1]})` : ''}`}
            {activeSection === 'teacher' && `${currentTeacher} Timetable`}
          </div>
        </div>

        {activeSection === 'whole' && (
          <div className="overflow-auto max-h-[70vh] border border-stone-200 dark:border-stone-800 rounded-2xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-stone-100 dark:bg-stone-800 border-b border-stone-200 dark:border-stone-800 sticky top-0 z-20">
                <tr>
                  <th className="py-2.5 px-3 font-bold text-stone-800 dark:text-stone-200 sticky left-0 bg-stone-100 dark:bg-stone-800 z-30 min-w-[110px]">Class</th>
                  <th className="py-2.5 px-3 font-bold text-stone-800 dark:text-stone-200 min-w-[120px]">Incharge</th>
                  {data.periods.map(p => (
                    <th key={p} className="py-2.5 px-3 font-bold text-stone-800 dark:text-stone-200 text-center">
                      Period {p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60">
                {data.classes.map((c, ci) => (
                  <tr key={c[0]} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/30">
                    <td className="py-2.5 px-3 font-bold text-stone-900 dark:text-stone-100 sticky left-0 bg-white dark:bg-stone-900 z-10 min-w-[110px]">{c[0]}</td>
                    <td className="py-2.5 px-3 text-stone-500 min-w-[120px]">{c[1] || "—"}</td>
                    {data.periods.map((_, pi) => {
                      const sub = c[3][pi] || "—";
                      const tea = c[4][pi];
                      const s2 = c[5] ? c[5][pi] : null;

                      return (
                        <td key={pi} className="py-2.5 px-2 text-center">
                          {s2 && s2.mode === 'same' ? (
                            <div className="font-bold text-stone-900 dark:text-stone-100 leading-tight">
                              {sub}/{s2.subject}{s2.days && s2.days.length > 0 ? ` (${s2.days.map(d => (DAY_NAMES[d] || "").slice(0, 3)).join(", ")})` : ''}{tea ? ` - ${tea}` : ''}
                            </div>
                          ) : (
                            <>
                              <div className="font-bold text-stone-900 dark:text-stone-100 leading-tight">
                                {sub} {tea && <span className="font-normal text-stone-500">- {tea}</span>}
                              </div>
                              {s2 && (
                                <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold mt-0.5">
                                  / {s2.subject} {s2.mode !== 'same' && s2.teacher && `- ${s2.teacher}`}
                                  {s2.mode === 'rotation' && s2.days && s2.days.length > 0 && ` (${s2.days.map(d => (DAY_NAMES[d] || "").slice(0, 3)).join(", ")})`}
                                </div>
                              )}
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeSection === 'allteachers' && (
          <div className="overflow-auto max-h-[70vh] border border-stone-200 dark:border-stone-800 rounded-2xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-stone-100 dark:bg-stone-800 border-b border-stone-200 dark:border-stone-800 sticky top-0 z-20">
                <tr>
                  <th className="py-2.5 px-3 font-bold text-stone-800 dark:text-stone-200 sticky left-0 bg-stone-100 dark:bg-stone-800 z-30 min-w-[130px]">Teacher</th>
                  {data.periods.map(p => (
                    <th key={p} className="py-2.5 px-3 font-bold text-stone-800 dark:text-stone-200 text-center">
                      Period {p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60">
                {(data.hideEmptyTeachersInTT
                  ? data.teachers.filter(t => getTeacherTotalPeriods(t) > 0)
                  : data.teachers
                ).map(t => (
                  <tr key={t} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/30">
                    <td className="py-2.5 px-3 font-bold text-stone-900 dark:text-stone-100 sticky left-0 bg-white dark:bg-stone-900 z-10 min-w-[130px]">{t}</td>
                    {data.periods.map((_, pi) => (
                      <td key={pi} className="py-2.5 px-2 text-center font-medium text-stone-700 dark:text-stone-300">
                        {teacherPeriodSummary(t, pi)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeSection === 'timings' && (
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Main table — includes FRIDAY inline if merge mode */}
            <div className="overflow-hidden rounded-2xl border border-stone-200 dark:border-stone-800">
              <table className="w-full text-center text-xs">
                <thead className="bg-stone-100 dark:bg-stone-800 border-b border-stone-200 dark:border-stone-800">
                  <tr>
                    <th className="py-2.5 px-4 font-bold text-stone-800 dark:text-stone-200 w-1/4">PERIOD</th>
                    <th className="py-2.5 px-4 font-bold text-stone-800 dark:text-stone-200 w-1/2">TIME SLOT</th>
                    <th className="py-2.5 px-4 font-bold text-stone-800 dark:text-stone-200 w-1/4">DURATION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60">
                  {weekdayTimingsRows}
                  {timingsMeta.mergeMode && timingsMeta.ft && (
                    <>
                      <tr className="bg-stone-200 dark:bg-stone-700 font-bold text-stone-900 dark:text-stone-100">
                        <td colSpan={3} className="py-2 px-4 uppercase tracking-wider text-center">
                          {timingsMeta.fridayDayName}{timingsMeta.ft.note ? ` — ${timingsMeta.ft.note}` : ''}
                        </td>
                      </tr>
                      {buildFridayTimingsRows()}
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {/* Separate Friday table when enabled */}
            {timingsMeta.separateMode && timingsMeta.ft && (
              <div className="overflow-hidden rounded-2xl border border-stone-200 dark:border-stone-800">
                <div className="p-3 bg-emerald-100 dark:bg-emerald-950/80 font-bold text-xs text-emerald-900 dark:text-emerald-200 text-center">
                  {timingsMeta.fridayDayName} TIMINGS {timingsMeta.ft.note ? `(${timingsMeta.ft.note})` : ''}
                </div>
                <table className="w-full text-center text-xs">
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60">
                    {buildFridayTimingsRows()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeSection === 'class' && currentClass && (
          <div className="overflow-auto max-h-[70vh] border border-stone-200 dark:border-stone-800 rounded-2xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-stone-100 dark:bg-stone-800 border-b border-stone-200 dark:border-stone-800 sticky top-0 z-20">
                <tr>
                  <th className="py-3 px-3 font-bold text-stone-800 dark:text-stone-200 w-24 sticky left-0 bg-stone-100 dark:bg-stone-800 z-30 min-w-[90px]">Day</th>
                  {data.periods.map(p => (
                    <th key={p} className="py-3 px-3 font-bold text-stone-800 dark:text-stone-200 text-center">
                      Period {p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60">
                {data.days.map((day, dayIdx) => (
                  <tr key={day} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/30">
                    <td className="py-3 px-3 font-bold text-stone-900 dark:text-stone-100 sticky left-0 bg-white dark:bg-stone-900 z-10 min-w-[90px]">{day}</td>
                    {data.periods.map((_, pi) => {
                      const s2 = currentClass[5] ? currentClass[5][pi] : null;
                      const t1 = currentClass[4][pi];
                      const sub1 = currentClass[3][pi] || "—";
                      let line = t1 ? `${sub1} - ${t1}` : sub1;

                      if (s2 && (s2.subject || s2.teacher)) {
                        if (s2.mode === 'same') {
                          const t = t1 || s2.teacher;
                          const sub2 = s2.subject || "—";
                          const hasMask = Array.isArray(s2.days) && s2.days.length > 0;
                          let displaySub;
                          if (!hasMask) displaySub = `${sub1}/${sub2}`;
                          else if (s2.days.includes(dayIdx)) displaySub = sub2;
                          else displaySub = sub1;
                          line = t ? `${displaySub} - ${t}` : displaySub;
                        } else if (s2.mode === 'parallel' || s2.days.includes(dayIdx)) {
                          line = `${sub1}${t1 ? " - " + t1 : ""} / ${s2.subject || ""}${s2.teacher ? " - " + s2.teacher : ""}`;
                        }
                      }

                      return (
                        <td key={pi} className="py-3 px-2 text-center font-medium">
                          {line}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeSection === 'teacher' && (
          <div className="max-w-xl mx-auto overflow-hidden rounded-2xl border border-stone-200 dark:border-stone-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-100 dark:bg-stone-800 border-b border-stone-200 dark:border-stone-800">
                <tr>
                  <th className="py-3 px-4 font-bold text-stone-800 dark:text-stone-200 w-1/3">Period</th>
                  <th className="py-3 px-4 font-bold text-stone-800 dark:text-stone-200">Assignment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60">
                {data.periods.map((p, pi) => (
                  <tr key={p} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/30">
                    <td className="py-3 px-4 font-bold text-stone-900 dark:text-stone-100">
                      Period {p}
                    </td>
                    <td className="py-3 px-4 font-semibold text-stone-700 dark:text-stone-300">
                      {teacherPeriodSummary(currentTeacher, pi)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {fullscreenMode && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-stone-950 p-4 sm:p-8 overflow-y-auto flex flex-col">
          <div className="flex justify-between items-center pb-4 border-b border-stone-200 dark:border-stone-800 mb-6">
            <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
              Fullscreen — {data.schoolName}
            </h2>
            <button
              type="button"
              onClick={() => setFullscreenMode(false)}
              className="px-4 py-2 bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold"
            >
              Exit Fullscreen
            </button>
          </div>
          <div className="flex-1">

            {/* 1. Whole School */}
            {activeSection === 'whole' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-stone-100 dark:bg-stone-800">
                    <tr>
                      <th className="py-3 px-4 font-bold">Class</th>
                      <th className="py-3 px-4 font-bold">Incharge</th>
                      {data.periods.map(p => (
                        <th key={p} className="py-3 px-4 font-bold text-center">Period {p}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                    {data.classes.map(c => (
                      <tr key={c[0]}>
                        <td className="py-3 px-4 font-bold">{c[0]}</td>
                        <td className="py-3 px-4 text-stone-500">{c[1] || "—"}</td>
                        {data.periods.map((_, pi) => (
                          <td key={pi} className="py-3 px-2 text-center">
                            {c[3][pi] || "—"} {c[4][pi] ? `- ${c[4][pi]}` : ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 2. All Teachers */}
            {activeSection === 'allteachers' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-stone-100 dark:bg-stone-800">
                    <tr>
                      <th className="py-3 px-4 font-bold">Teacher</th>
                      {data.periods.map(p => (
                        <th key={p} className="py-3 px-4 font-bold text-center">Period {p}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                    {(data.hideEmptyTeachersInTT
                      ? data.teachers.filter(t => getTeacherTotalPeriods(t) > 0)
                      : data.teachers
                    ).map(t => (
                      <tr key={t}>
                        <td className="py-3 px-4 font-bold">{t}</td>
                        {data.periods.map((_, pi) => (
                          <td key={pi} className="py-3 px-2 text-center">
                            {teacherPeriodSummary(t, pi)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 3. School Timings — now supports merge + separate */}
            {activeSection === 'timings' && (
              <div className="max-w-3xl mx-auto space-y-6">
                <div className="overflow-hidden rounded-2xl border border-stone-200 dark:border-stone-800">
                  <table className="w-full text-center text-sm border-collapse">
                    <thead className="bg-stone-100 dark:bg-stone-800">
                      <tr>
                        <th className="py-3 px-4 font-bold">PERIOD</th>
                        <th className="py-3 px-4 font-bold">TIME SLOT</th>
                        <th className="py-3 px-4 font-bold">DURATION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                      {weekdayTimingsRows}
                      {timingsMeta.mergeMode && timingsMeta.ft && (
                        <>
                          <tr className="bg-stone-200 dark:bg-stone-700 font-bold text-stone-900 dark:text-stone-100">
                            <td colSpan={3} className="py-2.5 px-4 uppercase tracking-wider text-center">
                              {timingsMeta.fridayDayName}{timingsMeta.ft.note ? ` — ${timingsMeta.ft.note}` : ''}
                            </td>
                          </tr>
                          {buildFridayTimingsRows()}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>

                {timingsMeta.separateMode && timingsMeta.ft && (
                  <div className="overflow-hidden rounded-2xl border border-stone-200 dark:border-stone-800">
                    <div className="p-3 bg-emerald-100 dark:bg-emerald-950/80 font-bold text-sm text-emerald-900 dark:text-emerald-200 text-center">
                      {timingsMeta.fridayDayName} TIMINGS {timingsMeta.ft.note ? `(${timingsMeta.ft.note})` : ''}
                    </div>
                    <table className="w-full text-center text-sm border-collapse">
                      <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                        {buildFridayTimingsRows()}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* 4. Class Wise */}
            {activeSection === 'class' && currentClass && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-stone-100 dark:bg-stone-800">
                    <tr>
                      <th className="py-3 px-4 font-bold w-24">Day</th>
                      {data.periods.map(p => (
                        <th key={p} className="py-3 px-4 font-bold text-center">Period {p}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                    {data.days.map((day, dayIdx) => (
                      <tr key={day}>
                        <td className="py-3 px-4 font-bold">{day}</td>
                        {data.periods.map((_, pi) => {
                          const s2 = currentClass[5] ? currentClass[5][pi] : null;
                          const t1 = currentClass[4][pi];
                          const sub1 = currentClass[3][pi] || "—";
                          let line = t1 ? `${sub1} - ${t1}` : sub1;
                          if (s2 && (s2.subject || s2.teacher)) {
                            if (s2.mode === 'same') {
                              const t = t1 || s2.teacher;
                              const sub2 = s2.subject || "—";
                              const hasMask = Array.isArray(s2.days) && s2.days.length > 0;
                              let displaySub;
                              if (!hasMask) displaySub = `${sub1}/${sub2}`;
                              else if (s2.days.includes(dayIdx)) displaySub = sub2;
                              else displaySub = sub1;
                              line = t ? `${displaySub} - ${t}` : displaySub;
                            } else if (s2.mode === 'parallel' || s2.days.includes(dayIdx)) {
                              line = `${sub1}${t1 ? " - " + t1 : ""} / ${s2.subject || ""}${s2.teacher ? " - " + s2.teacher : ""}`;
                            }
                          }
                          return <td key={pi} className="py-3 px-2 text-center">{line}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 5. Teacher Wise */}
            {activeSection === 'teacher' && (
              <div className="max-w-2xl mx-auto">
                <table className="w-full text-left text-sm border-collapse border border-stone-200 dark:border-stone-800">
                  <thead className="bg-stone-100 dark:bg-stone-800">
                    <tr>
                      <th className="py-3 px-4 font-bold w-1/3">Period</th>
                      <th className="py-3 px-4 font-bold">Assignment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                    {data.periods.map((p, pi) => (
                      <tr key={p}>
                        <td className="py-3 px-4 font-bold">Period {p}</td>
                        <td className="py-3 px-4">{teacherPeriodSummary(currentTeacher, pi)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
};