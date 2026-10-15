import React, { useMemo } from 'react';
import { useTimetable } from '../context/TimetableContext';
import { createTimetableCanvas, shareOrDownloadCanvas } from '../utils/canvasExport';
import { triggerPrint } from '../utils/printUtils';
import { DAY_NAMES } from '../types/timetable';
import { dateKey } from '../utils/dates';
import { buildFreeStaffDoc } from '../utils/printDocs';
import { Clock, Printer, Download, Share2 } from 'lucide-react';

export const FreeStaffView: React.FC = () => {
  const {
    data,
    updateData,
    getLeavesForDate,
    getTeacherPeriodsOnDay,
    teacherPeriodSummary,
    getTeacherTotalPeriods
  } = useTimetable();

  const todayKey = dateKey();
  const dayIdx = useMemo(() => {
    try {
      const [y, m, d] = todayKey.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      const map: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };
      return map[dt.getDay()] ?? -1;
    } catch {
      return -1;
    }
  }, [todayKey]);

  const onLeaveSet = useMemo(() => new Set(getLeavesForDate(todayKey)), [getLeavesForDate, todayKey]);
  const isDayInWeek = dayIdx >= 0 && dayIdx < data.daysPerWeek;

  const freeStaffPerPeriod = useMemo(() => {
    return data.periods.map((p, pi) => {
      if (!isDayInWeek) {
        return { period: p, freeList: [] };
      }

      const free = data.teachers.filter(t => {
        if (onLeaveSet.has(t)) return false;
        if (!data.freeStaffIncludeNonTeaching && getTeacherTotalPeriods(t) === 0) return false;

        // Check if teacher has class in this period today
        return !data.classes.some(c => {
          const t1 = c[4][pi];
          const s2 = c[5] ? c[5][pi] : null;
          let s1Active = true;
          if (s2 && s2.mode === 'rotation' && s2.days.includes(dayIdx)) s1Active = false;
          if (t1 === t && s1Active) return true;
          if (s2 && s2.teacher === t) {
            return s2.mode === 'parallel' || s2.days.includes(dayIdx);
          }
          return false;
        });
      });

      return {
        period: p,
        freeList: free.map(t => ({
          teacher: t,
          todayLoad: getTeacherPeriodsOnDay(t, dayIdx)
        }))
      };
    });
  }, [
    data.periods,
    data.teachers,
    data.classes,
    data.freeStaffIncludeNonTeaching,
    onLeaveSet,
    dayIdx,
    isDayInWeek,
    getTeacherPeriodsOnDay,
    getTeacherTotalPeriods
  ]);

  const buildFreeHtml = (variant: 'print' | 'png') =>
    buildFreeStaffDoc(
      data,
      {
        dayName: DAY_NAMES[dayIdx] || "",
        dateLabel: todayKey,
        rows: freeStaffPerPeriod.map(r => ({
          period: r.period,
          free: r.freeList.map(x => ({ teacher: x.teacher, load: x.todayLoad }))
        }))
      },
      variant
    );

  const handlePrint = () => {
    triggerPrint(buildFreeHtml('print'), { orientation: 'portrait', printSize: 'm' });
  };

  const handleExportImage = async (_share = false) => {
    const canvas = await createTimetableCanvas('freestaff', data, {
      teacherPeriodSummary,
      teacherTotalPeriods: getTeacherTotalPeriods,
      getLeavesForDate,
      docHtml: buildFreeHtml('png')
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `TimetableGrid-FreeStaff-${stamp}.png`;
    await shareOrDownloadCanvas(canvas, fileName, "Free Staff by Period");
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-stone-800">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider mb-0.5">
              <Clock className="w-3.5 h-3.5" /> Real-Time Availability
            </div>
            <h2 className="text-lg font-black text-stone-900 dark:text-stone-100 tracking-tight">
              Free Staff by Period
            </h2>
            <p className="text-xs text-stone-500 font-medium">
              Showing teachers without scheduled classes for today ({DAY_NAMES[dayIdx] || "Weekday"})
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Sheet</span>
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

        <div className="mt-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-stone-600 dark:text-stone-300 cursor-pointer">
            <input
              type="checkbox"
              checked={data.freeStaffIncludeNonTeaching}
              onChange={(e) =>
                updateData(prev => ({ ...prev, freeStaffIncludeNonTeaching: e.target.checked }))
              }
              className="rounded text-emerald-800 focus:ring-emerald-700"
            />
            <span>Include non-teaching staff (Principal, Physical Education, IT Lab incharge)</span>
          </label>
        </div>
      </div>

      {/* Free Staff Table */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-stone-100 dark:bg-stone-800 border-b border-stone-200 dark:border-stone-800">
              <tr>
                <th className="py-3 px-4 font-bold text-stone-700 dark:text-stone-300 w-36">
                  Period
                </th>
                <th className="py-3 px-4 font-bold text-stone-700 dark:text-stone-300">
                  Free Teachers (Numbers in brackets show periods taught)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60">
              {freeStaffPerPeriod.map(r => (
                <tr key={r.period} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/30">
                  <td className="py-3.5 px-4 font-bold text-stone-900 dark:text-stone-100">
                    <div>Period {r.period}</div>
                    {data.periodTimes[r.period - 1]?.start && (
                      <div className="text-[10px] text-stone-400 font-normal">
                        {data.periodTimes[r.period - 1].start} - {data.periodTimes[r.period - 1].end}
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    {r.freeList.length ? (
                      <div className="flex flex-wrap gap-2">
                        {r.freeList.map(item => (
                          <span
                            key={item.teacher}
                            className="px-2.5 py-1 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-xs font-semibold text-stone-800 dark:text-stone-200"
                          >
                            <b>{item.teacher}</b>
                           <span className="text-emerald-700 dark:text-emerald-400 ml-1 font-bold">
                             ({item.todayLoad})
                           </span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-stone-400 italic">All teachers busy</span>
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
