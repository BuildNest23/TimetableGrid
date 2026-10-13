import { TimetableData, ClassItem, DAY_NAMES } from '../types/timetable';
import { esc, wholeSchoolCellLines, cellTextForDay } from './printHtml';

export interface PageLayoutOptions {
  type: 'whole' | 'allteachers' | 'class' | 'teacher' | 'roster';
  selectedClass?: string;
  selectedTeacher?: string;
  fontPt: number;
  orientation: 'landscape' | 'portrait';
  showTimes: boolean;
  showBreakCol: boolean;
  oneSectionPerPage?: boolean;
  teacherPeriodSummary: (t: string, pi: number) => string;
  getTeacherTotalPeriods?: (t: string) => number;
  safetyReductionPx?: number;
}

export interface ComputedPage {
  pageNumber: number;
  totalPages: number;
  isFirstPage: boolean;
  headerHtml: string;
  tableHeaderHtml: string;
  rowsHtml: string;
  footerHtml: string;
  rowCount: number;
}

export interface PaginationResult {
  pages: ComputedPage[];
  pageCount: number;
  lastPageFullness: number; // 0 to 100 %
  fontPt: number;
  orientation: 'landscape' | 'portrait';
  widthPx: number;
  heightPx: number;
  totalExpectedRows: number;
  totalRowsShown: number;
  allRowsFit: boolean;
}

/* -------------------------------------------------------------
   A4 Dimensions at 96 DPI:
   Landscape: 1123 x 794 px
   Portrait:  794 x 1123 px
   Margin: 8mm = ~30.2px each side (total 60.5px)
------------------------------------------------------------- */
const DPI = 96;
const MM_TO_PX = DPI / 25.4;
export const MARGIN_PX = 8 * MM_TO_PX; // ~30.2px

export const A4_LANDSCAPE = { width: 1123, height: 794 };
export const A4_PORTRAIT = { width: 794, height: 1123 };

/* Hatched pattern for break column (light grey diagonal lines, not opacity) */
export const HATCHED_BG = `repeating-linear-gradient(45deg, #bbb, #bbb 1px, #fff 1px, #fff 5px)`;

/**
 * Convert pt to px at 96 DPI: 1 pt = 96/72 px = 1.3333 px.
 */
function ptToPx(pt: number): number {
  return pt * (96 / 72);
}

/**
 * Row definition for measuring and rendering
 */
export interface TableRowDef {
  isSection: boolean;
  label?: string;
  measuredHeight?: number;
  estimatedHeight?: number;
  render: (addedPaddingV: number) => string;
}

/**
 * Group of rows (e.g. by section in Whole School, or entire timetable)
 */
interface TableSectionGroup {
  sectionName?: string;
  title: string;
  tableHeaderHtml: string;
  rowDefs: TableRowDef[];
}

/**
 * Accurate Node fallback for measuring elements when document is not available
 */
function estimateHeightsNodeFallback(
  data: TimetableData,
  opts: PageLayoutOptions,
  titleBlockHtml: string,
  tableHeaderTr: string,
  rowDefs: TableRowDef[]
): { titleBlockHeight: number; tableHeaderHeight: number; rowHeights: number[] } {
  const { fontPt, showTimes, type } = opts;
  const basePx = ptToPx(fontPt);
  const cellPaddingV = Math.max(2, fontPt * 0.38);

  const titleBlockHeight = Math.ceil(
    basePx * 2.2 * 1.25 + basePx * 1.05 * 1.2 + (data.schoolLogo ? 50 : 36) + 20
  );

  const tableHeaderHeight = Math.ceil(
    basePx * 1.3 + (showTimes ? basePx * 0.72 + 14 : 10) + 8
  );

  const rowHeights = rowDefs.map(r => {
    if (r.isSection) {
      return Math.ceil(basePx * 1.1 + 18);
    }
    if (type === 'allteachers') {
      return Math.ceil(basePx * 1.35 + cellPaddingV * 2 + 4);
    }
    if (type === 'whole' || type === 'class') {
      return Math.ceil(basePx * 2.65 + cellPaddingV * 2 + 6);
    }
    if (type === 'teacher') {
      return Math.ceil(basePx * 1.8 + cellPaddingV * 2 + 6);
    }
    return Math.ceil(basePx * 1.5 + cellPaddingV * 2 + 4);
  });

  return { titleBlockHeight, tableHeaderHeight, rowHeights };
}

/**
 * Off-screen measurement of layout elements.
 * Measures in an invisible DOM container matching the real page printable width and styles.
 * Falls back to analytical calculation when running outside browser.
 */
export function measureLayoutElements(
  printableWidthPx: number,
  titleBlockHtml: string,
  tableHeaderTr: string,
  rowDefs: TableRowDef[],
  data: TimetableData,
  opts: PageLayoutOptions
): { titleBlockHeight: number; tableHeaderHeight: number; rowHeights: number[] } {
  if (typeof document !== 'undefined' && document.body) {
    let host = document.getElementById('printStudioMeasureHost') as HTMLDivElement | null;
    if (!host) {
      host = document.createElement('div');
      host.id = 'printStudioMeasureHost';
      host.setAttribute('aria-hidden', 'true');
      document.body.appendChild(host);
    }

    host.style.cssText = `
      position: fixed !important;
      left: -99999px !important;
      top: 0 !important;
      width: ${printableWidthPx}px !important;
      visibility: hidden !important;
      pointer-events: none !important;
      z-index: -99999 !important;
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
    `;

    host.innerHTML = `
      <div id="measure_title_block" style="box-sizing:border-box;">${titleBlockHtml}</div>
      <table style="width:100%; border-collapse:collapse; table-layout:fixed; background:#fff; border:0.75pt solid #000; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact;">
        <thead id="measure_thead">${tableHeaderTr}</thead>
        <tbody id="measure_tbody">
          ${rowDefs.map(r => r.render(0)).join('')}
        </tbody>
      </table>
    `;

    const titleEl = host.querySelector('#measure_title_block') as HTMLElement | null;
    const theadEl = host.querySelector('#measure_thead') as HTMLElement | null;
    const tbodyEl = host.querySelector('#measure_tbody') as HTMLElement | null;

    let titleBlockHeight = 0;
    if (titleEl) {
      const rect = titleEl.getBoundingClientRect();
      titleBlockHeight = Math.ceil(rect.height);
    }

    let tableHeaderHeight = 0;
    if (theadEl) {
      tableHeaderHeight = Math.ceil(theadEl.getBoundingClientRect().height);
    }

    const rowHeights: number[] = [];
    if (tbodyEl) {
      const trEls = tbodyEl.querySelectorAll('tr');
      trEls.forEach(tr => {
        rowHeights.push(Math.ceil(tr.getBoundingClientRect().height));
      });
    }

    host.innerHTML = '';

    if (rowHeights.length === rowDefs.length && titleBlockHeight > 0 && tableHeaderHeight > 0) {
      return { titleBlockHeight, tableHeaderHeight, rowHeights };
    }
  }

  return estimateHeightsNodeFallback(data, opts, titleBlockHtml, tableHeaderTr, rowDefs);
}

/**
 * Builds title block HTML matching Design 2 (serif school name, small caps subtitle, double rule)
 */
export function buildTitleBlockHtml(
  data: TimetableData,
  subtitle: string,
  fontPt: number
): string {
  const logoImgHtml = data.schoolLogo
    ? `<div style="position:absolute; left:0; top:0; height:100%; display:flex; align-items:center;">
         <img src="${esc(data.schoolLogo)}" alt="" style="max-height:46px; max-width:70px; object-fit:contain;" />
       </div>`
    : '';

  const metaLine = [data.academicYear, data.printNote].filter(Boolean).join(' · ');

  return `
    <div style="position:relative; text-align:center; margin-bottom:8px; padding-bottom:6px;">
      ${logoImgHtml}
      <h1 style="font-family:Georgia, 'Times New Roman', serif; font-size:${(fontPt * 2.2).toFixed(1)}pt; font-weight:700; margin:0; line-height:1.15; color:#000;">
        ${esc(data.schoolName || 'School Timetable')}
      </h1>
      <div style="font-size:${(fontPt * 1.05).toFixed(1)}pt; font-weight:700; text-transform:uppercase; letter-spacing:0.18em; margin-top:3px; color:#000;">
        ${esc(subtitle)}
      </div>
      ${metaLine ? `<div style="font-size:${Math.max(5, fontPt * 0.75).toFixed(1)}pt; color:#000; margin-top:2px;">${esc(metaLine)}</div>` : ''}
      <div style="margin-top:6px; border-top:1px solid #000; border-bottom:1px solid #000; height:2px;"></div>
    </div>
  `;
}

/**
 * Builds section groups and row definitions for the chosen timetable type
 */
function buildSectionGroups(
  data: TimetableData,
  opts: PageLayoutOptions
): TableSectionGroup[] {
  const {
    type,
    selectedClass,
    selectedTeacher,
    fontPt,
    showTimes,
    showBreakCol,
    teacherPeriodSummary,
    getTeacherTotalPeriods
  } = opts;

  const hasBreakCol = showBreakCol && data.breakAfter > 0 && data.breakAfter < data.periods.length;
  const cellPaddingV = Math.max(2, fontPt * 0.38);
  const cellPaddingH = Math.max(2, fontPt * 0.3);

  // Common styling rules:
  // - Boxed grid: 0.75pt solid black lines for all cell borders (horizontal & vertical), plus outer border
  // - Header: heavy black rule top (1.5pt), medium rule bottom (1pt), vertical lines 0.75pt
  // - Section bands: full-width box with 0.75pt borders
  // - Break column: vertical lines on both sides
  // - Cell text: solid black (#000), semi-bold (600), no italic, no opacity
  const rowBorder = `border:0.75pt solid #000;`;
  const thBorder = `border-top:1.5pt solid #000; border-bottom:1pt solid #000; border-left:0.75pt solid #000; border-right:0.75pt solid #000; color:#000; font-weight:700;`;

  const breakThHtml = hasBreakCol
    ? `<th style="width:14px; min-width:14px; max-width:14px; padding:0; ${thBorder} background:${HATCHED_BG};"></th>`
    : '';

  const breakTdHtml = hasBreakCol
    ? `<td style="width:14px; min-width:14px; max-width:14px; padding:0; ${rowBorder} background:${HATCHED_BG};"></td>`
    : '';

  const periodCols = data.periods.map(p => {
    let timeLabel = '';
    if (showTimes && data.periodTimes && data.periodTimes[p - 1]) {
      const pt = data.periodTimes[p - 1];
      if (pt && (pt.start || pt.end)) {
        timeLabel = `<div style="font-size:${Math.max(4, fontPt * 0.72).toFixed(1)}pt; font-weight:normal; letter-spacing:0; margin-top:1px; color:#000;">${esc(pt.start)}${pt.end ? '–' + esc(pt.end) : ''}</div>`;
      }
    }
    const thContent = `<div>PERIOD ${p}</div>${timeLabel}`;
    return {
      p,
      html: `<th style="text-align:center; padding:3px 2px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">${thContent}</th>`
    };
  });

  // =========================================================================
  // 1. WHOLE SCHOOL
  // Columns: Class, Incharge, Period 1..N (and break)
  // Continuous table: all classes of all sections together with centred section bands
  // If oneSectionPerPage is ON: each section gets its own page with "<title> — <Section> Section"
  // =========================================================================
  if (type === 'whole') {
    const totalCols = 2 + data.periods.length + (hasBreakCol ? 1 : 0);
    const baseTitle = data.wholeTitle || 'Whole School Timetable';

    const buildTableHeader = () => {
      let tr = `<tr style="background:#fff;">`;
      tr += `<th style="width:10%; text-align:left; padding:3px 4px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">CLASS</th>`;
      tr += `<th style="width:10%; text-align:left; padding:3px 4px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">INCHARGE</th>`;
      periodCols.forEach(col => {
        tr += col.html;
        if (hasBreakCol && col.p === data.breakAfter) tr += breakThHtml;
      });
      tr += `</tr>`;
      return tr;
    };

    const tableHeaderHtml = buildTableHeader();

    const distinctSections = Array.from(
      new Set(data.classes.map(c => (c[2] || '').trim()).filter(Boolean))
    );

    const makeClassRow = (c: ClassItem): TableRowDef => {
      const cellsLines: string[][] = data.periods.map((_, pi) => {
        const sub1 = c[3][pi] || '';
        const t1 = c[4][pi] || '';
        const s2 = c[5] ? c[5][pi] : null;
        return wholeSchoolCellLines(sub1, t1, s2);
      });

      return {
        isSection: false,
        label: c[0],
        render: (addedPaddingV: number) => {
          const padV = (cellPaddingV + addedPaddingV).toFixed(2);
          const fStyle = `text-align:left; font-family:Georgia, 'Times New Roman', serif; font-weight:700; font-size:${(fontPt * 1.05).toFixed(1)}pt; padding:${padV}px ${cellPaddingH + 2}px; ${rowBorder} color:#000;`;
          const incStyle = `text-align:left; font-weight:600; font-style:normal; font-size:${fontPt}pt; padding:${padV}px ${cellPaddingH}px; ${rowBorder} color:#000;`;
          const cStyle = `text-align:center; padding:${padV}px ${cellPaddingH}px; ${rowBorder} font-size:${fontPt}pt; color:#000;`;

          let cellsHtml = '';
          cellsLines.forEach((lines, idx) => {
            let inner = '';
            if (lines.length === 1) {
              inner = `<div style="line-height:1.2; text-align:center; color:#000; font-weight:600;">${esc(lines[0])}</div>`;
            } else {
              inner = `<div style="line-height:1.2; text-align:center; color:#000; font-weight:600;"><div>${esc(lines[0])}</div><div>${esc(lines[1])}</div></div>`;
            }
            cellsHtml += `<td style="${cStyle}">${inner}</td>`;
            if (hasBreakCol && data.periods[idx] === data.breakAfter) {
              cellsHtml += breakTdHtml;
            }
          });

          return `<tr style="background:#fff;"><td style="${fStyle}">${esc(c[0])}</td><td style="${incStyle}">${esc(c[1] || '—')}</td>${cellsHtml}</tr>`;
        }
      };
    };

    const makeSectionBandRow = (sec: string): TableRowDef => {
      const secTr = `
        <tr style="background:#fff;">
          <td colspan="${totalCols}" style="text-align:center; font-weight:800; text-transform:uppercase; letter-spacing:0.14em; font-size:${(fontPt * 0.95).toFixed(1)}pt; padding:4px 0; border:0.75pt solid #000; background:#fff; color:#000;">
            ${esc(sec)} SECTION
          </td>
        </tr>
      `;
      return {
        isSection: true,
        label: sec,
        render: () => secTr
      };
    };

    if (opts.oneSectionPerPage && distinctSections.length > 0) {
      // Multiple sections with "One section per page" ON: group each section separately
      const groups: TableSectionGroup[] = [];

      distinctSections.forEach(sec => {
        const secClasses = data.classes.filter(c => (c[2] || '').trim() === sec);
        const rowDefs: TableRowDef[] = [
          makeSectionBandRow(sec),
          ...secClasses.map(makeClassRow)
        ];
        groups.push({
          sectionName: sec,
          title: `${baseTitle} — ${sec} Section`,
          tableHeaderHtml,
          rowDefs
        });
      });

      const unsectioned = data.classes.filter(c => !(c[2] || '').trim());
      if (unsectioned.length > 0) {
        groups.push({
          title: `${baseTitle} — Other Classes`,
          tableHeaderHtml,
          rowDefs: unsectioned.map(makeClassRow)
        });
      }

      return groups;
    } else {
      // ONE continuous table: all classes of all sections together
      // Centred section bands as separator rows inside the same table
      // Title is just the Whole School title, with no "- High Section" suffix
      // School header appears once on page 1
      const allRows: TableRowDef[] = [];

      if (distinctSections.length > 0) {
        distinctSections.forEach(sec => {
          const secClasses = data.classes.filter(c => (c[2] || '').trim() === sec);
          allRows.push(makeSectionBandRow(sec));
          secClasses.forEach(c => allRows.push(makeClassRow(c)));
        });
        const unsectioned = data.classes.filter(c => !(c[2] || '').trim());
        if (unsectioned.length > 0) {
          allRows.push(...unsectioned.map(makeClassRow));
        }
      } else {
        allRows.push(...data.classes.map(makeClassRow));
      }

      return [{
        title: baseTitle,
        tableHeaderHtml,
        rowDefs: allRows
      }];
    }
  }

  // =========================================================================
  // 2. ALL TEACHERS
  // Columns: Teacher, Period 1..N (and break)
  // Text from teacherPeriodSummary, solid black, 600 weight
  // =========================================================================
  if (type === 'allteachers') {
    const buildTableHeader = () => {
      let tr = `<tr style="background:#fff;">`;
      tr += `<th style="width:14%; text-align:left; padding:3px 4px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">TEACHER</th>`;
      periodCols.forEach(col => {
        tr += col.html;
        if (hasBreakCol && col.p === data.breakAfter) tr += breakThHtml;
      });
      tr += `</tr>`;
      return tr;
    };

    const teacherList = data.hideEmptyTeachersInTT
      ? data.teachers.filter(t => data.periods.some((_, pi) => teacherPeriodSummary(t, pi) !== 'Free'))
      : data.teachers;

    const rowDefs: TableRowDef[] = teacherList.map(t => {
      const summaries = data.periods.map((_, pi) => teacherPeriodSummary(t, pi));

      return {
        isSection: false,
        label: t,
        render: (addedPaddingV: number) => {
          const padV = (cellPaddingV + addedPaddingV).toFixed(2);
          const fStyle = `text-align:left; font-family:Georgia, 'Times New Roman', serif; font-weight:700; font-size:${(fontPt * 1.05).toFixed(1)}pt; padding:${padV}px ${cellPaddingH + 2}px; ${rowBorder} color:#000;`;
          const cStyle = `text-align:center; padding:${padV}px ${cellPaddingH}px; ${rowBorder} font-size:${fontPt}pt; color:#000; font-weight:600;`;

          let cellsHtml = '';
          summaries.forEach((summary, idx) => {
            const isFree = summary === 'Free';
            const cellText = isFree ? '—' : summary;
            cellsHtml += `<td style="${cStyle}">${esc(cellText)}</td>`;
            if (hasBreakCol && data.periods[idx] === data.breakAfter) {
              cellsHtml += breakTdHtml;
            }
          });

          return `<tr style="background:#fff;"><td style="${fStyle}">${esc(t)}</td>${cellsHtml}</tr>`;
        }
      };
    });

    return [{
      title: data.allTeachersTitle || 'All Teachers Timetable',
      tableHeaderHtml: buildTableHeader(),
      rowDefs
    }];
  }

  // =========================================================================
  // 3. CLASS WISE
  // Columns: Day, Period 1..N (and break)
  // Rows: days. Cells: cellTextForDay
  // =========================================================================
  if (type === 'class') {
    const targetClass = data.classes.find(c => c[0] === selectedClass) || data.classes[0] || ['', '', '', [], []];

    const buildTableHeader = () => {
      let tr = `<tr style="background:#fff;">`;
      tr += `<th style="width:14%; text-align:left; padding:3px 4px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">DAY</th>`;
      periodCols.forEach(col => {
        tr += col.html;
        if (hasBreakCol && col.p === data.breakAfter) tr += breakThHtml;
      });
      tr += `</tr>`;
      return tr;
    };

    const rowDefs: TableRowDef[] = data.days.map((dayName, dayIdx) => {
      const dayCells = data.periods.map((_, pi) => cellTextForDay(targetClass, pi, dayIdx));

      return {
        isSection: false,
        label: dayName,
        render: (addedPaddingV: number) => {
          const padV = (cellPaddingV + addedPaddingV).toFixed(2);
          const fStyle = `text-align:left; font-family:Georgia, 'Times New Roman', serif; font-weight:700; font-size:${(fontPt * 1.05).toFixed(1)}pt; padding:${padV}px ${cellPaddingH + 2}px; ${rowBorder} color:#000;`;
          const cStyle = `text-align:center; padding:${padV}px ${cellPaddingH}px; ${rowBorder} font-size:${fontPt}pt; color:#000; font-weight:600;`;

          let cellsHtml = '';
          dayCells.forEach((line, idx) => {
            cellsHtml += `<td style="${cStyle}"><div style="line-height:1.2; text-align:center; color:#000; font-weight:600;">${esc(line)}</div></td>`;
            if (hasBreakCol && data.periods[idx] === data.breakAfter) {
              cellsHtml += breakTdHtml;
            }
          });

          return `<tr style="background:#fff;"><td style="${fStyle}">${esc(dayName)}</td>${cellsHtml}</tr>`;
        }
      };
    });

    const inchargePart = targetClass[1] ? ` — Incharge: ${targetClass[1]}` : '';
    return [{
      title: `${targetClass[0]}${inchargePart}`,
      tableHeaderHtml: buildTableHeader(),
      rowDefs
    }];
  }

  // =========================================================================
  // 4. TEACHER WISE
  // Two columns only: Period and Assignment (or Period, Time, Assignment if showTimes)
  // Rows: periods. "Free" stays "Free". Title: year, incharge, rank, qual, teacher
  // Single page, stretched with cap 3.0
  // =========================================================================
  if (type === 'teacher') {
    const currentTeacher = selectedTeacher || data.teachers[0] || '';

    const buildTableHeader = () => {
      let tr = `<tr style="background:#fff;">`;
      if (showTimes) {
        tr += `<th style="width:20%; text-align:left; padding:4px 8px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">PERIOD</th>`;
        tr += `<th style="width:25%; text-align:center; padding:4px 8px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">TIME</th>`;
        tr += `<th style="text-align:left; padding:4px 12px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">ASSIGNMENT</th>`;
      } else {
        tr += `<th style="width:25%; text-align:left; padding:4px 8px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">PERIOD</th>`;
        tr += `<th style="text-align:left; padding:4px 12px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">ASSIGNMENT</th>`;
      }
      tr += `</tr>`;
      return tr;
    };

    const rowDefs: TableRowDef[] = data.periods.map((p, pi) => {
      const summary = teacherPeriodSummary(currentTeacher, pi);
      const pt = (data.periodTimes && data.periodTimes[pi]) || { start: '', end: '' };
      const timeStr = (pt.start || pt.end) ? `${pt.start} - ${pt.end}` : '—';

      return {
        isSection: false,
        label: `Period ${p}`,
        render: (addedPaddingV: number) => {
          const padV = (cellPaddingV + addedPaddingV).toFixed(2);
          const fStyle = `text-align:left; font-family:Georgia, 'Times New Roman', serif; font-weight:700; font-size:${(fontPt * 1.05).toFixed(1)}pt; padding:${padV}px 8px; ${rowBorder} color:#000;`;
          const timeStyle = `text-align:center; padding:${padV}px 8px; ${rowBorder} font-size:${fontPt}pt; color:#000; font-weight:600;`;
          const cStyle = `text-align:left; padding:${padV}px 12px; ${rowBorder} font-size:${fontPt}pt; color:#000; font-weight:600;`;

          if (showTimes) {
            return `
              <tr style="background:#fff;">
                <td style="${fStyle}">Period ${p}</td>
                <td style="${timeStyle}">${esc(timeStr)}</td>
                <td style="${cStyle}">${esc(summary)}</td>
              </tr>
            `;
          }
          return `
            <tr style="background:#fff;">
              <td style="${fStyle}">Period ${p}</td>
              <td style="${cStyle}">${esc(summary)}</td>
            </tr>
          `;
        }
      };
    });

    const info = data.teacherInfo[currentTeacher] || { qual: '', rank: '', desig: '' };
    const inchargeClass = data.classes.find(c => c[1] === currentTeacher);
    const parts = [
      data.academicYear,
      inchargeClass ? `Incharge of ${inchargeClass[0]}` : '',
      info.rank,
      info.qual,
      currentTeacher
    ].filter(Boolean);

    return [{
      title: parts.join(' · '),
      tableHeaderHtml: buildTableHeader(),
      rowDefs
    }];
  }

  // =========================================================================
  // 5. TEACHERS ROSTER
  // =========================================================================
  const buildRosterHeader = () => `
    <tr style="background:#fff;">
      <th style="width:24%; text-align:left; padding:3px 4px; ${thBorder} font-size:${fontPt}pt;">TEACHER</th>
      <th style="width:14%; text-align:center; padding:3px 4px; ${thBorder} font-size:${fontPt}pt;">GROUP</th>
      <th style="width:12%; text-align:center; padding:3px 4px; ${thBorder} font-size:${fontPt}pt;">GRADE</th>
      <th style="width:16%; text-align:center; padding:3px 4px; ${thBorder} font-size:${fontPt}pt;">DESIGNATION</th>
      <th style="width:20%; text-align:center; padding:3px 4px; ${thBorder} font-size:${fontPt}pt;">INCHARGE OF</th>
      <th style="width:14%; text-align:center; padding:3px 4px; ${thBorder} font-size:${fontPt}pt;">PERIODS/WK</th>
    </tr>
  `;

  const rosterRows: TableRowDef[] = data.teachers.map(t => {
    const info = data.teacherInfo[t] || { qual: '', rank: '', desig: '' };
    const incharge = data.classes.filter(c => c[1] === t).map(c => c[0]).join(', ');
    const totalPeriods = getTeacherTotalPeriods ? getTeacherTotalPeriods(t) : 0;

    return {
      isSection: false,
      label: t,
      render: (addedPaddingV: number) => {
        const padV = (cellPaddingV + addedPaddingV).toFixed(2);
        const fStyle = `text-align:left; font-family:Georgia, 'Times New Roman', serif; font-weight:700; font-size:${(fontPt * 1.05).toFixed(1)}pt; padding:${padV}px ${cellPaddingH + 2}px; ${rowBorder} color:#000;`;
        const cStyle = `text-align:center; padding:${padV}px ${cellPaddingH}px; ${rowBorder} font-size:${fontPt}pt; color:#000; font-weight:600;`;

        return `
          <tr style="background:#fff;">
            <td style="${fStyle}">${esc(t)}</td>
            <td style="${cStyle}">${esc(info.qual || '—')}</td>
            <td style="${cStyle}">${esc(info.rank || '—')}</td>
            <td style="${cStyle}">${esc(info.desig || '—')}</td>
            <td style="${cStyle}">${esc(incharge || '—')}</td>
            <td style="${cStyle}">${totalPeriods}</td>
          </tr>
        `;
      }
    };
  });

  return [{
    title: 'Teachers Roster',
    tableHeaderHtml: buildRosterHeader(),
    rowDefs: rosterRows
  }];
}

/**
 * Main pagination calculation engine
 */
export function computePrintStudioPages(
  data: TimetableData,
  opts: PageLayoutOptions
): PaginationResult {
  const {
    type,
    fontPt,
    orientation,
    safetyReductionPx = 0
  } = opts;

  const isLandscape = orientation === 'landscape';
  const pageWidth = isLandscape ? A4_LANDSCAPE.width : A4_PORTRAIT.width;
  const pageHeight = isLandscape ? A4_LANDSCAPE.height : A4_PORTRAIT.height;

  // Build section groups for the chosen timetable type
  const sectionGroups = buildSectionGroups(data, opts);

  // Usable page height: A4 height minus 8mm top & bottom margin, minus safety reduction, minus 2% safety margin
  const baseUsableHeight = pageHeight - MARGIN_PX * 2 - safetyReductionPx;
  const usablePageHeight = baseUsableHeight * 0.98; // 2% safety margin

  const printableWidthPx = pageWidth - MARGIN_PX * 2;

  interface IntermediateBucket {
    groupTitle: string;
    titleBlockHtml: string;
    tableHeaderHtml: string;
    rows: TableRowDef[];
    isFirstPageOfGroup: boolean;
    budget: number;
    naturalHeight: number;
    isLastPageOfGroup: boolean;
    isSinglePageGroup: boolean;
  }

  const allBuckets: IntermediateBucket[] = [];
  let totalExpectedRows = 0;

  sectionGroups.forEach(group => {
    totalExpectedRows += group.rowDefs.length;

    const titleBlockHtml = buildTitleBlockHtml(data, group.title, fontPt);

    // Measure elements for this group
    const { titleBlockHeight, tableHeaderHeight, rowHeights } = measureLayoutElements(
      printableWidthPx,
      titleBlockHtml,
      group.tableHeaderHtml,
      group.rowDefs,
      data,
      opts
    );

    // Attach measured heights
    group.rowDefs.forEach((r, idx) => {
      r.measuredHeight = rowHeights[idx] || (ptToPx(fontPt) * 1.5 + 8);
    });

    // Pack group rows into page buckets
    const groupBuckets: {
      rows: TableRowDef[];
      isFirstPage: boolean;
      budget: number;
      naturalHeight: number;
    }[] = [];

    let currentRows: TableRowDef[] = [];
    let isFirstPage = true;
    let availableBudget = usablePageHeight - titleBlockHeight - tableHeaderHeight;
    let currentUsedHeight = 0;

    group.rowDefs.forEach(row => {
      const rowHeight = row.measuredHeight!;
      if (currentRows.length > 0 && (currentUsedHeight + rowHeight > availableBudget)) {
        // A section band row must never be the last row on a page:
        // If the last row in currentRows is a section band, move it to the next page together with this row!
        let carryOverSection: TableRowDef | null = null;
        if (currentRows.length > 1 && currentRows[currentRows.length - 1].isSection) {
          carryOverSection = currentRows.pop()!;
          currentUsedHeight -= carryOverSection.measuredHeight!;
        }

        // Push current bucket
        groupBuckets.push({
          rows: currentRows,
          isFirstPage,
          budget: availableBudget,
          naturalHeight: currentUsedHeight
        });

        // Start new page for this group
        currentRows = carryOverSection ? [carryOverSection, row] : [row];
        isFirstPage = false;
        availableBudget = usablePageHeight - tableHeaderHeight; // No title block on subsequent pages of group
        currentUsedHeight = currentRows.reduce((sum, r) => sum + (r.measuredHeight || 0), 0);
      } else {
        currentRows.push(row);
        currentUsedHeight += rowHeight;
      }
    });

    if (currentRows.length > 0) {
      groupBuckets.push({
        rows: currentRows,
        isFirstPage,
        budget: availableBudget,
        naturalHeight: currentUsedHeight
      });
    }

    const groupTotalPages = groupBuckets.length;
    groupBuckets.forEach((gb, idx) => {
      allBuckets.push({
        groupTitle: group.title,
        titleBlockHtml,
        tableHeaderHtml: group.tableHeaderHtml,
        rows: gb.rows,
        isFirstPageOfGroup: gb.isFirstPage,
        budget: gb.budget,
        naturalHeight: gb.naturalHeight,
        isLastPageOfGroup: idx === groupTotalPages - 1,
        isSinglePageGroup: groupTotalPages === 1
      });
    });
  });

  const totalPages = allBuckets.length;

  // Last page fullness calculation (from natural height before stretching)
  let fullness = 100;
  if (allBuckets.length > 0) {
    const lastBucket = allBuckets[allBuckets.length - 1];
    fullness = Math.min(100, Math.max(10, Math.round((lastBucket.naturalHeight / lastBucket.budget) * 100)));
  }

  // Cap rules:
  // - General: cap stretch so a row never becomes more than 2.2 times its natural height (max added = 1.2 * naturalH)
  // - Teacher Wise: cap stretch at 3.0 times natural height (max added = 2.0 * naturalH)
  // - Single-page timetables (or single-page group): stretch to fill the page
  // - Multi-page: stretch every page except the last one of the group. Leave the last page at its natural row height.
  // - Section band row must NOT be stretched: only normal rows get the extra height.
  const stretchMultiplierCap = type === 'teacher' ? 3.0 : 2.2;
  const maxAddRatio = stretchMultiplierCap - 1.0; // 1.2 or 2.0

  const pages: ComputedPage[] = allBuckets.map((bucket, pIdx) => {
    const isFirstPage = bucket.isFirstPageOfGroup;
    const shouldStretch = bucket.isSinglePageGroup || (!bucket.isLastPageOfGroup);
    const normalRows = bucket.rows.filter(r => !r.isSection);
    const naturalUsed = bucket.naturalHeight;

    let rowsHtml = '';
    if (shouldStretch && normalRows.length > 0) {
      const leftoverHeight = Math.max(0, bucket.budget - naturalUsed);
      const rawAddedPerRow = leftoverHeight / normalRows.length;

      rowsHtml = bucket.rows.map(r => {
        if (r.isSection) {
          return r.render(0);
        }
        const naturalH = r.measuredHeight || (ptToPx(fontPt) * 1.5 + 8);
        const maxAddedHeight = naturalH * maxAddRatio;
        const effectiveAdded = Math.min(rawAddedPerRow, maxAddedHeight);
        const addedPaddingV = Math.max(0, effectiveAdded / 2);
        return r.render(addedPaddingV);
      }).join('');
    } else {
      rowsHtml = bucket.rows.map(r => r.render(0)).join('');
    }

    return {
      pageNumber: pIdx + 1,
      totalPages,
      isFirstPage,
      headerHtml: isFirstPage ? bucket.titleBlockHtml : '',
      tableHeaderHtml: bucket.tableHeaderHtml,
      rowsHtml,
      footerHtml: '',
      rowCount: bucket.rows.length
    };
  });

  const totalRowsShown = pages.reduce((sum, p) => sum + p.rowCount, 0);

  return {
    pages,
    pageCount: totalPages,
    lastPageFullness: fullness,
    fontPt,
    orientation,
    widthPx: pageWidth,
    heightPx: pageHeight,
    totalExpectedRows,
    totalRowsShown,
    allRowsFit: totalRowsShown === totalExpectedRows
  };
}

/**
 * Binary search to find largest font size (in 0.25 pt steps) that fits in targetPages
 * without clipping or dropping any rows.
 */
export function findBestFitFontSize(
  data: TimetableData,
  opts: Omit<PageLayoutOptions, 'fontPt'>,
  targetPages: number
): number {
  let low = 4.0;
  let high = 16.0;
  let best = 4.0;

  for (let i = 0; i < 15; i++) {
    const mid = Math.round(((low + high) / 2) * 4) / 4;
    const res = computePrintStudioPages(data, { ...opts, fontPt: mid });

    if (res.pageCount <= targetPages && res.allRowsFit) {
      best = mid;
      low = mid + 0.25;
    } else {
      high = mid - 0.25;
    }

    if (low > high) break;
  }

  return Math.max(4.0, Math.min(16.0, best));
}

/**
 * Build complete print HTML string suitable for injecting into #printArea and calling window.print()
 */
export function buildPrintableHtml(
  data: TimetableData,
  layout: PaginationResult,
  opts: PageLayoutOptions
): string {
  const { orientation } = opts;
  const isLandscape = orientation === 'landscape';
  const pageHeightMm = isLandscape ? '194mm' : '281mm';

  return layout.pages.map((page, idx) => `
    <div class="print-studio-page" style="
      box-sizing: border-box;
      width: 100%;
      height: ${pageHeightMm};
      overflow: visible;
      padding: 0;
      background: #fff;
      color: #000;
      display: flex;
      flex-direction: column;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      page-break-after: ${idx === layout.pages.length - 1 ? 'auto' : 'always'};
      page-break-inside: avoid;
    ">
      ${page.headerHtml}
      <div style="flex:1; display:flex; flex-direction:column; min-height:0; overflow:visible;">
        <table style="width:100%; border-collapse:collapse; table-layout:fixed; background:#fff; border:0.75pt solid #000; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact;">
          <thead>${page.tableHeaderHtml}</thead>
          <tbody>${page.rowsHtml}</tbody>
        </table>
      </div>
    </div>
  `).join('');
}
