import { TimetableData, DAY_NAMES } from '../types/timetable';

declare global {
  interface Window {
    AndroidShare?: {
      shareBase64Image?: (b64: string, fileName: string, title: string) => void;
    };
    AndroidImage?: {
      saveBase64Image?: (b64: string, fileName: string) => void;
    };
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.crossOrigin = "anonymous";
    img.src = src;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = String(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width <= maxW) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawCentered(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
  const lines = wrapText(ctx, text, maxW);
  const totalH = lines.length * lineH;
  const startY = y - totalH / 2 + lineH * 0.8;
  lines.forEach((ln, i) => ctx.fillText(ln, x, startY + i * lineH));
}

function drawLeft(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
  const lines = wrapText(ctx, text, maxW);
  const totalH = lines.length * lineH;
  const startY = y - totalH / 2 + lineH * 0.8;
  ctx.textAlign = "left";
  lines.forEach((ln, i) => ctx.fillText(ln, x, startY + i * lineH));
  ctx.textAlign = "center";
}

function daysLabel(days: number[]): string {
  if (!Array.isArray(days) || !days.length) return "";
  return days.slice().sort((a, b) => a - b).map(d => (DAY_NAMES[d] || "").slice(0, 3)).join(", ");
}

export async function createTimetableCanvas(
  kind: 'whole' | 'allteachers' | 'class' | 'teacher' | 'timings' | 'substitute' | 'freestaff' | 'roster',
  data: TimetableData,
  options: {
    selectedClass?: string;
    selectedTeacher?: string;
    absentTeacher?: string;
    teacherPeriodSummary: (teacher: string, periodIndex: number) => string;
    teacherTotalPeriods: (teacher: string) => number;
    getLeavesForDate: (date: string) => string[];
  }
): Promise<HTMLCanvasElement> {
  const scale = 2;
  const F = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const hasBreak = data.breakAfter && data.breakAfter > 0 && data.breakAfter < data.periods.length;

  let logoImg: HTMLImageElement | null = null;
  if (data.schoolLogo) {
    try {
      logoImg = await loadImage(data.schoolLogo);
    } catch {
      // Ignore logo error
    }
  }

  function drawPageHeader(ctx: CanvasRenderingContext2D, totalW: number, pad: number, headerH: number, title: string) {
    let hx = pad;
    if (logoImg) {
      const lw = 80;
      const lh = Math.min(80, (lw * logoImg.height) / logoImg.width);
      ctx.drawImage(logoImg, pad, pad + (headerH - lh) / 2 - 10, lw, lh);
      hx = pad + lw + 16;
    }
    const cx = (hx + totalW - pad) / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = "#1B4D3E";
    ctx.font = `700 24px ${F}`;
    ctx.fillText(data.schoolName, cx, pad + 28);
    ctx.font = `600 13px ${F}`;
    ctx.fillStyle = "#4B5563";
    ctx.fillText(title, cx, pad + 62);
    ctx.fillStyle = "#000000";
  }

  // 1. Whole School Timetable
  if (kind === "whole") {
    const n = data.periods.length;
    const pad = 30;
    const headerH = 140;
    const headRowH = 50;
    const rowH = 66;
    const classW = 120;
    const inchargeW = 120;
    const periodW = 110;
    const tableW = classW + inchargeW + periodW * n;

    const totalW = pad * 2 + tableW;
    const totalH = pad * 2 + headerH + headRowH + data.classes.length * rowH;

    const canvas = document.createElement("canvas");
    canvas.width = totalW * scale;
    canvas.height = totalH * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, totalW, totalH);
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    const subtitle = [data.academicYear, data.wholeTitle].filter(Boolean).join(" • ");
    drawPageHeader(ctx, totalW, pad, headerH, subtitle);

    let y = pad + headerH;
    let x = pad;
    ctx.fillStyle = "#EFEBE2";
    ctx.fillRect(pad, y, tableW, headRowH);
    ctx.strokeStyle = "#DAD3C3";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, classW, headRowH);
    ctx.fillStyle = "#1B4D3E";
    ctx.font = `700 13px ${F}`;
    ctx.fillText("Class", x + classW / 2, y + headRowH / 2);
    x += classW;
    ctx.strokeRect(x, y, inchargeW, headRowH);
    ctx.fillText("Incharge", x + inchargeW / 2, y + headRowH / 2);
    x += inchargeW;

    data.periods.forEach(p => {
      ctx.strokeRect(x, y, periodW, headRowH);
      ctx.fillText(`Period ${p}`, x + periodW / 2, y + headRowH / 2);
      x += periodW;
    });
    y += headRowH;

    data.classes.forEach((c, ci) => {
      x = pad;
      ctx.fillStyle = ci % 2 === 0 ? "#FFFFFF" : "#F8F5EE";
      ctx.fillRect(pad, y, tableW, rowH);
      ctx.strokeStyle = "#DAD3C3";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, classW, rowH);
      ctx.fillStyle = "#111827";
      ctx.font = `700 13px ${F}`;
      ctx.fillText(c[0], x + classW / 2, y + rowH / 2);
      x += classW;
      ctx.strokeRect(x, y, inchargeW, rowH);
      ctx.font = `600 12px ${F}`;
      ctx.fillText(c[1] || "—", x + inchargeW / 2, y + rowH / 2);
      x += inchargeW;

      data.periods.forEach((_, pi) => {
        ctx.strokeRect(x, y, periodW, rowH);
        const s2 = c[5] ? c[5][pi] : null;
        const t1 = c[4][pi];
        const sub1 = c[3][pi] || "—";
        let line1 = t1 ? `${sub1} - ${t1}` : sub1;
        let line2 = "";

        if (s2 && (s2.subject || s2.teacher)) {
          if (s2.mode === "parallel") {
            line2 = s2.teacher ? `${s2.subject || "—"} - ${s2.teacher}` : s2.subject || "—";
          } else if (s2.mode === "same") {
            const t = t1 || s2.teacher;
            const dayStr = s2.days && s2.days.length > 0 ? ` (${daysLabel(s2.days)})` : "";
            line1 = t ? `${sub1}/${s2.subject || "—"}${dayStr} - ${t}` : `${sub1}/${s2.subject || "—"}${dayStr}`;
            line2 = "";
          } else {
            line2 = s2.teacher ? `${s2.subject || "—"} - ${s2.teacher} (${daysLabel(s2.days)})` : `${s2.subject || "—"} (${daysLabel(s2.days)})`;
          }
        }

        ctx.fillStyle = "#111827";
        ctx.font = `700 10.5px ${F}`;
        if (line2) {
          drawCentered(ctx, line1, x + periodW / 2, y + rowH / 2 - 11, periodW - 8, 12);
          drawCentered(ctx, line2, x + periodW / 2, y + rowH / 2 + 11, periodW - 8, 12);
        } else {
          drawCentered(ctx, line1, x + periodW / 2, y + rowH / 2, periodW - 8, 12);
        }
        x += periodW;
      });
      y += rowH;
    });

    return canvas;
  }

  // 2. Class Wise Timetable
  if (kind === "class") {
    const c = data.classes.find(x => x[0] === options.selectedClass) || data.classes[0];
    if (!c) throw new Error("No class selected");
    const n = data.periods.length;
    const pad = 30;
    const headerH = 110;
    const dayColW = 100;
    const periodColW = 130;
    const breakColW = 50;
    const headRowH = 40;
    const rowH = 74;

    const totalW = pad * 2 + dayColW + n * periodColW + (hasBreak ? breakColW : 0);
    const totalH = pad * 2 + headerH + headRowH + data.days.length * rowH;

    const canvas = document.createElement("canvas");
    canvas.width = totalW * scale;
    canvas.height = totalH * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, totalW, totalH);
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    const inchargePart = c[1] ? " — Incharge: " + c[1] : "";
    const subtitle = [data.academicYear, c[0] + inchargePart].filter(Boolean).join(" • ");
    drawPageHeader(ctx, totalW, pad, headerH, subtitle);

    let y = pad + headerH;
    let x = pad;
    ctx.fillStyle = "#EFEBE2";
    ctx.fillRect(pad, y, totalW - pad * 2, headRowH);
    ctx.strokeStyle = "#DAD3C3";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, dayColW, headRowH);
    ctx.fillStyle = "#1B4D3E";
    ctx.font = `700 13px ${F}`;
    ctx.fillText("Day", x + dayColW / 2, y + headRowH / 2);
    x += dayColW;

    data.periods.forEach(p => {
      ctx.strokeRect(x, y, periodColW, headRowH);
      ctx.font = `700 12px ${F}`;
      ctx.fillText(`Period ${p}`, x + periodColW / 2, y + headRowH / 2);
      x += periodColW;
      if (hasBreak && data.breakAfter === p) {
        ctx.strokeRect(x, y, breakColW, headRowH);
        x += breakColW;
      }
    });
    y += headRowH;

    data.days.forEach((d, dayIdx) => {
      let cx2 = pad;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(pad, y, totalW - pad * 2, rowH);
      ctx.strokeRect(cx2, y, dayColW, rowH);
      ctx.fillStyle = "#111827";
      ctx.font = `700 13px ${F}`;
      drawCentered(ctx, d, cx2 + dayColW / 2, y + rowH / 2, dayColW - 10, 15);
      cx2 += dayColW;

      data.periods.forEach((p, i) => {
        ctx.strokeRect(cx2, y, periodColW, rowH);
        const s2 = c[5] ? c[5][i] : null;
        const t1 = c[4][i];
        const sub1 = c[3][i] || "—";
        let line = t1 ? `${sub1} - ${t1}` : sub1;

        if (s2 && (s2.subject || s2.teacher)) {
          if (s2.mode === "same") {
            const t = t1 || s2.teacher;
            const sub2 = s2.subject || "—";
            const hasMask = Array.isArray(s2.days) && s2.days.length > 0;
            let displaySub;
            if (!hasMask) displaySub = `${sub1}/${sub2}`;
            else if (s2.days.includes(dayIdx)) displaySub = sub2;
            else displaySub = sub1;
            line = t ? `${displaySub} - ${t}` : displaySub;
          } else if (s2.mode === "parallel" || s2.days.includes(dayIdx)) {
            line = `${sub1}${t1 ? " - " + t1 : ""} / ${s2.subject || ""}${s2.teacher ? " - " + s2.teacher : ""}`;
          }
        }

        ctx.fillStyle = "#111827";
        ctx.font = `700 11.5px ${F}`;
        drawCentered(ctx, line, cx2 + periodColW / 2, y + rowH / 2, periodColW - 10, 13);
        cx2 += periodColW;

        if (hasBreak && data.breakAfter === p) {
          if (dayIdx === 0) {
            const bh = data.days.length * rowH;
            ctx.fillStyle = "#EFEBE2";
            ctx.fillRect(cx2, y, breakColW, bh);
            ctx.strokeRect(cx2, y, breakColW, bh);
            ctx.save();
            ctx.translate(cx2 + breakColW / 2, y + bh / 2);
            ctx.rotate(Math.PI / 2);
            ctx.fillStyle = "#1B4D3E";
            ctx.font = `700 14px ${F}`;
            ctx.fillText("BREAK", 0, 0);
            ctx.restore();
          }
          cx2 += breakColW;
        }
      });
      y += rowH;
    });

    return canvas;
  }


    // 3. All Teachers
    if (kind === "allteachers") {
      const teacherList = data.hideEmptyTeachersInTT
        ? data.teachers.filter(t => options.teacherTotalPeriods(t) > 0)
        : data.teachers;
      const n = data.periods.length;
      const pad = 30, headerH = 140, headRowH = 50, rowH = 66;
      const teacherW = 150, periodW = 118;
      const tableW = teacherW + periodW * n;
      const totalW = pad * 2 + tableW;
      const totalH = pad * 2 + headerH + headRowH + teacherList.length * rowH;
      const canvas = document.createElement("canvas");
      canvas.width = totalW * scale; canvas.height = totalH * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);
      ctx.fillStyle = "#FFF"; ctx.fillRect(0, 0, totalW, totalH);
      ctx.textBaseline = "middle"; ctx.textAlign = "center";
      drawPageHeader(ctx, totalW, pad, headerH, data.allTeachersTitle || "All Teachers Timetable");
      let y = pad + headerH, x = pad;
      ctx.fillStyle = "#EFEBE2"; ctx.fillRect(pad, y, tableW, headRowH);
      ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, teacherW, headRowH); ctx.fillStyle = "#1B4D3E";
      ctx.font = `700 13px ${F}`; ctx.fillText("Teacher", x + teacherW / 2, y + headRowH / 2);
      x += teacherW;
      data.periods.forEach(p => {
        ctx.strokeRect(x, y, periodW, headRowH);
        ctx.fillText(`Period ${p}`, x + periodW / 2, y + headRowH / 2);
        x += periodW;
      });
      y += headRowH;
      teacherList.forEach((t, ti) => {
        x = pad;
        ctx.fillStyle = ti % 2 === 0 ? "#FFF" : "#F8F5EE";
        ctx.fillRect(pad, y, tableW, rowH);
        ctx.strokeStyle = "#DAD3C3"; ctx.lineWidth = 1;
        ctx.strokeRect(x, y, teacherW, rowH);
        ctx.fillStyle = "#111";
        ctx.font = `700 13px ${F}`;
        ctx.fillText(t, x + teacherW / 2, y + rowH / 2);
        x += teacherW;
        data.periods.forEach((_, pi) => {
          ctx.strokeRect(x, y, periodW, rowH);
          ctx.fillStyle = "#111";
          ctx.font = `700 11px ${F}`;
          drawCentered(ctx, options.teacherPeriodSummary(t, pi), x + periodW / 2, y + rowH / 2, periodW - 8, 13);
          x += periodW;
        });
        y += rowH;
      });
      return canvas;
    }

    // 4. Timings — supports merge (Friday inline) and separate (two stacked tables)
    if (kind === "timings") {
      const title = data.schoolTimingsTitle || "SCHOOL TIMINGS";
      const wref = data.effectiveFromDate ? `w.e.f. ${data.effectiveFromDate}` : "";

      const calc = (s: string, e: string): string => {
        if (!s || !e) return "—";
        const parse = (x: string): number | null => {
          const m = x.trim().toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
          if (!m) return null;
          let h = parseInt(m[1], 10);
          const min = parseInt(m[2], 10);
          if (m[3] === "PM" && h < 12) h += 12;
          if (m[3] === "AM" && h === 12) h = 0;
          return h * 60 + min;
        };
        const ss = parse(s), ee = parse(e);
        if (ss === null || ee === null) return "—";
        let diff = ee - ss;
        if (diff < 0) diff += 24 * 60;
        return `${diff} min`;
      };

      type Row = {
        label: string;
        start: string;
        end: string;
        dur: string;
        isBreak?: boolean;
        isDivider?: boolean;
      };

      const buildRows = (
        times: any[],
        assembly: any,
        breakAfter: number,
        breakLabel: string
      ): Row[] => {
        const rows: Row[] = [];
        if (assembly && (assembly.start || assembly.end)) {
          rows.push({
            label: "Assembly",
            start: assembly.start || "—",
            end: assembly.end || "—",
            dur: calc(assembly.start, assembly.end),
          });
        }
        data.periods.forEach((p, i) => {
          const pt = (times && times[i]) || { start: "", end: "" };
          rows.push({
            label: String(p),
            start: pt.start || "—",
            end: pt.end || "—",
            dur: calc(pt.start, pt.end),
          });
          if (breakAfter === p && i < data.periods.length - 1) {
            const bs = pt.end || "—";
            const be = (times[i + 1] && times[i + 1].start) || "—";
            rows.push({
              label: breakLabel,
              start: bs,
              end: be,
              dur: bs !== "—" && be !== "—" ? calc(bs, be) : "—",
              isBreak: true,
            });
          }
        });
        return rows;
      };

      const ft = data.fridayTimings;
      const fridayHasAnyData = !!(
        ft &&
        ((ft.assemblyTime && (ft.assemblyTime.start || ft.assemblyTime.end)) ||
          (Array.isArray(ft.periodTimes) && ft.periodTimes.some(pt => pt && (pt.start || pt.end))))
      );
      const fridayDayName = ft ? (data.days[ft.dayIndex] || "Friday") : "Friday";

      const mainRows = buildRows(data.periodTimes || [], data.assemblyTime, data.breakAfter, "BREAK");
      const fridayRows = ft
        ? buildRows(ft.periodTimes || [], ft.assemblyTime, ft.breakAfter, ft.breakLabel || "BREAK")
        : [];

      const mergeMode = fridayHasAnyData && ft && !ft.enabled;
      const separateMode = fridayHasAnyData && ft && ft.enabled;

      let combinedRows: Row[] = mainRows;
      if (mergeMode) {
        combinedRows = [
          ...mainRows,
          {
            label: fridayDayName.toUpperCase() + (ft.note ? ` — ${ft.note}` : ""),
            start: "",
            end: "",
            dur: "",
            isDivider: true,
          },
          ...fridayRows,
        ];
      }

      const sections: { subtitle: string; rows: Row[]; note?: string }[] = [];
      if (separateMode) {
        sections.push({
          subtitle: wref ? `${title} (${wref})` : title,
          rows: mainRows,
        });
        sections.push({
          subtitle: wref ? `${title} — ${fridayDayName} (${wref})` : `${title} — ${fridayDayName}`,
          rows: fridayRows,
          note: ft.note || "",
        });
      } else {
        sections.push({
          subtitle: wref ? `${title} (${wref})` : title,
          rows: combinedRows,
        });
      }

      const pad = 30, headerH = 130, headRowH = 50, rowH = 58, gapH = 40;
      const col1W = 200, col2W = 300, col3W = 200;
      const tableW = col1W + col2W + col3W;
      const totalW = pad * 2 + tableW;
      const noteH = 26;
      let totalH = pad * 2;
      sections.forEach((s, si) => {
        totalH += headerH + headRowH + s.rows.length * rowH + (s.note ? noteH : 0) + (si > 0 ? gapH : 0);
      });

      const canvas = document.createElement("canvas");
      canvas.width = totalW * scale;
      canvas.height = totalH * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);
      ctx.fillStyle = "#FFF";
      ctx.fillRect(0, 0, totalW, totalH);
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";

      let y = pad;
      sections.forEach((s, si) => {
        if (si > 0) y += gapH;
        drawPageHeader(ctx, totalW, pad, headerH, s.subtitle);

        let ty = y + headerH;
        if (s.note) {
          ctx.font = `600 12px ${F}`;
          ctx.fillStyle = "#4B5563";
          ctx.fillText(s.note, totalW / 2, ty + 14);
          ctx.fillStyle = "#000";
          ty += noteH;
        }

        let x = pad;
        ctx.fillStyle = "#EFEBE2";
        ctx.fillRect(pad, ty, tableW, headRowH);
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, ty, col1W, headRowH);
        ctx.fillStyle = "#1B4D3E";
        ctx.font = `700 14px ${F}`;
        ctx.fillText("PERIOD", x + col1W / 2, ty + headRowH / 2);
        x += col1W;
        ctx.strokeRect(x, ty, col2W, headRowH);
        ctx.fillText("TIME SLOT", x + col2W / 2, ty + headRowH / 2);
        x += col2W;
        ctx.strokeRect(x, ty, col3W, headRowH);
        ctx.fillText("DURATION (MINS)", x + col3W / 2, ty + headRowH / 2);
        ty += headRowH;

        s.rows.forEach((r, idx) => {
          if (r.isDivider) {
            ctx.fillStyle = "#D6D3D1";
            ctx.fillRect(pad, ty, tableW, rowH);
            ctx.strokeStyle = "#000";
            ctx.lineWidth = 1;
            ctx.strokeRect(pad, ty, tableW, rowH);
            ctx.fillStyle = "#111827";
            ctx.font = `800 15px ${F}`;
            ctx.textAlign = "center";
            ctx.fillText(r.label, pad + tableW / 2, ty + rowH / 2);
            ty += rowH;
            return;
          }
          x = pad;
          ctx.fillStyle = r.isBreak ? "#F1F5F9" : (idx % 2 === 0 ? "#FFF" : "#F8FAFC");
          ctx.fillRect(pad, ty, tableW, rowH);
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 1;
          ctx.strokeRect(x, ty, col1W, rowH);
          ctx.fillStyle = "#111827";
          ctx.font = `700 14px ${F}`;
          ctx.fillText(r.label, x + col1W / 2, ty + rowH / 2);
          x += col1W;
          ctx.strokeRect(x, ty, col2W, rowH);
          ctx.fillText(`${r.start} - ${r.end}`, x + col2W / 2, ty + rowH / 2);
          x += col2W;
          ctx.strokeRect(x, ty, col3W, rowH);
          ctx.fillText(r.dur, x + col3W / 2, ty + rowH / 2);
          ty += rowH;
        });

        y = ty;
      });

      return canvas;
    }

    // 5. Roster
    if (kind === "roster") {
      const pad = 30, headerH = 130, headRowH = 48, rowH = 46;
      const nameW = 230, qualW = 150, rankW = 90, desigW = 150, inchargeW = 250, loadW = 110;
      const totalW = pad * 2 + nameW + qualW + rankW + desigW + inchargeW + loadW;
      const totalH = pad * 2 + headerH + headRowH + data.teachers.length * rowH;
      const canvas = document.createElement("canvas");
      canvas.width = totalW * scale; canvas.height = totalH * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);
      ctx.fillStyle = "#FFF"; ctx.fillRect(0, 0, totalW, totalH);
      ctx.textBaseline = "middle"; ctx.textAlign = "center";
      drawPageHeader(ctx, totalW, pad, headerH, "Teachers Roster");
      let y = pad + headerH, x = pad;
      const headers = ["Teacher", "Group", "Grade", "Designation", "Incharge of", "Periods/week"];
      const widths = [nameW, qualW, rankW, desigW, inchargeW, loadW];
      ctx.fillStyle = "#EFEBE2"; ctx.fillRect(pad, y, totalW - pad * 2, headRowH);
      ctx.strokeStyle = "#000"; ctx.lineWidth = 1;
      headers.forEach((h, i) => {
        ctx.strokeRect(x, y, widths[i], headRowH);
        ctx.fillStyle = "#1B4D3E"; ctx.font = `700 13px ${F}`;
        ctx.fillText(h, x + widths[i] / 2, y + headRowH / 2); x += widths[i];
      });
      y += headRowH;
      data.teachers.forEach((t, ti) => {
        x = pad;
        ctx.fillStyle = ti % 2 === 0 ? "#FFF" : "#F8FAFC";
        ctx.fillRect(pad, y, totalW - pad * 2, rowH);
        const info = data.teacherInfo[t] || { qual: "", rank: "", desig: "" };
        const incharge = data.classes.filter(c => c[1] === t).map(c => c[0]).join(", ");
        const cells = [t, info.qual || "—", info.rank || "—", info.desig || "—", incharge || "—", String(options.teacherTotalPeriods(t))];
        cells.forEach((v, i) => {
          ctx.strokeRect(x, y, widths[i], rowH);
          ctx.fillStyle = "#111"; ctx.font = `700 12px ${F}`;
          drawCentered(ctx, v, x + widths[i] / 2, y + rowH / 2, widths[i] - 10, 14);
          x += widths[i];
        });
        y += rowH;
      });
      return canvas;
    }

    // 6. Free Staff
    if (kind === "freestaff") {
      const today = new Date();
      const dayIdxMap: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };
      const todayIdx = dayIdxMap[today.getDay()] ?? -1;
      const onLeave = new Set(options.getLeavesForDate(`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`));
      const pad = 30, headerH = 130, headRowH = 48, rowH = 60;
      const periodW = 200, freeW = 850;
      const totalW = pad * 2 + periodW + freeW;
      const totalH = pad * 2 + headerH + headRowH + data.periods.length * rowH;
      const canvas = document.createElement("canvas");
      canvas.width = totalW * scale; canvas.height = totalH * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);
      ctx.fillStyle = "#FFF"; ctx.fillRect(0, 0, totalW, totalH);
      ctx.textBaseline = "middle"; ctx.textAlign = "center";
      drawPageHeader(ctx, totalW, pad, headerH, "Free Staff — by Period");
      let y = pad + headerH, x = pad;
      ctx.fillStyle = "#EFEBE2"; ctx.fillRect(pad, y, totalW - pad * 2, headRowH);
      ctx.strokeStyle = "#000"; ctx.lineWidth = 1;
      ctx.strokeRect(x, y, periodW, headRowH); ctx.fillStyle = "#1B4D3E";
      ctx.font = `700 13px ${F}`; ctx.fillText("Period", x + periodW / 2, y + headRowH / 2); x += periodW;
      ctx.strokeRect(x, y, freeW, headRowH); ctx.fillText("Free Teachers", x + freeW / 2, y + headRowH / 2);
      y += headRowH;
      data.periods.forEach((p, pi) => {
        x = pad;
        ctx.fillStyle = "#FFF"; ctx.fillRect(pad, y, totalW - pad * 2, rowH);
        ctx.strokeRect(x, y, periodW, rowH); ctx.fillStyle = "#111";
        ctx.font = `700 13px ${F}`; ctx.fillText(`Period ${p}`, x + periodW / 2, y + rowH / 2); x += periodW;
        ctx.strokeRect(x, y, freeW, rowH);
        let text = "All teachers busy";
        if (todayIdx >= 0 && todayIdx < data.daysPerWeek) {
          const free = data.teachers.filter(t => {
            if (onLeave.has(t)) return false;
            if (!data.freeStaffIncludeNonTeaching && options.teacherTotalPeriods(t) === 0) return false;
            return !data.classes.some(c => {
              const t1 = c[4][pi];
              const s2 = c[5] ? c[5][pi] : null;
              let s1Active = true;
              if (s2 && s2.mode === 'rotation' && s2.days.includes(todayIdx)) s1Active = false;
              if (t1 === t && s1Active) return true;
              if (s2 && s2.teacher === t && s2.mode !== 'same') {
                return s2.mode === 'parallel' || s2.days.includes(todayIdx);
              }
              return false;
            });
          });
          if (free.length) text = free.map(t => `${t} (${options.teacherTotalPeriods(t)})`).join(", ");
        }
        ctx.fillStyle = "#111"; ctx.font = `700 12px ${F}`;
        drawLeft(ctx, text, x + 14, y + rowH / 2, freeW - 28, 14);
        y += rowH;
      });
      return canvas;
    }

    // 7. Substitute Board — dynamic columns based on checkboxes
    if (kind === "substitute") {
      const absent = options.absentTeacher || data.teachers[0] || "";
      const leaveDate = data.leaveDate || new Date().toISOString().slice(0, 10);
      const dayIdxMap: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };
      let dayIdx = -1;
      try {
        const [y0, m0, d0] = leaveDate.split("-").map(Number);
        dayIdx = dayIdxMap[new Date(y0, m0 - 1, d0).getDay()] ?? -1;
      } catch {}
      const onLeave = new Set(options.getLeavesForDate(leaveDate));
      const isDayInWeek = dayIdx >= 0 && dayIdx < data.daysPerWeek;

      // Column visibility flags — match the on-screen table
      const showWorkloadCol = data.substituteRecommendWorkload !== false;
      const showGroupCol = data.substituteRecommendGroup !== false;

      const pad = 30, headerH = 150, headRowH = 50, rowH = 64;
      const periodW = 200;
      const recW = showWorkloadCol ? 220 : 0;
      const groupW = showGroupCol ? 260 : 0;
      // Free column expands to fill remaining space
      const totalTableW = 1200;
      const freeW = totalTableW - periodW - recW - groupW;
      const totalW = pad * 2 + totalTableW;
      const totalH = pad * 2 + headerH + headRowH + data.periods.length * rowH;
      const canvas = document.createElement("canvas");
      canvas.width = totalW * scale; canvas.height = totalH * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);
      ctx.fillStyle = "#FFF"; ctx.fillRect(0, 0, totalW, totalH);
      ctx.textBaseline = "middle"; ctx.textAlign = "center";
      drawPageHeader(ctx, totalW, pad, headerH, `Substitute Board — Absent: ${absent} · ${leaveDate}`);

      let y = pad + headerH;
      let x = pad;
      ctx.fillStyle = "#EFEBE2"; ctx.fillRect(pad, y, totalTableW, headRowH);
      ctx.strokeStyle = "#000"; ctx.lineWidth = 1;
      ctx.fillStyle = "#1B4D3E"; ctx.font = `700 12px ${F}`;

      // Header cells — only include the columns that are enabled
      ctx.strokeRect(x, y, periodW, headRowH);
      ctx.fillText("Period", x + periodW / 2, y + headRowH / 2);
      x += periodW;

      if (showWorkloadCol) {
        ctx.strokeRect(x, y, recW, headRowH);
        ctx.fillText("Recommended", x + recW / 2, y + headRowH / 2);
        x += recW;
      }
      if (showGroupCol) {
        ctx.strokeRect(x, y, groupW, headRowH);
        ctx.fillText("By Group (1–4)", x + groupW / 2, y + headRowH / 2);
        x += groupW;
      }
      ctx.strokeRect(x, y, freeW, headRowH);
      ctx.fillText("Free teachers (workload)", x + freeW / 2, y + headRowH / 2);
      y += headRowH;

      const prior: Record<string, number> = {};
      data.periods.forEach((p, pi) => {
        const assignments: string[] = [];
        if (isDayInWeek) {
          data.classes.forEach(c => {
            const t1 = c[4][pi];
            const s2 = c[5] ? c[5][pi] : null;
            let s1Active = true;
            if (s2 && s2.mode === 'rotation' && s2.days.includes(dayIdx)) s1Active = false;
            if (t1 === absent && s1Active) assignments.push(`${c[3][pi] || "—"} (${c[0]})`);
            else if (s2 && s2.teacher === absent && s2.mode !== 'same') {
              const active = s2.mode === 'parallel' || s2.days.includes(dayIdx);
              if (active) assignments.push(`${s2.subject || "—"} (${c[0]})`);
            }
          });
        }

        // Compute the free-teacher ranking once per row (used by multiple columns)
        const free = assignments.length ? data.teachers.filter(t => {
          if (t === absent) return false;
          if (onLeave.has(t)) return false;
          if (!data.substituteIncludeNonTeaching && options.teacherTotalPeriods(t) === 0) return false;
          return !data.classes.some(c => {
            const t1 = c[4][pi];
            const s2 = c[5] ? c[5][pi] : null;
            let s1Active = true;
            if (s2 && s2.mode === 'rotation' && s2.days.includes(dayIdx)) s1Active = false;
            if (t1 === t && s1Active) return true;
            if (s2 && s2.teacher === t && s2.mode !== 'same') {
              return s2.mode === 'parallel' || s2.days.includes(dayIdx);
            }
            return false;
          });
        }) : [];

        x = pad;
        ctx.fillStyle = "#FFF"; ctx.fillRect(pad, y, totalTableW, rowH);
        ctx.strokeStyle = "#DAD3C3";

        // Period cell
        ctx.strokeRect(x, y, periodW, rowH);
        ctx.fillStyle = "#111"; ctx.font = `700 13px ${F}`;
        if (assignments.length) {
          ctx.fillText(`P${p}`, x + periodW / 2, y + rowH / 2 - 9);
          ctx.font = `600 11px ${F}`; ctx.fillStyle = "#555";
          drawCentered(ctx, assignments.join(", "), x + periodW / 2, y + rowH / 2 + 10, periodW - 10, 12);
        } else {
          ctx.fillText(`P${p}`, x + periodW / 2, y + rowH / 2);
        }
        x += periodW;

        // Recommended cell (only if enabled)
        if (showWorkloadCol) {
          ctx.strokeRect(x, y, recW, rowH);
          if (!assignments.length) {
            ctx.fillStyle = "#888"; ctx.font = `600 12px ${F}`;
            ctx.fillText("No cover needed", x + recW / 2, y + rowH / 2);
          } else {
            const ranked = free.map(t => ({ t, s: options.teacherTotalPeriods(t) + (prior[t] || 0) }))
              .sort((a, b) => a.s - b.s || a.t.localeCompare(b.t));
            const best = ranked[0];
            if (best) prior[best.t] = (prior[best.t] || 0) + 1;
            ctx.fillStyle = "#111"; ctx.font = `700 12px ${F}`;
            drawCentered(ctx, best ? `${best.t} (${best.s})` : "None", x + recW / 2, y + rowH / 2, recW - 10, 13);
          }
          x += recW;
        }

        // By Group cell (only if enabled)
        if (showGroupCol) {
          ctx.strokeRect(x, y, groupW, rowH);
          ctx.fillStyle = "#111"; ctx.font = `600 11px ${F}`;
          if (!assignments.length) {
            ctx.fillText("—", x + groupW / 2, y + rowH / 2);
          } else {
            const absInfo = data.teacherInfo[absent] || { qual: "", rank: "" };
            const scored = free.map(t => {
              const inf = data.teacherInfo[t] || { qual: "", rank: "" };
              const tier = (absInfo.rank === inf.rank && absInfo.qual === inf.qual) ? 0
                : (absInfo.rank === inf.rank) ? 1
                : (absInfo.qual === inf.qual) ? 2 : 3;
              return { t, tier, inf };
            }).sort((a, b) => a.tier - b.tier).slice(0, 4);
            const lines = scored.map((s, i) => `${i + 1}. ${s.t} (${[s.inf.rank, s.inf.qual].filter(Boolean).join(" ")})`).join("  ·  ");
            drawLeft(ctx, lines || "—", x + 10, y + rowH / 2, groupW - 20, 13);
          }
          x += groupW;
        }

        // Free teachers cell (always shown)
        ctx.strokeRect(x, y, freeW, rowH);
        ctx.fillStyle = "#111"; ctx.font = `600 11px ${F}`;
        if (!assignments.length) {
          drawLeft(ctx, "Absent teacher is free", x + 12, y + rowH / 2, freeW - 24, 13);
        } else {
          const ranked = free.map(t => `${t} (${options.teacherTotalPeriods(t)})`).join(", ");
          drawLeft(ctx, ranked || "No teachers free", x + 12, y + rowH / 2, freeW - 24, 13);
        }

        y += rowH;
      });
      return canvas;
    }

    // 8. Teacher timetable (final fallback)
  if (kind !== "teacher") throw new Error(`PNG export not implemented for "${kind}"`);
  const t = options.selectedTeacher || data.teachers[0];
  const inchargeClass = data.classes.find(c => c[1] === t);
  const info = (data.teacherInfo && data.teacherInfo[t]) || { qual: "", rank: "", desig: "" };
  const subParts = [
    data.academicYear,
    inchargeClass ? "Incharge of " + inchargeClass[0] : "",
    info.rank,
    info.qual,
    t
  ].filter(Boolean);
  const subtitle = subParts.join(" • ");

  const pad = 30;
  const headerH = 110;
  const rowH = 60;
  const headRowH = 40;
  const periodColW = 180;
  const assignColW = 560;

  const totalW = pad * 2 + periodColW + assignColW;
  const totalH = pad * 2 + headerH + headRowH + data.periods.length * rowH;

  const canvas = document.createElement("canvas");
  canvas.width = totalW * scale;
  canvas.height = totalH * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, totalW, totalH);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  drawPageHeader(ctx, totalW, pad, headerH, subtitle);

  let y = pad + headerH;
  ctx.fillStyle = "#EFEBE2";
  ctx.fillRect(pad, y, periodColW + assignColW, headRowH);
  ctx.strokeStyle = "#DAD3C3";
  ctx.lineWidth = 1;
  ctx.strokeRect(pad, y, periodColW, headRowH);
  ctx.strokeRect(pad + periodColW, y, assignColW, headRowH);
  ctx.fillStyle = "#1B4D3E";
  ctx.font = `700 14px ${F}`;
  ctx.fillText("Period", pad + periodColW / 2, y + headRowH / 2);
  ctx.fillText("Assignment", pad + periodColW + assignColW / 2, y + headRowH / 2);
  y += headRowH;

  data.periods.forEach((p, i) => {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(pad, y, periodColW + assignColW, rowH);
    ctx.strokeRect(pad, y, periodColW, rowH);
    ctx.strokeRect(pad + periodColW, y, assignColW, rowH);
    ctx.fillStyle = "#111827";
    ctx.font = `700 13px ${F}`;
    ctx.fillText(`Period ${p}`, pad + periodColW / 2, y + rowH / 2);
    const cellText = options.teacherPeriodSummary(t, i);
    drawCentered(ctx, cellText, pad + periodColW + assignColW / 2, y + rowH / 2, assignColW - 20, 16);
    y += rowH;
  });

  return canvas;
}

export async function shareOrDownloadCanvas(
  canvas: HTMLCanvasElement,
  fileName: string,
  title: string
): Promise<boolean> {
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/png"));
  if (!blob) return false;

  // 1. Android APK Bridge check
  if (window.AndroidShare && typeof window.AndroidShare.shareBase64Image === "function") {
    const reader = new FileReader();
    reader.onload = function () {
      const s = String(reader.result || "");
      const i = s.indexOf(",");
      const b64 = i >= 0 ? s.slice(i + 1) : s;
      window.AndroidShare?.shareBase64Image?.(b64, fileName, title);
    };
    reader.readAsDataURL(blob);
    return true;
  }

  // 2. Web Share API
  const file = new File([blob], fileName, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return true;
    } catch {
      // Fall through to download if cancelled or unsupported
    }
  }

  // 3. Fallback: Save to pictures via Android bridge or browser download
  if (window.AndroidImage && typeof window.AndroidImage.saveBase64Image === "function") {
    const reader = new FileReader();
    reader.onload = function () {
      const s = String(reader.result || "");
      const i = s.indexOf(",");
      const b64 = i >= 0 ? s.slice(i + 1) : s;
      window.AndroidImage?.saveBase64Image?.(b64, fileName);
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
}