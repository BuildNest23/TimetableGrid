import { DAY_NAMES, ClassItem, Slot2 } from '../types/timetable';

/* ---------- HTML escape ---------- */
export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------- Slot helpers (single source of truth) ---------- */
export function isSlot2ActiveOn(s: Slot2 | null | undefined, d: number): boolean {
  if (!s) return false;
  if (s.mode === 'parallel') return true;
  if (s.mode === 'same') return !s.days?.length || s.days.includes(d);
  return !!s.days?.includes(d);
}

export function isSlot1ActiveOn(s: Slot2 | null | undefined, d: number): boolean {
  if (!s) return true;
  if (s.mode === 'parallel') return true;
  if (s.mode === 'same') return !s.days?.length || !s.days.includes(d);
  return !s.days?.includes(d);
}

export function daysLabel(days: number[]): string {
  if (!Array.isArray(days) || !days.length) return '';
  return days.slice().sort((a, b) => a - b).map(d => (DAY_NAMES[d] || '').slice(0, 3)).join(', ');
}

/* ---------- Whole School cell lines (single source of truth) ---------- */
export function wholeSchoolCellLines(
  sub1: string,
  t1: string,
  s2: any
): string[] {
  if (!s2 || (!s2.subject && !s2.teacher)) {
    if (!sub1 && !t1) return ['—'];
    if (t1) return [`${sub1 || '—'} - ${t1}`];
    return [sub1 || '—'];
  }

  if (s2.mode === 'same') {
    const t = t1 || s2.teacher;
    const dayStr = s2.days?.length ? ` (${daysLabel(s2.days)})` : '';
    const subPart = `${sub1 || '—'}/${s2.subject || '—'}${dayStr}`;
    return [t ? `${subPart} - ${t}` : subPart];
  }

  if (s2.mode === 'parallel') {
    const line1 = t1 ? `${sub1 || '—'} - ${t1}` : (sub1 || '—');
    const line2 = s2.teacher ? `${s2.subject || '—'} - ${s2.teacher}` : (s2.subject || '—');
    return [line1, line2];
  }

  // rotation mode
  const line1 = t1 ? `${sub1 || '—'} - ${t1}` : (sub1 || '—');
  const dayStr = s2.days?.length ? ` (${daysLabel(s2.days)})` : '';
  const line2 = `${s2.subject || '—'}${s2.teacher ? ' - ' + s2.teacher : ''}${dayStr}`;
  return [line1, line2];
}

/* ---------- Cell text for a specific day ---------- */
export function cellTextForDay(c: ClassItem, pi: number, dayIdx: number): string {
  const s2 = c[5] ? c[5][pi] : null;
  const t1 = (c[4] && c[4][pi]) || '';
  const sub1 = (c[3] && c[3][pi]) || '—';

  if (!s2 || (!s2.subject && !s2.teacher)) {
    return t1 ? `${sub1} - ${t1}` : sub1;
  }
  if (s2.mode === 'same') {
    const t = t1 || s2.teacher;
    if (!s2.days?.length) {
      return t ? `${sub1}/${s2.subject || '—'} - ${t}` : `${sub1}/${s2.subject || '—'}`;
    }
    if (s2.days.includes(dayIdx)) {
      return t ? `${s2.subject || '—'} - ${t}` : (s2.subject || '—');
    }
    return t ? `${sub1} - ${t}` : sub1;
  }
  // parallel or rotation
  const active2 = isSlot2ActiveOn(s2, dayIdx);
  const active1 = isSlot1ActiveOn(s2, dayIdx);
  const lines: string[] = [];
  if (active1 && (sub1 || t1)) lines.push(t1 ? `${sub1} - ${t1}` : sub1);
  if (active2) lines.push(s2.teacher ? `${s2.subject || '—'} - ${s2.teacher}` : (s2.subject || '—'));
  return lines.join(' / ') || '—';
}