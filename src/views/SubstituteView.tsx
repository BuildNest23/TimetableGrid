import React, { useState, useMemo, useEffect } from 'react';
import { useTimetable } from '../context/TimetableContext';
import { LongLeave, DAY_NAMES } from '../types/timetable';
import { createTimetableCanvas, shareOrDownloadCanvas } from '../utils/canvasExport';
import { triggerPrint } from '../utils/printUtils';
import { dateKey } from '../utils/dates';
import {
  UserCheck,
  Calendar,
  Layers,
  Printer,
  Download,
  Share2,
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  Users
} from 'lucide-react';

export const SubstituteView: React.FC = () => {
  const {
    data,
    updateData,
    getTeacherTotalPeriods,
    getLeavesForDate,
    setLeavesForDate,
    getLongLeavesForDate,
    teacherPeriodSummary
  } = useTimetable();

  /* ---------- date helpers ---------- */
  // Returns the day-of-week index (0 = first school day, ... , -1 = weekend / outside school week)
  const getDayIdxForDate = (key: string): number => {
    if (!key) return -1;
    try {
      const [y, m, d] = key.split("-").map(Number);
      const dow = new Date(y, m - 1, d).getDay(); // 0=Sun,1=Mon,...,6=Sat
      const map: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };
      const idx = map[dow];
      return idx >= 0 && idx < data.daysPerWeek ? idx : -1;
    } catch {
      return -1;
    }
  };

  const isValidSchoolDay = (key: string): boolean => getDayIdxForDate(key) >= 0;

  // Walk forward from a date until we hit a valid school day (max 14 steps to be safe).
  const nextSchoolDayFrom = (startKey: string): string => {
    try {
      const [y, m, d] = startKey.split("-").map(Number);
      const cur = new Date(y, m - 1, d);
      for (let i = 0; i < 14; i++) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
        if (isValidSchoolDay(key)) return key;
        cur.setDate(cur.getDate() + 1);
      }
    } catch {
      // fall through
    }
    return startKey;
  };

  const [leaveDate, setLeaveDate] = useState<string>(() => {
    const stored = data.leaveDate || "";
    if (isValidSchoolDay(stored)) return stored;
    // If the stored date is stale or a weekend, snap to the next school day from today
    const today = dateKey();
    const todayIsSchoolDay = isValidSchoolDay(today);
    return todayIsSchoolDay ? today : nextSchoolDayFrom(today);
  });

  const [absentTeacher, setAbsentTeacher] = useState<string>(
    localStorage.getItem("utAbsentTeacher") || data.teachers[0] || ""
  );
  const [showLongLeaveForm, setShowLongLeaveForm] = useState<boolean>(false);
  const [editingLongLeaveId, setEditingLongLeaveId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [shortLeavesOpen, setShortLeavesOpen] = useState<boolean>(false);

  // --- On mount: if the stored date is stale/weekend, snap to the next school day ---
  useEffect(() => {
    const today = dateKey();
    const stored = data.leaveDate || "";
    const todayIsSchoolDay = isValidSchoolDay(today);
    const target = todayIsSchoolDay ? today : nextSchoolDayFrom(today);

    // Only overwrite if the stored date is empty, in the past, or a non-school day.
    const storedIsValidFutureOrTodaySchoolDay =
      stored && stored >= today && isValidSchoolDay(stored);

    if (!storedIsValidFutureOrTodaySchoolDay) {
      setLeaveDate(target);
      updateData(prev => ({ ...prev, leaveDate: target }), true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Long leave form inputs
  const [llTeacher, setLlTeacher] = useState<string>(data.teachers[0] || "");
  const [llFrom, setLlFrom] = useState<string>(dateKey());
  const [llTo, setLlTo] = useState<string>("");
  const [llReason, setLlReason] = useState<string>("");

  const onLeaveAll = useMemo(() => getLeavesForDate(leaveDate), [getLeavesForDate, leaveDate]);
  const otherLeaves = useMemo(() => onLeaveAll.filter(t => t !== absentTeacher), [onLeaveAll, absentTeacher]);
  const longLeavesOnDate = useMemo(() => getLongLeavesForDate(leaveDate), [getLongLeavesForDate, leaveDate]);

  // Column visibility flags
  const showWorkloadCol = data.substituteRecommendWorkload !== false;
  const showGroupCol = data.substituteRecommendGroup !== false;

  // Day of week index for leaveDate
  const dayIdx = useMemo(() => getDayIdxForDate(leaveDate), [leaveDate, data.daysPerWeek]);

  const isDayInWeek = dayIdx >= 0;

  // Grade/group comparison function
  const compareQualRank = (abs: string, cand: string) => {
    const a = data.teacherInfo[abs] || { qual: "", rank: "", desig: "" };
    const b = data.teacherInfo[cand] || { qual: "", rank: "", desig: "" };
    const sameRank = a.rank && b.rank && a.rank === b.rank;
    const sameQual = a.qual && b.qual && a.qual === b.qual;
    if (sameRank && sameQual) return 0;
    if (sameRank) return 1;
    if (sameQual) return 2;
    if (a.rank && !b.rank) return 3;
    if (a.qual && !b.qual) return 4;
    return 5;
  };

  // Build rows for each period
  const substitutionRows = useMemo(() => {
    if (!absentTeacher) return [];

    const priorRecommended: Record<string, number> = {};

    return data.periods.map((p, pi) => {
      const assignments: string[] = [];
      if (isDayInWeek) {
        data.classes.forEach(c => {
          const t1 = c[4][pi];
          const s2 = c[5] ? c[5][pi] : null;
          let isSlot1Active = true;
          if (s2 && s2.mode === 'rotation' && s2.days.includes(dayIdx)) isSlot1Active = false;

          if (t1 === absentTeacher && isSlot1Active) {
            assignments.push(`${c[3][pi] || "—"} (${c[0]})`);
          } else if (s2 && s2.teacher === absentTeacher && s2.mode !== 'same') {
            const isSlot2Active = s2.mode === 'parallel' || s2.days.includes(dayIdx);
            if (isSlot2Active) {
              assignments.push(`${s2.subject || "—"} (${c[0]})`);
            }
          }
        });
      }

      const isBusy = assignments.length > 0;
      if (!isBusy) {
        return {
          period: p,
          info: "",
          isFree: true,
          bestWorkload: "No cover needed",
          groupMatches: [],
          freeTeachers: []
        };
      }

      const free = data.teachers.filter(t => {
        if (t === absentTeacher) return false;
        if (onLeaveAll.includes(t)) return false;
        if (!data.substituteIncludeNonTeaching && getTeacherTotalPeriods(t) === 0) return false;

        return !data.classes.some(c => {
          const t1 = c[4][pi];
          const s2 = c[5] ? c[5][pi] : null;
          let s1Active = true;
          if (s2 && s2.mode === 'rotation' && s2.days.includes(dayIdx)) s1Active = false;
          if (t1 === t && s1Active) return true;
          if (s2 && s2.teacher === t && s2.mode !== 'same') {
            return s2.mode === 'parallel' || s2.days.includes(dayIdx);
          }
          return false;
        });
      });

      const rankedByWorkload = free.map(t => ({
        teacher: t,
        score: getTeacherTotalPeriods(t) + (priorRecommended[t] || 0)
      })).sort((a, b) => a.score - b.score || a.teacher.localeCompare(b.teacher));

      const best = rankedByWorkload[0];
      if (best) {
        priorRecommended[best.teacher] = (priorRecommended[best.teacher] || 0) + 1;
      }

      const rankedByGroup = free.map(t => ({
        teacher: t,
        tier: compareQualRank(absentTeacher, t),
        load: getTeacherTotalPeriods(t),
        info: data.teacherInfo[t] || { qual: "", rank: "", desig: "" }
      })).sort((a, b) => a.tier - b.tier || a.load - b.load || a.teacher.localeCompare(b.teacher));

      return {
        period: p,
        info: assignments.join(", "),
        isFree: false,
        bestWorkload: best ? `${best.teacher} (${best.score} loads)` : "No free teacher",
        groupMatches: rankedByGroup.slice(0, 4),
        freeTeachers: rankedByWorkload.map(x => `${x.teacher} (${x.score})`)
      };
    });
  }, [
    absentTeacher,
    data.periods,
    data.classes,
    data.teachers,
    data.teacherInfo,
    data.substituteIncludeNonTeaching,
    onLeaveAll,
    dayIdx,
    isDayInWeek,
    getTeacherTotalPeriods
  ]);

  const handleSaveLongLeave = () => {
    if (!llTeacher || !llFrom) {
      alert("Please select teacher and from date.");
      return;
    }
    if (llTo && llFrom > llTo) {
      alert("From date must be before To date.");
      return;
    }

    updateData(prev => {
      let nextLong = [...(prev.longLeaves || [])];
      if (editingLongLeaveId) {
        nextLong = nextLong.map(ll =>
          ll.id === editingLongLeaveId
            ? { ...ll, teacher: llTeacher, from: llFrom, to: llTo, reason: llReason }
            : ll
        );
      } else {
        const id = `ll_${Date.now().toString(36)}`;
        nextLong.push({ id, teacher: llTeacher, from: llFrom, to: llTo, reason: llReason });
      }
      return { ...prev, longLeaves: nextLong };
    });

    setShowLongLeaveForm(false);
    setEditingLongLeaveId(null);
    setLlReason("");
    setLlTo("");
  };

  const handleRemoveLongLeave = (id: string) => {
    updateData(prev => ({
      ...prev,
      longLeaves: (prev.longLeaves || []).filter(ll => ll.id !== id)
    }));
  };

  const handleToggleShortLeave = (teacher: string, checked: boolean) => {
    const cur = onLeaveAll.filter(t => !longLeavesOnDate.some(ll => ll.teacher === t));
    let next: string[];
    if (checked) {
      next = [...cur, teacher];
    } else {
      next = cur.filter(t => t !== teacher);
    }
    setLeavesForDate(leaveDate, next);
  };

  const handlePrintSubstitute = () => {
    const headerCells = [
      `<th style="width: 20%; padding: 6px; border: 1px solid #000;">Period &amp; Assignment</th>`
    ];
    if (showWorkloadCol) headerCells.push(`<th style="width: 25%; padding: 6px; border: 1px solid #000;">Workload Recommended</th>`);
    if (showGroupCol) headerCells.push(`<th style="width: 25%; padding: 6px; border: 1px solid #000;">By Group (1–4)</th>`);
    headerCells.push(`<th style="padding: 6px; border: 1px solid #000;">Available Teachers</th>`);

    const rowsHtml = substitutionRows.map(r => {
      const tds = [
        `<th style="padding: 6px; border: 1px solid #000; text-align: center;">
          <div>Period ${r.period}</div>
          <div style="font-size: 11px; font-weight: normal;">${r.info || "—"}</div>
        </th>`
      ];
      if (showWorkloadCol) {
        tds.push(`<td style="padding: 6px; border: 1px solid #000; text-align: center; font-weight: bold;">${r.bestWorkload}</td>`);
      }
      if (showGroupCol) {
        tds.push(`<td style="padding: 6px; border: 1px solid #000; font-size: 11px;">${r.groupMatches.map(m => `<div><b>${m.teacher}</b> (${[m.info.rank, m.info.qual].filter(Boolean).join(" ")})</div>`).join("") || "—"}</td>`);
      }
      tds.push(`<td style="padding: 6px; border: 1px solid #000; font-size: 11px;">${r.freeTeachers.join(", ") || "—"}</td>`);
      return `<tr>${tds.join("")}</tr>`;
    }).join("");

    const content = `
      <div class="print-sheet" style="font-family: sans-serif; padding: 10mm;">
        <div style="text-align: center; margin-bottom: 6mm;">
          <h2 style="margin: 0; font-size: 18pt;">${data.schoolName}</h2>
          <div style="font-size: 12pt; font-weight: bold; margin-top: 2mm;">
            Substitute Teacher Sheet — Absent: ${absentTeacher}
          </div>
          <div style="font-size: 10pt; color: #555; margin-top: 1mm;">
            Date: ${leaveDate} (${DAY_NAMES[dayIdx] || "Day"}) ${otherLeaves.length ? `· Also on leave: ${otherLeaves.join(", ")}` : ""}
          </div>
        </div>
        <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
          <thead>
            <tr style="background: #e5e7eb;">
              ${headerCells.join("")}
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;

    triggerPrint(content, { orientation: 'landscape', printSize: 'm' });
  };

  const handleExportImage = async (share: boolean) => {
    if (!absentTeacher) {
      alert("Please select an absent teacher first.");
      return;
    }
    setIsExporting(true);
    try {
      const canvas = await createTimetableCanvas('substitute', data, {
        selectedClass: "",
        selectedTeacher: absentTeacher,
        absentTeacher,
        teacherPeriodSummary,
        teacherTotalPeriods: getTeacherTotalPeriods,
        getLeavesForDate
      });

      const stamp = dateKey();
      const safeName = (absentTeacher || "absent").replace(/\s+/g, "-");
      const fileName = `ClassGrid-Substitute-${safeName}-${stamp}.png`;
      const title = `Substitute Board — ${absentTeacher}`;

      await shareOrDownloadCanvas(canvas, fileName, title);
    } catch (err) {
      console.error("Substitute image export error:", err);
      alert("Failed to generate substitute board image.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ============================== 1. CONFIGURATION ============================== */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-stone-800">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
              Absence &amp; Cover Planning
            </span>
            <h2 className="text-lg font-black text-stone-900 dark:text-stone-100 tracking-tight">
              Substitute Board
            </h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handlePrintSubstitute}
              className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>

            <button
              type="button"
              onClick={() => handleExportImage(false)}
              disabled={isExporting}
              className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
              title="Download PNG"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExporting ? "…" : "PNG"}</span>
            </button>

            <button
              type="button"
              onClick={() => handleExportImage(true)}
              disabled={isExporting}
              className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
              title="Share via WhatsApp / Android"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
              Absence Date
            </label>
            <input
              type="date"
              value={leaveDate}
              onChange={(e) => {
                setLeaveDate(e.target.value);
                updateData(prev => ({ ...prev, leaveDate: e.target.value }));
              }}
              className="w-full px-3.5 py-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm font-semibold text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
              Absent Teacher *
            </label>
            <select
              value={absentTeacher}
              onChange={(e) => {
                setAbsentTeacher(e.target.value);
                localStorage.setItem("utAbsentTeacher", e.target.value);
              }}
              className="w-full px-3.5 py-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm font-bold text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
            >
              {data.teachers.map(t => {
                const info = data.teacherInfo[t] || { qual: "", rank: "" };
                const extra = [info.rank, info.qual].filter(Boolean).join(" ");
                return (
                  <option key={t} value={t}>
                    {t} {extra ? `(${extra})` : ''}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        <div className="mt-4 space-y-2 border-t border-stone-200 dark:border-stone-800 pt-4">
          <label className="flex items-center gap-2 text-xs font-semibold text-stone-700 dark:text-stone-300 cursor-pointer">
            <input type="checkbox"
              checked={data.substituteRecommendWorkload !== false}
              onChange={(e) => updateData(prev => ({ ...prev, substituteRecommendWorkload: e.target.checked }))}
              className="rounded text-emerald-800 focus:ring-emerald-700" />
            <span>Recommend by workload (lowest total load first)</span>
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-stone-700 dark:text-stone-300 cursor-pointer">
            <input type="checkbox"
              checked={data.substituteRecommendGroup !== false}
              onChange={(e) => updateData(prev => ({ ...prev, substituteRecommendGroup: e.target.checked }))}
              className="rounded text-emerald-800 focus:ring-emerald-700" />
            <span>Recommend by group &amp; grade match</span>
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-stone-700 dark:text-stone-300 cursor-pointer">
            <input type="checkbox"
              checked={data.substituteIncludeNonTeaching}
              onChange={(e) => updateData(prev => ({ ...prev, substituteIncludeNonTeaching: e.target.checked }))}
              className="rounded text-emerald-800 focus:ring-emerald-700" />
            <span>Include non-teaching staff (Principal, Head, etc.)</span>
          </label>
        </div>

        {!isDayInWeek && (
          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl text-xs text-amber-900 dark:text-amber-200 font-medium">
            This date falls outside the school week. Showing an empty schedule.
          </div>
        )}
      </div>

      {/* ============================== 2. SINGLE-DAY SHORT LEAVES (collapsible) ============================== */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => setShortLeavesOpen(o => !o)}
          className="w-full flex items-center justify-between gap-3 p-5 text-left hover:bg-stone-50 dark:hover:bg-stone-800/30 transition"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-xl shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                Single-Day Short Leaves — {leaveDate}
              </h3>
              <p className="text-xs text-stone-500">
                {onLeaveAll.length > 0
                  ? `${onLeaveAll.length} teacher${onLeaveAll.length === 1 ? '' : 's'} marked absent on this date`
                  : 'No teachers marked absent on this date'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
              onLeaveAll.length > 0
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                : 'bg-stone-100 dark:bg-stone-800 text-stone-500'
            }`}>
              {onLeaveAll.length} selected
            </span>
            <ChevronDown
              className={`w-4 h-4 text-stone-500 transition-transform ${shortLeavesOpen ? 'rotate-180' : ''}`}
            />
          </div>
        </button>

        {shortLeavesOpen && (
          <div className="px-5 pb-5 border-t border-stone-200 dark:border-stone-800 pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-stone-500">
                Check teachers who are absent on this date. Teachers on long leave are locked.
              </p>
              {onLeaveAll.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm('Clear all short leaves for this date?')) return;
                    setLeavesForDate(leaveDate, []);
                  }}
                  className="text-xs font-bold text-rose-600 hover:underline shrink-0 ml-3"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {data.teachers.map(t => {
                const isLong = longLeavesOnDate.some(ll => ll.teacher === t);
                const isChecked = onLeaveAll.includes(t);

                return (
                  <label
                    key={t}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition ${
                      isLong
                        ? 'bg-stone-100 dark:bg-stone-800/80 border-stone-300 dark:border-stone-700 opacity-80 cursor-not-allowed'
                        : isChecked
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                        : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isLong}
                      onChange={(e) => handleToggleShortLeave(t, e.target.checked)}
                      className="rounded text-emerald-800 focus:ring-emerald-700 shrink-0"
                    />
                    <span className="truncate">{t}</span>
                    {isLong && <span className="text-[10px] text-stone-400 shrink-0">(Long)</span>}
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ============================== 3. LONG-TERM LEAVES ============================== */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-xs">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              Long-Term Leaves ({data.longLeaves.length})
            </h3>
            <p className="text-xs text-stone-500">
              Staff on extended medical, pilgrimage, or duty leave
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowLongLeaveForm(!showLongLeaveForm);
              setEditingLongLeaveId(null);
            }}
            className="px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{showLongLeaveForm ? "Close Form" : "Add Long Leave"}</span>
          </button>
        </div>

        {showLongLeaveForm && (
          <div className="p-4 bg-stone-50 dark:bg-stone-950/60 rounded-2xl border border-stone-200 dark:border-stone-800 mb-4 space-y-3 animate-in fade-in duration-150">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                  Teacher
                </label>
                <select
                  value={llTeacher}
                  onChange={(e) => setLlTeacher(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-xs font-bold"
                >
                  {data.teachers.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                  Reason (Optional)
                </label>
                <input
                  type="text"
                  value={llReason}
                  onChange={(e) => setLlReason(e.target.value)}
                  placeholder="e.g. Medical / Hajj / Training"
                  className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                  From Date *
                </label>
                <input
                  type="date"
                  value={llFrom}
                  onChange={(e) => setLlFrom(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                  To Date (Leave empty if open-ended)
                </label>
                <input
                  type="date"
                  value={llTo}
                  onChange={(e) => setLlTo(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-xs font-semibold"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleSaveLongLeave}
                className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold"
              >
                {editingLongLeaveId ? "Update Leave" : "Save Leave"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLongLeaveForm(false);
                  setEditingLongLeaveId(null);
                }}
                className="px-4 py-2 bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {data.longLeaves.length === 0 ? (
          <div className="text-xs text-stone-400 italic py-2">
            No long-term leaves active.
          </div>
        ) : (
          <div className="divide-y divide-stone-100 dark:divide-stone-800/60">
            {data.longLeaves.map(ll => (
              <div key={ll.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-bold text-stone-900 dark:text-stone-100">{ll.teacher}</span>
                  <span className="text-stone-500 ml-2">
                    {ll.from} → {ll.to || "Open-ended"}
                  </span>
                  {ll.reason && (
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold ml-2">
                      ({ll.reason})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingLongLeaveId(ll.id);
                      setLlTeacher(ll.teacher);
                      setLlFrom(ll.from);
                      setLlTo(ll.to);
                      setLlReason(ll.reason);
                      setShowLongLeaveForm(true);
                    }}
                    className="p-1.5 text-stone-500 hover:text-stone-800"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveLongLeave(ll.id)}
                    className="p-1.5 text-rose-600 hover:text-rose-800"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ============================== 4. COVERAGE RECOMMENDATION ============================== */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/30 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800 dark:text-stone-200">
              Coverage Recommendation Table
            </h3>
            <p className="text-[11px] text-stone-500">
              Matching workload and group (Science/Arts/IT) for {absentTeacher}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-stone-100 dark:bg-stone-800 border-b border-stone-200 dark:border-stone-800">
              <tr>
                <th className="py-3 px-3.5 font-bold text-stone-700 dark:text-stone-300 w-36">Period</th>
                {showWorkloadCol && (
                  <th className="py-3 px-3.5 font-bold text-stone-700 dark:text-stone-300 w-48">
                    Recommended (Workload)
                  </th>
                )}
                {showGroupCol && (
                  <th className="py-3 px-3.5 font-bold text-stone-700 dark:text-stone-300 w-52">
                    By Group (1–4 Match)
                  </th>
                )}
                <th className="py-3 px-3.5 font-bold text-stone-700 dark:text-stone-300">
                  Free Staff (Available)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60">
              {substitutionRows.map(r => (
                <tr key={r.period} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/30">
                  <td className="py-3 px-3.5 font-bold">
                    <div className="text-stone-900 dark:text-stone-100">Period {r.period}</div>
                    {r.info && (
                      <div className="text-[11px] text-stone-500 font-semibold mt-0.5">
                        {r.info}
                      </div>
                    )}
                  </td>
                  {showWorkloadCol && (
                    <td className="py-3 px-3.5">
                      {r.isFree ? (
                        <span className="text-stone-400 italic">Absent teacher free</span>
                      ) : (
                        <div className="font-bold text-emerald-800 dark:text-emerald-400">
                          {r.bestWorkload}
                        </div>
                      )}
                    </td>
                  )}
                  {showGroupCol && (
                    <td className="py-3 px-3.5">
                      {r.isFree ? (
                        <span className="text-stone-400">—</span>
                      ) : (
                        <div className="space-y-1">
                          {r.groupMatches.map((m, mi) => (
                            <div key={m.teacher} className="text-[11px] leading-tight">
                              <span className="font-bold text-stone-900 dark:text-stone-100">
                                {mi + 1}. {m.teacher}
                              </span>
                              <span className="text-stone-400 ml-1">
                                ({[m.info.rank, m.info.qual].filter(Boolean).join(" ") || "No group"})
                              </span>
                            </div>
                          ))}
                          {r.groupMatches.length === 0 && <span className="text-stone-400">—</span>}
                        </div>
                      )}
                    </td>
                  )}
                  <td className="py-3 px-3.5">
                    {r.isFree ? (
                      <span className="text-stone-400">—</span>
                    ) : (
                      <div className="text-[11px] text-stone-600 dark:text-stone-400 leading-normal">
                        {r.freeTeachers.join(", ") || "No teachers available"}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};