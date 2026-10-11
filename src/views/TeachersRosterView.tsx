import React from 'react';
import { useTimetable } from '../context/TimetableContext';
import { createTimetableCanvas, shareOrDownloadCanvas } from '../utils/canvasExport';
import { triggerPrint } from '../utils/printUtils';
import { Users, Printer, Download, Share2 } from 'lucide-react';

export const TeachersRosterView: React.FC = () => {
  const {
    data,
    getTeacherTotalPeriods,
    teacherPeriodSummary,
    getLeavesForDate
  } = useTimetable();

  const handlePrint = () => {
    const rowsHtml = data.teachers.map(t => {
      const info = data.teacherInfo[t] || { qual: "", rank: "", desig: "" };
      const incharge = data.classes.filter(c => c[1] === t).map(c => c[0]).join(", ");
      return `
        <tr>
          <td style="padding: 7px; border: 1px solid #000; font-weight: bold; text-align: left;">${t}</td>
          <td style="padding: 7px; border: 1px solid #000; text-align: center;">${info.qual || "—"}</td>
          <td style="padding: 7px; border: 1px solid #000; text-align: center;">${info.rank || "—"}</td>
          <td style="padding: 7px; border: 1px solid #000; text-align: center;">${info.desig || "—"}</td>
          <td style="padding: 7px; border: 1px solid #000; text-align: left;">${incharge || "—"}</td>
          <td style="padding: 7px; border: 1px solid #000; text-align: center; font-weight: bold;">${getTeacherTotalPeriods(t)}</td>
        </tr>
      `;
    }).join("");

    const content = `
      <div class="print-sheet" style="font-family: sans-serif; padding: 10mm;">
        <div style="text-align: center; margin-bottom: 6mm;">
          <h2 style="margin: 0; font-size: 18pt;">${data.schoolName}</h2>
          <div style="font-size: 13pt; font-weight: bold; margin-top: 2mm;">Teachers Roster</div>
          <div style="font-size: 10pt; color: #555; margin-top: 1mm;">
            ${[data.academicYear, data.printNote].filter(Boolean).join(" · ")}
          </div>
        </div>
        <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
          <thead>
            <tr style="background: #e5e7eb;">
              <th style="width: 24%; padding: 7px; border: 1px solid #000; text-align: left;">Teacher</th>
              <th style="width: 14%; padding: 7px; border: 1px solid #000;">Group</th>
              <th style="width: 12%; padding: 7px; border: 1px solid #000;">Grade</th>
              <th style="width: 16%; padding: 7px; border: 1px solid #000;">Designation</th>
              <th style="width: 20%; padding: 7px; border: 1px solid #000; text-align: left;">Incharge Of</th>
              <th style="width: 14%; padding: 7px; border: 1px solid #000;">Periods/Wk</th>
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

  const handleExportImage = async (share = false) => {
    const canvas = await createTimetableCanvas('roster', data, {
      teacherPeriodSummary,
      teacherTotalPeriods: getTeacherTotalPeriods,
      getLeavesForDate
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `ClassGrid-Roster-${stamp}.png`;
    await shareOrDownloadCanvas(canvas, fileName, "Teachers Roster");
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-stone-800">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider mb-0.5">
              <Users className="w-3.5 h-3.5" /> Staff Directory
            </div>
            <h2 className="text-lg font-black text-stone-900 dark:text-stone-100 tracking-tight">
              Teachers Roster
            </h2>
            <p className="text-xs text-stone-500 font-medium">
              Complete faculty list with groups, grades, class incharge roles, and weekly workloads
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Roster</span>
            </button>
            <button
              type="button"
              onClick={() => handleExportImage(false)}
              className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>PNG</span>
            </button>
            <button
              type="button"
              onClick={() => handleExportImage(true)}
              className="p-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 text-stone-800 dark:text-stone-200 rounded-xl transition"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Roster Table */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-stone-100 dark:bg-stone-800 border-b border-stone-200 dark:border-stone-800">
              <tr>
                <th className="py-3 px-4 font-bold text-stone-700 dark:text-stone-300">Teacher</th>
                <th className="py-3 px-4 font-bold text-stone-700 dark:text-stone-300">Group</th>
                <th className="py-3 px-4 font-bold text-stone-700 dark:text-stone-300">Grade</th>
                <th className="py-3 px-4 font-bold text-stone-700 dark:text-stone-300">Designation</th>
                <th className="py-3 px-4 font-bold text-stone-700 dark:text-stone-300">Incharge Of</th>
                <th className="py-3 px-4 font-bold text-stone-700 dark:text-stone-300 text-right">Periods / Week</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60">
              {data.teachers.map(t => {
                const info = data.teacherInfo[t] || { qual: "", rank: "", desig: "" };
                const incharge = data.classes.filter(c => c[1] === t).map(c => c[0]).join(", ");
                const total = getTeacherTotalPeriods(t);

                return (
                  <tr key={t} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/30">
                    <td className="py-3 px-4 font-bold text-stone-900 dark:text-stone-100">{t}</td>
                    <td className="py-3 px-4 text-stone-600 dark:text-stone-400">{info.qual || "—"}</td>
                    <td className="py-3 px-4 text-stone-600 dark:text-stone-400">{info.rank || "—"}</td>
                    <td className="py-3 px-4 text-stone-600 dark:text-stone-400">{info.desig || "—"}</td>
                    <td className="py-3 px-4 font-medium text-stone-700 dark:text-stone-300">{incharge || "—"}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-800 dark:text-emerald-400 tabular-nums">
                      {total}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
