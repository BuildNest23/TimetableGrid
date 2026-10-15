import { TimetableData, printYear } from '../types/timetable';
import { esc } from './printHtml';
import { formatPeriodsDW, periodsHeading } from './periodsDW';

/**
 * Black-and-white document builders for the Teachers Roster, Substitute Sheet
 * and Free Staff prints, and for their PNG exports.
 *
 * Everything is sized in `em`, so the same HTML renders as an A4 print
 * (base font in pt) and as a 1080px PNG (base font in px).
 * Pure functions: they only return HTML strings.
 */

export type DocVariant = 'print' | 'png';

/* ------------------------------------------------------------------ */
/* Shared styles                                                       */
/* ------------------------------------------------------------------ */
function docStyles(variant: DocVariant, fixedHeight: boolean): string {
  const base = variant === 'png' ? '15.5px' : '9.5pt';
  const frame =
    variant === 'png'
      ? 'border:2px solid #000;border-radius:26px;padding:2.4em 2.6em 1.8em;'
      : `padding:0.2em;${fixedHeight ? 'height:calc(var(--page-h,281mm) - 3mm);' : 'min-height:calc(var(--page-h,281mm) - 3mm);'}`;
  return `<style>
.doc{box-sizing:border-box;width:100%;display:flex;flex-direction:column;background:#fff;color:#000;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:${base};line-height:1.35;${frame}}
.doc *{box-sizing:border-box}
.doc .lh{display:flex;align-items:center;gap:1.2em;padding-bottom:0.7em;border-bottom:0.26em solid #000;position:relative;margin-bottom:0.7em}
.doc .lh:after{content:"";position:absolute;left:0;right:0;bottom:-0.62em;border-bottom:0.06em solid #bdbdbd}
.doc .logo{width:5.4em;height:5.4em;flex:none;object-fit:contain;filter:grayscale(1)}
.doc .mono{width:5.4em;height:5.4em;flex:none;border:0.14em solid #000;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:1.5em}
.doc .ttl{flex:1;min-width:0}
.doc .school{font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:2em;line-height:1.1;overflow-wrap:anywhere}
.doc .dt{font-size:0.78em;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#444;margin-top:0.5em}
.doc .meta{font-size:0.78em;color:#444;margin-top:0.2em}
.doc .chips{display:flex;flex-direction:column;align-items:flex-end;gap:0.3em;flex:none}
.doc .chip{font-size:0.78em;font-weight:700;border:0.1em solid #000;border-radius:2em;padding:0.1em 0.9em;white-space:nowrap}
.doc .body{flex:1;min-height:0;display:flex;flex-direction:column;gap:0.9em;padding-top:1em}
.doc .foot{display:flex;justify-content:space-between;align-items:flex-end;gap:1em;border-top:0.06em solid #bdbdbd;padding-top:0.5em;margin-top:0.8em;font-size:0.78em;color:#444}
.doc .sig{min-width:15em;text-align:center}
.doc .sig .ln{height:1.6em;border-bottom:0.08em solid #000;margin-bottom:0.25em}
.doc .stats{display:flex;gap:0.6em}
.doc .stat{flex:1;display:flex;justify-content:space-between;align-items:baseline;gap:0.6em;background:#f2f2f2;border:0.08em solid #000;padding:0.45em 0.8em}
.doc .stat span{font-size:0.72em;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#444}
.doc .stat b{font-size:1.15em}
.doc table.t{width:100%;border-collapse:collapse}
.doc table.t thead{display:table-header-group}
.doc table.t tr{page-break-inside:avoid;break-inside:avoid}
.doc table.t th{font-size:0.78em;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-align:center;padding:0.65em 0.5em;border-top:0.19em solid #000;border-bottom:0.1em solid #000;background:#fff;color:#000}
.doc table.t th.l,.doc table.t td.l{text-align:left}
.doc table.t td{padding:0.32em 0.5em;text-align:center;border-top:0.05em solid #bdbdbd;vertical-align:middle}
.doc table.t tbody tr:first-child td{border-top:none}
.doc table.t tbody tr:nth-child(even) td{background:#f2f2f2}
.doc table.t tbody tr:last-child td{border-bottom:0.1em solid #000}
.doc td.n{text-align:left;font-weight:700;font-family:Georgia,'Times New Roman',serif;font-size:1.05em}
.doc .pill{display:inline-block;border:0.07em solid #000;border-radius:2em;padding:0.02em 0.8em;font-size:0.92em;font-weight:600;white-space:nowrap;background:#fff}
.doc .g-arts{background:#e8e8e8}
.doc .g-it{background:#cfcfcf}
.doc .g-other{border-style:dashed}
.doc .bd{display:inline-block;min-width:3.2em;border:0.09em solid #000;border-radius:0.35em;padding:0.05em 0.6em;font-weight:700;background:#fff}
.doc .bd.z{color:#777;border:0.09em dashed #999}
.doc .dash{color:#999}
.doc .info{display:flex;border:0.09em solid #000}
.doc .info>div{flex:1;padding:0.6em 0.9em;border-left:0.09em solid #000;min-width:0}
.doc .info>div:first-child{flex:1.4;border-left:none;background:#f2f2f2}
.doc .info small{display:block;font-size:0.72em;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:#444}
.doc .info b{font-size:1.2em}
.doc .info em{font-style:normal;font-size:0.85em;color:#444}
.doc .leave{font-size:0.85em;color:#444}
.doc .blk{display:flex;border:0.09em solid #000;page-break-inside:avoid;break-inside:avoid}
.doc .blk .main{flex:1;min-width:0}
.doc .head{display:flex;align-items:center;gap:0.8em;padding:0.55em 0.9em;background:#f2f2f2;border-bottom:0.09em solid #000}
.doc .pn{width:2.1em;height:2.1em;flex:none;border:0.14em solid #000;border-radius:0.3em;background:#fff;color:#000;font-weight:700;font-size:1.1em;display:flex;align-items:center;justify-content:center}
.doc .sb{font-weight:700;font-size:1.1em;line-height:1.2}
.doc .sb small{display:block;font-weight:500;font-size:0.78em;color:#444}
.doc .rec{margin-left:auto;border:0.14em solid #000;border-radius:2em;padding:0.18em 0.85em;font-weight:700;font-size:0.88em;background:#fff;text-align:right}
.doc .row{display:flex;gap:0.6em;padding:0.55em 0.9em;font-size:0.88em;align-items:flex-start}
.doc .row+.row{border-top:0.05em dashed #bdbdbd}
.doc .row .k{flex:none;width:5.6em;color:#444;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;font-size:0.78em;padding-top:0.25em}
.doc .grp{display:flex;flex-wrap:wrap;gap:0.2em 1.2em}
.doc .grp .g2{color:#444}
.doc .chs{display:flex;flex-wrap:wrap;gap:0.3em}
.doc .c{display:inline-flex;align-items:center;gap:0.4em;border:0.07em solid #000;border-radius:2em;padding:0.05em 0.25em 0.05em 0.75em;font-weight:600;background:#fff}
.doc .c i{font-style:normal;font-size:0.9em;font-weight:700;background:#e4e4e4;border-radius:2em;padding:0 0.5em}
.doc .sg{flex:none;width:9em;border-left:0.09em solid #000;padding:0.5em;display:flex;align-items:flex-end;justify-content:center;text-align:center;font-size:0.72em;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#444}
.doc .freeline{border:0.09em dashed #000;background:#f2f2f2;padding:0.55em 0.9em;font-size:0.88em;color:#444}
.doc .freeline b{color:#000}
.doc .sigs{display:flex;gap:4em;margin-top:auto;padding-top:2.4em}
.doc .sigs div{flex:1;border-top:0.09em solid #000;padding-top:0.3em;text-align:center;font-size:0.85em;color:#444}
.doc .legend{font-size:0.85em;color:#444}
.doc .fsw{flex:1;min-height:0;display:flex;flex-direction:column}
.doc table.t.fs{flex:1;height:100%}
.doc table.t.fs td{padding:0.7em 0.5em}
.doc .pb{display:inline-flex;align-items:center;gap:0.6em;font-weight:700}
.doc .cnt{font-weight:700}
.doc .busy{color:#444;font-style:italic}
</style>`;
}

/* ------------------------------------------------------------------ */
/* Letterhead and footer                                               */
/* ------------------------------------------------------------------ */
function monogram(name: string): string {
  const words = (name || '').split(/\s+/).filter(w => /^[A-Za-z0-9]/.test(w) && !/^(of|the|and|for)$/i.test(w));
  const letters = words.slice(0, 3).map(w => w[0].toUpperCase()).join('');
  return letters || 'S';
}

export function buildLetterheadHtml(
  data: TimetableData,
  title: string,
  chips: string[]
): string {
  const logo = data.schoolLogo
    ? `<img class="logo" src="${esc(data.schoolLogo)}" alt=""/>`
    : `<div class="mono">${esc(monogram(data.schoolName))}</div>`;
  const meta = [printYear(data), data.printNote].filter(Boolean).join(' · ');
  return `<div class="lh">${logo}<div class="ttl"><div class="school">${esc(data.schoolName || 'School')}</div><div class="dt">${esc(title)}</div>${meta ? `<div class="meta">${esc(meta)}</div>` : ''}</div><div class="chips">${chips.filter(Boolean).map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div></div>`;
}

function buildFooterHtml(dateLabel: string, signLabel: string): string {
  return `<div class="foot"><span>${esc(dateLabel)}</span>${signLabel ? `<div class="sig"><div class="ln"></div>${esc(signLabel)}</div>` : '<span></span>'}</div>`;
}

function todayLabel(): string {
  try {
    return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

function wrap(variant: DocVariant, inner: string, fixedHeight = false): string {
  return `${docStyles(variant, fixedHeight)}<div class="doc ${variant}">${inner}</div>`;
}

const dash = '<span class="dash">–</span>';

/* ------------------------------------------------------------------ */
/* Teachers Roster                                                     */
/* ------------------------------------------------------------------ */
export function buildRosterDoc(
  data: TimetableData,
  getTeacherTotalPeriods: (t: string) => number,
  variant: DocVariant = 'print'
): string {
  const groupClass = (g: string): string =>
    g === 'Science' ? '' : g === 'Arts' ? 'g-arts' : g === 'IT' ? 'g-it' : 'g-other';
  const inchargeTeachers = new Set(data.classes.map(c => c[1]).filter(Boolean));
  const modeLabel = data.periodsDisplay === 'day' ? 'Per Day' : data.periodsDisplay === 'week' ? 'Per Week' : 'Day/Week';

  const rows = data.teachers.map(t => {
    const info = data.teacherInfo[t] || { qual: '', rank: '', desig: '' };
    const incharge = data.classes.filter(c => c[1] === t).map(c => c[0]).join(', ');
    const total = getTeacherTotalPeriods(t);
    return `<tr>
      <td class="n">${esc(t)}</td>
      <td>${info.qual ? `<span class="pill ${groupClass(info.qual)}">${esc(info.qual)}</span>` : dash}</td>
      <td>${info.rank ? esc(info.rank) : dash}</td>
      <td>${info.desig ? esc(info.desig) : dash}</td>
      <td>${incharge ? esc(incharge) : dash}</td>
      <td><span class="bd${total === 0 ? ' z' : ''}">${esc(formatPeriodsDW(total, data.daysPerWeek, data.periodsDisplay))}</span></td>
    </tr>`;
  }).join('');

  const inner = `${buildLetterheadHtml(data, 'Teachers Roster', [todayLabel()])}
  <div class="body">
    <div class="stats">
      <div class="stat"><span>Teachers</span><b>${data.teachers.length}</b></div>
      <div class="stat"><span>Class incharges</span><b>${inchargeTeachers.size}</b></div>
      <div class="stat"><span>Periods shown</span><b>${esc(modeLabel)}</b></div>
    </div>
    <table class="t">
      <colgroup><col style="width:30%"/><col style="width:14%"/><col style="width:9%"/><col style="width:15%"/><col style="width:17%"/><col style="width:15%"/></colgroup>
      <thead><tr><th class="l">Teacher</th><th>Group</th><th>Grade</th><th>Designation</th><th>Incharge of</th><th>${esc(periodsHeading(data.periodsDisplay))}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  ${variant === 'print' ? buildFooterHtml(todayLabel(), data.printNote ? '' : 'Principal') : ''}`;
  return wrap(variant, inner);
}

/* ------------------------------------------------------------------ */
/* Substitute sheet                                                    */
/* ------------------------------------------------------------------ */
export interface SubstituteDocRow {
  period: number;
  info: string; // "Subject (Class), Subject (Class)"
  isFree: boolean;
  bestName: string;
  bestLoad: string;
  groupMatches: { teacher: string; rank: string; qual: string }[];
  freeList: { teacher: string; load: string }[];
}

export interface SubstituteDocInput {
  absentTeacher: string;
  dateLabel: string; // e.g. 2026-10-15
  dayName: string; // e.g. Thursday
  otherLeaves: string[];
  rows: SubstituteDocRow[];
  showWorkload: boolean;
  showGroup: boolean;
}

function splitAssignment(s: string): { subject: string; cls: string } {
  const m = s.match(/^(.*) \(([^()]*)\)$/);
  return m ? { subject: m[1], cls: m[2] } : { subject: s, cls: '' };
}

export function buildSubstituteDoc(
  data: TimetableData,
  input: SubstituteDocInput,
  variant: DocVariant = 'print'
): string {
  const info = data.teacherInfo[input.absentTeacher] || { qual: '', rank: '', desig: '' };
  const absentSub = [info.qual, info.rank].filter(Boolean).join(', ');
  const cover = input.rows.filter(r => !r.isFree);
  const freePeriods = input.rows.filter(r => r.isFree).map(r => r.period);

  const blocks = cover.map(r => {
    const parts = r.info.split(', ').filter(Boolean).map(splitAssignment);
    const title = parts.map(p => esc(p.subject)).join(' / ');
    const sub = parts.map(p => p.cls).filter(Boolean).join(', ');
    const rec =
      input.showWorkload && r.bestName
        ? `<div class="rec">Recommended: ${esc(r.bestName)} · ${esc(r.bestLoad)}</div>`
        : '';
    const group =
      input.showGroup && r.groupMatches.length
        ? `<div class="row"><div class="k">By group</div><div class="grp">${r.groupMatches
            .map((g, i) => `<span><b>${i + 1}</b> ${esc(g.teacher)} <span class="g2">(${esc([g.rank, g.qual].filter(Boolean).join(' ') || 'No group')})</span></span>`)
            .join('')}</div></div>`
        : '';
    const free = r.freeList.length
      ? `<div class="chs">${r.freeList.map(f => `<span class="c">${esc(f.teacher)}<i>${esc(f.load)}</i></span>`).join('')}</div>`
      : `<span class="busy">No free teacher</span>`;
    return `<div class="blk"><div class="main">
      <div class="head"><div class="pn">${r.period}</div><div class="sb">${title || 'Period ' + r.period}${sub ? `<small>${esc(sub)}</small>` : ''}</div>${rec}</div>
      ${group}
      <div class="row"><div class="k">Also free</div>${free}</div>
    </div>${variant === 'print' ? '<div class="sg">Substitute signs</div>' : ''}</div>`;
  }).join('');

  const freeLine = freePeriods.length
    ? `<div class="freeline"><b>${freePeriods.length === 1 ? 'Period ' + freePeriods[0] : 'Periods ' + rangeLabel(freePeriods)}</b> · Absent teacher is free · no cover needed</div>`
    : '';

  const leave = input.otherLeaves.length
    ? `<div class="leave">Also on leave: ${esc(input.otherLeaves.join(', '))}</div>`
    : '';

  const inner = `${buildLetterheadHtml(data, 'Substitute Teacher Sheet', [input.dayName ? `${input.dayName}, ${input.dateLabel}` : input.dateLabel])}
  <div class="body">
    <div class="info">
      <div><small>Absent teacher</small><b>${esc(input.absentTeacher)}</b>${absentSub ? ` <em>· ${esc(absentSub)}</em>` : ''}</div>
      <div><small>Date</small><b>${esc(input.dayName || '—')}</b> <em>${esc(input.dateLabel)}</em></div>
      <div><small>Periods to cover</small><b>${cover.length}</b> <em>of ${input.rows.length}</em></div>
    </div>
    ${leave}
    ${blocks || '<div class="freeline">No periods need cover for this date.</div>'}
    ${freeLine}
    ${variant === 'print' ? '<div class="sigs"><div>Arranged by</div><div>Principal</div></div>' : ''}
  </div>
  ${variant === 'print' ? buildFooterHtml(todayLabel(), '') : ''}`;
  return wrap(variant, inner);
}

/** [1,2,3,5] -> "1 – 3, 5" */
function rangeLabel(nums: number[]): string {
  const sorted = nums.slice().sort((a, b) => a - b);
  const out: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const n = sorted[i];
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    out.push(start === prev ? `${start}` : `${start} – ${prev}`);
    start = n;
    prev = n;
  }
  return out.join(', ');
}

/* ------------------------------------------------------------------ */
/* Free staff                                                          */
/* ------------------------------------------------------------------ */
export interface FreeStaffDocInput {
  dayName: string;
  dateLabel: string;
  rows: { period: number; free: { teacher: string; load: number }[] }[];
}

export function buildFreeStaffDoc(
  data: TimetableData,
  input: FreeStaffDocInput,
  variant: DocVariant = 'print'
): string {
  const rows = input.rows.map(r => `<tr>
      <td class="l"><span class="pb"><span class="pn">${r.period}</span>Period ${r.period}</span></td>
      <td>${r.free.length ? `<span class="cnt">${r.free.length}</span> free` : dash}</td>
      <td class="l">${r.free.length
        ? `<div class="chs">${r.free.map(f => `<span class="c">${esc(f.teacher)}<i>${f.load}</i></span>`).join('')}</div>`
        : '<span class="busy">All teachers busy</span>'}</td>
    </tr>`).join('');

  const inner = `${buildLetterheadHtml(data, 'Free Staff by Period', [input.dayName, input.dateLabel])}
  <div class="body">
    <div class="legend">The number next to a name is how many periods that teacher teaches today.</div>
    <div class="fsw"><table class="t fs">
      <colgroup><col style="width:19%"/><col style="width:12%"/><col/></colgroup>
      <thead><tr><th class="l">Period</th><th>Available</th><th class="l">Free teachers</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>
  ${variant === 'print' ? buildFooterHtml(todayLabel(), '') : ''}`;
  return wrap(variant, inner, variant === 'print' && input.rows.length <= 10);
}
