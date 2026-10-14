import { formatPeriodsDW, periodsHeading } from './periodsDW';
import { TimetableData, ClassItem } from '../types/timetable';
import { esc, wholeSchoolCellLines, cellTextForDay } from './printHtml';
import { dateKey } from './dates';

// Escapes text and allows a line break after every "/" so long names like Computer/Drawing wrap inside the cell.
const escWrap = (s: unknown): string => esc(s).replace(/\//g, '/<wbr />');

export type PrintStudioDocType =
  | 'whole'
  | 'allteachers'
  | 'class'
  | 'teacher'
  | 'allclasses'
  | 'schooltimings'
  | 'roster'
  | 'teacherstrips';

export interface PageLayoutOptions {
  type: PrintStudioDocType;
  selectedClass?: string;
  selectedTeacher?: string;
  fontPt: number;
  orientation: 'landscape' | 'portrait';
  showTimes: boolean;
  showBreakCol: boolean;
  oneSectionPerPage?: boolean;
  stripsGrid?: string;
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
  customBodyHtml?: string;
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
  _titleBlockHtml: string,
  _tableHeaderTr: string,
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
      <table style="text-align:center; width:100%; border-collapse:collapse; table-layout:fixed; overflow-wrap:anywhere; word-break:break-word; background:#fff; border:0.75pt solid #000; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact;">
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
         <img src="${esc(data.schoolLogo)}" alt="" style="max-height:78px; max-width:120px; object-fit:contain;" />
       </div>`
    : '';

  const metaLine = [data.academicYear, data.printNote].filter(Boolean).join(' · ');

  return `
    <div style="position:relative; text-align:center; ${data.schoolLogo ? 'min-height:80px; padding-left:130px; padding-right:130px;' : ''} margin-bottom:8px; padding-bottom:6px;">
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

  // Gray shading (header row + first column) used by Whole School and All Teachers
  const GRAY_BG = 'background:#d9d9d9; -webkit-print-color-adjust:exact; print-color-adjust:exact;';
  const grayPeriodCols = periodCols.map(col => ({
    ...col,
    html: col.html.replace('<th style="', `<th style="${GRAY_BG} `)
  }));

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
      let tr = `<tr style="background:#d9d9d9;">`;
      tr += `<th style="${GRAY_BG} width:10%; text-align:center; padding:3px 4px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">CLASS</th>`;
      tr += `<th style="${GRAY_BG} width:10%; text-align:center; padding:3px 4px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">INCHARGE</th>`;
      grayPeriodCols.forEach(col => {
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
          const fStyle = `text-align:center; font-family:Georgia, 'Times New Roman', serif; font-weight:700; font-size:${(fontPt * 1.05).toFixed(1)}pt; padding:${padV}px ${cellPaddingH + 2}px; ${rowBorder} color:#000; ${GRAY_BG}`;
          const incStyle = `text-align:center; font-weight:600; font-style:normal; font-size:${fontPt}pt; padding:${padV}px ${cellPaddingH}px; ${rowBorder} color:#000;`;
          const cStyle = `text-align:center; padding:${padV}px ${cellPaddingH}px; ${rowBorder} font-size:${fontPt}pt; color:#000;`;

          let cellsHtml = '';
          cellsLines.forEach((lines, idx) => {
            let inner = '';
            if (lines.length === 1) {
              inner = `<div style="line-height:1.2; text-align:center; color:#000; font-weight:600;">${escWrap(lines[0])}</div>`;
            } else {
              inner = `<div style="line-height:1.2; text-align:center; color:#000; font-weight:600;"><div>${escWrap(lines[0])}</div><div>${escWrap(lines[1])}</div></div>`;
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
      let tr = `<tr style="background:#d9d9d9;">`;
      tr += `<th style="${GRAY_BG} width:14%; text-align:center; padding:3px 4px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">TEACHER</th>`;
      grayPeriodCols.forEach(col => {
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
          const fStyle = `text-align:center; font-family:Georgia, 'Times New Roman', serif; font-weight:700; font-size:${(fontPt * 1.05).toFixed(1)}pt; padding:${padV}px ${cellPaddingH + 2}px; ${rowBorder} color:#000; ${GRAY_BG}`;
          const cStyle = `text-align:center; padding:${padV}px ${cellPaddingH}px; ${rowBorder} font-size:${fontPt}pt; color:#000; font-weight:600;`;

          let cellsHtml = '';
          summaries.forEach((summary, idx) => {
            const isFree = summary === 'Free';
            const cellText = isFree ? '—' : summary;
            cellsHtml += `<td style="${cStyle}">${escWrap(cellText)}</td>`;
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
      tr += `<th style="width:14%; text-align:center; padding:3px 4px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">DAY</th>`;
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
          const fStyle = `text-align:center; font-family:Georgia, 'Times New Roman', serif; font-weight:700; font-size:${(fontPt * 1.05).toFixed(1)}pt; padding:${padV}px ${cellPaddingH + 2}px; ${rowBorder} color:#000;`;
          const cStyle = `text-align:center; padding:${padV}px ${cellPaddingH}px; ${rowBorder} font-size:${fontPt}pt; color:#000; font-weight:600;`;

          let cellsHtml = '';
          dayCells.forEach((line, idx) => {
            cellsHtml += `<td style="${cStyle}"><div style="line-height:1.2; text-align:center; color:#000; font-weight:600;">${escWrap(line)}</div></td>`;
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
        tr += `<th style="width:20%; text-align:center; padding:4px 8px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">PERIOD</th>`;
        tr += `<th style="width:25%; text-align:center; padding:4px 8px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">TIME</th>`;
        tr += `<th style="text-align:center; padding:4px 12px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">ASSIGNMENT</th>`;
      } else {
        tr += `<th style="width:25%; text-align:center; padding:4px 8px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">PERIOD</th>`;
        tr += `<th style="text-align:center; padding:4px 12px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">ASSIGNMENT</th>`;
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
          const fStyle = `text-align:center; font-family:Georgia, 'Times New Roman', serif; font-weight:700; font-size:${(fontPt * 1.05).toFixed(1)}pt; padding:${padV}px 8px; ${rowBorder} color:#000;`;
          const timeStyle = `text-align:center; padding:${padV}px 8px; ${rowBorder} font-size:${fontPt}pt; color:#000; font-weight:600;`;
          const cStyle = `text-align:center; vertical-align:middle; padding:${padV}px 12px; ${rowBorder} font-size:${fontPt}pt; color:#000; font-weight:600;`;

          if (showTimes) {
            return `
              <tr style="background:#fff;">
                <td style="${fStyle}">Period ${p}</td>
                <td style="${timeStyle}">${esc(timeStr)}</td>
                <td style="${cStyle}">${escWrap(summary)}</td>
              </tr>
            `;
          }
          return `
            <tr style="background:#fff;">
              <td style="${fStyle}">Period ${p}</td>
              <td style="${cStyle}">${escWrap(summary)}</td>
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
      <th style="width:24%; text-align:center; padding:3px 4px; ${thBorder} font-size:${fontPt}pt;">TEACHER</th>
      <th style="width:14%; text-align:center; padding:3px 4px; ${thBorder} font-size:${fontPt}pt;">GROUP</th>
      <th style="width:12%; text-align:center; padding:3px 4px; ${thBorder} font-size:${fontPt}pt;">GRADE</th>
      <th style="width:16%; text-align:center; padding:3px 4px; ${thBorder} font-size:${fontPt}pt;">DESIGNATION</th>
      <th style="width:20%; text-align:center; padding:3px 4px; ${thBorder} font-size:${fontPt}pt;">INCHARGE OF</th>
      <th style="width:14%; text-align:center; padding:3px 4px; ${thBorder} font-size:${fontPt}pt;">${periodsHeading(data.periodsDisplay).toUpperCase()}</th>
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
        const fStyle = `text-align:center; font-family:Georgia, 'Times New Roman', serif; font-weight:700; font-size:${(fontPt * 1.05).toFixed(1)}pt; padding:${padV}px ${cellPaddingH + 2}px; ${rowBorder} color:#000;`;
        const cStyle = `text-align:center; padding:${padV}px ${cellPaddingH}px; ${rowBorder} font-size:${fontPt}pt; color:#000; font-weight:600;`;

        return `
          <tr style="background:#fff;">
            <td style="${fStyle}">${esc(t)}</td>
            <td style="${cStyle}">${esc(info.qual || '—')}</td>
            <td style="${cStyle}">${esc(info.rank || '—')}</td>
            <td style="${cStyle}">${esc(info.desig || '—')}</td>
            <td style="${cStyle}">${esc(incharge || '—')}</td>
            <td style="${cStyle}">${formatPeriodsDW(totalPeriods, data.daysPerWeek, data.periodsDisplay)}</td>
          </tr>
        `;
      }
    };
  });

  if (type === 'roster') {
    return [{
      title: 'Teachers Roster',
      tableHeaderHtml: buildRosterHeader(),
      rowDefs: rosterRows
    }];
  }

  // =========================================================================
  // 6. ALL CLASSES (ONE PAGE EACH)
  // =========================================================================
  if (type === 'allclasses') {
    const buildTableHeader = () => {
      let tr = `<tr style="background:#fff;">`;
      tr += `<th style="width:14%; text-align:center; padding:3px 4px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">DAY</th>`;
      periodCols.forEach(col => {
        tr += col.html;
        if (hasBreakCol && col.p === data.breakAfter) tr += breakThHtml;
      });
      tr += `</tr>`;
      return tr;
    };

    return data.classes.map(targetClass => {
      const rowDefs: TableRowDef[] = data.days.map((dayName, dayIdx) => {
        const dayCells = data.periods.map((_, pi) => cellTextForDay(targetClass, pi, dayIdx));

        return {
          isSection: false,
          label: dayName,
          render: (addedPaddingV: number) => {
            const padV = (cellPaddingV + addedPaddingV).toFixed(2);
            const fStyle = `text-align:center; font-family:Georgia, 'Times New Roman', serif; font-weight:700; font-size:${(fontPt * 1.05).toFixed(1)}pt; padding:${padV}px ${cellPaddingH + 2}px; ${rowBorder} color:#000;`;
            const cStyle = `text-align:center; padding:${padV}px ${cellPaddingH}px; ${rowBorder} font-size:${fontPt}pt; color:#000; font-weight:600;`;

            let cellsHtml = '';
            dayCells.forEach((line, idx) => {
              cellsHtml += `<td style="${cStyle}"><div style="line-height:1.2; text-align:center; color:#000; font-weight:600;">${escWrap(line)}</div></td>`;
              if (hasBreakCol && data.periods[idx] === data.breakAfter) {
                cellsHtml += breakTdHtml;
              }
            });

            return `<tr style="background:#fff;"><td style="${fStyle}">${esc(dayName)}</td>${cellsHtml}</tr>`;
          }
        };
      });

      const inchargePart = targetClass[1] ? ` — Incharge: ${targetClass[1]}` : '';
      return {
        title: `${targetClass[0]}${inchargePart}`,
        tableHeaderHtml: buildTableHeader(),
        rowDefs
      };
    });
  }

  // =========================================================================
  // 7. SCHOOL TIMINGS
  // =========================================================================
  if (type === 'schooltimings') {
    const title = data.schoolTimingsTitle || 'SCHOOL TIMINGS';
    const wref = data.effectiveFromDate ? `w.e.f. ${data.effectiveFromDate}` : '';

    const calcDuration = (s: string, e: string): string => {
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

    const buildTimingsHeader = () => `
      <tr style="background:#fff;">
        <th style="width:24%; text-align:center; padding:4px 8px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">PERIOD</th>
        <th style="width:42%; text-align:center; padding:4px 8px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">TIME SLOT</th>
        <th style="width:34%; text-align:center; padding:4px 8px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">DURATION (MINS)</th>
      </tr>
    `;

    const buildTimingRowDefs = (
      times: { start: string; end: string }[] | undefined,
      assembly: { start: string; end: string } | undefined,
      breakAfter: number,
      breakLabel: string
    ): TableRowDef[] => {
      const defs: TableRowDef[] = [];
      if (assembly && (assembly.start || assembly.end)) {
        defs.push({
          isSection: false,
          label: 'Assembly',
          render: (addedPaddingV: number) => {
            const padV = (cellPaddingV + addedPaddingV).toFixed(2);
            const fStyle = `text-align:center; font-family:Georgia, 'Times New Roman', serif; font-weight:700; font-size:${(fontPt * 1.05).toFixed(1)}pt; padding:${padV}px 8px; ${rowBorder} color:#000;`;
            const cStyle = `text-align:center; padding:${padV}px 8px; ${rowBorder} font-size:${fontPt}pt; color:#000; font-weight:600;`;
            return `
              <tr style="background:#fff;">
                <td style="${fStyle}">Assembly</td>
                <td style="${cStyle}">${esc(assembly.start || '—')} - ${esc(assembly.end || '—')}</td>
                <td style="${cStyle}">${esc(calcDuration(assembly.start || '', assembly.end || ''))}</td>
              </tr>
            `;
          }
        });
      }

      data.periods.forEach((p, i) => {
        const pt = (times && times[i]) || { start: '', end: '' };
        defs.push({
          isSection: false,
          label: `Period ${p}`,
          render: (addedPaddingV: number) => {
            const padV = (cellPaddingV + addedPaddingV).toFixed(2);
            const fStyle = `text-align:center; font-family:Georgia, 'Times New Roman', serif; font-weight:700; font-size:${(fontPt * 1.05).toFixed(1)}pt; padding:${padV}px 8px; ${rowBorder} color:#000;`;
            const cStyle = `text-align:center; padding:${padV}px 8px; ${rowBorder} font-size:${fontPt}pt; color:#000; font-weight:600;`;
            return `
              <tr style="background:#fff;">
                <td style="${fStyle}">Period ${p}</td>
                <td style="${cStyle}">${esc(pt.start || '—')} - ${esc(pt.end || '—')}</td>
                <td style="${cStyle}">${esc(calcDuration(pt.start || '', pt.end || ''))}</td>
              </tr>
            `;
          }
        });

        if (breakAfter === p && i < data.periods.length - 1) {
          const bs = pt.end || '—';
          const be = (times && times[i + 1] && times[i + 1].start) || '—';
          defs.push({
            isSection: false,
            label: breakLabel,
            render: (addedPaddingV: number) => {
              const padV = (cellPaddingV + addedPaddingV).toFixed(2);
              const fStyle = `text-align:center; font-family:Georgia, 'Times New Roman', serif; font-weight:700; font-size:${(fontPt * 1.05).toFixed(1)}pt; padding:${padV}px 8px; ${rowBorder} color:#000;`;
              const cStyle = `text-align:center; padding:${padV}px 8px; ${rowBorder} font-size:${fontPt}pt; color:#000; font-weight:600;`;
              return `
                <tr style="background:#fff;">
                  <td style="${fStyle}">${esc(breakLabel)}</td>
                  <td style="${cStyle}">${esc(bs)} - ${esc(be)}</td>
                  <td style="${cStyle}">${bs !== '—' && be !== '—' ? esc(calcDuration(bs, be)) : '—'}</td>
                </tr>
              `;
            }
          });
        }
      });

      return defs;
    };

    const ft = data.fridayTimings;
    const fridayHasAnyData = !!(
      ft &&
      ((ft.assemblyTime && (ft.assemblyTime.start || ft.assemblyTime.end)) ||
        (Array.isArray(ft.periodTimes) && ft.periodTimes.some(pt => pt && (pt.start || pt.end))))
    );
    const fridayDayName = ft ? (data.days[ft.dayIndex] || 'Friday') : 'Friday';

    const mainDefs = buildTimingRowDefs(data.periodTimes || [], data.assemblyTime, data.breakAfter, 'BREAK');

    if (fridayHasAnyData && ft && ft.enabled) {
      // 2 separate sheets
      const fridayDefs = buildTimingRowDefs(ft.periodTimes || [], ft.assemblyTime, ft.breakAfter, ft.breakLabel || 'BREAK');
      return [
        {
          title: `${title}${wref ? ` (${wref})` : ''}`,
          tableHeaderHtml: buildTimingsHeader(),
          rowDefs: mainDefs
        },
        {
          title: `${title} — ${fridayDayName}${wref ? ` (${wref})` : ''}`,
          tableHeaderHtml: buildTimingsHeader(),
          rowDefs: fridayDefs
        }
      ];
    } else if (fridayHasAnyData && ft) {
      // Merged single sheet with divider row
      const fridayDefs = buildTimingRowDefs(ft.periodTimes || [], ft.assemblyTime, ft.breakAfter, ft.breakLabel || 'BREAK');
      const dividerDef: TableRowDef = {
        isSection: true,
        label: fridayDayName,
        render: (addedPaddingV: number) => {
          const padV = (cellPaddingV + addedPaddingV + 2).toFixed(2);
          return `
            <tr style="background:#fff;">
              <td colspan="3" style="text-align:center; font-family:Georgia, 'Times New Roman', serif; font-weight:700; font-size:${(fontPt * 1.05).toFixed(1)}pt; letter-spacing:0.08em; text-transform:uppercase; padding:${padV}px 8px; ${rowBorder} color:#000;">
                ${esc(fridayDayName)}${ft.note ? ` — ${esc(ft.note)}` : ''}
              </td>
            </tr>
          `;
        }
      };
      return [{
        title: `${title}${wref ? ` (${wref})` : ''}`,
        tableHeaderHtml: buildTimingsHeader(),
        rowDefs: [...mainDefs, dividerDef, ...fridayDefs]
      }];
    }

    return [{
      title: `${title}${wref ? ` (${wref})` : ''}`,
      tableHeaderHtml: buildTimingsHeader(),
      rowDefs: mainDefs
    }];
  }

  return [];
}

export type TimingMode = 'normal' | 'friday' | 'both';

import {
  getPeriodTimes,
  hasDifferingFridayTimings,
  PeriodTimeInfo,
  BreakInfo,
  TimingsData
} from './timings';

export { getPeriodTimes, hasDifferingFridayTimings };
export type { PeriodTimeInfo, BreakInfo, TimingsData };


/**
 * Free Staff helper that calculates teachers free in a period using existing Free Staff logic.
 */
export function getFreeTeachersForPeriod(
  data: TimetableData,
  periodIndex: number,
  options: {
    getLeavesForDate?: (d: string) => string[];
    getTeacherTotalPeriods?: (t: string) => number;
    targetDayIdx?: number;
  } = {}
): string[] {
  const { getLeavesForDate, getTeacherTotalPeriods, targetDayIdx } = options;

  let dayIdx = targetDayIdx;
  let leavesSet = new Set<string>();

  if (dayIdx === undefined) {
    try {
      const today = dateKey();
      const [y, m, d] = today.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      const map: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };
      dayIdx = map[dt.getDay()] ?? 0;
      if (getLeavesForDate) {
        leavesSet = new Set(getLeavesForDate(today));
      }
    } catch {
      dayIdx = 0;
    }
  }

  const effectiveDayIdx = (dayIdx !== undefined && dayIdx >= 0 && dayIdx < data.daysPerWeek) ? dayIdx : 0;

  return data.teachers.filter(t => {
    if (leavesSet.has(t)) return false;
    if (!data.freeStaffIncludeNonTeaching && getTeacherTotalPeriods && getTeacherTotalPeriods(t) === 0) {
      return false;
    }

    // Check if teacher has class in this period on effectiveDayIdx
    const isBusy = data.classes.some(c => {
      const t1 = c[4]?.[periodIndex];
      const s2 = c[5]?.[periodIndex];
      let s1Active = true;
      if (s2 && s2.mode === 'rotation' && s2.days && s2.days.includes(effectiveDayIdx)) {
        s1Active = false;
      }
      if (t1 === t && s1Active) return true;
      if (s2 && s2.teacher === t) {
        return s2.mode === 'parallel' || (s2.days && s2.days.includes(effectiveDayIdx));
      }
      return false;
    });

    return !isBusy;
  });
}

/**
 * Builds a single A4 portrait Class Card HTML page (same Design 2 look as Print Studio).
 * Columns: Period | Time | Assignment (Time column hidden if no times set).
 * Assignment text uses wholeSchoolCellLines (parallel, combined, rotation).
 * Rows stretch evenly to fill page height.
 */
export function buildClassCardHTML(
  data: TimetableData,
  className: string,
  opts: { fontPt?: number; timingMode?: TimingMode } = {}
): string {
  const fontPt = opts.fontPt || 10.5;
  const targetClass = data.classes.find(c => c[0] === className) || data.classes[0] || [className, '', '', [], [], []];

  const timings = getPeriodTimes(data);
  const hasTimes = timings.periods.some(p => p.normal || p.friday);

  const rowBorder = `border:0.75pt solid #000;`;
  const thBorder = `border-top:1.5pt solid #000; border-bottom:1pt solid #000; border-left:0.75pt solid #000; border-right:0.75pt solid #000; color:#000; font-weight:700;`;

  // Header Logo & Title
  const logoHtml = data.schoolLogo
    ? `<div style="position:absolute; left:0; top:0; height:100%; display:flex; align-items:center;">
         <img src="${esc(data.schoolLogo)}" alt="" style="max-height:78px; max-width:120px; object-fit:contain;" />
       </div>`
    : '';

  const inchargePart = targetClass[1] ? `Incharge: ${targetClass[1]}` : '';
  const metaLine = [inchargePart, data.academicYear].filter(Boolean).join(' · ');

  const titleBlockHtml = `
    <div style="position:relative; text-align:center; ${data.schoolLogo ? 'min-height:80px; padding-left:130px; padding-right:130px;' : ''} margin-bottom:10px; padding-bottom:6px; flex-shrink:0;">
      ${logoHtml}
      <h1 style="font-family:Georgia, 'Times New Roman', serif; font-size:${(fontPt * 2.2).toFixed(1)}pt; font-weight:700; margin:0; line-height:1.15; color:#000;">
        ${esc(data.schoolName || 'School Timetable')}
      </h1>
      <div style="font-size:${(fontPt * 1.05).toFixed(1)}pt; font-weight:700; text-transform:uppercase; letter-spacing:0.18em; margin-top:3px; color:#000;">
        ${esc(`Class ${targetClass[0]}`)}
      </div>
      ${metaLine ? `<div style="font-size:${Math.max(6, fontPt * 0.75).toFixed(1)}pt; color:#000; margin-top:2px; font-weight:600;">${esc(metaLine)}</div>` : ''}
      <div style="margin-top:6px; border-top:1px solid #000; border-bottom:1px solid #000; height:2px;"></div>
    </div>
  `;

  // Total rows for height calculation: periods + break row (if break configured)
  const hasBreak = timings.normalBreak.breakAfter > 0 && timings.normalBreak.breakAfter < data.periods.length;
  const totalRows = data.periods.length + (hasBreak ? 1 : 0);

  // Table header
  const tableHeaderHtml = hasTimes ? `
    <tr style="background:#fff;">
      <th style="width:20%; text-align:center; padding:4px 8px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">PERIOD</th>
      <th style="width:25%; text-align:center; padding:4px 8px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">TIME</th>
      <th style="text-align:center; padding:4px 12px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">ASSIGNMENT</th>
    </tr>
  ` : `
    <tr style="background:#fff;">
      <th style="width:25%; text-align:center; padding:4px 8px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">PERIOD</th>
      <th style="text-align:center; padding:4px 12px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">ASSIGNMENT</th>
    </tr>
  `;

  const fStyle = `text-align:center; font-family:Georgia, 'Times New Roman', serif; font-weight:700; font-size:${(fontPt * 1.05).toFixed(1)}pt; padding:4px 8px; ${rowBorder} color:#000;`;
  const timeStyle = `text-align:center; padding:4px 8px; ${rowBorder} font-size:${fontPt}pt; color:#000; font-weight:600;`;
  const cStyle = `text-align:center; vertical-align:middle; padding:4px 12px; ${rowBorder} font-size:${fontPt}pt; color:#000; font-weight:600; overflow-wrap:anywhere; word-break:break-word;`;

  let rowsHtml = '';
  timings.periods.forEach((item) => {
    const p = item.period;
    const pi = item.periodIndex;

    const sub1 = (targetClass[3] && targetClass[3][pi]) || '';
    const t1 = (targetClass[4] && targetClass[4][pi]) || '';
    const s2 = targetClass[5] ? targetClass[5][pi] : null;
    const lines = wholeSchoolCellLines(sub1, t1, s2);

    let innerAssignment = '';
    if (lines.length === 1) {
      innerAssignment = `<div style="line-height:1.2; text-align:center; color:#000; font-weight:600;">${escWrap(lines[0])}</div>`;
    } else {
      innerAssignment = `<div style="line-height:1.2; text-align:center; color:#000; font-weight:600;"><div>${escWrap(lines[0])}</div><div style="margin-top:2px;">${escWrap(lines[1])}</div></div>`;
    }

    let timeCellHtml = '';
    if (hasTimes) {
      if (item.friday !== null) {
        timeCellHtml = `
          <td style="${timeStyle}">
            <div style="line-height:1.2; font-size:${fontPt}pt; color:#000; font-weight:600;">${esc(item.normal || '—')}</div>
            <div style="line-height:1.2; font-size:${(fontPt * 0.80).toFixed(1)}pt; color:#555555; margin-top:2px; font-weight:400;">${esc(item.friday)}</div>
          </td>
        `;
      } else {
        timeCellHtml = `
          <td style="${timeStyle}">
            <div style="line-height:1.2; font-size:${fontPt}pt; color:#000; font-weight:600;">${esc(item.normal || '—')}</div>
          </td>
        `;
      }
    }

    rowsHtml += `
      <tr style="background:#fff; height:calc(100% / ${totalRows});">
        <td style="${fStyle}">Period ${p}</td>
        ${timeCellHtml}
        <td style="${cStyle}">${innerAssignment}</td>
      </tr>
    `;

    if (hasBreak && p === timings.normalBreak.breakAfter) {
      let breakTimeCell = '';
      if (hasTimes) {
        const breakDiffers = timings.fridayEnabled && timings.fridayBreak.time && timings.fridayBreak.time !== timings.normalBreak.time;
        if (breakDiffers) {
          breakTimeCell = `
            <td style="${timeStyle} background:${HATCHED_BG};">
              <div style="line-height:1.2; font-size:${fontPt}pt; color:#000; font-weight:700;">${esc(timings.normalBreak.time || '—')}</div>
              <div style="line-height:1.2; font-size:${(fontPt * 0.80).toFixed(1)}pt; color:#555555; margin-top:2px; font-weight:400;">${esc(timings.fridayBreak.time)}</div>
            </td>
          `;
        } else {
          breakTimeCell = `
            <td style="${timeStyle} background:${HATCHED_BG}; font-weight:700;">${esc(timings.normalBreak.time || '—')}</td>
          `;
        }
      }

      rowsHtml += `
        <tr style="background:#fff; height:calc(100% / ${totalRows});">
          <td style="${fStyle} background:${HATCHED_BG};">${esc(timings.normalBreak.label)}</td>
          ${breakTimeCell}
          <td style="${cStyle} background:${HATCHED_BG};"></td>
        </tr>
      `;
    }
  });

  const differingNoteHtml = timings.differingBreakNote
    ? `<div style="margin-top:4px; font-size:${Math.max(6, fontPt * 0.80).toFixed(1)}pt; color:#555555; font-style:normal;">${esc(timings.differingBreakNote)}</div>`
    : '';

  return `
    <div class="timetable-card-page" style="box-sizing:border-box; width:100%; height:100%; display:flex; flex-direction:column; padding:28px 24px; background:#fff; color:#000; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; overflow:visible;">
      ${titleBlockHtml}
      <div style="flex:1; display:flex; flex-direction:column; min-height:0; overflow:visible;">
        <table style="text-align:center; width:100%; height:100%; flex:1; border-collapse:collapse; table-layout:fixed; overflow-wrap:anywhere; word-break:break-word; background:#fff; border:0.75pt solid #000; -webkit-print-color-adjust:exact; print-color-adjust:exact;">
          <thead>${tableHeaderHtml}</thead>
          <tbody style="height:100%;">${rowsHtml}</tbody>
        </table>
        ${differingNoteHtml}
      </div>
    </div>
  `;
}

/**
 * Builds a single A4 portrait Teacher Card HTML page (used by View tab popup and Print Studio Teacher Wise).
 * Columns: Period | Time | Assignment (Time column hidden if no times set).
 * Assignment text uses teacherPeriodSummary.
 * Rows stretch evenly to fill page height.
 */
export function buildTeacherCardHTML(
  data: TimetableData,
  teacherName: string,
  teacherPeriodSummary: (t: string, pi: number) => string,
  opts: { fontPt?: number; timingMode?: TimingMode } = {}
): string {
  const fontPt = opts.fontPt || 10.5;
  const currentTeacher = teacherName || data.teachers[0] || '';

  const timings = getPeriodTimes(data);
  const hasTimes = timings.periods.some(p => p.normal || p.friday);

  const rowBorder = `border:0.75pt solid #000;`;
  const thBorder = `border-top:1.5pt solid #000; border-bottom:1pt solid #000; border-left:0.75pt solid #000; border-right:0.75pt solid #000; color:#000; font-weight:700;`;

  // Header Logo & Title
  const logoHtml = data.schoolLogo
    ? `<div style="position:absolute; left:0; top:0; height:100%; display:flex; align-items:center;">
         <img src="${esc(data.schoolLogo)}" alt="" style="max-height:78px; max-width:120px; object-fit:contain;" />
       </div>`
    : '';

  const info = data.teacherInfo[currentTeacher] || { qual: '', rank: '', desig: '' };
  const inchargeClass = data.classes.find(c => c[1] === currentTeacher);
  const parts = [
    data.academicYear,
    inchargeClass ? `Incharge of ${inchargeClass[0]}` : '',
    info.rank,
    info.qual,
    currentTeacher
  ].filter(Boolean);

  const timingNoteLine = '';

  const titleBlockHtml = `
    <div style="position:relative; text-align:center; ${data.schoolLogo ? 'min-height:80px; padding-left:130px; padding-right:130px;' : ''} margin-bottom:10px; padding-bottom:6px; flex-shrink:0;">
      ${logoHtml}
      <h1 style="font-family:Georgia, 'Times New Roman', serif; font-size:${(fontPt * 2.2).toFixed(1)}pt; font-weight:700; margin:0; line-height:1.15; color:#000;">
        ${esc(data.schoolName || 'School Timetable')}
      </h1>
      <div style="font-size:${(fontPt * 1.05).toFixed(1)}pt; font-weight:700; text-transform:uppercase; letter-spacing:0.18em; margin-top:3px; color:#000;">
        ${esc(parts.join(' · '))}
      </div>
      ${timingNoteLine ? `<div style="font-size:${Math.max(6, fontPt * 0.75).toFixed(1)}pt; color:#000; margin-top:2px; font-weight:600;">${esc(timingNoteLine)}</div>` : ''}
      <div style="margin-top:6px; border-top:1px solid #000; border-bottom:1px solid #000; height:2px;"></div>
    </div>
  `;

  // Total rows for height calculation: periods + break row (if break configured)
  const hasBreak = timings.normalBreak.breakAfter > 0 && timings.normalBreak.breakAfter < data.periods.length;
  const totalRows = data.periods.length + (hasBreak ? 1 : 0);

  // Table header
  const tableHeaderHtml = hasTimes ? `
    <tr style="background:#fff;">
      <th style="width:20%; text-align:center; padding:4px 8px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">PERIOD</th>
      <th style="width:25%; text-align:center; padding:4px 8px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">TIME</th>
      <th style="text-align:center; padding:4px 12px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">ASSIGNMENT</th>
    </tr>
  ` : `
    <tr style="background:#fff;">
      <th style="width:25%; text-align:center; padding:4px 8px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">PERIOD</th>
      <th style="text-align:center; padding:4px 12px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">ASSIGNMENT</th>
    </tr>
  `;

  const fStyle = `text-align:center; font-family:Georgia, 'Times New Roman', serif; font-weight:700; font-size:${(fontPt * 1.05).toFixed(1)}pt; padding:4px 8px; ${rowBorder} color:#000;`;
  const timeStyle = `text-align:center; padding:4px 8px; ${rowBorder} font-size:${fontPt}pt; color:#000; font-weight:600;`;
  const cStyle = `text-align:center; vertical-align:middle; padding:4px 12px; ${rowBorder} font-size:${fontPt}pt; color:#000; font-weight:600; overflow-wrap:anywhere; word-break:break-word;`;

  let rowsHtml = '';
  timings.periods.forEach((item) => {
    const p = item.period;
    const pi = item.periodIndex;
    const summary = teacherPeriodSummary(currentTeacher, pi);

    const innerAssignment = `<div style="line-height:1.2; text-align:center; color:#000; font-weight:600;">${escWrap(summary)}</div>`;

    let timeCellHtml = '';
    if (hasTimes) {
      if (item.friday !== null) {
        timeCellHtml = `
          <td style="${timeStyle}">
            <div style="line-height:1.2; font-size:${fontPt}pt; color:#000; font-weight:600;">${esc(item.normal || '—')}</div>
            <div style="line-height:1.2; font-size:${(fontPt * 0.80).toFixed(1)}pt; color:#555555; margin-top:2px; font-weight:400;">${esc(item.friday)}</div>
          </td>
        `;
      } else {
        timeCellHtml = `
          <td style="${timeStyle}">
            <div style="line-height:1.2; font-size:${fontPt}pt; color:#000; font-weight:600;">${esc(item.normal || '—')}</div>
          </td>
        `;
      }
    }

    rowsHtml += `
      <tr style="background:#fff; height:calc(100% / ${totalRows});">
        <td style="${fStyle}">Period ${p}</td>
        ${timeCellHtml}
        <td style="${cStyle}">${innerAssignment}</td>
      </tr>
    `;

    if (hasBreak && p === timings.normalBreak.breakAfter) {
      let breakTimeCell = '';
      if (hasTimes) {
        const breakDiffers = timings.fridayEnabled && timings.fridayBreak.time && timings.fridayBreak.time !== timings.normalBreak.time;
        if (breakDiffers) {
          breakTimeCell = `
            <td style="${timeStyle} background:${HATCHED_BG};">
              <div style="line-height:1.2; font-size:${fontPt}pt; color:#000; font-weight:700;">${esc(timings.normalBreak.time || '—')}</div>
              <div style="line-height:1.2; font-size:${(fontPt * 0.80).toFixed(1)}pt; color:#555555; margin-top:2px; font-weight:400;">${esc(timings.fridayBreak.time)}</div>
            </td>
          `;
        } else {
          breakTimeCell = `
            <td style="${timeStyle} background:${HATCHED_BG}; font-weight:700;">${esc(timings.normalBreak.time || '—')}</td>
          `;
        }
      }

      rowsHtml += `
        <tr style="background:#fff; height:calc(100% / ${totalRows});">
          <td style="${fStyle} background:${HATCHED_BG};">${esc(timings.normalBreak.label)}</td>
          ${breakTimeCell}
          <td style="${cStyle} background:${HATCHED_BG};"></td>
        </tr>
      `;
    }
  });

  const differingNoteHtml = timings.differingBreakNote
    ? `<div style="margin-top:4px; font-size:${Math.max(6, fontPt * 0.80).toFixed(1)}pt; color:#555555; font-style:normal;">${esc(timings.differingBreakNote)}</div>`
    : '';

  return `
    <div class="timetable-card-page" style="box-sizing:border-box; width:100%; height:100%; display:flex; flex-direction:column; padding:28px 24px; background:#fff; color:#000; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; overflow:visible;">
      ${titleBlockHtml}
      <div style="flex:1; display:flex; flex-direction:column; min-height:0; overflow:visible;">
        <table style="text-align:center; width:100%; height:100%; flex:1; border-collapse:collapse; table-layout:fixed; overflow-wrap:anywhere; word-break:break-word; background:#fff; border:0.75pt solid #000; -webkit-print-color-adjust:exact; print-color-adjust:exact;">
          <thead>${tableHeaderHtml}</thead>
          <tbody style="height:100%;">${rowsHtml}</tbody>
        </table>
        ${differingNoteHtml}
      </div>
    </div>
  `;
}

/**
 * Builds a single A4 portrait Period Card HTML page ("who teaches which class in this period").
 * Grouped by section with centred bands ("HIGH SECTION") like Whole School print.
 * Under table: boxed row "Free teachers" listing teachers who have no class in this period.
 */
export function buildPeriodCardHTML(
  data: TimetableData,
  period: number,
  opts: {
    fontPt?: number;
    timingMode?: TimingMode;
    getLeavesForDate?: (d: string) => string[];
    getTeacherTotalPeriods?: (t: string) => number;
    targetDayIdx?: number;
  } = {}
): string {
  const fontPt = opts.fontPt || 10;
  const periodIndex = Math.max(0, data.periods.indexOf(period));

  const timings = getPeriodTimes(data);
  const item = timings.periods[periodIndex] || timings.periods[0];

  const rowBorder = `border:0.75pt solid #000;`;
  const thBorder = `border-top:1.5pt solid #000; border-bottom:1pt solid #000; border-left:0.75pt solid #000; border-right:0.75pt solid #000; color:#000; font-weight:700;`;

  // Header Logo & Title
  const logoHtml = data.schoolLogo
    ? `<div style="position:absolute; left:0; top:0; height:100%; display:flex; align-items:center;">
         <img src="${esc(data.schoolLogo)}" alt="" style="max-height:78px; max-width:120px; object-fit:contain;" />
       </div>`
    : '';

  let timeLine = '';
  if (item.friday !== null) {
    timeLine = `Time: ${item.normal || '—'} / ${item.friday}`;
  } else {
    timeLine = `Time: ${item.normal || '—'}`;
  }

  const timingNoteParts = [
    timeLine,
    data.academicYear
  ].filter(Boolean);

  const titleBlockHtml = `
    <div style="position:relative; text-align:center; ${data.schoolLogo ? 'min-height:80px; padding-left:130px; padding-right:130px;' : ''} margin-bottom:10px; padding-bottom:6px; flex-shrink:0;">
      ${logoHtml}
      <h1 style="font-family:Georgia, 'Times New Roman', serif; font-size:${(fontPt * 2.2).toFixed(1)}pt; font-weight:700; margin:0; line-height:1.15; color:#000;">
        ${esc(data.schoolName || 'School Timetable')}
      </h1>
      <div style="font-size:${(fontPt * 1.05).toFixed(1)}pt; font-weight:700; text-transform:uppercase; letter-spacing:0.18em; margin-top:3px; color:#000;">
        ${esc(`Period ${period}`)}
      </div>
      <div style="font-size:${Math.max(6, fontPt * 0.75).toFixed(1)}pt; color:#000; margin-top:2px; font-weight:600;">
        ${esc(timingNoteParts.join(' · '))}
      </div>
      <div style="margin-top:6px; border-top:1px solid #000; border-bottom:1px solid #000; height:2px;"></div>
    </div>
  `;

  // Free staff calculation
  const freeTeachers = getFreeTeachersForPeriod(data, periodIndex, opts);

  // Group classes by section like Whole School print
  const distinctSections = Array.from(
    new Set(data.classes.map(c => (c[2] || '').trim()).filter(Boolean))
  );

  interface PeriodRowItem {
    isSection: boolean;
    secName?: string;
    classItem?: ClassItem;
  }

  const rowItems: PeriodRowItem[] = [];

  if (distinctSections.length > 0) {
    distinctSections.forEach(sec => {
      rowItems.push({ isSection: true, secName: sec });
      const secClasses = data.classes.filter(c => (c[2] || '').trim() === sec);
      secClasses.forEach(c => rowItems.push({ isSection: false, classItem: c }));
    });

    const unsectioned = data.classes.filter(c => !(c[2] || '').trim());
    if (unsectioned.length > 0) {
      rowItems.push({ isSection: true, secName: 'OTHER CLASSES' });
      unsectioned.forEach(c => rowItems.push({ isSection: false, classItem: c }));
    }
  } else {
    data.classes.forEach(c => rowItems.push({ isSection: false, classItem: c }));
  }

  const totalRows = rowItems.length;

  const tableHeaderHtml = `
    <tr style="background:#fff;">
      <th style="width:25%; text-align:center; padding:4px 8px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">CLASS</th>
      <th style="text-align:center; padding:4px 12px; ${thBorder} font-size:${fontPt}pt; letter-spacing:0.06em;">SUBJECT - TEACHER</th>
    </tr>
  `;

  const fStyle = `text-align:center; font-family:Georgia, 'Times New Roman', serif; font-weight:700; font-size:${(fontPt * 1.05).toFixed(1)}pt; padding:4px 8px; ${rowBorder} color:#000;`;
  const cStyle = `text-align:center; vertical-align:middle; padding:4px 12px; ${rowBorder} font-size:${fontPt}pt; color:#000; font-weight:600; overflow-wrap:anywhere; word-break:break-word;`;

  let rowsHtml = '';
  rowItems.forEach(itemRow => {
    if (itemRow.isSection) {
      rowsHtml += `
        <tr style="background:#fff; height:calc(100% / ${totalRows});">
          <td colspan="2" style="text-align:center; font-weight:800; text-transform:uppercase; letter-spacing:0.14em; font-size:${(fontPt * 0.95).toFixed(1)}pt; padding:4px 0; border:0.75pt solid #000; background:#fff; color:#000;">
            ${esc(itemRow.secName)} ${itemRow.secName === 'OTHER CLASSES' ? '' : 'SECTION'}
          </td>
        </tr>
      `;
    } else {
      const c = itemRow.classItem!;
      const sub1 = (c[3] && c[3][periodIndex]) || '';
      const t1 = (c[4] && c[4][periodIndex]) || '';
      const s2 = c[5] ? c[5][periodIndex] : null;
      const lines = wholeSchoolCellLines(sub1, t1, s2);

      let inner = '';
      if (lines.length === 1) {
        inner = `<div style="line-height:1.2; text-align:center; color:#000; font-weight:600;">${escWrap(lines[0])}</div>`;
      } else {
        inner = `<div style="line-height:1.2; text-align:center; color:#000; font-weight:600;"><div>${escWrap(lines[0])}</div><div style="margin-top:2px;">${escWrap(lines[1])}</div></div>`;
      }

      rowsHtml += `
        <tr style="background:#fff; height:calc(100% / ${totalRows});">
          <td style="${fStyle}">${esc(c[0])}</td>
          <td style="${cStyle}">${inner}</td>
        </tr>
      `;
    }
  });

  const differingNoteHtml = timings.differingBreakNote
    ? `<div style="margin-top:4px; font-size:${Math.max(6, fontPt * 0.80).toFixed(1)}pt; color:#555555; font-style:normal;">${esc(timings.differingBreakNote)}</div>`
    : '';

  return `
    <div class="timetable-card-page" style="box-sizing:border-box; width:100%; height:100%; display:flex; flex-direction:column; padding:28px 24px; background:#fff; color:#000; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; overflow:visible;">
      ${titleBlockHtml}
      <div style="flex:1; display:flex; flex-direction:column; min-height:0; overflow:visible;">
        <table style="text-align:center; width:100%; height:100%; flex:1; border-collapse:collapse; table-layout:fixed; overflow-wrap:anywhere; word-break:break-word; background:#fff; border:0.75pt solid #000; -webkit-print-color-adjust:exact; print-color-adjust:exact;">
          <thead>${tableHeaderHtml}</thead>
          <tbody style="height:100%;">${rowsHtml}</tbody>
        </table>
        <div style="margin-top:6px; border:0.75pt solid #000; padding:6px 10px; font-size:${(fontPt * 0.95).toFixed(1)}pt; color:#000; line-height:1.3; overflow-wrap:anywhere; word-break:break-word;">
          <strong style="font-weight:700;">Free teachers:</strong> ${freeTeachers.length ? esc(freeTeachers.join(', ')) : 'No free teachers'}
        </div>
        ${differingNoteHtml}
      </div>
    </div>
  `;
}

/**
 * Builds a complete standalone HTML document for iframe srcDoc or printing.
 */
export function buildCardDocumentHTML(cardInnerHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4 portrait; margin: 0; }
    html, body {
      margin: 0;
      padding: 0;
      width: 794px;
      height: 1123px;
      box-sizing: border-box;
      background: #ffffff;
      overflow: hidden;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    * { box-sizing: border-box; }
    table, th, td { text-align: center; }
  </style>
</head>
<body style="width:794px; height:1123px; margin:0; padding:0; background:#fff; overflow:hidden;">
  ${cardInnerHtml}
</body>
</html>`;
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

  // Dedicated single-page Teacher Wise card layout (identical to View tab teacher card)
  if (type === 'teacher') {
    const currentTeacher = opts.selectedTeacher || data.teachers[0] || '';
    const customBodyHtml = buildTeacherCardHTML(data, currentTeacher, opts.teacherPeriodSummary, { fontPt });
    return {
      pages: [{
        pageNumber: 1,
        totalPages: 1,
        isFirstPage: true,
        headerHtml: '',
        tableHeaderHtml: '',
        rowsHtml: '',
        footerHtml: '',
        rowCount: data.periods.length,
        customBodyHtml
      }],
      pageCount: 1,
      lastPageFullness: 100,
      fontPt,
      orientation: 'portrait',
      widthPx: A4_PORTRAIT.width,
      heightPx: A4_PORTRAIT.height,
      totalExpectedRows: data.periods.length,
      totalRowsShown: data.periods.length,
      allRowsFit: true
    };
  }

  // Dedicated cut-out teacher strips layout
  if (type === 'teacherstrips') {
    const teachers = (data.hideEmptyTeachersInTT && opts.getTeacherTotalPeriods)
      ? data.teachers.filter(t => opts.getTeacherTotalPeriods!(t) > 0)
      : data.teachers;

    const defaultGrid = isLandscape ? '4x2' : '2x4';
    const grid = opts.stripsGrid || defaultGrid;
    const [colsStr, rowsStr] = grid.split('x');
    const cols = parseInt(colsStr, 10) || (isLandscape ? 4 : 2);
    const rows = parseInt(rowsStr, 10) || (isLandscape ? 2 : 4);
    const perPage = cols * rows;

    const totalTeachers = teachers.length;
    const pageCount = Math.max(1, Math.ceil(totalTeachers / perPage));
    const pages: ComputedPage[] = [];

    const teacherNamePt = (fontPt * 1.15).toFixed(1);
    const periodPt = (fontPt * 0.92).toFixed(1);

    for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
      const pageTeachers = teachers.slice(pageIdx * perPage, (pageIdx + 1) * perPage);
      let boxesHtml = '';

      pageTeachers.forEach(t => {
        const periodRows = data.periods.map((p, pi) => {
          const summary = opts.teacherPeriodSummary(t, pi);
          return `
            <tr style="height:1px;">
              <td style="padding:2px 4px; border:0.75pt solid #000; font-size:${periodPt}pt; font-weight:700; text-align:center; width:22%; color:#000;">P${p}</td>
              <td style="padding:2px 4px; border:0.75pt solid #000; font-size:${periodPt}pt; text-align:center; color:#000; font-weight:500;">${escWrap(summary)}</td>
            </tr>
          `;
        }).join('');

        boxesHtml += `
          <div style="border:1.2pt dashed #000; padding:2mm; box-sizing:border-box; display:flex; flex-direction:column; background:#fff; overflow:hidden; height:100%;">
            <div style="text-align:center; font-family:Georgia, 'Times New Roman', serif; font-weight:700; font-size:${teacherNamePt}pt; border-bottom:1pt solid #000; padding-bottom:1mm; margin-bottom:1.5mm; color:#000;">
              ${esc(t)}
            </div>
            <table style="text-align:center; width:100%; height:100%; border-collapse:collapse; table-layout:fixed; border:0.75pt solid #000; background:#fff;">
              <tbody>${periodRows}</tbody>
            </table>
          </div>
        `;
      });

      const customBodyHtml = `
        <div style="display:grid; grid-template-columns:repeat(${cols}, 1fr); grid-template-rows:repeat(${rows}, 1fr); gap:4mm; height:100%; box-sizing:border-box; padding:2mm;">
          ${boxesHtml}
        </div>
      `;

      pages.push({
        pageNumber: pageIdx + 1,
        totalPages: pageCount,
        isFirstPage: pageIdx === 0,
        headerHtml: '',
        tableHeaderHtml: '',
        rowsHtml: '',
        footerHtml: '',
        rowCount: pageTeachers.length,
        customBodyHtml
      });
    }

    const lastPageTeachers = totalTeachers % perPage === 0 && totalTeachers > 0
      ? perPage
      : totalTeachers % perPage;
    const lastPageFullness = totalTeachers === 0 ? 0 : Math.round((lastPageTeachers / perPage) * 100);

    return {
      pages,
      pageCount,
      lastPageFullness,
      fontPt,
      orientation,
      widthPx: pageWidth,
      heightPx: pageHeight,
      totalExpectedRows: totalTeachers,
      totalRowsShown: totalTeachers,
      allRowsFit: true
    };
  }

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
  const stretchMultiplierCap = 2.2;
  const maxAddRatio = stretchMultiplierCap - 1.0; // 1.2

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
  _data: TimetableData,
  layout: PaginationResult,
  opts: PageLayoutOptions
): string {
  const { orientation } = opts;
  const isLandscape = orientation === 'landscape';
  const pageHeightMm = isLandscape ? '194mm' : '281mm';

  return layout.pages.map((page, idx) => {
    if (page.customBodyHtml) {
      return `
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
          ${page.customBodyHtml}
        </div>
      `;
    }

    return `
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
          <table style="text-align:center; width:100%; border-collapse:collapse; table-layout:fixed; overflow-wrap:anywhere; word-break:break-word; background:#fff; border:0.75pt solid #000; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact;">
            <thead>${page.tableHeaderHtml}</thead>
            <tbody>${page.rowsHtml}</tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');
}
