import React from 'react';
import { X, BookOpen, Layers, CheckCircle2, FileSpreadsheet, Printer, Smartphone } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-white dark:bg-stone-900 rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-xl">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                ClassGrid Guide
              </h2>
              <p className="text-xs text-stone-500">Universal School Timetable Manual</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 rounded-full active:bg-stone-200 dark:active:bg-stone-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
          {/* Quick Start */}
          <section>
            <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> 1. Quick Start Workflow
            </h3>
            <ol className="list-decimal pl-5 space-y-1.5 font-medium text-xs sm:text-sm">
              <li><b>School Setup:</b> Configure your school name, session, number of periods, days per week, and break after period.</li>
              <li><b>Teachers, Classes & Subjects:</b> Add teachers, assign their Groups (Science/Arts/IT) and Grades (SST/EST/PST).</li>
              <li><b>Timetable Editor:</b> Assign subjects and teachers to each class in Fast Add or Grid mode.</li>
              <li><b>View Timetables:</b> Inspect Whole School, Class-wise, or Teacher-wise sheets.</li>
              <li><b>Print & Export:</b> Print A4 landscape sheets or download multi-tab Excel workbooks.</li>
            </ol>
          </section>

          {/* 2nd Subject Mode */}
          <section className="p-4 bg-stone-100 dark:bg-stone-800/60 rounded-2xl border border-stone-200 dark:border-stone-700/60">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 mb-2 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" /> 2. 2nd Subject Slots (Dual Courses)
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-400 mb-2">
              When a single period divides students or rotates across days:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-stone-600 dark:text-stone-300">
              <li><b>Parallel:</b> Biology and Computer Science taught simultaneously in separate labs.</li>
              <li><b>Rotation:</b> IST on Mon–Wed, Drawing on Thu–Fri. Select the specific days for the 2nd subject.</li>
              <li><b>Same Teacher:</b> One teacher teaching two integrated subjects without double-counting weekly load.</li>
            </ul>
          </section>

          {/* Substitute Engine */}
          <section>
            <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Smartphone className="w-4 h-4" /> 3. Substitute Teacher Recommendations
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-400">
              The Substitute Board provides 4 columns:
              <br />
              <b>1. Period Info:</b> The class and subject the absent teacher was scheduled to teach.
              <br />
              <b>2. Recommended:</b> Workload-balanced best substitute (lowest weekly load).
              <br />
              <b>3. By Group (1–4):</b> Teachers with matching grade & group (e.g., SST Science for SST Science).
              <br />
              <b>4. Free Teachers:</b> Complete list of all staff free during that period.
            </p>
          </section>

          {/* Excel & Print */}
          <section className="grid sm:grid-cols-2 gap-3">
            <div className="p-3.5 bg-stone-50 dark:bg-stone-800/40 rounded-xl border border-stone-200 dark:border-stone-800">
              <div className="flex items-center gap-2 font-bold text-xs text-stone-900 dark:text-stone-100 mb-1">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel (.xlsx) Export
              </div>
              <p className="text-xs text-stone-500">
                Downloads a real multi-tab Excel file with Whole School, All Teachers, Class cards, and Timings. Fully offline.
              </p>
            </div>
            <div className="p-3.5 bg-stone-50 dark:bg-stone-800/40 rounded-xl border border-stone-200 dark:border-stone-800">
              <div className="flex items-center gap-2 font-bold text-xs text-stone-900 dark:text-stone-100 mb-1">
                <Printer className="w-4 h-4 text-emerald-600" /> Cut-Out Teacher Grids
              </div>
              <p className="text-xs text-stone-500">
                Print 4×2, 3×2, or 2×2 teacher timetable strips on A4 with cut-lines ready for distribution.
              </p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-stone-50 dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
