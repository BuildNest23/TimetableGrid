import { TimetableData, ClassItem, DAY_NAMES } from '../types/timetable';

/**
 * Change log + undo history.
 *
 * Every edit is stored as a small "patch" (only the parts that changed, with their
 * value before and after) plus a human readable description. The list is saved in
 * localStorage, so Undo / Redo and the "Recent changes" window survive a refresh.
 */

export interface ChangeRow {
  label: string;
  before: string;
  after: string;
}

interface PatchPart {
  b: unknown; // value before
  a: unknown; // value after
}

export interface Patch {
  /** top-level fields that changed (except single class edits) */
  keys: Record<string, PatchPart>;
  /** classes edited in place, by index */
  cls?: Record<string, PatchPart>;
}

export interface HistoryEntry {
  id: string;
  ts: number;
  tag: string;
  where: string;
  rows: ChangeRow[];
  /** number of extra changes not listed in `rows` */
  more: number;
  patch: Patch;
}

export interface HistoryState {
  undo: HistoryEntry[]; // oldest -> newest
  redo: HistoryEntry[]; // undone entries; the LAST one is the next to redo
}

export const EMPTY_HISTORY: HistoryState = { undo: [], redo: [] };
export const MAX_HISTORY = 50;
const HISTORY_KEY = 'utHistory';
const MAX_ROWS = 30;

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Small fast string hash, used to check the saved history still matches the saved data. */
export function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${h}:${s.length}`;
}

// ---------------------------------------------------------------- diff / apply

/** Returns what changed between two data versions, or null when nothing did. */
export function diffData(prev: TimetableData, next: TimetableData): Patch | null {
  const patch: Patch = { keys: {} };
  const p = prev as unknown as Record<string, unknown>;
  const n = next as unknown as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(p), ...Object.keys(n)]);

  allKeys.forEach(k => {
    if (k === 'classes') return;
    if (!eq(p[k], n[k])) patch.keys[k] = { b: p[k], a: n[k] };
  });

  const pc = prev.classes || [];
  const nc = next.classes || [];
  const sameShape = pc.length === nc.length && pc.every((c, i) => c[0] === nc[i][0]);
  if (sameShape) {
    pc.forEach((c, i) => {
      if (!eq(c, nc[i])) {
        if (!patch.cls) patch.cls = {};
        patch.cls[String(i)] = { b: c, a: nc[i] };
      }
    });
  } else if (!eq(pc, nc)) {
    patch.keys.classes = { b: pc, a: nc };
  }

  if (!Object.keys(patch.keys).length && !patch.cls) return null;
  // detach from live state objects
  return JSON.parse(JSON.stringify(patch)) as Patch;
}

/** Applies a patch in one direction: 'b' = go back (undo), 'a' = go forward (redo). */
export function applyPatch(data: TimetableData, patch: Patch, dir: 'b' | 'a'): TimetableData {
  const out = { ...data } as unknown as Record<string, unknown>;
  Object.keys(patch.keys).forEach(k => {
    const v = patch.keys[k][dir];
    if (v === undefined) delete out[k];
    else out[k] = v;
  });
  if (patch.cls) {
    const list = ((out.classes as ClassItem[]) || []).slice();
    Object.keys(patch.cls).forEach(idx => {
      const i = Number(idx);
      if (i >= 0 && i < list.length) list[i] = patch.cls![idx][dir] as ClassItem;
    });
    out.classes = list;
  }
  return out as unknown as TimetableData;
}

// ---------------------------------------------------------------- description

const FIELD_LABELS: Record<string, string> = {
  schoolName: 'School name',
  academicYear: 'Academic year',
  printAcademicYear: 'Print academic year',
  printNote: 'Print note',
  wholeTitle: 'Whole school title',
  allTeachersTitle: 'All teachers title',
  periods: 'Periods',
  breakAfter: 'Break after period',
  daysPerWeek: 'Days per week',
  days: 'Days',
  periodTimes: 'Period timings',
  fridayTimings: 'Friday timings',
  schoolTimingsTitle: 'Timings title',
  effectiveFromDate: 'Effective from',
  assemblyTime: 'Assembly time',
  showTimingsSignature: 'Timings signature',
  autoChainTimes: 'Auto-chain times',
  freeStaffIncludeNonTeaching: 'Free staff: include non-teaching',
  substituteIncludeNonTeaching: 'Substitute: include non-teaching',
  substituteRecommendWorkload: 'Substitute: recommend by workload',
  substituteRecommendGroup: 'Substitute: recommend by group',
  hideEmptyTeachersInTT: 'Hide empty teachers',
  periodsDisplay: 'Periods display',
  printSize: 'Print size',
  printOrientation: 'Print orientation',
  printFontPt: 'Print font size',
  printTimes: 'Print times',
  printBreakCol: 'Print break column',
  stripSize: 'Strip size',
  viewSize: 'View size',
  schoolLogo: 'School logo',
  signatureEnabled: 'Signature',
  leaveDate: 'Leave date'
};

const MASTER_KEYS = new Set(['teachers', 'subjects', 'teacherInfo']);
const LEAVE_KEYS = new Set(['teacherLeaves', 'longLeaves', 'substituteBoards', 'leaveDate']);

function short(v: unknown): string {
  if (v === undefined || v === null || v === '') return '(empty)';
  if (typeof v === 'boolean') return v ? 'On' : 'Off';
  if (typeof v === 'string') return v.length > 40 ? v.slice(0, 37) + '…' : v;
  if (typeof v === 'number') return String(v);
  return 'changed';
}

function cellText(c: ClassItem, p: number): string {
  const sub = c[3]?.[p] || '';
  const tea = c[4]?.[p] || '';
  const s2 = c[5]?.[p] || null;
  if (!sub && !tea && !s2) return '(empty)';
  let t = `${sub || '—'} / ${tea || '—'}`;
  if (s2) {
    if (s2.mode === 'same') {
      t += ` + ${s2.subject || '—'} (same teacher)`;
    } else if (s2.mode === 'parallel') {
      t += ` + ${s2.subject || '—'} / ${s2.teacher || '—'} (parallel)`;
    } else {
      const d = (s2.days || []).map(i => (DAY_NAMES[i] || '').slice(0, 3)).join(', ');
      t += ` + ${s2.subject || '—'} / ${s2.teacher || '—'} (rotation ${d})`;
    }
  }
  return t;
}

function listRows(label: string, before: string[], after: string[]): ChangeRow[] {
  const rows: ChangeRow[] = [];
  if (before.length === after.length) {
    before.forEach((b, i) => {
      if (b !== after[i]) rows.push({ label: `${label} renamed`, before: b, after: after[i] });
    });
    if (!rows.length) rows.push({ label: `${label} list order`, before: 'old order', after: 'new order' });
    return rows;
  }
  after.filter(x => !before.includes(x)).forEach(x => rows.push({ label: `${label} added`, before: '(none)', after: x }));
  before.filter(x => !after.includes(x)).forEach(x => rows.push({ label: `${label} removed`, before: x, after: '(removed)' }));
  if (!rows.length) rows.push({ label: `${label} list`, before: `${before.length}`, after: `${after.length}` });
  return rows;
}

function classRows(pc: ClassItem, nc: ClassItem, periods: number[]): ChangeRow[] {
  const rows: ChangeRow[] = [];
  const name = nc[0];
  if (pc[0] !== nc[0]) rows.push({ label: 'Class name', before: pc[0], after: nc[0] });
  if (pc[1] !== nc[1]) rows.push({ label: `${name} · Incharge`, before: short(pc[1]), after: short(nc[1]) });
  if (pc[2] !== nc[2]) rows.push({ label: `${name} · Section`, before: short(pc[2]), after: short(nc[2]) });
  const count = Math.max(pc[3]?.length || 0, nc[3]?.length || 0);
  for (let p = 0; p < count; p++) {
    const b = cellText(pc, p);
    const a = cellText(nc, p);
    if (b !== a) rows.push({ label: `${name} · Period ${periods[p] ?? p + 1}`, before: b, after: a });
  }
  return rows;
}

/** Builds the readable "what changed" description for one patch. */
export function describeChange(
  prev: TimetableData,
  next: TimetableData,
  patch: Patch,
  meta?: { tag?: string; where?: string }
): { tag: string; where: string; rows: ChangeRow[]; more: number } {
  const rows: ChangeRow[] = [];
  const groups = new Set<string>();
  const keys = Object.keys(patch.keys);
  const renameCascade = keys.includes('teachers') || keys.includes('subjects');

  // single-class edits
  let cellsOnly = true;
  if (patch.cls && !renameCascade) {
    groups.add('EDITOR');
    Object.keys(patch.cls).forEach(idx => {
      const part = patch.cls![idx];
      const r = classRows(part.b as ClassItem, part.a as ClassItem, next.periods);
      r.forEach(x => {
        if (!x.label.includes('Period')) cellsOnly = false;
      });
      rows.push(...r);
    });
  } else if (patch.cls) {
    groups.add('MASTER LISTS');
  }

  keys.forEach(k => {
    const part = patch.keys[k];
    if (k === 'classes') {
      const b = (part.b as ClassItem[]) || [];
      const a = (part.a as ClassItem[]) || [];
      groups.add('MASTER LISTS');
      if (b.length === a.length) {
        b.forEach((c, i) => {
          if (c[0] !== a[i][0]) rows.push({ label: 'Class renamed', before: c[0], after: a[i][0] });
        });
        if (!rows.some(r => r.label === 'Class renamed')) rows.push({ label: 'Classes order', before: 'old order', after: 'new order' });
      } else {
        const bn = b.map(c => c[0]);
        const an = a.map(c => c[0]);
        an.filter(x => !bn.includes(x)).forEach(x => rows.push({ label: 'Class added', before: '(none)', after: x }));
        bn.filter(x => !an.includes(x)).forEach(x => rows.push({ label: 'Class removed', before: x, after: '(removed)' }));
      }
      return;
    }
    if (k === 'teachers') {
      groups.add('MASTER LISTS');
      rows.push(...listRows('Teacher', (part.b as string[]) || [], (part.a as string[]) || []));
      return;
    }
    if (k === 'subjects') {
      groups.add('MASTER LISTS');
      rows.push(...listRows('Subject', (part.b as string[]) || [], (part.a as string[]) || []));
      return;
    }
    if (k === 'teacherInfo') {
      groups.add('MASTER LISTS');
      const b = (part.b || {}) as Record<string, { qual?: string; rank?: string; desig?: string }>;
      const a = (part.a || {}) as Record<string, { qual?: string; rank?: string; desig?: string }>;
      const fmt = (i?: { qual?: string; rank?: string; desig?: string }) =>
        i ? [i.qual, i.rank, i.desig].filter(Boolean).join(' · ') || '(empty)' : '(none)';
      new Set([...Object.keys(b), ...Object.keys(a)]).forEach(t => {
        if (!eq(b[t], a[t])) {
          // a pure rename shows up in the Teachers list already
          if (renameCascade && (!b[t] || !a[t])) return;
          rows.push({ label: `Teacher details · ${t}`, before: fmt(b[t]), after: fmt(a[t]) });
        }
      });
      return;
    }
    if (k === 'teacherLeaves') {
      groups.add('LEAVES');
      const b = (part.b || {}) as Record<string, string[]>;
      const a = (part.a || {}) as Record<string, string[]>;
      new Set([...Object.keys(b), ...Object.keys(a)]).forEach(d => {
        if (!eq(b[d], a[d])) {
          rows.push({ label: `Leave · ${d}`, before: (b[d] || []).join(', ') || '(none)', after: (a[d] || []).join(', ') || '(none)' });
        }
      });
      return;
    }
    if (k === 'longLeaves') {
      groups.add('LEAVES');
      type LL = { id: string; teacher: string; from: string; to: string };
      const b = ((part.b as LL[]) || []);
      const a = ((part.a as LL[]) || []);
      const f = (l?: LL) => (l ? `${l.from} → ${l.to || 'open'}` : '(none)');
      a.forEach(l => {
        const old = b.find(x => x.id === l.id);
        if (!old || !eq(old, l)) rows.push({ label: `Long leave · ${l.teacher}`, before: f(old), after: f(l) });
      });
      b.forEach(l => {
        if (!a.find(x => x.id === l.id)) rows.push({ label: `Long leave · ${l.teacher}`, before: f(l), after: '(removed)' });
      });
      return;
    }
    if (k === 'substituteBoards') {
      groups.add('SUBSTITUTE');
      type SB = { absent: string[]; assigned: Record<string, Record<string, string>> };
      const b = (part.b || {}) as Record<string, SB>;
      const a = (part.a || {}) as Record<string, SB>;
      const f = (s?: SB) => {
        if (!s) return '(none)';
        const covered = Object.values(s.assigned || {}).reduce((n, o) => n + Object.keys(o).length, 0);
        return `${s.absent.length} absent, ${covered} covered`;
      };
      new Set([...Object.keys(b), ...Object.keys(a)]).forEach(d => {
        if (!eq(b[d], a[d])) rows.push({ label: `Substitute board · ${d}`, before: f(b[d]), after: f(a[d]) });
      });
      return;
    }
    if (k === 'conflictExceptions') {
      groups.add('CONFLICTS');
      const b = (part.b as unknown[]) || [];
      const a = (part.a as unknown[]) || [];
      rows.push({ label: 'Marked as intentional', before: `${b.length}`, after: `${a.length}` });
      return;
    }
    groups.add(LEAVE_KEYS.has(k) ? 'LEAVES' : MASTER_KEYS.has(k) ? 'MASTER LISTS' : 'SETTINGS');
    if (k === 'schoolLogo') {
      rows.push({ label: 'School logo', before: part.b ? 'logo' : '(none)', after: part.a ? 'logo' : '(none)' });
      return;
    }
    rows.push({ label: FIELD_LABELS[k] || k, before: short(part.b), after: short(part.a) });
  });

  let tag = 'CHANGE';
  if (groups.size === 1) tag = Array.from(groups)[0];
  else if (groups.has('MASTER LISTS')) tag = 'MASTER LISTS';
  else if (groups.size > 1) tag = 'MULTIPLE';
  if (tag === 'EDITOR' && cellsOnly && rows.length && rows.every(r => r.after === '(empty)')) tag = 'EDITOR · CLEAR';

  const total = rows.length;
  const shown = rows.slice(0, MAX_ROWS);
  const where = total === 1 ? shown[0].label : `${total} changes`;

  return {
    tag: meta?.tag || tag,
    where: meta?.where || where,
    rows: shown,
    more: Math.max(0, total - shown.length)
  };
}

export function newEntryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------- storage

/** Loads the saved history, but only if it belongs to exactly the data currently saved. */
export function loadHistory(savedDataStr: string): HistoryState {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw || !savedDataStr) return EMPTY_HISTORY;
    const p = JSON.parse(raw);
    if (!p || p.head !== hashString(savedDataStr) || !Array.isArray(p.undo) || !Array.isArray(p.redo)) {
      return EMPTY_HISTORY;
    }
    return { undo: p.undo, redo: p.redo };
  } catch {
    return EMPTY_HISTORY;
  }
}

/**
 * Saves the history. If the browser storage is full, the oldest entries are dropped
 * until it fits. Returns what was really kept.
 */
export function saveHistory(h: HistoryState, dataStr: string): HistoryState {
  let cur = h;
  const head = hashString(dataStr);
  for (let i = 0; i < 200; i++) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify({ head, undo: cur.undo, redo: cur.redo }));
      return cur;
    } catch {
      if (cur.undo.length > 1) cur = { ...cur, undo: cur.undo.slice(1) };
      else if (cur.redo.length) cur = { ...cur, redo: cur.redo.slice(1) };
      else if (cur.undo.length) cur = { ...cur, undo: [] };
      else break;
    }
  }
  try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
  return EMPTY_HISTORY;
}

export function clearSavedHistory() {
  try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
}
