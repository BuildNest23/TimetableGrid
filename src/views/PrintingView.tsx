import React, { useState } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';
import { useTimetable } from '../context/TimetableContext';
import { exportTimetableToExcel } from '../utils/excelExport';
import { triggerPrint } from '../utils/printUtils';
import {
  wholeSchoolHTML,
  allTeachersHTML,
  classWiseHTML,
  teacherHTML,
  rosterHTML,
  schoolTimingsHTML
} from '../utils/printHtml';
import { PRINT_SIZES } from '../types/timetable';
import {
  Printer, FileSpreadsheet, Settings, Scissors, Users, Calendar, Download
} from 'lucide-react';

export const PrintingView: React.FC = () => {
  const {
    data, updateData, teacherPeriodSummary, getTeacherTotalPeriods, getLeavesForDate
  } = useTimetable();

  const absentTeacher = localStorage.getItem('utAbsentTeacher') || '';

  const [printSize, setPrintSize] = useState<'xs'|'s'|'m'|'l'|'xl'>(data.printSize || 'm');
  const [orientation, setOrientation] = useState<'landscape'|'portrait'>(data.printOrientation || 'landscape');
  const [selectedTeacher, setSelectedTeacher] = usePersistentState<string>('utPrintTeacher', data.teachers[0] || '');
  const [selectedClass, setSelectedClass] = usePersistentState<string>('utPrintClass', data.classes[0]?.[0] || '');
  const [teacherGridLayout, setTeacherGridLayout] = usePersistentState<string>('utPrintGrid', '4x2');
  // Drop saved selections that no longer exist (renamed/deleted)
  React.useEffect(() => {
    if (selectedTeacher && !data.teachers.includes(selectedTeacher)) setSelectedTeacher(data.teachers[0] || '');
    if (selectedClass && !data.classes.some(c => c[0] === selectedClass)) setSelectedClass(data.classes[0]?.[0] || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.teachers, data.classes]);
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
  const [wholeTitle, setWholeTitle] = useState<string>(data.wholeTitle || 'Whole School Timetable');
  const [allTeachersTitle, setAllTeachersTitle] = useState<string>(data.allTeachersTitle || 'All Teachers Timetable');

  const opts = { printSize, orientation };

  const handlePrintWholeSchool = () => {
    triggerPrint(wholeSchoolHTML(data), opts);
  };

  const handlePrintAllTeachers = () => {
    triggerPrint(allTeachersHTML(data, teacherPeriodSummary), opts);
  };

  const handlePrintAllClassrooms = () => {
    const html = data.classes.map(c => classWiseHTML(data, c)).join('');
    triggerPrint(html, opts);
  };

  const handlePrintBySection = () => {
    const sections = Array.from(new Set(data.classes.map(c => (c[2] || '').trim()).filter(Boolean)));
    if (!sections.length) {
      alert('No sections set. Add a Section (High / Middle) to your classes first.');
      return;
    }
    // One whole-section table per section (all its classes together), one section per page
    const baseTitle = data.wholeTitle || 'Whole School Timetable';
    const pages = sections.map(section =>
      wholeSchoolHTML(
        data,
        data.classes.filter(c => (c[2] || '').trim() === section),
        `${baseTitle} — ${section} Section`
      )
    );
    const unsectioned = data.classes.filter(c => !(c[2] || '').trim());
    if (unsectioned.length) {
      pages.push(wholeSchoolHTML(data, unsectioned, `${baseTitle} — Other Classes`));
    }
    triggerPrint(pages.join(''), opts);
  };

  const handlePrintSchoolTimings = () => {
    triggerPrint(schoolTimingsHTML(data), { ...opts, orientation: 'portrait' });
  };

  const handlePrintTeacherGrid = () => {
    const [cols, rows] = teacherGridLayout.split('x').map(Number);
    const perPage = cols * rows;
    const teachers = data.hideEmptyTeachersInTT
      ? data.teachers.filter(t => getTeacherTotalPeriods(t) > 0)
      : data.teachers;

    const pagesHtml: string[] = [];
    for (let i = 0; i < teachers.length; i += perPage) {
      const pageTeachers = teachers.slice(i, i + perPage);
      let boxes = '';
      pageTeachers.forEach(t => {
        const periodRows = data.periods.map((p, pi) => `
          <tr style="height:1px;">
            <td style="padding:2px 4px;border:1px solid #999;font-size:8pt;font-weight:bold;text-align:center;width:22%;">P${p}</td>
            <td style="padding:2px 4px;border:1px solid #999;font-size:8pt;text-align:left;">${teacherPeriodSummary(t, pi)}</td>
          </tr>
        `).join('');
        boxes += `
          <div style="border:1px dashed #000;padding:2mm;box-sizing:border-box;display:flex;flex-direction:column;background:#fff;">
            <div style="text-align:center;font-weight:bold;font-size:10pt;border-bottom:1px solid #000;padding-bottom:1mm;margin-bottom:1.5mm;">${t}</div>
            <table style="width:100%;height:100%;border-collapse:collapse;table-layout:fixed;">
              <tbody>${periodRows}</tbody>
            </table>
          </div>
        `;
      });
      pagesHtml.push(`
        <div class="print-sheet fixed-sheet" style="padding:6mm;box-sizing:border-box;">
          <div style="display:grid;grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);gap:4mm;height:100%;">
            ${boxes}
          </div>
        </div>
      `);
    }
    triggerPrint(pagesHtml.join(''), { orientation: 'landscape' });
  };

  const handlePrintClassroom = () => {
    const c = data.classes.find(x => x[0] === selectedClass) || data.classes[0];
    if (!c) return;
    triggerPrint(classWiseHTML(data, c), opts);
  };

  const handlePrintSingleTeacher = () => {
    if (!selectedTeacher) return;
    triggerPrint(teacherHTML(data, selectedTeacher, teacherPeriodSummary), { printSize, orientation: 'portrait' });
  };

  const handlePrintRoster = () => {
    triggerPrint(rosterHTML(data, getTeacherTotalPeriods), opts);
  };

  const handleDownloadExcel = async () => {
    setIsExportingExcel(true);
    try {
      await exportTimetableToExcel(data, teacherPeriodSummary, getTeacherTotalPeriods, absentTeacher, getLeavesForDate);
    } catch (err) {
      console.error('Excel export error:', err);
      alert('Failed to generate Excel workbook.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-emerald-900 text-white rounded-3xl p-5 sm:p-6 shadow-md border border-emerald-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-800 text-[11px] font-bold uppercase tracking-wider text-emerald-200">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Full Excel Export
            </div>
            <h2 className="text-xl font-bold tracking-tight">Export Complete Workbook (.xlsx)</h2>
            <p className="text-xs text-emerald-200 leading-relaxed max-w-xl">
              Generates a real, multi-tab Microsoft Excel file offline.
            </p>
          </div>
          <button type="button" onClick={handleDownloadExcel} disabled={isExportingExcel}
            className="min-h-[46px] px-5 py-2.5 bg-white hover:bg-emerald-50 text-emerald-950 font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2 active:scale-95 shrink-0">
            <Download className="w-4 h-4 text-emerald-800" />
            <span>{isExportingExcel ? 'Generating .xlsx...' : 'Download Excel (.xlsx)'}</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-xs">
        <div className="flex items-center gap-2 pb-3 mb-3 border-b border-stone-200 dark:border-stone-800">
          <Settings className="w-4 h-4 text-emerald-700" />
          <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">Print Geometry &amp; Sizing</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">Print Scaling</label>
            <select value={printSize}
              onChange={(e) => { const val = e.target.value as any; setPrintSize(val); updateData(prev => ({ ...prev, printSize: val })); }}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-xs font-semibold">
              {Object.keys(PRINT_SIZES).map(k => (<option key={k} value={k}>{PRINT_SIZES[k].label}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">Page Orientation</label>
            <select value={orientation}
              onChange={(e) => { const val = e.target.value as any; setOrientation(val); updateData(prev => ({ ...prev, printOrientation: val })); }}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-xs font-semibold">
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">Whole School Title</label>
            <input type="text" value={wholeTitle}
              onChange={(e) => { setWholeTitle(e.target.value); updateData(prev => ({ ...prev, wholeTitle: e.target.value })); }}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-xs font-semibold" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">All Teachers Title</label>
            <input type="text" value={allTeachersTitle}
              onChange={(e) => { setAllTeachersTitle(e.target.value); updateData(prev => ({ ...prev, allTeachersTitle: e.target.value })); }}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-xs font-semibold" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-700" />
            <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100">Complete School Sheets</h4>
          </div>
          <div className="space-y-2">
            <button type="button" onClick={handlePrintWholeSchool}
              className="w-full py-2.5 px-4 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold transition flex items-center justify-between">
              <span>Whole School Master Timetable</span><Printer className="w-4 h-4" />
            </button>
            <button type="button" onClick={handlePrintAllTeachers}
              className="w-full py-2.5 px-4 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold transition flex items-center justify-between">
              <span>All Teachers Wise Timetable</span><Printer className="w-4 h-4" />
            </button>
            <button type="button" onClick={handlePrintAllClassrooms}
              className="w-full py-2.5 px-4 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold transition flex items-center justify-between">
              <span>All Classrooms (1 page each)</span><Printer className="w-4 h-4" />
            </button>
            <button type="button" onClick={handlePrintBySection}
              className="w-full py-2.5 px-4 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold transition flex items-center justify-between">
              <span>By Section (High / Middle)</span><Printer className="w-4 h-4" />
            </button>
            <button type="button" onClick={handlePrintSchoolTimings}
              className="w-full py-2.5 px-4 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold transition flex items-center justify-between">
              <span>School Timings Sheet</span><Printer className="w-4 h-4" />
            </button>
            <button type="button" onClick={handlePrintRoster}
              className="w-full py-2.5 px-4 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold transition flex items-center justify-between">
              <span>Teachers Roster</span><Printer className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <Scissors className="w-4 h-4 text-emerald-700" />
            <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100">Cut-Out Teacher Strips</h4>
          </div>
          <p className="text-xs text-stone-500">Compact individual timetable boxes ready for cutting.</p>
          <div className="flex gap-2">
            <select value={teacherGridLayout} onChange={(e) => setTeacherGridLayout(e.target.value)}
              className="flex-1 px-3 py-2 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-xs font-bold">
              <option value="4x2">4 × 2 (8 teachers per A4 page)</option>
              <option value="3x2">3 × 2 (6 teachers per A4 page)</option>
              <option value="3x3">3 × 3 (9 teachers per A4 page)</option>
              <option value="2x2">2 × 2 (4 teachers per A4 page)</option>
            </select>
            <button type="button" onClick={handlePrintTeacherGrid}
              className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5">
              <Printer className="w-4 h-4" /><span>Print</span>
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-xs space-y-3 sm:col-span-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-700" />
            <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100">Single Classroom or Teacher Print</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider">Select Class</label>
              <div className="flex gap-2">
                <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}
                  className="flex-1 px-3 py-2 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-xs font-bold">
                  {data.classes.map(c => (<option key={c[0]} value={c[0]}>{c[0]}</option>))}
                </select>
                <button type="button" onClick={handlePrintClassroom}
                  className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5">
                  <Printer className="w-4 h-4" /><span>Print</span>
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider">Select Teacher</label>
              <div className="flex gap-2">
                <select value={selectedTeacher} onChange={(e) => setSelectedTeacher(e.target.value)}
                  className="flex-1 px-3 py-2 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-xs font-bold">
                  {data.teachers.map(t => (<option key={t} value={t}>{t}</option>))}
                </select>
                <button type="button" onClick={handlePrintSingleTeacher}
                  className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5">
                  <Printer className="w-4 h-4" /><span>Print</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};