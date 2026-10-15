import React, { useState, useRef, useEffect } from 'react';
import { useTimetable, TimetableIssue } from '../context/TimetableContext';
import { ConfirmModal, ConfirmDialogOptions } from '../components/ConfirmModal';
import { ActiveTab, PeriodTime } from '../types/timetable';
import { uiConfirm } from '../utils/uiConfirm';
import { DAY_NAMES } from '../types/timetable';
import {
  Settings,
  Clock,
  Save,
  Download,
  Upload,
  AlertTriangle,
  FolderOpen,
  Image as ImageIcon,
  ShieldCheck,
  ChevronDown,
  ArrowRight,
  Share2,
  Database
} from 'lucide-react';

interface SchoolSetupViewProps {
  onNavigate?: (tab: ActiveTab, ctx?: { period?: number; teacher?: string }) => void;
}

/* ============================================================
   TIME FORMATTING HELPERS
   ============================================================ */

// Parse "H:MM" or "H:MM AM/PM" into { hour, minute, suffix | null }.
// Returns null if not parseable.
function parseTimeInput(raw: string): { hour: number; minute: number; suffix: 'AM' | 'PM' | null } | null {
  const s = String(raw || '').trim().toUpperCase();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const suffix = (m[3] as 'AM' | 'PM' | undefined) || null;
  return { hour, minute, suffix };
}

/* ============================================================
   TIME HELPERS (minutes-from-midnight model)
   ============================================================ */

const pad2 = (n: number) => String(n).padStart(2, '0');

// minutes -> "08:15 AM" (the format stored in the timetable data)
function minToStr(m: number): string {
  const total = ((Math.round(m) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const mm = total % 60;
  const suffix = h < 12 ? 'AM' : 'PM';
  return `${pad2(h % 12 || 12)}:${pad2(mm)} ${suffix}`;
}

// minutes -> "HH:MM" (value for <input type="time">)
function minToInput(m: number | null): string {
  if (m == null) return '';
  const total = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

// "HH:MM" from <input type="time"> -> minutes
function inputToMin(v: string): number | null {
  const m = String(v || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// Stored string ("08:15 AM", "1:15 PM", or legacy "8:15") -> minutes
function strToMin(raw?: string): number | null {
  const p = parseTimeInput(raw || '');
  if (!p) return null;
  let h = p.hour;
  if (p.suffix === 'PM' && h < 12) h += 12;
  else if (p.suffix === 'AM' && h === 12) h = 0;
  else if (!p.suffix && h >= 1 && h <= 6) h += 12; // legacy value without AM/PM: 1-6 means afternoon
  return h * 60 + p.minute;
}

interface RowOverride { dur: number | null; gap: number | null }
interface TimeModel {
  start: number | null; // first period start
  dur: number;          // first period length (default for the rest)
  bm: number;           // break length
  rows: RowOverride[];  // manual overrides per period (null = auto-fill)
}
interface CalcRow { st: number; en: number; dur: number; gap: number; durManual: boolean; gapManual: boolean; prevEnd: number }

const DEFAULT_DUR = 30;
const DEFAULT_BREAK = 20;

function emptyRows(n: number): RowOverride[] {
  return Array.from({ length: n }, () => ({ dur: null, gap: null }));
}

function cloneRows(model: TimeModel, n: number): RowOverride[] {
  return Array.from({ length: n }, (_, i) => ({ ...(model.rows[i] ?? { dur: null, gap: null }) }));
}

// Work out the model (first start, length, break, manual overrides) from saved times
function inferModel(times: PeriodTime[], ba: number, n: number): TimeModel {
  const mins = Array.from({ length: n }, (_, i) => ({
    s: strToMin(times[i]?.start),
    e: strToMin(times[i]?.end)
  }));
  const start = mins[0]?.s ?? null;
  if (start == null) return { start: null, dur: DEFAULT_DUR, bm: DEFAULT_BREAK, rows: emptyRows(n) };

  let dur = DEFAULT_DUR;
  if (mins[0].e != null && mins[0].e > start) dur = mins[0].e - start;

  let bm = DEFAULT_BREAK;
  if (ba > 0 && ba < n && mins[ba].s != null && mins[ba - 1].e != null) {
    bm = Math.max(0, (mins[ba].s as number) - (mins[ba - 1].e as number));
  }

  const rows = emptyRows(n);
  let cur = dur;
  for (let i = 1; i < n; i++) {
    const { s, e } = mins[i];
    const prevEnd = mins[i - 1].e;
    if (s != null && prevEnd != null) {
      const g = s - prevEnd;
      const def = ba === i ? bm : 0;
      if (g >= 0 && g !== def) rows[i].gap = g;
    }
    if (s != null && e != null && e > s) {
      const d = e - s;
      if (d !== cur) rows[i].dur = d;
      cur = d;
    }
  }
  return { start, dur, bm, rows };
}

function calcModel(model: TimeModel, ba: number, n: number): CalcRow[] {
  if (model.start == null) return [];
  const out: CalcRow[] = [];
  let prevEnd = model.start;
  let cur = model.dur;
  for (let i = 0; i < n; i++) {
    const r = model.rows[i] ?? { dur: null, gap: null };
    if (r.dur != null) cur = r.dur;
    const gap = i === 0 ? 0 : (r.gap != null ? r.gap : (ba === i ? model.bm : 0));
    const st = i === 0 ? model.start : prevEnd + gap;
    const en = st + cur;
    out.push({ st, en, dur: cur, gap, durManual: r.dur != null, gapManual: r.gap != null, prevEnd });
    prevEnd = en;
  }
  return out;
}

/* ============================================================
   SMALL INPUTS
   ============================================================ */

const fieldCls = 'w-full px-2.5 py-2 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-lg text-xs font-semibold text-stone-900 dark:text-stone-100 dark:[color-scheme:dark]';
const editedCls = '!border-emerald-600 dark:!border-emerald-500';

// Number input that only commits on blur / Enter, so typing "25" never flickers through "2"
const MinInput: React.FC<{ value: number; onCommit: (v: number) => void; className?: string; min?: number; ariaLabel: string }> = ({ value, onCommit, className = '', min = 0, ariaLabel }) => {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const commit = () => {
    const v = parseInt(text, 10);
    if (isNaN(v) || v < min) { setText(String(value)); return; }
    if (v !== value) onCommit(v);
  };
  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className={`${fieldCls} text-center ${className}`}
    />
  );
};

/* ============================================================
   SCHEDULE EDITOR — one grid (normal days OR the Friday grid)
   ============================================================ */

interface ScheduleEditorProps {
  periodNums: number[];
  times: PeriodTime[];
  /** Value of the "Break after" select (0 = none / same as normal) */
  breakAfterValue: number;
  /** What a break position of 0 means: 0 for normal days, normal break position for Friday */
  zeroMeans: number;
  zeroLabel: string;
  breakLabel: string;
  assembly: { start: string; end: string };
  chain: boolean;
  onBreakAfterChange: (n: number) => void;
  onTimesChange: (t: PeriodTime[], assembly?: { start: string; end: string }) => void;
  onAssemblyChange: (a: { start: string; end: string }) => void;
  onChainChange: (on: boolean) => void;
}

const ScheduleEditor: React.FC<ScheduleEditorProps> = (p) => {
  const n = p.periodNums.length;
  const ba = p.breakAfterValue > 0 ? p.breakAfterValue : p.zeroMeans;

  const sig = JSON.stringify(p.times);
  const lastSig = useRef(sig);
  const [model, setModel] = useState<TimeModel>(() => inferModel(p.times, ba, n));

  // Times changed from outside (copy button, scenario load…) → rebuild the model
  useEffect(() => {
    if (sig !== lastSig.current) {
      lastSig.current = sig;
      setModel(inferModel(p.times, ba, n));
    }
  }, [sig]);

  const commit = (next: TimeModel, assembly?: { start: string; end: string }) => {
    setModel(next);
    if (next.start == null) return;
    const rows = calcModel(next, ba, n);
    const times: PeriodTime[] = rows.map(r => ({ start: minToStr(r.st), end: minToStr(r.en) }));
    lastSig.current = JSON.stringify(times);
    // times + assembly go out in ONE update, otherwise the second update overwrites the first
    p.onTimesChange(times, assembly);
  };

  // Break position / period count changed → re-flow times (skip the first render)
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    if (model.start != null) commit(model);
  }, [ba, n]);

  const rows = calcModel(model, ba, n);
  const hasStart = model.start != null;

  const setFirst = (m: number) => commit({ ...model, start: m });
  const setLen = (v: number) => commit({ ...model, dur: Math.max(1, v) });
  const setBreakLen = (v: number) => {
    const r = cloneRows(model, n);
    if (ba > 0 && ba < n) r[ba].gap = null;
    commit({ ...model, bm: Math.max(0, v), rows: r });
  };
  const setRowStart = (i: number, m: number) => {
    if (i === 0) return setFirst(m);
    if (!hasStart) return;
    const r = cloneRows(model, n);
    r[i].gap = Math.max(0, m - rows[i].prevEnd);
    commit({ ...model, rows: r });
  };
  const setRowEnd = (i: number, m: number) => {
    if (!hasStart) return;
    const d = Math.max(1, m - rows[i].st);
    if (i === 0) return commit({ ...model, dur: d });
    const r = cloneRows(model, n);
    r[i].dur = d;
    commit({ ...model, rows: r });
  };
  const setRowDur = (i: number, d: number) => {
    if (!hasStart) return;
    const v = Math.max(1, d);
    if (i === 0) return commit({ ...model, dur: v });
    const r = cloneRows(model, n);
    r[i].dur = v;
    commit({ ...model, rows: r });
  };
  const setRowGap = (i: number, g: number) => {
    if (i === ba) return setBreakLen(g);
    const r = cloneRows(model, n);
    r[i].gap = Math.max(0, g);
    commit({ ...model, rows: r });
  };
  const resetRow = (i: number) => {
    const r = cloneRows(model, n);
    r[i] = { dur: null, gap: null };
    commit({ ...model, rows: r });
  };
  const resetGap = (i: number) => {
    const r = cloneRows(model, n);
    r[i].gap = null;
    commit({ ...model, rows: r });
  };

  const setAssemblyStart = (v: string) => {
    const m = inputToMin(v);
    if (m == null) return;
    p.onAssemblyChange({ start: minToStr(m), end: p.assembly.end });
  };
  const setAssemblyEnd = (v: string) => {
    const m = inputToMin(v);
    if (m == null) return;
    const nextAsm = { start: p.assembly.start, end: minToStr(m) };
    if (p.chain) commit({ ...model, start: m }, nextAsm);
    else p.onAssemblyChange(nextAsm);
  };

  const labelCls = 'block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1';
  const boxCls = 'p-3.5 bg-stone-50 dark:bg-stone-950/60 rounded-2xl border border-stone-200 dark:border-stone-800';

  return (
    <div className="space-y-3">
      {/* Assembly */}
      <div className={boxCls}>
        <div className="text-xs font-bold text-stone-800 dark:text-stone-200 mb-2">Assembly <span className="font-medium text-stone-500">(optional)</span></div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className={labelCls}>Starts</label>
            <input
              type="time"
              value={minToInput(strToMin(p.assembly.start))}
              onChange={(e) => setAssemblyStart(e.target.value)}
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>Ends</label>
            <input
              type="time"
              value={minToInput(strToMin(p.assembly.end))}
              onChange={(e) => setAssemblyEnd(e.target.value)}
              className={fieldCls}
            />
          </div>
        </div>
        <label className="flex items-start gap-2 mt-2.5 text-xs font-semibold text-stone-700 dark:text-stone-300 cursor-pointer">
          <input
            type="checkbox"
            checked={p.chain}
            onChange={(e) => p.onChainChange(e.target.checked)}
            className="mt-0.5 rounded text-emerald-800 focus:ring-emerald-700"
          />
          <span>Period 1 starts when assembly ends</span>
        </label>
      </div>

      {/* Quick setup */}
      <div className={boxCls}>
        <div className="text-xs font-bold text-stone-800 dark:text-stone-200 mb-2">Quick setup</div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className={labelCls}>First period starts</label>
            <input
              type="time"
              value={minToInput(model.start)}
              onChange={(e) => { const m = inputToMin(e.target.value); if (m != null) setFirst(m); }}
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>Period length (min)</label>
            <MinInput value={model.dur} min={1} ariaLabel="Period length in minutes" onCommit={setLen} />
          </div>
          <div>
            <label className={labelCls}>Break after</label>
            <select
              value={p.breakAfterValue}
              onChange={(e) => p.onBreakAfterChange(Number(e.target.value))}
              className={fieldCls}
            >
              <option value="0">{p.zeroLabel}</option>
              {p.periodNums.map(pn => (
                <option key={pn} value={pn}>Period {pn}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Break length (min)</label>
            <MinInput value={model.bm} min={0} ariaLabel="Break length in minutes" onCommit={setBreakLen} />
          </div>
        </div>
        <p className="text-[11px] text-stone-500 dark:text-stone-400 font-medium mt-2.5 leading-relaxed">
          Set these four and every period fills in. Change any single time below and the periods after it follow.
        </p>
      </div>

      {/* Period grid */}
      <div className={boxCls}>
        <div className="text-xs font-bold text-stone-800 dark:text-stone-200 mb-2">Periods</div>
        {!hasStart && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold mb-2">
            Enter the first period's start time to fill the whole day.
          </p>
        )}
        <div className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_56px_22px] gap-1.5 items-center mb-1 text-[10px] font-bold text-stone-400 uppercase tracking-wider">
          <span />
          <span>Start</span>
          <span>End</span>
          <span className="text-center">Min</span>
          <span />
        </div>

        {p.periodNums.map((pn, i) => {
          const r = rows[i];
          const showGap = !!r && i > 0 && (r.gap > 0 || ba === i || r.gapManual);
          const isBreak = ba === i;
          const manualRow = !!r && (r.durManual || (i > 0 && r.gapManual && !isBreak));
          return (
            <React.Fragment key={pn}>
              {showGap && r && (
                <div className="grid grid-cols-[minmax(0,1fr)_56px_22px] gap-1.5 items-center bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-lg px-2 py-1 my-1">
                  <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 truncate">
                    {isBreak ? (p.breakLabel || 'Break') : 'Gap'} · {minToStr(r.prevEnd)} → {minToStr(r.st)}
                  </span>
                  <MinInput
                    value={r.gap}
                    min={0}
                    ariaLabel={`${isBreak ? 'Break' : 'Gap'} length in minutes`}
                    className={r.gapManual && !isBreak ? editedCls : ''}
                    onCommit={(v) => setRowGap(i, v)}
                  />
                  {r.gapManual && !isBreak ? (
                    <button type="button" onClick={() => resetGap(i)} aria-label="Reset gap to auto" title="Reset gap to auto" className="text-emerald-700 dark:text-emerald-400 text-sm leading-none">↺</button>
                  ) : <span />}
                </div>
              )}
              <div className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_56px_22px] gap-1.5 items-center mb-1.5">
                <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400">P{pn}</span>
                <input
                  type="time"
                  aria-label={`Period ${pn} start`}
                  value={minToInput(r ? r.st : null)}
                  onChange={(e) => { const m = inputToMin(e.target.value); if (m != null) setRowStart(i, m); }}
                  className={`${fieldCls} ${i > 0 && r?.gapManual && !isBreak ? editedCls : ''}`}
                />
                <input
                  type="time"
                  aria-label={`Period ${pn} end`}
                  value={minToInput(r ? r.en : null)}
                  onChange={(e) => { const m = inputToMin(e.target.value); if (m != null) setRowEnd(i, m); }}
                  className={`${fieldCls} ${r?.durManual ? editedCls : ''}`}
                />
                {r ? (
                  <MinInput
                    value={r.dur}
                    min={1}
                    ariaLabel={`Period ${pn} length in minutes`}
                    className={r.durManual ? editedCls : ''}
                    onCommit={(v) => setRowDur(i, v)}
                  />
                ) : (
                  <input type="text" disabled aria-label={`Period ${pn} length`} className={`${fieldCls} text-center opacity-50`} />
                )}
                {manualRow ? (
                  <button type="button" onClick={() => resetRow(i)} aria-label={`Reset period ${pn} to auto`} title="Reset to auto" className="text-emerald-700 dark:text-emerald-400 text-sm leading-none">↺</button>
                ) : <span />}
              </div>
            </React.Fragment>
          );
        })}

        <p className="text-[11px] text-stone-500 dark:text-stone-400 font-medium mt-2 leading-relaxed">
          Green outline = you changed it. Tap ↺ to hand it back to auto-fill.
          {rows.length > 0 && <> Day runs <b>{minToStr(rows[0].st)}</b> to <b>{minToStr(rows[rows.length - 1].en)}</b>.</>}
        </p>
      </div>
    </div>
  );
};

// Make sure a times array has exactly one entry per period
function padTimes(times: PeriodTime[] | undefined, n: number): PeriodTime[] {
  return Array.from({ length: n }, (_, i) => ({
    start: times?.[i]?.start || '',
    end: times?.[i]?.end || ''
  }));
}

export const SchoolSetupView: React.FC<SchoolSetupViewProps> = ({ onNavigate }) => {
  const {
    data,
    updateData,
    saveScenario,
    loadScenario,
    deleteScenario,
    getScenarioNames,
    resetEverything,
    exportBackupJson,
    importBackupJson,
    collectTimetableIssues
  } = useTimetable();

  const [schoolName, setSchoolName] = useState(data.schoolName);
  const [academicYear, setAcademicYear] = useState(data.academicYear);
  const [printNote, setPrintNote] = useState(data.printNote);
  const [periodCount, setPeriodCount] = useState(data.periods.length);
  const [daysPerWeek, setDaysPerWeek] = useState(data.daysPerWeek);
  const [breakAfter, setBreakAfter] = useState(data.breakAfter);

  const [timingsTitle, setTimingsTitle] = useState(data.schoolTimingsTitle || "SCHOOL TIMINGS");
  const [effectiveFrom, setEffectiveFrom] = useState(data.effectiveFromDate || "");
  const [timingTab, setTimingTab] = useState<'normal' | 'friday'>('normal');

  const [fridayEnabled, setFridayEnabled] = useState(data.fridayTimings?.enabled || false);
  const [fridayDayIdx, setFridayDayIdx] = useState(data.fridayTimings?.dayIndex ?? 4);
  const [fridayBreakAfter, setFridayBreakAfter] = useState(data.fridayTimings?.breakAfter || 0);
  const [fridayBreakLabel, setFridayBreakLabel] = useState(data.fridayTimings?.breakLabel || "JUMMA BREAK");
  const [fridayNote, setFridayNote] = useState(data.fridayTimings?.note || "");

  const [scenarioNameInput, setScenarioNameInput] = useState("");
  const [selectedScenario, setSelectedScenario] = useState("");
  const scenarioNames = getScenarioNames();

  const specialDayName = data.days[fridayDayIdx] || 'Friday';

  const toggleAutoChain = (on: boolean) => {
    updateData(prev => ({ ...prev, autoChainTimes: on }));
  };

  // --- Storage quota indicator ---
  const [storageInfo, setStorageInfo] = useState<{ bytes: number; quotaBytes: number } | null>(null);

  const refreshStorageInfo = () => {
    try {
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const val = localStorage.getItem(key);
        if (val) {
          total += (key.length + val.length) * 2;
        }
      }
      const quotaBytes = 5 * 1024 * 1024;
      setStorageInfo({ bytes: total, quotaBytes });
    } catch {
      setStorageInfo(null);
    }
  };

  React.useEffect(() => {
    refreshStorageInfo();
  }, [data]);

  // --- Timetable validation state ---
  const [validationResults, setValidationResults] = useState<TimetableIssue[] | null>(null);
  const [validationOpen, setValidationOpen] = useState<boolean>(false);

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    options: ConfirmDialogOptions;
    action?: (val?: string) => void;
  }>({
    isOpen: false,
    options: { message: "" }
  });

  /* ============================================================
     OTHER ACTIONS
     ============================================================ */

  const handleSaveGeneralSetup = async () => {
    if (periodCount < data.periods.length) {
      const ok = await uiConfirm(`Reducing to ${periodCount} periods will remove data in the removed slots.\n\nContinue?`,
        { title: 'Reduce periods', yesText: 'Yes, reduce', danger: true, icon: '⚠️' });
      if (!ok) return;
    }
    if (daysPerWeek < data.daysPerWeek) {
      const ok = await uiConfirm(`Reducing to ${daysPerWeek} days will drop rotation day-masks beyond that range.\n\nContinue?`,
        { title: 'Reduce days', yesText: 'Yes, reduce', danger: true, icon: '⚠️' });
      if (!ok) return;
    }

    updateData(prev => {
      let nextPeriods = [...prev.periods];
      if (periodCount !== prev.periods.length) {
        nextPeriods = Array.from({ length: periodCount }, (_, i) => i + 1);
      }
      const nextDays = DAY_NAMES.slice(0, daysPerWeek);

      const nextClasses = prev.classes.map(c => {
        const subs = [...c[3]];
        const teas = [...c[4]];
        const s2s = c[5] ? [...c[5]] : prev.periods.map(() => null);
        while (subs.length < periodCount) subs.push('');
        while (teas.length < periodCount) teas.push('');
        while (s2s.length < periodCount) s2s.push(null);
        const trimmedS2 = s2s.slice(0, periodCount).map(s => {
          if (!s) return null;
          const days = (s.days || []).filter(d => d < daysPerWeek);
          return { ...s, days };
        });
        return [c[0], c[1], c[2], subs.slice(0, periodCount), teas.slice(0, periodCount), trimmedS2] as typeof c;
      });

      const nextPeriodTimes = [...prev.periodTimes];
      while (nextPeriodTimes.length < periodCount) nextPeriodTimes.push({ start: '', end: '' });

      const nextFridayTimes = [...(prev.fridayTimings?.periodTimes || [])];
      while (nextFridayTimes.length < periodCount) nextFridayTimes.push({ start: '', end: '' });

      const clampedBreakAfter = breakAfter > periodCount ? 0 : breakAfter;
      const fridayBreak = prev.fridayTimings?.breakAfter ?? 0;
      const clampedFridayBreakAfter = fridayBreak > periodCount ? 0 : fridayBreak;

      return {
        ...prev,
        schoolName: schoolName.trim(),
        academicYear: academicYear.trim(),
        printNote: printNote.trim(),
        periods: nextPeriods,
        daysPerWeek,
        days: nextDays,
        breakAfter: clampedBreakAfter,
        classes: nextClasses,
        periodTimes: nextPeriodTimes.slice(0, periodCount),
        conflictExceptions: (prev.conflictExceptions || [])
          .filter(ex => ex.period < periodCount)
          .map(ex => ({ ...ex, days: ex.days.filter(d => d < daysPerWeek) }))
          .filter(ex => ex.days.length > 0),
        fridayTimings: {
          ...prev.fridayTimings,
          breakAfter: clampedFridayBreakAfter,
          periodTimes: nextFridayTimes.slice(0, periodCount)
        }
      };
    });

    alert('School setup saved successfully.');
  };

  const handleSaveTimings = () => {
    updateData(prev => ({
      ...prev,
      schoolTimingsTitle: timingsTitle.trim(),
      effectiveFromDate: effectiveFrom.trim()
    }));
    alert("Timings configuration saved.");
  };

  const handleSaveFridayTimings = () => {
    updateData(prev => ({
      ...prev,
      fridayTimings: {
        ...prev.fridayTimings,
        enabled: fridayEnabled,
        dayIndex: fridayDayIdx,
        breakAfter: fridayBreakAfter,
        breakLabel: fridayBreakLabel.trim(),
        note: fridayNote.trim()
      }
    }));
    alert("Day-specific timings saved.");
  };

  const handleCheckTimetable = () => {
    const issues = collectTimetableIssues();
    setValidationResults(issues);
    setValidationOpen(true);
    setTimeout(() => {
      const el = document.getElementById("validationResultsPanel");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const handleJumpToEditor = (issue: TimetableIssue) => {
    if (!onNavigate) return;
    if (issue.kind === "conflict" && issue.period !== undefined && issue.teacher) {
      onNavigate("editor", { period: issue.period, teacher: issue.teacher });
    } else {
      onNavigate("editor");
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 500 * 1024) {
      alert("Image is larger than 500 KB. Please choose a smaller logo.");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        try {
          const MAX_DIM = 400;
          let w = img.width;
          let h = img.height;
          if (w > MAX_DIM || h > MAX_DIM) {
            const scale = MAX_DIM / Math.max(w, h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error("Canvas not available");

          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);

          let dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          if (dataUrl.length > 250 * 1024) {
            dataUrl = canvas.toDataURL('image/jpeg', 0.70);
          }
          if (dataUrl.length > 250 * 1024) {
            dataUrl = canvas.toDataURL('image/jpeg', 0.55);
          }

          const kb = Math.round(dataUrl.length / 1024);
          if (kb > 350) {
            alert(
              `Logo is still ${kb} KB after compression. Please choose a simpler image ` +
              `(fewer colors, smaller dimensions).`
            );
            return;
          }

          updateData(prev => ({ ...prev, schoolLogo: dataUrl }));
          alert(`Logo saved (${w}×${h}, ~${kb} KB).`);
        } catch (err) {
          alert("Could not process image: " + (err as Error).message);
        }
      };
      img.onerror = () => alert("Could not load image. It may be corrupted.");
      img.src = result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemoveLogo = () => {
    setConfirmState({
      isOpen: true,
      options: {
        title: "Remove school logo?",
        message: "The logo will be removed from all printed timetables and exports.",
        danger: true,
        confirmText: "Remove"
      },
      action: () => {
        updateData(prev => ({ ...prev, schoolLogo: "" }));
      }
    });
  };

  const buildBackupBlob = (): { blob: Blob; fileName: string } => {
    const json = exportBackupJson();
    const blob = new Blob([json], { type: "application/json" });
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `TimetableGrid-backup-${stamp}.json`;
    return { blob, fileName };
  };

  const handleExportBackup = () => {
    const { blob, fileName } = buildBackupBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const handleShareBackup = async () => {
  try {
    const { blob, fileName } = buildBackupBlob();

    // Use text/plain so Android's share sheet accepts it more reliably.
    // Content is still JSON — import reads it as text and parses.
    const txtName = fileName.replace(/\.json$/i, '.txt');
    const file = new File([blob], txtName, { type: "text/plain" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `TimetableGrid backup — ${data.schoolName || "school"}`,
          text: `Backup of "${data.schoolName || "school"}" timetable, exported ${new Date().toLocaleDateString()}.`
        });
        return;
      }

      if (navigator.share) {
        const summary = `TimetableGrid backup for ${data.schoolName || "school"} on ${new Date().toLocaleDateString()}. (Full backup file not shareable in this browser — use Download instead.)`;
        await navigator.share({ title: "TimetableGrid Backup", text: summary });
        return;
      }

      alert("Share not available in this browser. Downloading instead.");
      handleExportBackup();
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error("Share error:", err);
      alert("Could not share. Downloading instead.");
      handleExportBackup();
    }
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setConfirmState({
        isOpen: true,
        options: {
          title: "Import Backup File?",
          message: "This will overwrite your current timetable data with the imported file.",
          danger: true,
          confirmText: "Import & Overwrite"
        },
        action: () => {
          const success = importBackupJson(content);
          if (success) {
            alert("Backup imported successfully.");
          } else {
            alert("Invalid backup file format.");
          }
        }
      });
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleSaveScenario = () => {
    const name = scenarioNameInput.trim();
    if (!name) {
      alert("Please enter a scenario name (e.g. Ramadan, Exams, Winter).");
      return;
    }
    saveScenario(name);
    setScenarioNameInput("");
    alert(`Scenario "${name}" saved.`);
  };

  const handleLoadScenario = () => {
    if (!selectedScenario) return;
    setConfirmState({
      isOpen: true,
      options: {
        title: `Load Scenario "${selectedScenario}"?`,
        message: "This will replace your currently active timetable with this saved scenario.",
        confirmText: "Load Scenario"
      },
      action: () => {
        loadScenario(selectedScenario);
      }
    });
  };

  const handleDeleteScenario = () => {
    if (!selectedScenario) return;
    setConfirmState({
      isOpen: true,
      options: {
        title: `Delete Scenario "${selectedScenario}"?`,
        message: "This cannot be undone.",
        danger: true,
        confirmText: "Delete"
      },
      action: () => {
        deleteScenario(selectedScenario);
        setSelectedScenario("");
      }
    });
  };

  const handleResetEverything = () => {
    setConfirmState({
      isOpen: true,
      options: {
        title: "Reset Everything to Defaults?",
        message: "This will permanently wipe all classes, teachers, periods, and schedules. This cannot be undone.",
        danger: true,
        confirmText: "Wipe & Reset"
      },
      action: () => {
        resetEverything();
        alert("Everything has been reset to defaults.");
      }
    });
  };

  const errors = validationResults?.filter(x => x.level === 'error') || [];
  const warns = validationResults?.filter(x => x.level === 'warn') || [];
  const infos = validationResults?.filter(x => x.level === 'info') || [];

  const validationSummary = validationResults ? (
    errors.length ? `🛑 ${errors.length} error(s)` :
    warns.length ? `⚠️ ${warns.length} warning(s)` :
    `✅ All clean`
  ) : "";

  const renderIssueList = (list: TimetableIssue[], color: string) => (
    <ul className="space-y-1.5 mt-2">
      {list.map((x, i) => (
        <li
          key={i}
          className="flex items-start justify-between gap-2 text-xs py-1.5 px-3 rounded-lg bg-white dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800"
        >
          <span className="flex-1" style={{ color }}>{x.text}</span>
          {x.kind === 'conflict' && x.period !== undefined && x.teacher && onNavigate && (
            <button
              type="button"
              onClick={() => handleJumpToEditor(x)}
              className="shrink-0 inline-flex items-center gap-1 px-2 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-[11px] font-bold"
            >
              <ArrowRight className="w-3 h-3" />
              <span>Fix</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );

  const validationPanel = validationResults ? (
    <div id="validationResultsPanel" className="mt-4 rounded-2xl border border-stone-300 dark:border-stone-700 overflow-hidden bg-stone-50 dark:bg-stone-950/40">
      <button
        type="button"
        onClick={() => setValidationOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800/60 transition text-left"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-700" />
          <span className="text-xs font-bold uppercase tracking-wider text-stone-800 dark:text-stone-200">
            Timetable Check — {validationSummary}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-stone-500 transition-transform ${validationOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {validationOpen && (
        <div className="p-4 border-t border-stone-200 dark:border-stone-800">
          {errors.length === 0 && warns.length === 0 && infos.length === 0 && (
            <div className="text-xs text-emerald-800 dark:text-emerald-300 font-semibold py-2">
              ✅ Timetable looks clean — no conflicts or missing assignments.
            </div>
          )}

          {errors.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300 mb-1">
                Errors ({errors.length})
              </div>
              {renderIssueList(errors, "#7F1D1D")}
            </div>
          )}

          {warns.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-1">
                Warnings ({warns.length})
              </div>
              {renderIssueList(warns, "#7A5515")}
            </div>
          )}

          {infos.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300 mb-1">
                Notes ({infos.length})
              </div>
              {renderIssueList(infos, "#1E4D6B")}
            </div>
          )}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 sm:p-6 border border-stone-200 dark:border-stone-800 shadow-xs">
        <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-stone-200 dark:border-stone-800">
          <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-xl">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
              School Setup &amp; Calendar
            </h2>
            <p className="text-xs text-stone-500 font-medium">Institutional profile and basic schedule parameters</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
              School Name *
            </label>
            <input
              type="text"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm font-semibold text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
              Academic Year / Session
            </label>
            <input
              type="text"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              placeholder="e.g. 2026-2027"
              className="w-full px-3.5 py-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm font-semibold text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
              Print Subtitle / Headmaster
            </label>
            <input
              type="text"
              value={printNote}
              onChange={(e) => setPrintNote(e.target.value)}
              placeholder="e.g. Principal: Name Surname"
              className="w-full px-3.5 py-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm font-semibold text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
              Days Per Week
            </label>
            <select
              value={daysPerWeek}
              onChange={(e) => setDaysPerWeek(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm font-semibold text-stone-900 dark:text-stone-100"
            >
              {[4, 5, 6, 7].map(n => (
                <option key={n} value={n}>
                  {n} Days ({DAY_NAMES.slice(0, n).map(d => d.slice(0, 3)).join(", ")})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
              Show Teacher Periods
            </label>
            <select
              value={data.periodsDisplay || 'both'}
              onChange={(e) => {
                const v = e.target.value as 'day' | 'week' | 'both';
                updateData(prev => ({ ...prev, periodsDisplay: v }), true);
              }}
              className="w-full px-3.5 py-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm font-semibold text-stone-900 dark:text-stone-100"
            >
              <option value="day">Per Day (Periods/Day)</option>
              <option value="week">Per Week (Periods/Week)</option>
              <option value="both">Both, e.g. 3/15 (Periods Day/Week)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
              Number of Periods
            </label>
            <select
              value={periodCount}
              onChange={(e) => setPeriodCount(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm font-semibold text-stone-900 dark:text-stone-100"
            >
              {[5, 6, 7, 8, 9, 10].map(n => (
                <option key={n} value={n}>{n} Periods</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
              Break / Recess Position
            </label>
            <select
              value={breakAfter}
              onChange={(e) => setBreakAfter(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm font-semibold text-stone-900 dark:text-stone-100"
            >
              <option value="0">No Break</option>
              {data.periods.map(p => (
                <option key={p} value={p}>After Period {p}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 pt-3 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={handleCheckTimetable}
            className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold shadow-xs transition inline-flex items-center gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Check Timetable</span>
          </button>
          <button
            type="button"
            onClick={handleSaveGeneralSetup}
            className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shadow-xs transition"
          >
            Save General Setup
          </button>
        </div>

        {validationPanel}
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 sm:p-6 border border-stone-200 dark:border-stone-800 shadow-xs">
        <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-stone-200 dark:border-stone-800">
          <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-xl">
            <ImageIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
              School Crest / Logo
            </h2>
            <p className="text-xs text-stone-500 font-medium">Appears on the header of all printed timetables and PNG exports</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="w-24 h-24 rounded-2xl bg-stone-100 dark:bg-stone-800 border-2 border-dashed border-stone-300 dark:border-stone-700 flex items-center justify-center overflow-hidden shrink-0">
            {data.schoolLogo ? (
              <img src={data.schoolLogo} alt="School Crest" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-xs text-stone-400 font-medium text-center px-2">No logo</span>
            )}
          </div>

          <div className="flex-1 space-y-2 text-center sm:text-left">
            <div className="text-xs text-stone-600 dark:text-stone-400">
              Upload a PNG or JPG emblem. It will be auto-resized to fit 400×400 px and
              saved as compressed JPEG — final size is usually under 100 KB.
            </div>
            <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
              <label className="px-4 py-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold cursor-pointer transition">
                <span>Choose Image...</span>
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>

              {data.schoolLogo && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="px-4 py-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-bold transition"
                >
                  Remove Logo
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 sm:p-6 border border-stone-200 dark:border-stone-800 shadow-xs">
        <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-stone-200 dark:border-stone-800">
          <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-xl">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
              School Timings
            </h2>
            <p className="text-xs text-stone-500 font-medium">Enter the first period and its length — the rest fills in. Correct any period you need.</p>
          </div>
        </div>

        {/* Normal / Friday switch */}
        <div className="flex gap-1 bg-stone-100 dark:bg-stone-800 rounded-xl p-1 mb-4">
          <button
            type="button"
            onClick={() => setTimingTab('normal')}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition ${
              timingTab === 'normal'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
            }`}
          >
            Normal days
          </button>
          <button
            type="button"
            onClick={() => setTimingTab('friday')}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition ${
              timingTab === 'friday'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
            }`}
          >
            {specialDayName}
          </button>
        </div>

        {timingTab === 'normal' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                  Timings Sheet Title
                </label>
                <input
                  type="text"
                  value={timingsTitle}
                  onChange={(e) => setTimingsTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm font-semibold text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                  Effective Date (w.e.f.)
                </label>
                <input
                  type="text"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  placeholder="e.g. 01/09/2026"
                  className="w-full px-3.5 py-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm font-semibold text-stone-900 dark:text-stone-100"
                />
              </div>
            </div>

            <ScheduleEditor
              key="normal-grid"
              periodNums={data.periods}
              times={padTimes(data.periodTimes, data.periods.length)}
              breakAfterValue={data.breakAfter || 0}
              zeroMeans={0}
              zeroLabel="No break"
              breakLabel="Break"
              assembly={data.assemblyTime || { start: '', end: '' }}
              chain={!!data.autoChainTimes}
              onBreakAfterChange={(n) => {
                setBreakAfter(n);
                updateData(prev => ({ ...prev, breakAfter: n }), true);
              }}
              onTimesChange={(t, a) => updateData(prev => ({ ...prev, periodTimes: t, ...(a ? { assemblyTime: a } : {}) }), true)}
              onAssemblyChange={(a) => updateData(prev => ({ ...prev, assemblyTime: a }), true)}
              onChainChange={toggleAutoChain}
            />

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveTimings}
                className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shadow-xs transition"
              >
                Save Timings
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                  Designated Day
                </label>
                <select
                  value={fridayDayIdx}
                  onChange={(e) => setFridayDayIdx(Number(e.target.value))}
                  className="w-full px-3.5 py-2 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-xs font-semibold"
                >
                  {data.days.map((d, i) => (
                    <option key={d} value={i}>{d}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                  Break Label
                </label>
                <input
                  type="text"
                  value={fridayBreakLabel}
                  onChange={(e) => setFridayBreakLabel(e.target.value)}
                  placeholder="e.g. JUMMA BREAK"
                  className="w-full px-3.5 py-2 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-xs font-semibold"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                  Notice Note
                </label>
                <input
                  type="text"
                  value={fridayNote}
                  onChange={(e) => setFridayNote(e.target.value)}
                  placeholder="e.g. Jumma prayer 12:30 – 1:15"
                  className="w-full px-3.5 py-2 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-xs font-semibold"
                />
              </div>
            </div>

            <label className="flex items-start gap-2 text-xs font-bold text-stone-800 dark:text-stone-200 cursor-pointer">
              <input
                type="checkbox"
                checked={fridayEnabled}
                onChange={(e) => setFridayEnabled(e.target.checked)}
                className="mt-0.5 rounded text-emerald-800 focus:ring-emerald-700"
              />
              <span>Print on its own page (unchecked = merge into main sheet)</span>
            </label>

            <button
              type="button"
              onClick={() => {
                updateData(prev => ({
                  ...prev,
                  fridayTimings: {
                    ...prev.fridayTimings,
                    periodTimes: padTimes(prev.periodTimes, prev.periods.length).map(t => ({ start: t.start, end: t.end })),
                    assemblyTime: { ...prev.assemblyTime }
                  }
                }));
                alert('Normal-day times copied. Edit only the periods that differ.');
              }}
              className="w-full px-4 py-2.5 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold transition"
            >
              Copy normal-day times here
            </button>

            <ScheduleEditor
              key="friday-grid"
              periodNums={data.periods}
              times={padTimes(data.fridayTimings?.periodTimes, data.periods.length)}
              breakAfterValue={fridayBreakAfter}
              zeroMeans={data.breakAfter || 0}
              zeroLabel="Same as normal days"
              breakLabel={fridayBreakLabel.trim() || 'Break'}
              assembly={data.fridayTimings?.assemblyTime || { start: '', end: '' }}
              chain={!!data.autoChainTimes}
              onBreakAfterChange={(n) => {
                setFridayBreakAfter(n);
                updateData(prev => ({ ...prev, fridayTimings: { ...prev.fridayTimings, breakAfter: n } }), true);
              }}
              onTimesChange={(t, a) => updateData(prev => ({ ...prev, fridayTimings: { ...prev.fridayTimings, periodTimes: t, ...(a ? { assemblyTime: a } : {}) } }), true)}
              onAssemblyChange={(a) => updateData(prev => ({ ...prev, fridayTimings: { ...prev.fridayTimings, assemblyTime: a } }), true)}
              onChainChange={toggleAutoChain}
            />

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveFridayTimings}
                className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shadow-xs transition"
              >
                Save {specialDayName} Timings
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 sm:p-6 border border-stone-200 dark:border-stone-800 shadow-xs">
        <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-stone-200 dark:border-stone-800">
          <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-xl">
            <FolderOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
              Timetable Scenarios
            </h2>
            <p className="text-xs text-stone-500 font-medium">Save and toggle between Ramadan, Examination, and Regular term timetables</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider">
              Save Current as Scenario
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={scenarioNameInput}
                onChange={(e) => setScenarioNameInput(e.target.value)}
                placeholder="e.g. Ramadan Timings"
                className="flex-1 px-3.5 py-2 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-xs font-semibold"
              />
              <button
                type="button"
                onClick={handleSaveScenario}
                className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shrink-0"
              >
                Save
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider">
              Load / Manage Scenario
            </label>
            <div className="flex gap-2">
              <select
                value={selectedScenario}
                onChange={(e) => setSelectedScenario(e.target.value)}
                className="flex-1 px-3.5 py-2 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-xs font-semibold"
              >
                <option value="">— Select Scenario —</option>
                {scenarioNames.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleLoadScenario}
                disabled={!selectedScenario}
                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold disabled:opacity-40"
              >
                Load
              </button>
              <button
                type="button"
                onClick={handleDeleteScenario}
                disabled={!selectedScenario}
                className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl disabled:opacity-40"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 sm:p-6 border border-stone-200 dark:border-stone-800 shadow-xs">
        <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-stone-200 dark:border-stone-800">
          <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-xl">
            <Database className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
              Device Storage
            </h2>
            <p className="text-xs text-stone-500 font-medium">
              How much of the browser's ~5 MB limit is used by TimetableGrid
            </p>
          </div>
        </div>

        {storageInfo ? (() => {
          const usedKB = Math.round(storageInfo.bytes / 1024);
          const quotaKB = Math.round(storageInfo.quotaBytes / 1024);
          const pct = Math.min(100, (storageInfo.bytes / storageInfo.quotaBytes) * 100);
          const pctInt = Math.round(pct);

          const barColor =
            pct >= 90 ? "bg-rose-500" :
            pct >= 70 ? "bg-amber-500" :
            "bg-emerald-600";

          const warning =
            pct >= 90 ? "⚠️ Storage is nearly full. Save a backup and consider removing old scenarios." :
            pct >= 70 ? "Storage is getting full. You may want to download a backup soon." :
            null;

          return (
            <>
              <div className="flex items-baseline justify-between mb-2">
                <div className="text-xs text-stone-600 dark:text-stone-400">
                  <span className="font-bold text-stone-900 dark:text-stone-100">{usedKB} KB</span>
                  <span className="text-stone-400"> / ~{quotaKB} KB used</span>
                </div>
                <div className={`text-sm font-bold ${
                  pct >= 90 ? "text-rose-600" :
                  pct >= 70 ? "text-amber-600" :
                  "text-emerald-700 dark:text-emerald-400"
                }`}>
                  {pctInt}%
                </div>
              </div>

              <div className="w-full h-2.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${barColor} transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              {warning && (
                <div className={`mt-3 p-3 rounded-xl text-[11px] font-medium leading-relaxed border ${
                  pct >= 90
                    ? "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200"
                    : "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200"
                }`}>
                  {warning}
                </div>
              )}

              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  type="button"
                  onClick={refreshStorageInfo}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold transition"
                >
                  Refresh
                </button>
              </div>
            </>
          );
        })() : (
          <div className="text-xs text-stone-500 italic">
            Storage info unavailable in this browser.
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 sm:p-6 border border-stone-200 dark:border-stone-800 shadow-xs">
        <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-stone-200 dark:border-stone-800">
          <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-xl">
            <Save className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
              Offline Backup &amp; Restore
            </h2>
            <p className="text-xs text-stone-500 font-medium">
              Download JSON backup files to transfer between phones and computers
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleExportBackup}
            className="flex-1 min-w-[140px] min-h-[44px] px-4 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition"
          >
            <Download className="w-4 h-4" />
            <span>Download (.json)</span>
          </button>

          <button
            type="button"
            onClick={handleShareBackup}
            className="flex-1 min-w-[140px] min-h-[44px] px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition"
            title="Share the backup file via WhatsApp, Gmail, Drive, Telegram, etc."
          >
            <Share2 className="w-4 h-4" />
            <span>Share to WhatsApp / Drive</span>
          </button>

          <label className="flex-1 min-w-[140px] min-h-[44px] px-4 py-2.5 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition">
            <Upload className="w-4 h-4" />
            <span>Restore Backup File...</span>
            <input type="file" accept=".json,application/json,.txt,text/plain" onChange={handleImportBackup} className="hidden" />
          </label>
        </div>

        <div className="mt-3 p-3 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900/60 rounded-xl text-[11px] text-sky-900 dark:text-sky-200 leading-relaxed">
          <b>Tip:</b> On Android, tap <b>Share to WhatsApp / Drive</b> to send the backup directly without downloading first.
The shared file uses a <b>.txt</b> extension so Android accepts it — that's normal, and it imports fine.
To restore, save the file from WhatsApp/Drive to your phone, then tap <b>Restore Backup File</b>.
        </div>
      </div>

      <div className="bg-rose-50 dark:bg-rose-950/20 rounded-3xl p-5 sm:p-6 border border-rose-200 dark:border-rose-900/60">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 rounded-xl shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-rose-900 dark:text-rose-200">
              Danger Zone — Reset All Timetables
            </h3>
            <p className="text-xs text-rose-700 dark:text-rose-300 mt-1 leading-relaxed">
              This will permanently delete all classes, teachers, periods, and schedules, resetting TimetableGrid to its default state. Please export a backup first if you need this data.
            </p>
            <button
              type="button"
              onClick={handleResetEverything}
              className="mt-3 px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold transition"
            >
              Reset Everything to Defaults
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmState.isOpen}
        options={confirmState.options}
        onConfirm={(val) => {
          confirmState.action?.(val);
          setConfirmState(prev => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};