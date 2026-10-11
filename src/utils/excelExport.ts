import { TimetableData, DAY_NAMES } from '../types/timetable';

declare global {
  interface Window {
    AndroidBackup?: {
      saveBase64File?: (b64: string, fileName: string, mime: string) => void;
    };
  }
}

function calculateDuration(start: string, end: string): string {
  if (!start || !end) return "—";
  const parse = (s: string): number | null => {
    const m = String(s).trim().toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ampm = m[3];
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return h * 60 + min;
  };
  const s = parse(start);
  const e = parse(end);
  if (s === null || e === null) return "—";
  let diff = e - s;
  if (diff < 0) diff += 24 * 60;
  return diff + " min";
}

function crc32(buf: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = (c ^ buf[i]) & 0xFF;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    c = (c >>> 8) ^ c;
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function strToU8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function u16(n: number): number[] {
  return [n & 0xFF, (n >>> 8) & 0xFF];
}

function u32(n: number): number[] {
  return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
}

function concatU8(arrs: Uint8Array[]): Uint8Array {
  let len = 0;
  arrs.forEach(a => len += a.length);
  const out = new Uint8Array(len);
  let o = 0;
  arrs.forEach(a => {
    out.set(a, o);
    o += a.length;
  });
  return out;
}

function makeZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

  files.forEach(f => {
    const nameU8 = strToU8(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;
    const localHeader = concatU8([
      new Uint8Array(u32(0x04034b50)),
      new Uint8Array(u16(20)), new Uint8Array(u16(0)),
      new Uint8Array(u16(0)), new Uint8Array(u16(dosTime)), new Uint8Array(u16(dosDate)),
      new Uint8Array(u32(crc)), new Uint8Array(u32(size)), new Uint8Array(u32(size)),
      new Uint8Array(u16(nameU8.length)), new Uint8Array(u16(0)),
      nameU8
    ]);
    localParts.push(localHeader, f.data);

    const centralHeader = concatU8([
      new Uint8Array(u32(0x02014b50)),
      new Uint8Array(u16(20)), new Uint8Array(u16(20)),
      new Uint8Array(u16(0)), new Uint8Array(u16(0)),
      new Uint8Array(u16(dosTime)), new Uint8Array(u16(dosDate)),
      new Uint8Array(u32(crc)), new Uint8Array(u32(size)), new Uint8Array(u32(size)),
      new Uint8Array(u16(nameU8.length)),
      new Uint8Array(u16(0)), new Uint8Array(u16(0)),
      new Uint8Array(u16(0)), new Uint8Array(u16(0)),
      new Uint8Array(u32(0)),
      new Uint8Array(u32(offset)),
      nameU8
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length + f.data.length;
  });

  const centralDirStart = offset;
  const centralDirBytes = concatU8(centralParts);
  const centralDirSize = centralDirBytes.length;
  const endRecord = concatU8([
    new Uint8Array(u32(0x06054b50)),
    new Uint8Array(u16(0)), new Uint8Array(u16(0)),
    new Uint8Array(u16(files.length)), new Uint8Array(u16(files.length)),
    new Uint8Array(u32(centralDirSize)),
    new Uint8Array(u32(centralDirStart)),
    new Uint8Array(u16(0))
  ]);

  return concatU8([...localParts, centralDirBytes, endRecord]);
}

function xesc(s: unknown): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

interface CellObject {
  v: string;
  style?: number;
}

function sheetXml(
  rows: (string | CellObject | null)[][],
  opts: { colWidths?: number[]; merges?: string[]; freezeRows?: number } = {}
): string {
  const colWidths = opts.colWidths || [];
  const mergeCells = opts.merges || [];
  const freezeRows = opts.freezeRows || 0;

  let cols = "";
  if (colWidths.length) {
    cols = "<cols>" + colWidths.map((w, i) =>
      `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`
    ).join("") + "</cols>";
  }

  let sheetData = "<sheetData>";
  rows.forEach((row, rIdx) => {
    const r = rIdx + 1;
    let rowXml = `<row r="${r}">`;
    let hasData = false;
    (row || []).forEach((cell, cIdx) => {
      if (cell == null || cell === "") return;
      hasData = true;
      const ref = colLetter(cIdx + 1) + r;
      let v: string, s: number | undefined;
      if (typeof cell === "object") {
        v = cell.v;
        s = cell.style;
      } else {
        v = String(cell);
        s = undefined;
      }
      if (v == null || v === "") return;
      const styleAttr = s !== undefined ? ` s="${s}"` : "";
      rowXml += `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${xesc(v)}</t></is></c>`;
    });
    rowXml += "</row>";
    if (hasData) sheetData += rowXml;
  });
  sheetData += "</sheetData>";

  let mergeXml = "";
  if (mergeCells.length) {
    mergeXml = `<mergeCells count="${mergeCells.length}">` +
      mergeCells.map(m => `<mergeCell ref="${m}"/>`).join("") +
      "</mergeCells>";
  }

  let sheetViews = "<sheetViews><sheetView workbookViewId=\"0\">";
  if (freezeRows > 0) {
    sheetViews += `<pane ySplit="${freezeRows}" topLeftCell="A${freezeRows + 1}" activePane="bottomLeft" state="frozen"/>`;
  }
  sheetViews += "</sheetView></sheetViews>";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    sheetViews + cols + sheetData + mergeXml +
    `</worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="5">
  <font><sz val="11"/><name val="Calibri"/></font>
  <font><b/><sz val="16"/><name val="Calibri"/></font>
  <font><sz val="11"/><name val="Calibri"/></font>
  <font><b/><sz val="12"/><name val="Calibri"/></font>
  <font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font>
</fonts>
<fills count="4">
  <fill><patternFill patternType="none"/></fill>
  <fill><patternFill patternType="gray125"/></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FFD1D5DB"/><bgColor indexed="64"/></patternFill></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FFEEF1F4"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
  <border><left/><right/><top/><bottom/><diagonal/></border>
  <border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
  <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
  <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  <xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  <xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
  <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
  <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
  <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function buildHeaderRows(numCols: number, title: string, subtitle: string): (CellObject | null)[][] {
  const blank = Array(numCols).fill(null);
  const titleRow = Array(numCols).fill(null);
  titleRow[0] = { v: title, style: 1 };
  const subRow = Array(numCols).fill(null);
  subRow[0] = { v: subtitle || "", style: 2 };
  return [
    blank.slice(),
    blank.slice(),
    titleRow,
    subRow,
    blank.slice()
  ];
}

function mergeTitleRows(numCols: number): string[] {
  const last = colLetter(numCols);
  return [`A3:${last}3`, `A4:${last}4`];
}

function daysLabel(days: number[]): string {
  if (!Array.isArray(days) || !days.length) return "";
  return days.slice().sort((a, b) => a - b).map(d => (DAY_NAMES[d] || "").slice(0, 3)).join(", ");
}

/* ---------------------------------------------------------------
   Day-of-week index (0=Mon .. 6=Sun) from a YYYY-MM-DD string.
   Returns -1 on parse failure.
   --------------------------------------------------------------- */
function getDayIdxFromDate(key: string): number {
  if (!key) return -1;
  try {
    const [y, m, d] = key.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const dow = dt.getDay();
    const map: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };
    return map[dow] ?? -1;
  } catch {
    return -1;
  }
}

/* ---------------------------------------------------------------
   Teacher-hit test for a given period + day. Used by both
   Free Staff and Substitute sheet builders.
   --------------------------------------------------------------- */
function teacherIsTeaching(
  data: TimetableData,
  periodIndex: number,
  dayIdx: number,
  teacher: string
): boolean {
  for (const c of data.classes) {
    const t1 = c[4][periodIndex];
    const s2 = c[5] ? c[5][periodIndex] : null;

    if (s2 && s2.mode === 'rotation') {
      const slot2Active = s2.days.includes(dayIdx);
      if (slot2Active) {
        if (s2.teacher === teacher) return true;
      } else {
        if (t1 === teacher) return true;
      }
      continue;
    }
    if (s2 && s2.mode === 'same') {
      const combined = t1 || s2.teacher;
      if (combined === teacher) return true;
      continue;
    }
    if (t1 === teacher) return true;
    if (s2 && s2.teacher === teacher) return true;
  }
  return false;
}

/* ---------------------------------------------------------------
   Same comparison used by the Substitute board.
   Returns a tier number: 0 (best) … 5 (worst).
   --------------------------------------------------------------- */
function compareQualRank(data: TimetableData, abs: string, cand: string): number {
  const a = data.teacherInfo[abs] || { qual: "", rank: "", desig: "" };
  const b = data.teacherInfo[cand] || { qual: "", rank: "", desig: "" };
  const sameRank = a.rank && b.rank && a.rank === b.rank;
  const sameQual = a.qual && b.qual && a.qual === b.qual;
  if (sameRank && sameQual) return 0;
  if (sameRank) return 1;
  if (sameQual) return 2;
  if (a.rank && !b.rank) return 3;
  if (a.qual && !b.qual) return 4;
  return 5;
}

export async function exportTimetableToExcel(
  data: TimetableData,
  teacherPeriodSummary: (teacher: string, periodIndex: number) => string,
  teacherTotalPeriods: (teacher: string) => number,
  absentTeacher: string = "",
  getLeavesForDate?: (dateKey: string) => string[]
): Promise<boolean> {
  try {
    const sheetsSpec: {
      name: string;
      rows: (string | CellObject | null)[][];
      numCols: number;
      merges: string[];
      freezeRows?: number;
    }[] = [];

    // 1. Whole School
    if (data.classes.length) {
      const n = data.periods.length;
      const numCols = 2 + n;
      const rows = buildHeaderRows(numCols, data.schoolName, [data.academicYear, data.wholeTitle].filter(Boolean).join(" • "));
      const hdr = [{ v: "Class", style: 4 }, { v: "Incharge", style: 4 }];
      data.periods.forEach(p => hdr.push({ v: "Period " + p, style: 4 }));
      rows.push(hdr);

      let lastSection: string | null = null;
      data.classes.forEach((c) => {
        if (c[2] && c[2] !== lastSection) {
          const sectionRow = Array(numCols).fill(null);
          sectionRow[0] = { v: c[2] + " SECTION", style: 7 };
          for (let i = 1; i < numCols; i++) sectionRow[i] = { v: "", style: 7 };
          rows.push(sectionRow);
          lastSection = c[2];
        } else if (!c[2]) {
          lastSection = null;
        }

        const r: (CellObject | null)[] = [{ v: c[0], style: 5 }, { v: c[1] || "", style: 5 }];
        for (let i = 0; i < n; i++) {
          const s2 = c[5] ? c[5][i] : null;
          let text = "";
          const sub1 = c[3][i] || "";
          const t1 = c[4][i] || "";
          if (s2 && (s2.subject || s2.teacher)) {
            if (s2.mode === "parallel") {
              text = `${sub1}${t1 ? " - " + t1 : ""} / ${s2.subject || ""}${s2.teacher ? " - " + s2.teacher : ""}`;
            } else if (s2.mode === "same") {
              const t = t1 || s2.teacher;
              const dayStr = Array.isArray(s2.days) && s2.days.length > 0 ? ` (${daysLabel(s2.days)})` : "";
              text = `${sub1}/${s2.subject || ""}${dayStr}${t ? " - " + t : ""}`;
            } else {
              const active1 = daysLabel(Array.from({ length: data.daysPerWeek }, (_, k) => k).filter(k => !s2.days.includes(k)));
              const active2 = daysLabel(s2.days);
              text = `${sub1}${t1 ? " - " + t1 : ""} (${active1})\n${s2.subject || ""}${s2.teacher ? " - " + s2.teacher : ""} (${active2})`;
            }
          } else {
            text = sub1 + (t1 ? " - " + t1 : "");
          }
          r.push({ v: text, style: 5 });
        }
        rows.push(r);
      });

      sheetsSpec.push({ name: "Whole School", rows, numCols, merges: mergeTitleRows(numCols) });
    }

    // 2. All Teachers
    if (data.classes.length && data.teachers.length) {
      const n = data.periods.length;
      const numCols = 1 + n;
      const rows = buildHeaderRows(numCols, data.schoolName, [data.academicYear, data.allTeachersTitle].filter(Boolean).join(" • "));
      const hdr = [{ v: "Teacher", style: 4 }];
      data.periods.forEach(p => hdr.push({ v: "Period " + p, style: 4 }));
      rows.push(hdr);

      const teacherList = data.hideEmptyTeachersInTT
        ? data.teachers.filter(t => teacherTotalPeriods(t) > 0)
        : data.teachers;

      teacherList.forEach(t => {
        const r: (CellObject | null)[] = [{ v: t, style: 5 }];
        for (let i = 0; i < n; i++) {
          r.push({ v: teacherPeriodSummary(t, i), style: 5 });
        }
        rows.push(r);
      });

      sheetsSpec.push({ name: "All Teachers", rows, numCols, merges: mergeTitleRows(numCols) });
    }

    // 3. Each Class
    data.classes.forEach(c => {
      const n = data.periods.length;
      const numCols = 1 + n;
      const subtitle = [data.academicYear, c[0] + (c[1] ? " — Incharge: " + c[1] : "")].filter(Boolean).join(" • ");
      const rows = buildHeaderRows(numCols, data.schoolName, subtitle);
      const hdr = [{ v: "Day", style: 4 }];
      data.periods.forEach(p => hdr.push({ v: "Period " + p, style: 4 }));
      rows.push(hdr);

      data.days.forEach((d, dayIdx) => {
        const r: (CellObject | null)[] = [{ v: d, style: 5 }];
        data.periods.forEach((_, pi) => {
          const s2 = c[5] ? c[5][pi] : null;
          const t1 = c[4][pi];
          const sub1 = c[3][pi] || "—";
          let cellText = "";
          if (!s2 || (!s2.subject && !s2.teacher)) {
            cellText = t1 ? `${sub1} - ${t1}` : sub1;
          } else if (s2.mode === "same") {
            const t = t1 || s2.teacher;
            if (!Array.isArray(s2.days) || s2.days.length === 0) {
              cellText = t ? `${sub1}/${s2.subject || "—"} - ${t}` : `${sub1}/${s2.subject || "—"}`;
            } else if (s2.days.includes(dayIdx)) {
              cellText = t ? `${s2.subject || "—"} - ${t}` : (s2.subject || "—");
            } else {
              cellText = t ? `${sub1} - ${t}` : sub1;
            }
          } else {
            const active2 = s2.mode === "parallel" || s2.days.includes(dayIdx);
            const active1 = s2.mode === "parallel" || !s2.days.includes(dayIdx);
            const lines: string[] = [];
            if (active1 && (sub1 || t1)) lines.push(t1 ? `${sub1} - ${t1}` : sub1);
            if (active2) lines.push(s2.teacher ? `${s2.subject || "—"} - ${s2.teacher}` : (s2.subject || "—"));
            cellText = lines.join(" / ") || "—";
          }
          r.push({ v: cellText, style: 5 });
        });
        rows.push(r);
      });

      sheetsSpec.push({ name: c[0] || "Class", rows, numCols, merges: mergeTitleRows(numCols) });
    });

    // 4. Cut-out Teacher Grid
    if (data.teachers.length) {
      const COLS = 4;
      const ROWS = 2;
      const PER_BLOCK = COLS * ROWS;
      const teachers = data.teachers;
      const periodCount = data.periods.length;
      const numCols = COLS * 2 + (COLS - 1);
      const rows = buildHeaderRows(numCols, data.schoolName, [data.academicYear, "All Teachers — Cut-Out Grid"].filter(Boolean).join(" • "));

      for (let blockStart = 0; blockStart < teachers.length; blockStart += PER_BLOCK) {
        const block = teachers.slice(blockStart, blockStart + PER_BLOCK);
        for (let r = 0; r < ROWS; r++) {
          const nameRow: (CellObject | null)[] = [];
          for (let c = 0; c < COLS; c++) {
            const t = block[r * COLS + c];
            if (t) {
              nameRow.push({ v: t, style: 4 });
              nameRow.push({ v: "", style: 4 });
            } else {
              nameRow.push({ v: "", style: 6 });
              nameRow.push({ v: "", style: 6 });
            }
            if (c < COLS - 1) nameRow.push({ v: "", style: 6 });
          }
          rows.push(nameRow);

          for (let p = 0; p < periodCount; p++) {
            const row: (CellObject | null)[] = [];
            for (let c = 0; c < COLS; c++) {
              const t = block[r * COLS + c];
              if (t) {
                row.push({ v: "Period " + data.periods[p], style: 5 });
                row.push({ v: teacherPeriodSummary(t, p), style: 5 });
              } else {
                row.push({ v: "", style: 6 });
                row.push({ v: "", style: 6 });
              }
              if (c < COLS - 1) row.push({ v: "", style: 6 });
            }
            rows.push(row);
          }
        }
        if (blockStart + PER_BLOCK < teachers.length) {
          rows.push(Array(numCols).fill(null).map(() => ({ v: "", style: 6 })));
        }
      }

      sheetsSpec.push({ name: "Teachers (Grid)", rows, numCols, merges: mergeTitleRows(numCols), freezeRows: 0 });
    }

    // 5. School Timings
    const numColsTimings = 3;
    const timingsTitle = data.schoolTimingsTitle || "SCHOOL TIMINGS";
    const wref = data.effectiveFromDate ? "w.e.f. " + data.effectiveFromDate : "";
    const timingsRows = buildHeaderRows(numColsTimings, data.schoolName, [data.academicYear, timingsTitle, wref].filter(Boolean).join(" • "));
    timingsRows.push([{ v: "PERIOD", style: 4 }, { v: "TIME SLOT", style: 4 }, { v: "DURATION (MINS)", style: 4 }]);

    if (data.assemblyTime && (data.assemblyTime.start || data.assemblyTime.end)) {
      timingsRows.push([
        { v: "Assembly", style: 5 },
        { v: `${data.assemblyTime.start || "—"} - ${data.assemblyTime.end || "—"}`, style: 5 },
        { v: calculateDuration(data.assemblyTime.start, data.assemblyTime.end), style: 5 }
      ]);
    }

    data.periods.forEach((p, i) => {
      const pt = data.periodTimes[i] || { start: "", end: "" };
      timingsRows.push([
        { v: String(p), style: 5 },
        { v: (pt.start || pt.end) ? `${pt.start || "—"} - ${pt.end || "—"}` : "—", style: 5 },
        { v: calculateDuration(pt.start, pt.end), style: 5 }
      ]);

      if (data.breakAfter === p && i < data.periods.length - 1) {
        const bs = pt.end || "";
        const be = (data.periodTimes[i + 1] && data.periodTimes[i + 1].start) || "";
        timingsRows.push([
          { v: "BREAK", style: 5 },
          { v: `${bs || "—"} - ${be || "—"}`, style: 5 },
          { v: calculateDuration(bs, be), style: 5 }
        ]);
      }
    });

    sheetsSpec.push({ name: "School Timings", rows: timingsRows, numCols: numColsTimings, merges: mergeTitleRows(numColsTimings) });

    // 5b. Day-Specific Timings (Friday / Jumma)
    const ft = data.fridayTimings;
    if (ft && ft.enabled && (ft.periodTimes || []).some(pt => pt.start || pt.end)) {
      const dayName = data.days[ft.dayIndex] || "Friday";
      const ftTitle = `${timingsTitle} — ${dayName}`;
      const ftRows = buildHeaderRows(numColsTimings, data.schoolName, [data.academicYear, ftTitle, wref].filter(Boolean).join(" • "));
      ftRows.push([{ v: "PERIOD", style: 4 }, { v: "TIME SLOT", style: 4 }, { v: "DURATION (MINS)", style: 4 }]);

      if (ft.assemblyTime && (ft.assemblyTime.start || ft.assemblyTime.end)) {
        ftRows.push([
          { v: "Assembly", style: 5 },
          { v: `${ft.assemblyTime.start || "—"} - ${ft.assemblyTime.end || "—"}`, style: 5 },
          { v: calculateDuration(ft.assemblyTime.start, ft.assemblyTime.end), style: 5 }
        ]);
      }

      data.periods.forEach((p, i) => {
        const pt = (ft.periodTimes && ft.periodTimes[i]) || { start: "", end: "" };
        if (!pt.start && !pt.end) return;
        ftRows.push([
          { v: String(p), style: 5 },
          { v: `${pt.start || "—"} - ${pt.end || "—"}`, style: 5 },
          { v: calculateDuration(pt.start, pt.end), style: 5 }
        ]);

        if (ft.breakAfter === p && i < data.periods.length - 1) {
          const bs = pt.end || "";
          const be = (ft.periodTimes[i + 1] && ft.periodTimes[i + 1].start) || "";
          ftRows.push([
            { v: ft.breakLabel || "BREAK", style: 5 },
            { v: `${bs || "—"} - ${be || "—"}`, style: 5 },
            { v: calculateDuration(bs, be), style: 5 }
          ]);
        }
      });

      if (ft.note) {
        ftRows.push([
          { v: "Note", style: 5 },
          { v: ft.note, style: 5 },
          { v: "", style: 5 }
        ]);
      }

      sheetsSpec.push({
        name: dayName + " Timings",
        rows: ftRows,
        numCols: numColsTimings,
        merges: mergeTitleRows(numColsTimings)
      });
    }

    // 6. Teachers Roster
    const numColsRoster = 6;
    const rosterRows = buildHeaderRows(numColsRoster, data.schoolName, [data.academicYear, "Teachers Roster"].filter(Boolean).join(" • "));
    rosterRows.push([
      { v: "Teacher", style: 4 },
      { v: "Group", style: 4 },
      { v: "Grade", style: 4 },
      { v: "Designation", style: 4 },
      { v: "Incharge of", style: 4 },
      { v: "Periods / week", style: 4 }
    ]);
    data.teachers.forEach(t => {
      const info = data.teacherInfo[t] || { qual: "", rank: "", desig: "" };
      const incharge = data.classes.filter(c => c[1] === t).map(c => c[0]).join(", ");
      rosterRows.push([
        { v: t, style: 5 },
        { v: info.qual || "—", style: 5 },
        { v: info.rank || "—", style: 5 },
        { v: info.desig || "—", style: 5 },
        { v: incharge || "—", style: 5 },
        { v: String(teacherTotalPeriods(t)), style: 5 }
      ]);
    });
    sheetsSpec.push({ name: "Teachers Roster", rows: rosterRows, numCols: numColsRoster, merges: mergeTitleRows(numColsRoster) });

    // 7. Free Staff — by Period (today)
    if (data.teachers.length && getLeavesForDate) {
      const today = new Date().toISOString().slice(0, 10);
      const todayIdx = getDayIdxFromDate(today);
      const onLeaveSet = new Set(getLeavesForDate(today));
      const numCols = 2;
      const rows = buildHeaderRows(numCols, data.schoolName, [data.academicYear, "Free Staff — by Period", today].filter(Boolean).join(" • "));
      rows.push([{ v: "Period", style: 4 }, { v: "Free teachers", style: 4 }]);

      data.periods.forEach((p, pi) => {
        let text = "No classes today";
        if (todayIdx >= 0 && todayIdx < data.daysPerWeek) {
          const free = data.teachers.filter(t => {
            if (onLeaveSet.has(t)) return false;
            if (!data.freeStaffIncludeNonTeaching && teacherTotalPeriods(t) === 0) return false;
            return !teacherIsTeaching(data, pi, todayIdx, t);
          });
          text = free.length ? free.join(", ") : "All teachers busy";
        }
        rows.push([
          { v: "Period " + p, style: 5 },
          { v: text, style: 5 }
        ]);
      });

      sheetsSpec.push({ name: "Free Staff", rows, numCols, merges: mergeTitleRows(numCols) });
    }

    // 8. Substitute Board — cover recommendations for the currently selected absent teacher
    if (data.teachers.length && getLeavesForDate && absentTeacher) {
      const leaveDate = data.leaveDate || new Date().toISOString().slice(0, 10);
      const dayIdx = getDayIdxFromDate(leaveDate);
      const onLeaveAll = getLeavesForDate(leaveDate);
      const isDayInWeek = dayIdx >= 0 && dayIdx < data.daysPerWeek;

      const numCols = 4;
      const subParts = [
        data.academicYear,
        "Substitute Board — Absent: " + absentTeacher,
        "Date: " + leaveDate
      ].filter(Boolean).join(" • ");
      const rows = buildHeaderRows(numCols, data.schoolName, subParts);
      rows.push([
        { v: "Period", style: 4 },
        { v: "Recommended (workload)", style: 4 },
        { v: "By Group (1–3 match)", style: 4 },
        { v: "Free staff (available)", style: 4 }
      ]);

      const priorRecommended: Record<string, number> = {};

      data.periods.forEach((p, pi) => {
        const assignments: string[] = [];
        if (isDayInWeek) {
          data.classes.forEach(c => {
            const t1 = c[4][pi];
            const s2 = c[5] ? c[5][pi] : null;
            let slot1Active = true;
            if (s2 && s2.mode === 'rotation' && s2.days.includes(dayIdx)) slot1Active = false;

            if (t1 === absentTeacher && slot1Active) {
              assignments.push(`${c[3][pi] || "—"} (${c[0]})`);
            } else if (s2 && s2.teacher === absentTeacher && s2.mode !== 'same') {
              const slot2Active = s2.mode === 'parallel' || s2.days.includes(dayIdx);
              if (slot2Active) {
                assignments.push(`${s2.subject || "—"} (${c[0]})`);
              }
            }
          });
        }

        if (assignments.length === 0) {
          rows.push([
            { v: "Period " + p, style: 5 },
            { v: "No substitution needed", style: 5 },
            { v: "—", style: 5 },
            { v: "Absent teacher is free", style: 5 }
          ]);
          return;
        }

        const free = data.teachers.filter(t => {
          if (t === absentTeacher) return false;
          if (onLeaveAll.includes(t)) return false;
          if (!data.substituteIncludeNonTeaching && teacherTotalPeriods(t) === 0) return false;
          return !teacherIsTeaching(data, pi, dayIdx, t);
        });

        const ranked = free.map(t => ({
          teacher: t,
          score: teacherTotalPeriods(t) + (priorRecommended[t] || 0)
        })).sort((a, b) => a.score - b.score || a.teacher.localeCompare(b.teacher));

        const best = ranked[0];
        if (best) priorRecommended[best.teacher] = (priorRecommended[best.teacher] || 0) + 1;

        const tierRanked = free.map(t => ({
          teacher: t,
          tier: compareQualRank(data, absentTeacher, t),
          load: teacherTotalPeriods(t)
        })).sort((a, b) => a.tier - b.tier || a.load - b.load || a.teacher.localeCompare(b.teacher));

        const groupText = tierRanked.slice(0, 3).map((x, i) => {
          const info = data.teacherInfo[x.teacher] || { qual: "", rank: "" };
          const badge = [info.rank, info.qual].filter(Boolean).join(" ");
          return `${i + 1}. ${x.teacher}${badge ? " (" + badge + ")" : ""}`;
        }).join("\n") || "—";

        rows.push([
          { v: "Period " + p + " — " + assignments.join(", "), style: 5 },
          { v: best ? `${best.teacher} (${best.score} loads)` : "No free teacher", style: 5 },
          { v: groupText, style: 5 },
          { v: ranked.map(x => `${x.teacher} (${x.score})`).join(", ") || "—", style: 5 }
        ]);
      });

      sheetsSpec.push({ name: "Substitute", rows, numCols, merges: mergeTitleRows(numCols) });
    }

    // Build workbook XML
    const sheetNames = sheetsSpec.map(s => s.name.replace(/[[\]:*?/\\]/g, "").slice(0, 31) || "Sheet");
    const uniqueNames: string[] = [];
    const seen: Record<string, boolean> = {};
    sheetNames.forEach(n => {
      let base = n;
      let name = base;
      let i = 2;
      while (seen[name]) {
        name = `${base.slice(0, 28)}_${i}`.slice(0, 31);
        i++;
      }
      seen[name] = true;
      uniqueNames.push(name);
    });

    const parts: { name: string; data: Uint8Array }[] = [];

    let contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`;
    for (let i = 1; i <= sheetsSpec.length; i++) {
      contentTypesXml += `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
    }
    contentTypesXml += `</Types>`;
    parts.push({ name: "[Content_Types].xml", data: strToU8(contentTypesXml) });

    parts.push({
      name: "_rels/.rels",
      data: strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`)
    });

    const sheetsXml = uniqueNames.map((n, i) =>
      `<sheet name="${xesc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
    ).join("");
    parts.push({
      name: "xl/workbook.xml",
      data: strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheetsXml}</sheets>
</workbook>`)
    });

    let wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`;
    for (let i = 1; i <= sheetsSpec.length; i++) {
      wbRels += `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`;
    }
    wbRels += `<Relationship Id="rId${sheetsSpec.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
    wbRels += `</Relationships>`;
    parts.push({ name: "xl/_rels/workbook.xml.rels", data: strToU8(wbRels) });

    parts.push({ name: "xl/styles.xml", data: strToU8(STYLES_XML) });

    sheetsSpec.forEach((s, i) => {
      const colWidths = Array(s.numCols).fill(18);
      colWidths[0] = 22;
      const freeze = s.freezeRows !== undefined ? s.freezeRows : 5;
      const xml = sheetXml(s.rows, { colWidths, merges: s.merges, freezeRows: freeze });
      parts.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: strToU8(xml) });
    });

    const zipBytes = makeZip(parts);
    const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const stamp = new Date().toISOString().slice(0, 10);
    const schoolSlug = (data.schoolName || "school").trim().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "school";
    const fileName = `${schoolSlug}-timetable-${stamp}.xlsx`;

    if (window.AndroidBackup && typeof window.AndroidBackup.saveBase64File === "function") {
      const reader = new FileReader();
      reader.onload = function () {
        const s = String(reader.result || "");
        const i = s.indexOf(",");
        const b64 = i >= 0 ? s.slice(i + 1) : s;
        window.AndroidBackup?.saveBase64File?.(b64, fileName, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      };
      reader.readAsDataURL(blob);
      return true;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    return true;
  } catch (err) {
    console.error("Excel generation error:", err);
    throw err;
  }
}