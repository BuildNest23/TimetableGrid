import React, { useState, useMemo, useEffect } from 'react';
import { useTimetable } from '../context/TimetableContext';
import { DAY_NAMES, SubstituteBoard } from '../types/timetable';
import { formatPeriodsDW } from '../utils/periodsDW';
import { buildSubstituteDoc, SubstituteDocRow } from '../utils/printDocs';
import { createTimetableCanvas, shareOrDownloadCanvas } from '../utils/canvasExport';
import { triggerPrint } from '../utils/printUtils';
import { dateKey } from '../utils/dates';
import {
  autoFillAssignments,
  candidatesFor,
  dayIndexForDate,
  nextSchoolDayFrom,
  periodsNeedingCover,
  teachingAt,
  tierLabel,
  Candidate,
  SubRules
} from '../utils/substitute';
import {
  Printer,
  Download,
  Share2,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Search,
  Sparkles,
  TriangleAlert
} from 'lucide-react';

interface SubstituteViewProps {
  initialTeacher?: string;
  onTeacherHandled?: () => void;
}

type TabId = 'assign' | 'sheet' | 'load' | 'leaves' | 'details';

const TABS: { id: TabId; label: string }[] = [
  { id: 'assign', label: 'Assign' },
  { id: 'sheet', label: 'Sheet' },
  { id: 'load', label: 'Load' },
  { id: 'leaves', label: 'Leaves' },
  { id: 'details', label: 'Details' }
];

const EMPTY_BOARD: SubstituteBoard = { absent: [], assigned: {} };

const CARD = 'bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-xs';
const LABEL = 'block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1';
const INPUT =
  'w-full px-3.5 py-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm font-semibold text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-600';
const BTN_SOFT =
  'px-3.5 py-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50';

export const SubstituteView: React.FC<SubstituteViewProps> = ({
  initialTeacher,
  onTeacherHandled
}) => {
  const {
    data,
    updateData,
    getTeacherTotalPeriods,
    getLeavesForDate,
    setLeavesForDate,
    getLongLeavesForDate,
    teacherPeriodSummary
  } = useTimetable();

  /* ---------- date ---------- */
  const isValidSchoolDay = (key: string): boolean => dayIndexForDate(data, key) >= 0;

  const [leaveDate, setLeaveDate] = useState<string>(() => {
    const stored = data.leaveDate || '';
    if (isValidSchoolDay(stored)) return stored;
    const today = dateKey();
    return isValidSchoolDay(today) ? today : nextSchoolDayFrom(data, today);
  });

  // On mount: if the stored date is empty, in the past or not a school day, snap to the next school day
  useEffect(() => {
    const today = dateKey();
    const stored = data.leaveDate || '';
    const target = isValidSchoolDay(today) ? today : nextSchoolDayFrom(data, today);
    const storedIsFine = stored && stored >= today && isValidSchoolDay(stored);
    if (!storedIsFine) {
      setLeaveDate(target);
      updateData(prev => ({ ...prev, leaveDate: target }), true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Opened from the Dashboard "absent" card: add that teacher to today's board
  useEffect(() => {
    if (!initialTeacher || !data.teachers.includes(initialTeacher)) return;
    const today = dateKey();
    const target = isValidSchoolDay(today) ? today : leaveDate;
    setLeaveDate(target);
    updateData(prev => {
      const boards = { ...prev.substituteBoards };
      const cur = boards[target] || EMPTY_BOARD;
      if (!cur.absent.includes(initialTeacher)) {
        boards[target] = { ...cur, absent: [...cur.absent, initialTeacher] };
      }
      return { ...prev, leaveDate: target, substituteBoards: boards };
    }, true);
    onTeacherHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTeacher]);

  const dayIdx = useMemo(() => dayIndexForDate(data, leaveDate), [data, leaveDate]);
  const isDayInWeek = dayIdx >= 0;

  /* ---------- the saved board for this date ---------- */
  const board = data.substituteBoards[leaveDate] || EMPTY_BOARD;
  const absent = useMemo(() => board.absent.filter(t => data.teachers.includes(t)), [board.absent, data.teachers]);
  const assigned = board.assigned;

  const writeBoard = (fn: (b: SubstituteBoard) => SubstituteBoard) => {
    updateData(prev => {
      const cur = prev.substituteBoards[leaveDate] || EMPTY_BOARD;
      const next = fn(cur);
      const boards = { ...prev.substituteBoards };
      if (!next.absent.length && !Object.keys(next.assigned).length) delete boards[leaveDate];
      else boards[leaveDate] = next;
      return { ...prev, substituteBoards: boards };
    });
  };

  /* ---------- leaves ---------- */
  const onLeaveAll = useMemo(() => getLeavesForDate(leaveDate), [getLeavesForDate, leaveDate]);
  const longLeavesOnDate = useMemo(() => getLongLeavesForDate(leaveDate), [getLongLeavesForDate, leaveDate]);
  const otherLeaves = useMemo(() => onLeaveAll.filter(t => !absent.includes(t)), [onLeaveAll, absent]);

  /* ---------- rules ---------- */
  const showWorkloadCol = data.substituteRecommendWorkload !== false;
  const showGroupCol = data.substituteRecommendGroup !== false;
  const rules: SubRules = {
    workload: showWorkloadCol,
    group: showGroupCol,
    nonTeaching: !!data.substituteIncludeNonTeaching
  };

  const baseArgs = {
    data,
    dayIdx,
    absentList: absent,
    onLeave: onLeaveAll,
    rules,
    getLoad: getTeacherTotalPeriods
  };

  const fmtLoad = (n: number) => formatPeriodsDW(n, data.daysPerWeek, data.periodsDisplay);
  const infoLine = (t: string) => {
    const i = data.teacherInfo[t];
    return i ? [i.rank, i.qual].filter(Boolean).join(' ') : '';
  };

  /* ---------- UI state ---------- */
  const [tab, setTab] = useState<TabId>('assign');
  const [pick, setPick] = useState<{ abs: string; pi: number } | null>(null);
  const [pickSearch, setPickSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [leaveMode, setLeaveMode] = useState<'short' | 'long'>('short');

  // Long leave form
  const [showLongLeaveForm, setShowLongLeaveForm] = useState(false);
  const [editingLongLeaveId, setEditingLongLeaveId] = useState<string | null>(null);
  const [llTeacher, setLlTeacher] = useState<string>(data.teachers[0] || '');
  const [llFrom, setLlFrom] = useState<string>(dateKey());
  const [llTo, setLlTo] = useState<string>('');
  const [llReason, setLlReason] = useState<string>('');

  const sheetOpen = !!pick || addOpen;
  useEffect(() => {
    document.body.style.overflow = sheetOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sheetOpen]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  /* ---------- board actions ---------- */
  const addAbsent = (t: string) =>
    writeBoard(b => (b.absent.includes(t) ? b : { ...b, absent: [...b.absent, t] }));

  const removeAbsent = (t: string) =>
    writeBoard(b => {
      const nextAssigned = { ...b.assigned };
      delete nextAssigned[t];
      return { absent: b.absent.filter(x => x !== t), assigned: nextAssigned };
    });

  const setCover = (abs: string, pi: number, sub: string | null) =>
    writeBoard(b => {
      const per = { ...(b.assigned[abs] || {}) };
      if (sub) per[String(pi)] = sub;
      else delete per[String(pi)];
      const nextAssigned = { ...b.assigned };
      if (Object.keys(per).length) nextAssigned[abs] = per;
      else delete nextAssigned[abs];
      return { ...b, assigned: nextAssigned };
    });

  const clearAssignments = (abs: string) =>
    writeBoard(b => {
      const nextAssigned = { ...b.assigned };
      delete nextAssigned[abs];
      return { ...b, assigned: nextAssigned };
    });

  const needCount = (abs: string) => periodsNeedingCover(data, abs, dayIdx).length;
  const doneCount = (abs: string) =>
    periodsNeedingCover(data, abs, dayIdx).filter(pi => assigned[abs]?.[String(pi)]).length;

  const handleAutoFill = () => {
    if (!absent.length) return;
    const before = absent.reduce((n, a) => n + doneCount(a), 0);
    const total = absent.reduce((n, a) => n + needCount(a), 0);
    const next = autoFillAssignments({ ...baseArgs, absentList: absent }, assigned);
    writeBoard(b => ({ ...b, assigned: next }));
    const after = absent.reduce(
      (n, a) => n + periodsNeedingCover(data, a, dayIdx).filter(pi => next[a]?.[String(pi)]).length,
      0
    );
    const filled = after - before;
    const left = total - after;
    setNotice(
      filled === 0 && left === 0
        ? 'Everything is already covered.'
        : `Filled ${filled} period${filled === 1 ? '' : 's'}${left > 0 ? ` · ${left} still need someone (no free teacher)` : ''}.`
    );
  };

  /* ---------- status of an assigned cell ---------- */
  const cellIssue = (abs: string, pi: number): string => {
    const sub = assigned[abs]?.[String(pi)];
    if (!sub) return '';
    const c = candidatesFor({ ...baseArgs, absentTeacher: abs, pi, assigned }).find(x => x.teacher === sub);
    if (!c) {
      if (absent.includes(sub)) return `${sub} is absent`;
      if (onLeaveAll.includes(sub)) return `${sub} is on leave`;
      if (!data.teachers.includes(sub)) return 'Teacher no longer exists';
      return `${sub} is not available`;
    }
    if (c.busyWith) return `${sub} is teaching ${c.busyWith}`;
    if (c.takenFor) return `${sub} also covers for ${c.takenFor}`;
    return '';
  };

  /* ---------- rows for print / PNG / sheet ---------- */
  const docRows = (abs: string): SubstituteDocRow[] =>
    data.periods.map((p, pi) => {
      const info = teachingAt(data, abs, pi, dayIdx).join(', ');
      const empty: SubstituteDocRow = {
        period: p, info: '', isFree: true, assigned: '', bestName: '', bestLoad: '', groupMatches: [], freeList: []
      };
      if (!info) return empty;
      const cands = candidatesFor({ ...baseArgs, absentTeacher: abs, pi, assigned });
      const free = cands.filter(c => c.available);
      const byLoad = [...free].sort((x, y) => x.load + x.coversToday - (y.load + y.coversToday) || x.teacher.localeCompare(y.teacher));
      const byGroup = [...free].sort((x, y) => x.tier - y.tier || x.load - y.load || x.teacher.localeCompare(y.teacher));
      const best = byLoad[0];
      return {
        period: p,
        info,
        isFree: false,
        assigned: assigned[abs]?.[String(pi)] || '',
        bestName: best ? best.teacher : '',
        bestLoad: best ? fmtLoad(best.load + best.coversToday) : '',
        groupMatches: byGroup.slice(0, 4).map(c => ({
          teacher: c.teacher,
          rank: data.teacherInfo[c.teacher]?.rank || '',
          qual: data.teacherInfo[c.teacher]?.qual || ''
        })),
        freeList: byLoad.map(c => ({ teacher: c.teacher, load: fmtLoad(c.load + c.coversToday) }))
      };
    });

  const buildSheetHtml = (variant: 'print' | 'png') =>
    buildSubstituteDoc(
      data,
      {
        dateLabel: leaveDate,
        dayName: DAY_NAMES[dayIdx] || '',
        otherLeaves,
        showWorkload: showWorkloadCol,
        showGroup: showGroupCol,
        absent: absent.map(a => ({ name: a, rows: docRows(a) }))
      },
      variant
    );

  const handlePrint = () => {
    if (!absent.length) {
      alert('Add an absent teacher first.');
      return;
    }
    triggerPrint(buildSheetHtml('print'), { orientation: 'portrait', printSize: 'm' });
  };

  const handleExportImage = async () => {
    if (!absent.length) {
      alert('Add an absent teacher first.');
      return;
    }
    setIsExporting(true);
    try {
      const canvas = await createTimetableCanvas('substitute', data, {
        selectedClass: '',
        selectedTeacher: absent[0],
        absentTeacher: absent[0],
        teacherPeriodSummary,
        teacherTotalPeriods: getTeacherTotalPeriods,
        getLeavesForDate,
        docHtml: buildSheetHtml('png')
      });
      const safeName = absent.map(a => a.replace(/\s+/g, '-')).join('_');
      const fileName = `TimetableGrid-Substitute-${safeName}-${leaveDate}.png`;
      await shareOrDownloadCanvas(canvas, fileName, `Substitute Board — ${absent.join(', ')}`);
    } catch (err) {
      console.error('Substitute image export error:', err);
      alert('Failed to generate substitute board image.');
    } finally {
      setIsExporting(false);
    }
  };

  /* ---------- leaves actions ---------- */
  const handleToggleShortLeave = (teacher: string, checked: boolean) => {
    const cur = onLeaveAll.filter(t => !longLeavesOnDate.some(ll => ll.teacher === t));
    setLeavesForDate(leaveDate, checked ? [...cur, teacher] : cur.filter(t => t !== teacher));
  };

  const handleSaveLongLeave = () => {
    if (!llTeacher || !llFrom) {
      alert('Please select teacher and from date.');
      return;
    }
    if (llTo && llFrom > llTo) {
      alert('From date must be before To date.');
      return;
    }
    updateData(prev => {
      let nextLong = [...(prev.longLeaves || [])];
      if (editingLongLeaveId) {
        nextLong = nextLong.map(ll =>
          ll.id === editingLongLeaveId ? { ...ll, teacher: llTeacher, from: llFrom, to: llTo, reason: llReason } : ll
        );
      } else {
        nextLong.push({ id: `ll_${Date.now().toString(36)}`, teacher: llTeacher, from: llFrom, to: llTo, reason: llReason });
      }
      return { ...prev, longLeaves: nextLong };
    });
    setShowLongLeaveForm(false);
    setEditingLongLeaveId(null);
    setLlReason('');
    setLlTo('');
  };

  const handleRemoveLongLeave = (id: string) =>
    updateData(prev => ({ ...prev, longLeaves: (prev.longLeaves || []).filter(ll => ll.id !== id) }));

  /* ---------- derived: on leave but not on the absent list ---------- */
  const needsCoverNotAdded = useMemo(
    () =>
      onLeaveAll.filter(
        t => data.teachers.includes(t) && !absent.includes(t) && periodsNeedingCover(data, t, dayIdx).length > 0
      ),
    [onLeaveAll, absent, data, dayIdx]
  );

  /* ============================== PIECES ============================== */
  const renderTags = (c: Candidate, isBest: boolean) => (
    <>
      {isBest && <Tag>Best</Tag>}
      {c.available && rules.group && tierLabel(c.tier) && <Tag>{tierLabel(c.tier)}</Tag>}
      {c.available && c.coversToday > 0 && <Tag warn>{c.coversToday} today</Tag>}
    </>
  );

  const renderAssign = () => (
    <div className="space-y-4">
      <div className={`${CARD} p-4 flex items-center justify-between gap-3`}>
        <p className="text-xs text-stone-500 min-w-0">
          Pick a teacher for each period, or let Auto-fill choose the best free teacher for every empty period.
        </p>
        <button
          type="button"
          onClick={handleAutoFill}
          disabled={!absent.length}
          className="shrink-0 px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Auto-fill all</span>
        </button>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl text-xs text-emerald-900 dark:text-emerald-200 font-semibold">
          {notice}
        </div>
      )}

      {needsCoverNotAdded.length > 0 && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl text-xs text-amber-900 dark:text-amber-200 space-y-2">
          <div className="font-semibold">On leave today and teaching, but not in the absent list:</div>
          <div className="flex flex-wrap gap-2">
            {needsCoverNotAdded.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => addAbsent(t)}
                className="px-2.5 py-1 rounded-full bg-white dark:bg-stone-900 border border-amber-300 dark:border-amber-800 font-bold"
              >
                + {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {!absent.length && (
        <div className={`${CARD} p-5 text-xs text-stone-500`}>Add an absent teacher to start.</div>
      )}

      {absent.map(a => {
        const need = periodsNeedingCover(data, a, dayIdx);
        const done = need.filter(pi => assigned[a]?.[String(pi)]).length;
        const freePeriods = data.periods.filter((_, pi) => !need.includes(pi));
        return (
          <div key={a} className={`${CARD} p-4`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-black text-stone-900 dark:text-stone-100 truncate">{a}</div>
                <div className="text-[11px] text-stone-500">{infoLine(a) || 'No group set'}</div>
              </div>
              {done > 0 && (
                <button
                  type="button"
                  onClick={() => clearAssignments(a)}
                  className="text-xs font-bold text-rose-600 hover:underline shrink-0"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="h-1.5 bg-stone-200 dark:bg-stone-800 rounded-full overflow-hidden mt-3">
              <div
                className="h-full bg-emerald-700 transition-all"
                style={{ width: `${need.length ? (done / need.length) * 100 : 0}%` }}
              />
            </div>
            <div className="text-[11px] text-stone-500 mt-1">
              {need.length ? `${done} of ${need.length} periods covered` : 'No periods to cover on this date'}
            </div>

            <div className="mt-2">
              {need.map(pi => {
                const sub = assigned[a]?.[String(pi)];
                const issue = cellIssue(a, pi);
                return (
                  <div key={pi} className="py-2.5 border-t border-stone-100 dark:border-stone-800/70">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 grid place-items-center font-black text-xs shrink-0">
                        P{data.periods[pi]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-bold text-stone-900 dark:text-stone-100 truncate">
                          {teachingAt(data, a, pi, dayIdx).join(', ')}
                        </div>
                        <div className="text-[11px] text-stone-500">needs cover</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPickSearch('');
                          setPick({ abs: a, pi });
                        }}
                        className={`min-w-28 max-w-40 truncate px-3 py-2 rounded-xl text-[13px] text-left font-bold border transition ${
                          sub && issue
                            ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-900 text-rose-700 dark:text-rose-300'
                            : sub
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 border-transparent text-emerald-800 dark:text-emerald-300'
                            : 'bg-stone-50 dark:bg-stone-950 border-dashed border-stone-300 dark:border-stone-700 text-stone-500 font-semibold'
                        }`}
                      >
                        {sub || 'Pick teacher'}
                      </button>
                    </div>
                    {issue && (
                      <div className="mt-1.5 ml-12 flex items-start gap-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                        <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
                        <span>{issue}. Pick someone else.</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {need.length > 0 && freePeriods.length > 0 && (
              <div className="text-[11px] text-stone-400 mt-1 pt-2 border-t border-stone-100 dark:border-stone-800/70">
                Free: {freePeriods.map(p => `P${p}`).join(', ')} · no cover needed
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderSheet = () => {
    if (!absent.length) return <div className={`${CARD} p-5 text-xs text-stone-500`}>Add an absent teacher first.</div>;
    const rowsNeeded = data.periods
      .map((p, pi) => ({ p, pi }))
      .filter(({ pi }) => absent.some(a => teachingAt(data, a, pi, dayIdx).length > 0));
    return (
      <div className={`${CARD} p-4`}>
        <div className="flex items-center justify-between mb-3">
          <b className="text-sm text-stone-900 dark:text-stone-100">Substitute sheet</b>
          <span className="text-[11px] text-stone-500">{DAY_NAMES[dayIdx] ? `${DAY_NAMES[dayIdx]}, ` : ''}{leaveDate}</span>
        </div>
        {rowsNeeded.length === 0 ? (
          <div className="text-xs text-stone-500">No periods need cover on this date.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-stone-100 dark:bg-stone-800">
                  <th className="py-2.5 px-3 font-bold text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700">Period</th>
                  {absent.map(a => (
                    <th key={a} className="py-2.5 px-3 font-bold text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700">{a}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsNeeded.map(({ p, pi }) => (
                  <tr key={pi}>
                    <td className="py-2.5 px-3 font-bold border border-stone-200 dark:border-stone-700">P{p}</td>
                    {absent.map(a => {
                      const info = teachingAt(data, a, pi, dayIdx).join(', ');
                      const sub = assigned[a]?.[String(pi)];
                      return (
                        <td key={a} className="py-2.5 px-3 align-top border border-stone-200 dark:border-stone-700">
                          {!info ? (
                            <span className="text-stone-400">—</span>
                          ) : sub ? (
                            <>
                              <b className="text-stone-900 dark:text-stone-100">{sub}</b>
                              <div className="text-[11px] text-stone-500">{info}</div>
                            </>
                          ) : (
                            <span className="text-rose-600 font-semibold">Not assigned</span>
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
      </div>
    );
  };

  const renderLoad = () => {
    const covers: Record<string, string[]> = {};
    absent.forEach(a => {
      Object.entries(assigned[a] || {}).forEach(([pi, t]) => {
        (covers[t] = covers[t] || []).push(`P${data.periods[Number(pi)]} for ${a}`);
      });
    });
    const names = Object.keys(covers).sort((x, y) => covers[y].length - covers[x].length || x.localeCompare(y));
    return (
      <div className={`${CARD} p-4`}>
        <b className="text-sm text-stone-900 dark:text-stone-100">Who is covering on this date</b>
        <p className="text-xs text-stone-500 mb-3">Check that the extra load stays fair.</p>
        {names.length === 0 ? (
          <div className="text-xs text-stone-400 italic">No cover assigned yet.</div>
        ) : (
          <div className="divide-y divide-stone-100 dark:divide-stone-800/60">
            {names.map(t => (
              <div key={t} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm text-stone-900 dark:text-stone-100">{t}</span>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300">
                    {covers[t].length} cover{covers[t].length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="text-[11px] text-stone-500 mt-0.5">
                  Own load {fmtLoad(getTeacherTotalPeriods(t))} · {covers[t].join(', ')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderLeaves = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 p-1 bg-stone-200/70 dark:bg-stone-800 rounded-2xl">
        {(['short', 'long'] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setLeaveMode(m)}
            className={`min-h-[38px] rounded-xl text-xs font-bold transition ${
              leaveMode === m
                ? 'bg-white dark:bg-stone-700 text-emerald-800 dark:text-emerald-300 shadow-xs'
                : 'text-stone-600 dark:text-stone-300'
            }`}
          >
            {m === 'short' ? 'Short leave (this date)' : 'Long leave'}
          </button>
        ))}
      </div>

      {leaveMode === 'short' ? (
        <div className={`${CARD} p-4`}>
          <div className="flex items-start justify-between gap-3 mb-1">
            <div>
              <b className="text-sm text-stone-900 dark:text-stone-100">On leave — {leaveDate}</b>
              <p className="text-xs text-stone-500 mt-0.5">
                Teachers marked here are never suggested as substitutes. Tap Needs cover if their periods must be covered.
              </p>
            </div>
            {onLeaveAll.length > longLeavesOnDate.length && (
              <button
                type="button"
                onClick={() => {
                  if (!confirm('Clear all short leaves for this date?')) return;
                  setLeavesForDate(leaveDate, []);
                }}
                className="text-xs font-bold text-rose-600 hover:underline shrink-0"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="divide-y divide-stone-100 dark:divide-stone-800/60">
            {data.teachers.map(t => {
              const isLong = longLeavesOnDate.some(ll => ll.teacher === t);
              const isShort = onLeaveAll.includes(t) && !isLong;
              const onLeave = isLong || isShort;
              const teachesToday = periodsNeedingCover(data, t, dayIdx).length > 0;
              const inList = absent.includes(t);
              return (
                <div key={t} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-stone-900 dark:text-stone-100 truncate">{t}</div>
                    <div className="text-[11px] text-stone-500 truncate">
                      {infoLine(t) || 'No group set'}
                      {inList ? ' · in absent list' : ''}
                      {isLong ? ' · long leave' : ''}
                    </div>
                  </div>
                  {onLeave && !inList && teachesToday && (
                    <button type="button" onClick={() => addAbsent(t)} className="text-xs font-bold text-emerald-800 dark:text-emerald-400 px-1">
                      Needs cover
                    </button>
                  )}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={onLeave}
                    aria-label={`On leave: ${t}`}
                    disabled={isLong}
                    onClick={() => handleToggleShortLeave(t, !isShort)}
                    className={`relative w-11 h-6 rounded-full shrink-0 transition ${
                      onLeave ? 'bg-emerald-700' : 'bg-stone-300 dark:bg-stone-700'
                    } ${isLong ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${onLeave ? 'left-5.5' : 'left-0.5'}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className={`${CARD} p-4`}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <b className="text-sm text-stone-900 dark:text-stone-100">Long-term leaves ({data.longLeaves.length})</b>
              <p className="text-xs text-stone-500">Staff on extended medical, pilgrimage, or duty leave</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowLongLeaveForm(!showLongLeaveForm);
                setEditingLongLeaveId(null);
              }}
              className={BTN_SOFT}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showLongLeaveForm ? 'Close' : 'Add'}</span>
            </button>
          </div>

          {showLongLeaveForm && (
            <div className="p-4 bg-stone-50 dark:bg-stone-950/60 rounded-2xl border border-stone-200 dark:border-stone-800 mb-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Teacher</label>
                  <select value={llTeacher} onChange={e => setLlTeacher(e.target.value)} className={INPUT}>
                    {data.teachers.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Reason (optional)</label>
                  <input type="text" value={llReason} onChange={e => setLlReason(e.target.value)} placeholder="e.g. Medical / Hajj / Training" className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>From date *</label>
                  <input type="date" value={llFrom} onChange={e => setLlFrom(e.target.value)} className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>To date (empty if open-ended)</label>
                  <input type="date" value={llTo} onChange={e => setLlTo(e.target.value)} className={INPUT} />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={handleSaveLongLeave} className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold">
                  {editingLongLeaveId ? 'Update leave' : 'Save leave'}
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
            <div className="text-xs text-stone-400 italic py-2">No long-term leaves active.</div>
          ) : (
            <div className="divide-y divide-stone-100 dark:divide-stone-800/60">
              {data.longLeaves.map(ll => {
                const activeNow = leaveDate >= ll.from && (!ll.to || leaveDate <= ll.to);
                const inList = absent.includes(ll.teacher);
                const teachesToday = periodsNeedingCover(data, ll.teacher, dayIdx).length > 0;
                return (
                  <div key={ll.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <div className="font-bold text-stone-900 dark:text-stone-100 truncate">{ll.teacher}</div>
                      <div className="text-stone-500">
                        {ll.from} → {ll.to || 'open-ended'}
                        {ll.reason && <span className="text-emerald-700 dark:text-emerald-400 font-semibold"> ({ll.reason})</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {activeNow && <Tag>Active</Tag>}
                      {activeNow && !inList && teachesToday && (
                        <button type="button" onClick={() => addAbsent(ll.teacher)} className="text-xs font-bold text-emerald-800 dark:text-emerald-400 px-1">
                          Needs cover
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label="Edit leave"
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
                      <button type="button" aria-label="Remove leave" onClick={() => handleRemoveLongLeave(ll.id)} className="p-1.5 text-rose-600 hover:text-rose-800">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderDetails = () => {
    if (!absent.length) return <div className={`${CARD} p-5 text-xs text-stone-500`}>Add an absent teacher first.</div>;
    return (
      <div className="space-y-4">
        {absent.map(a => (
          <div key={a} className={`${CARD} overflow-hidden`}>
            <div className="p-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/30">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800 dark:text-stone-200">Coverage details: {a}</h3>
              <p className="text-[11px] text-stone-500">Best by workload, best by group, and everyone free, ignoring picks already made.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-stone-100 dark:bg-stone-800 border-b border-stone-200 dark:border-stone-800">
                  <tr>
                    <th className="py-3 px-3.5 font-bold text-stone-700 dark:text-stone-300 w-36">Period</th>
                    {showWorkloadCol && <th className="py-3 px-3.5 font-bold text-stone-700 dark:text-stone-300 w-44">Recommended (workload)</th>}
                    {showGroupCol && <th className="py-3 px-3.5 font-bold text-stone-700 dark:text-stone-300 w-52">By group (1–4 match)</th>}
                    <th className="py-3 px-3.5 font-bold text-stone-700 dark:text-stone-300">Free staff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60">
                  {periodsNeedingCover(data, a, dayIdx).map(pi => {
                    const free = candidatesFor({ ...baseArgs, absentTeacher: a, pi, assigned: {} }).filter(c => c.available);
                    const byLoad = [...free].sort((x, y) => x.load - y.load || x.teacher.localeCompare(y.teacher));
                    const byGroup = [...free].sort((x, y) => x.tier - y.tier || x.load - y.load || x.teacher.localeCompare(y.teacher)).slice(0, 4);
                    return (
                      <tr key={pi}>
                        <td className="py-3 px-3.5 font-bold align-top">
                          <div className="text-stone-900 dark:text-stone-100">Period {data.periods[pi]}</div>
                          <div className="text-[11px] text-stone-500 font-semibold mt-0.5">{teachingAt(data, a, pi, dayIdx).join(', ')}</div>
                        </td>
                        {showWorkloadCol && (
                          <td className="py-3 px-3.5 align-top font-bold text-emerald-800 dark:text-emerald-400">
                            {byLoad[0] ? `${byLoad[0].teacher} (${fmtLoad(byLoad[0].load)})` : 'No free teacher'}
                          </td>
                        )}
                        {showGroupCol && (
                          <td className="py-3 px-3.5 align-top">
                            {byGroup.length === 0 ? <span className="text-stone-400">—</span> : byGroup.map((c, i) => (
                              <div key={c.teacher} className="text-[11px] leading-tight mb-1">
                                <span className="font-bold text-stone-900 dark:text-stone-100">{i + 1}. {c.teacher}</span>
                                <span className="text-stone-400 ml-1">({infoLine(c.teacher) || 'No group'})</span>
                              </div>
                            ))}
                          </td>
                        )}
                        <td className="py-3 px-3.5 align-top text-[11px] text-stone-600 dark:text-stone-400 leading-normal">
                          {byLoad.map(c => `${c.teacher} (${fmtLoad(c.load)})`).join(', ') || 'No teachers available'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    );
  };

  /* ---------- pick sheet ---------- */
  const renderPickSheet = () => {
    if (!pick) return null;
    const { abs, pi } = pick;
    const cur = assigned[abs]?.[String(pi)];
    const list = candidatesFor({ ...baseArgs, absentTeacher: abs, pi, assigned });
    const bestTeacher = list.find(c => c.available)?.teacher;
    const q = pickSearch.trim().toLowerCase();
    const shown = q ? list.filter(c => c.teacher.toLowerCase().includes(q)) : list;
    const close = () => setPick(null);
    return (
      <Sheet title={`Cover P${data.periods[pi]} for ${abs}`} subtitle={teachingAt(data, abs, pi, dayIdx).join(', ')} onClose={close}>
        <SearchBox value={pickSearch} onChange={setPickSearch} placeholder="Search teacher" />
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-stone-100 dark:divide-stone-800/60">
          {cur && (
            <button
              type="button"
              onClick={() => { setCover(abs, pi, null); close(); }}
              className="w-full min-h-[48px] px-4 py-3 text-left text-sm font-bold text-rose-600 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              Remove {cur}
            </button>
          )}
          {shown.map(c => {
            const reason = c.busyWith
              ? `Teaching ${c.busyWith}`
              : c.takenFor
              ? `Already covering for ${c.takenFor} this period`
              : `${c.coversToday ? `Already covering ${c.coversToday} today` : 'Free'} · load ${fmtLoad(c.load)}`;
            return (
              <button
                key={c.teacher}
                type="button"
                disabled={!c.available}
                onClick={() => { setCover(abs, pi, c.teacher); close(); }}
                className={`w-full min-h-[52px] px-4 py-2.5 flex items-center gap-2 text-left rounded-xl transition ${
                  !c.available
                    ? 'opacity-45 cursor-not-allowed'
                    : c.teacher === cur
                    ? 'bg-emerald-700 text-white'
                    : 'hover:bg-stone-200/60 dark:hover:bg-stone-800/60'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{c.teacher}</div>
                  <div className={`text-[11px] truncate ${c.teacher === cur ? 'text-emerald-100' : 'text-stone-500'}`}>
                    {infoLine(c.teacher) || 'No group'} · {reason}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">{renderTags(c, c.teacher === bestTeacher)}</div>
                {c.teacher === cur && <Check className="w-4 h-4 shrink-0" />}
              </button>
            );
          })}
          {shown.length === 0 && <div className="p-8 text-center text-sm text-stone-400">No matching teachers.</div>}
        </div>
      </Sheet>
    );
  };

  const renderAddSheet = () => {
    if (!addOpen) return null;
    const q = addSearch.trim().toLowerCase();
    const list = data.teachers.filter(t => !absent.includes(t) && (!q || t.toLowerCase().includes(q)));
    return (
      <Sheet title="Who is absent?" onClose={() => setAddOpen(false)} closeLabel="Done">
        <SearchBox value={addSearch} onChange={setAddSearch} placeholder="Search teacher" />
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-stone-100 dark:divide-stone-800/60">
          {list.map(t => {
            const n = periodsNeedingCover(data, t, dayIdx).length;
            return (
              <button
                key={t}
                type="button"
                onClick={() => addAbsent(t)}
                className="w-full min-h-[52px] px-4 py-2.5 flex items-center gap-2 text-left rounded-xl hover:bg-stone-200/60 dark:hover:bg-stone-800/60"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">{t}</div>
                  <div className="text-[11px] text-stone-500 truncate">
                    {infoLine(t) || 'No group'} · {n ? `${n} period${n > 1 ? 's' : ''} this day` : 'no periods this day'}
                  </div>
                </div>
                {onLeaveAll.includes(t) && <Tag warn>On leave</Tag>}
              </button>
            );
          })}
          {list.length === 0 && <div className="p-8 text-center text-sm text-stone-400">No more teachers to add.</div>}
        </div>
      </Sheet>
    );
  };

  /* ============================== RENDER ============================== */
  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-stone-800">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">Absence &amp; Cover Planning</span>
            <h2 className="text-lg font-black text-stone-900 dark:text-stone-100 tracking-tight">Substitute Board</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={handlePrint} className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5">
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
            <button type="button" onClick={handleExportImage} disabled={isExporting} className={BTN_SOFT} title="Download PNG">
              <Download className="w-3.5 h-3.5" />
              <span>{isExporting ? '…' : 'PNG'}</span>
            </button>
            <button type="button" onClick={handleExportImage} disabled={isExporting} className={BTN_SOFT} title="Share via WhatsApp / Android">
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>
          </div>
        </div>

        <div className="mt-4">
          <label className={LABEL}>Absence date</label>
          <input
            type="date"
            value={leaveDate}
            onChange={e => {
              setLeaveDate(e.target.value);
              updateData(prev => ({ ...prev, leaveDate: e.target.value }));
            }}
            className={INPUT}
          />
        </div>

        <div className="mt-4">
          <label className={LABEL}>Absent teachers</label>
          <div className="flex flex-wrap gap-2">
            {absent.map(a => (
              <span key={a} className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 rounded-full pl-3 pr-1.5 py-1 text-[13px] font-bold">
                {a}
                <button
                  type="button"
                  aria-label={`Remove ${a}`}
                  onClick={() => {
                    if (doneCount(a) > 0 && !confirm(`Remove ${a}? Their ${doneCount(a)} saved cover pick(s) will be cleared.`)) return;
                    removeAbsent(a);
                  }}
                  className="w-5 h-5 grid place-items-center rounded-full bg-black/10 dark:bg-white/10"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => { setAddSearch(''); setAddOpen(true); }}
              className="px-3 py-1 rounded-full border border-dashed border-emerald-700 text-emerald-800 dark:text-emerald-400 text-[13px] font-bold"
            >
              + Add teacher
            </button>
          </div>
        </div>

        <details className="mt-4 group">
          <summary className="cursor-pointer text-[13px] font-bold text-stone-800 dark:text-stone-200">Suggestion rules</summary>
          <div className="mt-2 space-y-2">
            <RuleCheck checked={showWorkloadCol} label="Prefer lowest workload" onChange={v => updateData(prev => ({ ...prev, substituteRecommendWorkload: v }))} />
            <RuleCheck checked={showGroupCol} label="Prefer same group & grade" onChange={v => updateData(prev => ({ ...prev, substituteRecommendGroup: v }))} />
            <RuleCheck checked={!!data.substituteIncludeNonTeaching} label="Include non-teaching staff (Principal, Head, etc.)" onChange={v => updateData(prev => ({ ...prev, substituteIncludeNonTeaching: v }))} />
          </div>
        </details>

        {!isDayInWeek && (
          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl text-xs text-amber-900 dark:text-amber-200 font-medium">
            This date falls outside the school week. Showing an empty schedule.
          </div>
        )}
      </div>

      <div role="tablist" aria-label="Substitute sections" className="grid grid-cols-5 gap-1 p-1 bg-stone-200/70 dark:bg-stone-800 rounded-2xl">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-[38px] px-1 rounded-xl text-xs font-bold transition ${
              tab === t.id
                ? 'bg-emerald-800 dark:bg-emerald-700 text-white shadow-xs'
                : 'text-stone-600 dark:text-stone-300 hover:bg-white/70 dark:hover:bg-stone-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'assign' && renderAssign()}
      {tab === 'sheet' && renderSheet()}
      {tab === 'load' && renderLoad()}
      {tab === 'leaves' && renderLeaves()}
      {tab === 'details' && renderDetails()}

      {renderPickSheet()}
      {renderAddSheet()}
    </div>
  );
};

/* ============================== small components ============================== */
const Tag: React.FC<{ warn?: boolean; children: React.ReactNode }> = ({ warn, children }) => (
  <span
    className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap ${
      warn
        ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
        : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
    }`}
  >
    {children}
  </span>
);

const RuleCheck: React.FC<{ checked: boolean; label: string; onChange: (v: boolean) => void }> = ({ checked, label, onChange }) => (
  <label className="flex items-center gap-2 text-xs font-semibold text-stone-700 dark:text-stone-300 cursor-pointer">
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="rounded text-emerald-800 focus:ring-emerald-700" />
    <span>{label}</span>
  </label>
);

const Sheet: React.FC<{
  title: string;
  subtitle?: string;
  closeLabel?: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, subtitle, closeLabel, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/60 backdrop-blur-xs" onClick={onClose}>
    <div
      role="dialog"
      aria-label={title}
      className="w-full sm:max-w-md max-h-[85vh] sm:max-h-[80vh] flex flex-col bg-stone-50 dark:bg-stone-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden"
      onClick={e => e.stopPropagation()}
    >
      <div className="sm:hidden pt-3 pb-1 flex justify-center">
        <div className="w-12 h-1.5 bg-stone-300 dark:bg-stone-700 rounded-full" />
      </div>
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-stone-200 dark:border-stone-800">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 truncate">{title}</h3>
          {subtitle && <div className="text-[11px] text-stone-500 truncate">{subtitle}</div>}
        </div>
        <button type="button" onClick={onClose} className="px-2 py-1 -mr-2 text-sm font-bold text-emerald-800 dark:text-emerald-400 rounded-lg" aria-label="Close">
          {closeLabel || 'Close'}
        </button>
      </div>
      {children}
    </div>
  </div>
);

const SearchBox: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string }> = ({ value, onChange, placeholder }) => (
  <div className="px-4 py-2.5 border-b border-stone-200 dark:border-stone-800">
    <div className="relative flex items-center">
      <Search className="w-4 h-4 absolute left-3.5 text-stone-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
      />
    </div>
  </div>
);
