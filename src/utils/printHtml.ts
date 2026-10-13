import { TimetableData, DAY_NAMES, ClassItem } from '../types/timetable';

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
export function isSlot2ActiveOn(s: any, d: number): boolean {
  if (!s) return false;
  if (s.mode === 'parallel') return true;
  if (s.mode === 'same') return !s.days?.length || s.days.includes(d);
  return !!s.days?.includes(d);
}

export function isSlot1ActiveOn(s: any, d: number): boolean {
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

/* ---------- Header (logo + school name + title) ---------- */
export function printHeaderHTML(data: TimetableData, title: string): string {
  const logoHtml = data.schoolLogo
    ? `<div style="flex:0 0 24mm; max-width:24mm; display:flex; align-items:center; justify-content:center;">
         <img src="${esc(data.schoolLogo)}" alt="" style="max-height:18mm; max-width:24mm; display:block;" />
       </div>`
    : '';
  const spacerHtml = data.schoolLogo
    ? `<div style="flex:0 0 24mm; max-width:24mm; visibility:hidden;"></div>`
    : '';
  const metaLine = [data.academicYear, data.printNote].filter(Boolean).join(' · ');
  return `
    <div class="print-header" style="display:flex; align-items:center; gap:3mm; margin-bottom:3mm;">
      ${logoHtml}
      <div style="flex:1; text-align:center; min-width:0;">
        <h2 class="print-title" style="font-family:Georgia, 'Times New Roman', serif; font-weight:700; margin:0; line-height:1.2; letter-spacing:0.02em;">${esc(data.schoolName)}</h2>
        <div class="print-sub" style="text-transform:uppercase; font-variant:small-caps; letter-spacing:0.18em; font-weight:700; margin-top:1.5mm;">${esc(title)}</div>
        ${metaLine ? `<div class="print-sub" style="font-size:8.5pt; color:#444; margin-top:1mm;">${esc(metaLine)}</div>` : ''}
        <div style="margin-top:2mm; border-top:1px solid #000; border-bottom:1px solid #000; height:2px;"></div>
      </div>
      ${spacerHtml}
    </div>
  `;
}

/* ---------- Whole School table ---------- */
export function wholeSchoolHTML(
  data: TimetableData,
  classes: ClassItem[] = data.classes,
  titleOverride?: string
): string {
  const hasBreak = data.breakAfter && data.breakAfter > 0 && data.breakAfter < data.periods.length;
  const breakTh = hasBreak ? `<th class="break-header" style="width:14px; min-width:14px; max-width:14px; padding:0;"></th>` : '';
  const breakTd = hasBreak ? `<td class="break-cell" style="width:14px; min-width:14px; max-width:14px; padding:0;"></td>` : '';
  const totalCols = 2 + data.periods.length + (hasBreak ? 1 : 0);

  const headRow = `
    <tr>
      <th style="width:10%">Class</th>
      <th style="width:10%">Incharge</th>
      ${data.periods.map(p => {
        const extra = (hasBreak && data.breakAfter === p) ? breakTh : '';
        return `<th>Period ${p}</th>${extra}`;
      }).join('')}
    </tr>
  `;

  let lastSection: string | null = null;
  const bodyRows = classes.map((c) => {
    let sectionRow = '';
    if (c[2] && c[2] !== lastSection) {
      sectionRow = `<tr class="sectionrow"><td colspan="${totalCols}"><b>${esc(c[2])} SECTION</b></td></tr>`;
      lastSection = c[2];
    } else if (!c[2]) {
      lastSection = null;
    }

    const cells = data.periods.map((_, pi) => {
      const s2 = c[5] ? c[5][pi] : null;
      const sub1 = c[3][pi] || '—';
      const t1 = c[4][pi];
      const breakExtra = (hasBreak && data.breakAfter === data.periods[pi]) ? breakTd : '';
      const lines = wholeSchoolCellLines(sub1, t1, s2);

      if (lines.length === 1) {
        return `<td><div style="line-height:1.2; text-align:center; font-weight:700;">${esc(lines[0])}</div></td>${breakExtra}`;
      }
      return `<td><div style="line-height:1.2; text-align:center; font-size:0.9em;"><div style="font-weight:700;">${esc(lines[0])}</div><div style="font-style:italic; color:#333; margin-top:1px;">${esc(lines[1])}</div></div></td>${breakExtra}`;
    }).join('');

    return `${sectionRow}<tr><th style="font-family:Georgia, 'Times New Roman', serif; text-align:left;">${esc(c[0])}</th><td style="font-style:italic;">${esc(c[1] || '—')}</td>${cells}</tr>`;
  }).join('');

  return `
    <div class="print-sheet fixed-sheet wide-sheet">
      ${printHeaderHTML(data, titleOverride || data.wholeTitle || 'Whole School Timetable')}
      <div class="sheet-body">
        <table class="fill">
          <thead>${headRow}</thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

/* ---------- All Teachers table ---------- */
export function allTeachersHTML(
  data: TimetableData,
  teacherPeriodSummary: (t: string, pi: number) => string
): string {
  // "Hide empty teachers" keeps anyone who teaches at least one period (not just period 1)
  const teacherList = data.hideEmptyTeachersInTT
    ? data.teachers.filter(t => data.periods.some((_, pi) => teacherPeriodSummary(t, pi) !== 'Free'))
    : data.teachers;

  const hasBreak = data.breakAfter && data.breakAfter > 0 && data.breakAfter < data.periods.length;
  const breakTh = hasBreak ? `<th class="break-header" style="width:14px; min-width:14px; max-width:14px; padding:0;"></th>` : '';
  const breakTd = hasBreak ? `<td class="break-cell" style="width:14px; min-width:14px; max-width:14px; padding:0;"></td>` : '';

  const headRow = `
    <tr>
      <th style="width:14%">Teacher</th>
      ${data.periods.map(p => {
        const extra = (hasBreak && data.breakAfter === p) ? breakTh : '';
        return `<th>Period ${p}</th>${extra}`;
      }).join('')}
    </tr>
  `;
  const rows = teacherList.map(t => {
    const cells = data.periods.map((_, pi) => {
      const summary = teacherPeriodSummary(t, pi);
      const isFree = summary === 'Free';
      const cellContent = isFree
        ? `<span style="color:#777;">—</span>`
        : `<span style="font-weight:700;">${esc(summary)}</span>`;
      const breakExtra = (hasBreak && data.breakAfter === data.periods[pi]) ? breakTd : '';
      return `<td>${cellContent}</td>${breakExtra}`;
    }).join('');

    return `
      <tr>
        <th style="font-family:Georgia, 'Times New Roman', serif; text-align:left;">${esc(t)}</th>
        ${cells}
      </tr>
    `;
  }).join('');

  return `
    <div class="print-sheet flow-sheet wide-sheet">
      ${printHeaderHTML(data, data.allTeachersTitle || 'All Teachers Timetable')}
      <div class="sheet-body">
        <table class="fill">
          <thead>${headRow}</thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

/* ---------- Class-wise table (per class, all days) ---------- */
export function classWiseHTML(data: TimetableData, c: ClassItem): string {
  const ci = data.classes.indexOf(c);
  const hasBreak = data.breakAfter && data.breakAfter > 0 && data.breakAfter < data.periods.length;

  const headRow = `
    <tr>
      <th style="width:14%">Day</th>
      ${data.periods.map((p, i) => {
        const extra = (hasBreak && data.breakAfter === p) ? `<th class="break-header" style="width:14px; min-width:14px; max-width:14px; padding:0;"></th>` : '';
        return `<th>Period ${p}</th>${extra}`;
      }).join('')}
    </tr>
  `;

  const rows = data.days.map((d, dayIdx) => {
    let cells = '';
    data.periods.forEach((p, i) => {
      const line = cellTextForDay(c, i, dayIdx);
      cells += `<td>${esc(line)}</td>`;
      if (hasBreak && data.breakAfter === p) {
        cells += `<td class="break-cell" style="width:14px; min-width:14px; max-width:14px; padding:0;"></td>`;
      }
    });
    return `<tr><th style="font-family:Georgia, 'Times New Roman', serif; text-align:left;">${esc(d)}</th>${cells}</tr>`;
  }).join('');

  const inchargePart = c[1] ? ` — Incharge: ${c[1]}` : '';
  return `
    <div class="print-sheet fixed-sheet class-sheet">
      ${printHeaderHTML(data, `${c[0]}${inchargePart}`)}
      <div class="sheet-body">
        <table class="fill">
          <thead>${headRow}</thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

/* ---------- Teacher timetable ---------- */
export function teacherHTML(
  data: TimetableData,
  t: string,
  teacherPeriodSummary: (t: string, pi: number) => string
): string {
  const rows = data.periods.map((p, i) => `
    <tr>
      <th style="width:25%; font-family:Georgia, 'Times New Roman', serif; text-align:left;">Period ${p}</th>
      <td style="text-align:left; font-weight:700; padding-left:12px;">${esc(teacherPeriodSummary(t, i))}</td>
    </tr>
  `).join('');

  const info = data.teacherInfo[t] || { qual: '', rank: '', desig: '' };
  const inchargeClass = data.classes.find(c => c[1] === t);
  const parts = [
    data.academicYear,
    inchargeClass ? `Incharge of ${inchargeClass[0]}` : '',
    info.rank, info.qual, t
  ].filter(Boolean);

  return `
    <div class="print-sheet fixed-sheet teacher-sheet">
      ${printHeaderHTML(data, parts.join(' · '))}
      <div class="sheet-body">
        <table class="fill">
          <thead><tr><th>Period</th><th>Assignment</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

/* ---------- Roster ---------- */
export function rosterHTML(data: TimetableData, teacherTotalPeriods: (t: string) => number): string {
  const head = `
    <tr>
      <th style="width:24%">Teacher</th>
      <th style="width:14%">Group</th>
      <th style="width:12%">Grade</th>
      <th style="width:16%">Designation</th>
      <th style="width:20%">Incharge Of</th>
      <th style="width:14%">Periods/Wk</th>
    </tr>
  `;
  const rows = data.teachers.map(t => {
    const info = data.teacherInfo[t] || { qual: '', rank: '', desig: '' };
    const incharge = data.classes.filter(c => c[1] === t).map(c => c[0]).join(', ');
    return `
      <tr>
        <th>${esc(t)}</th>
        <td>${esc(info.qual || '—')}</td>
        <td>${esc(info.rank || '—')}</td>
        <td>${esc(info.desig || '—')}</td>
        <td>${esc(incharge || '—')}</td>
        <td>${teacherTotalPeriods(t)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="print-sheet fixed-sheet roster-sheet">
      ${printHeaderHTML(data, 'Teachers Roster')}
      <div class="sheet-body">
        <table class="fill"><thead>${head}</thead><tbody>${rows}</tbody></table>
      </div>
    </div>
  `;
}

/* ---------- Free Staff ---------- */
export function freeStaffHTML(data: TimetableData, rows: { period: number; text: string }[]): string {
  const head = `<tr><th style="width:22%">Period</th><th style="text-align:left">Free Teachers</th></tr>`;
  const bodyRows = rows.map(r => `
    <tr><th>Period ${r.period}</th><td style="text-align:left">${esc(r.text)}</td></tr>
  `).join('');
  return `
    <div class="print-sheet fixed-sheet freestaff-sheet">
      ${printHeaderHTML(data, 'Free Staff — by Period')}
      <div class="sheet-body">
        <table class="fill"><thead>${head}</thead><tbody>${bodyRows}</tbody></table>
      </div>
    </div>
  `;
}

/* ---------- School Timings (main + optional merged/separate Friday) ---------- */
 export function schoolTimingsHTML(data: TimetableData): string {
   const title = data.schoolTimingsTitle || 'SCHOOL TIMINGS';
   const wref = data.effectiveFromDate ? `w.e.f. ${data.effectiveFromDate}` : '';

   const calc = (s: string, e: string): string => {
     if (!s || !e) return '—';
     const parse = (x: string): number | null => {
       const m = x.trim().toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
       if (!m) return null;
       let h = parseInt(m[1], 10);
       const min = parseInt(m[2], 10);
       if (m[3] === 'PM' && h < 12) h += 12;
       if (m[3] === 'AM' && h === 12) h = 0;
       return h * 60 + min;
     };
     const ss = parse(s), ee = parse(e);
     if (ss === null || ee === null) return '—';
     let diff = ee - ss;
     if (diff < 0) diff += 24 * 60;
     return `${diff} min`;
   };

   const buildRows = (
     times: { start: string; end: string }[] | undefined,
     assembly: { start: string; end: string } | undefined,
     breakAfter: number,
     breakLabel: string
   ): string => {
     let rows = '';
     if (assembly && (assembly.start || assembly.end)) {
       rows += `<tr><th>Assembly</th><td>${esc(assembly.start || '—')} - ${esc(assembly.end || '—')}</td><td>${esc(calc(assembly.start || '', assembly.end || ''))}</td></tr>`;
     }
     data.periods.forEach((p, i) => {
       const pt = (times && times[i]) || { start: '', end: '' };
       rows += `<tr><th>${esc(p)}</th><td>${esc(pt.start || '—')} - ${esc(pt.end || '—')}</td><td>${esc(calc(pt.start || '', pt.end || ''))}</td></tr>`;
       if (breakAfter === p && i < data.periods.length - 1) {
         const bs = pt.end || '—';
         const be = (times && times[i + 1] && times[i + 1].start) || '—';
         rows += `<tr><th>${esc(breakLabel)}</th><td>${esc(bs)} - ${esc(be)}</td><td>${bs !== '—' && be !== '—' ? esc(calc(bs, be)) : '—'}</td></tr>`;
       }
     });
     return rows;
   };

   const head = `<tr><th style="width:20%">PERIOD</th><th style="width:40%">TIME SLOT</th><th style="width:40%">DURATION (MINS)</th></tr>`;

   const ft = data.fridayTimings;
   const fridayHasAnyData = !!(
     ft &&
     ((ft.assemblyTime && (ft.assemblyTime.start || ft.assemblyTime.end)) ||
       (Array.isArray(ft.periodTimes) && ft.periodTimes.some(pt => pt && (pt.start || pt.end))))
   );
   const fridayDayName = ft ? (data.days[ft.dayIndex] || 'Friday') : 'Friday';

   // Divider row that spans all three columns
   const dividerRow = ft
     ? `<tr class="day-divider"><td colspan="3" style="background:#D6D3D1;font-weight:800;letter-spacing:.08em;text-transform:uppercase;text-align:center;">${esc(fridayDayName)}${ft.note ? ` — ${esc(ft.note)}` : ''}</td></tr>`
     : '';

   const mainRows = buildRows(data.periodTimes || [], data.assemblyTime, data.breakAfter, 'BREAK');
   const fridayRows = ft
     ? buildRows(ft.periodTimes || [], ft.assemblyTime, ft.breakAfter, ft.breakLabel || 'BREAK')
     : '';

   // Modes:
   // - No Friday data              → single sheet with just the main table
   // - Friday data + !enabled      → single sheet, main rows + divider + Friday rows (merged)
   // - Friday data + enabled       → two sheets (main, then Friday)
   let html = '';
   if (fridayHasAnyData && ft && ft.enabled) {
     // Separate: main sheet
     html += `
       <div class="print-sheet fixed-sheet timings-sheet">
         <div class="print-header">
           <div class="print-title">${esc(data.schoolName)}</div>
           <div class="print-sub">${esc(title)}${wref ? ' (' + esc(wref) + ')' : ''}</div>
         </div>
         <div class="sheet-body">
           <table class="fill"><thead>${head}</thead><tbody>${mainRows}</tbody></table>
         </div>
       </div>
     `;
     // Separate: Friday sheet
     html += `
       <div class="print-sheet fixed-sheet timings-sheet">
         <div class="print-header">
           <div class="print-title">${esc(data.schoolName)}</div>
           <div class="print-sub">${esc(title)} — ${esc(fridayDayName)}${wref ? ' (' + esc(wref) + ')' : ''}</div>
         </div>
         <div class="sheet-body">
           <table class="fill"><thead>${head}</thead><tbody>${fridayRows}</tbody></table>
         </div>
       </div>
     `;
   } else {
     // Merged (or no Friday data at all)
     const mergedBody = fridayHasAnyData && ft
       ? mainRows + dividerRow + fridayRows
       : mainRows;
     html = `
       <div class="print-sheet fixed-sheet timings-sheet">
         <div class="print-header">
           <div class="print-title">${esc(data.schoolName)}</div>
           <div class="print-sub">${esc(title)}${wref ? ' (' + esc(wref) + ')' : ''}</div>
         </div>
         <div class="sheet-body">
           <table class="fill"><thead>${head}</thead><tbody>${mergedBody}</tbody></table>
         </div>
       </div>
     `;
   }
   return html;
 }