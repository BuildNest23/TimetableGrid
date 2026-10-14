import React, { useState } from 'react';
import { useTimetable, TimetableIssue } from '../context/TimetableContext';
import { ConfirmModal, ConfirmDialogOptions } from '../components/ConfirmModal';
import { ActiveTab } from '../types/timetable';
import { uiConfirm } from '../utils/uiConfirm';
import { DAY_NAMES } from '../types/timetable';
import {
  Settings,
  Clock,
  Calendar,
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

// Format a parsed time into "HH:MM AM/PM"
function formatTime(hour: number, minute: number, suffix: 'AM' | 'PM'): string {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${hh}:${mm} ${suffix}`;
}

// Decide what suffix to use for a typed value, given the current mode
// and the last-seen hour (for auto-flip).
function resolveSuffix(
  parsed: { hour: number; minute: number; suffix: 'AM' | 'PM' | null },
  currentMode: 'AM' | 'PM',
  lastSeenHour: number | null
): { suffix: 'AM' | 'PM'; flipped: boolean } {
  // 1. Explicit suffix typed
  if (parsed.suffix) {
    return { suffix: parsed.suffix, flipped: parsed.suffix !== currentMode };
  }
  // 2. Hour = 12 → assume PM
  if (parsed.hour === 12) {
    return { suffix: 'PM', flipped: currentMode !== 'PM' };
  }
  // 3. Hour 1-11
  if (currentMode === 'PM') {
    return { suffix: 'PM', flipped: false };
  }
  // currentMode === 'AM'
  if (lastSeenHour !== null && parsed.hour < lastSeenHour) {
    // crossing noon → flip to PM
    return { suffix: 'PM', flipped: true };
  }
  return { suffix: 'AM', flipped: false };
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
  const [assemblyStart, setAssemblyStart] = useState(data.assemblyTime?.start || "");
  const [assemblyEnd, setAssemblyEnd] = useState(data.assemblyTime?.end || "");

  const [fridayEnabled, setFridayEnabled] = useState(data.fridayTimings?.enabled || false);
  const [fridayDayIdx, setFridayDayIdx] = useState(data.fridayTimings?.dayIndex ?? 4);
  const [fridayBreakAfter, setFridayBreakAfter] = useState(data.fridayTimings?.breakAfter || 0);
  const [fridayBreakLabel, setFridayBreakLabel] = useState(data.fridayTimings?.breakLabel || "JUMMA BREAK");
  const [fridayNote, setFridayNote] = useState(data.fridayTimings?.note || "");

  const [scenarioNameInput, setScenarioNameInput] = useState("");
  const [selectedScenario, setSelectedScenario] = useState("");
  const scenarioNames = getScenarioNames();

  // Tracks which inputs were auto-filled last time — so we never overwrite typed values
  const [autoFilled, setAutoFilled] = useState<Record<string, boolean>>({});

  // AM/PM modes for main and Friday schedules (independent)
  const [mainAmPmMode, setMainAmPmMode] = useState<'AM' | 'PM'>('AM');
  const [fridayAmPmMode, setFridayAmPmMode] = useState<'AM' | 'PM'>('AM');

  const markAutoFilled = (key: string) =>
    setAutoFilled(prev => ({ ...prev, [key]: true }));

  const clearAutoFilled = (key: string) =>
    setAutoFilled(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

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
     FORMAT-ON-BLUR HELPERS
     ============================================================ */

  // Get the last-seen-hour for a schedule — used for auto-flip across noon.
  // Reads the previous period's end hour (or assembly end for Period 1).
  const getLastSeenHourMain = (idx: number): number | null => {
    if (idx === 0) {
      const ae = data.assemblyTime?.end || '';
      const p = parseTimeInput(ae);
      return p ? p.hour : null;
    }
    const prevEnd = data.periodTimes?.[idx - 1]?.end || '';
    const p = parseTimeInput(prevEnd);
    return p ? p.hour : null;
  };

  const getLastSeenHourFriday = (idx: number): number | null => {
    if (idx === 0) {
      const ae = data.fridayTimings?.assemblyTime?.end || '';
      const p = parseTimeInput(ae);
      return p ? p.hour : null;
    }
    const prevEnd = data.fridayTimings?.periodTimes?.[idx - 1]?.end || '';
    const p = parseTimeInput(prevEnd);
    return p ? p.hour : null;
  };

  // Format a typed value on blur — main schedule. Returns formatted string (or original if unparseable).
  const formatMainValue = (raw: string, idx: number | 'assembly'): string => {
    const parsed = parseTimeInput(raw);
    if (!parsed) return raw;
    const lastSeen = idx === 'assembly' ? null : getLastSeenHourMain(idx as number);
    const { suffix, flipped } = resolveSuffix(parsed, mainAmPmMode, lastSeen);
    if (flipped) setMainAmPmMode(suffix);
    return formatTime(parsed.hour, parsed.minute, suffix);
  };

  const formatFridayValue = (raw: string, idx: number | 'assembly'): string => {
    const parsed = parseTimeInput(raw);
    if (!parsed) return raw;
    const lastSeen = idx === 'assembly' ? null : getLastSeenHourFriday(idx as number);
    const { suffix, flipped } = resolveSuffix(parsed, fridayAmPmMode, lastSeen);
    if (flipped) setFridayAmPmMode(suffix);
    return formatTime(parsed.hour, parsed.minute, suffix);
  };

  /* ============================================================
     AUTO-CHAINING HELPERS
     ============================================================ */

  const canAutoFill = (key: string, currentValue: string): boolean => {
    if (!currentValue || !currentValue.trim()) return true;
    return !!autoFilled[key];
  };

  // ---------- Main: Assembly End → Period 1 Start ----------
  const handleMainAssemblyEndBlur = (rawValue: string) => {
    const formatted = formatMainValue(rawValue, 'assembly');
    setAssemblyEnd(formatted);
    updateData(prev => ({ ...prev, assemblyTime: { ...prev.assemblyTime, end: formatted } }), true);

    if (!data.autoChainTimes || !formatted) return;
    const key = 'main-p0-start';
    const currentP1Start = data.periodTimes?.[0]?.start || '';
    if (!canAutoFill(key, currentP1Start)) return;

    updateData(prev => {
      const next = [...prev.periodTimes];
      if (!next[0]) next[0] = { start: '', end: '' };
      next[0] = { ...next[0], start: formatted };
      return { ...prev, periodTimes: next };
    }, true);
    markAutoFilled(key);
  };

  // ---------- Main: Period N End → Period N+1 Start ----------
  const handleMainPeriodEndBlur = (idx: number, rawValue: string) => {
    const formatted = formatMainValue(rawValue, idx);
    updateData(prev => {
      const next = [...prev.periodTimes];
      if (!next[idx]) next[idx] = { start: '', end: '' };
      next[idx] = { ...next[idx], end: formatted };
      return { ...prev, periodTimes: next };
    }, true);

    if (!data.autoChainTimes || !formatted) return;
    if (idx + 1 >= data.periods.length) return;
    const thisPeriodNum = data.periods[idx];
    if (data.breakAfter && data.breakAfter === thisPeriodNum) return;

    const key = `main-p${idx + 1}-start`;
    const currentNextStart = data.periodTimes?.[idx + 1]?.start || '';
    if (!canAutoFill(key, currentNextStart)) return;

    updateData(prev => {
      const next = [...prev.periodTimes];
      if (!next[idx + 1]) next[idx + 1] = { start: '', end: '' };
      next[idx + 1] = { ...next[idx + 1], start: formatted };
      return { ...prev, periodTimes: next };
    }, true);
    markAutoFilled(key);
  };

  // ---------- Main: Start blur (padding only, no chaining) ----------
  const handleMainPeriodStartBlur = (idx: number, rawValue: string) => {
    const formatted = formatMainValue(rawValue, idx);
    clearAutoFilled(`main-p${idx}-start`);
    updateData(prev => {
      const next = [...prev.periodTimes];
      if (!next[idx]) next[idx] = { start: '', end: '' };
      next[idx] = { ...next[idx], start: formatted };
      return { ...prev, periodTimes: next };
    }, true);
  };

  // ---------- Main: Assembly Start blur (padding only) ----------
  const handleMainAssemblyStartBlur = (rawValue: string) => {
    const parsed = parseTimeInput(rawValue);
    let formatted = rawValue;
    if (parsed) {
      const { suffix } = resolveSuffix(parsed, mainAmPmMode, null);
      formatted = formatTime(parsed.hour, parsed.minute, suffix);
    }
    setAssemblyStart(formatted);
    updateData(prev => ({ ...prev, assemblyTime: { ...prev.assemblyTime, start: formatted } }), true);
  };

  // ---------- Friday: Assembly End → Period 1 Start ----------
  const handleFridayAssemblyEndBlur = (rawValue: string) => {
    const formatted = formatFridayValue(rawValue, 'assembly');
    updateData(prev => ({
      ...prev,
      fridayTimings: {
        ...prev.fridayTimings,
        assemblyTime: { ...prev.fridayTimings.assemblyTime, end: formatted }
      }
    }), true);

    if (!data.autoChainTimes || !formatted) return;
    const key = 'ft-p0-start';
    const currentP1Start = data.fridayTimings?.periodTimes?.[0]?.start || '';
    if (!canAutoFill(key, currentP1Start)) return;

    updateData(prev => {
      const next = [...(prev.fridayTimings.periodTimes || [])];
      while (next.length < prev.periods.length) next.push({ start: '', end: '' });
      next[0] = { ...next[0], start: formatted };
      return { ...prev, fridayTimings: { ...prev.fridayTimings, periodTimes: next } };
    }, true);
    markAutoFilled(key);
  };

  // ---------- Friday: Period N End → Period N+1 Start ----------
  const handleFridayPeriodEndBlur = (idx: number, rawValue: string) => {
    const formatted = formatFridayValue(rawValue, idx);
    updateData(prev => {
      const next = [...(prev.fridayTimings.periodTimes || [])];
      while (next.length < prev.periods.length) next.push({ start: '', end: '' });
      next[idx] = { ...next[idx], end: formatted };
      return { ...prev, fridayTimings: { ...prev.fridayTimings, periodTimes: next } };
    }, true);

    if (!data.autoChainTimes || !formatted) return;
    if (idx + 1 >= data.periods.length) return;
    const thisPeriodNum = data.periods[idx];
    if (fridayBreakAfter && fridayBreakAfter === thisPeriodNum) return;

    const key = `ft-p${idx + 1}-start`;
    const currentNextStart = data.fridayTimings?.periodTimes?.[idx + 1]?.start || '';
    if (!canAutoFill(key, currentNextStart)) return;

    updateData(prev => {
      const next = [...(prev.fridayTimings.periodTimes || [])];
      while (next.length < prev.periods.length) next.push({ start: '', end: '' });
      next[idx + 1] = { ...next[idx + 1], start: formatted };
      return { ...prev, fridayTimings: { ...prev.fridayTimings, periodTimes: next } };
    }, true);
    markAutoFilled(key);
  };

  // ---------- Friday: Start blur (padding only) ----------
  const handleFridayPeriodStartBlur = (idx: number, rawValue: string) => {
    const formatted = formatFridayValue(rawValue, idx);
    clearAutoFilled(`ft-p${idx}-start`);
    updateData(prev => {
      const next = [...(prev.fridayTimings.periodTimes || [])];
      while (next.length < prev.periods.length) next.push({ start: '', end: '' });
      next[idx] = { ...next[idx], start: formatted };
      return { ...prev, fridayTimings: { ...prev.fridayTimings, periodTimes: next } };
    }, true);
  };

  const handleFridayAssemblyStartBlur = (rawValue: string) => {
    const parsed = parseTimeInput(rawValue);
    let formatted = rawValue;
    if (parsed) {
      const { suffix } = resolveSuffix(parsed, fridayAmPmMode, null);
      formatted = formatTime(parsed.hour, parsed.minute, suffix);
    }
    updateData(prev => ({
      ...prev,
      fridayTimings: {
        ...prev.fridayTimings,
        assemblyTime: { ...prev.fridayTimings.assemblyTime, start: formatted }
      }
    }), true);
  };

  const toggleAutoChain = (on: boolean) => {
    updateData(prev => ({ ...prev, autoChainTimes: on }));
    if (!on) {
      setAutoFilled({});
    }
  };

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
      effectiveFromDate: effectiveFrom.trim(),
      assemblyTime: { start: assemblyStart.trim(), end: assemblyEnd.trim() }
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
              School Timings Grid
            </h2>
            <p className="text-xs text-stone-500 font-medium">Configure start and end times for assembly and each instructional period</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
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

          <div>
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
              Assembly Start
            </label>
            <input
              type="text"
              defaultValue={assemblyStart}
              key={`asm-start-${assemblyStart}`}
              onBlur={(e) => handleMainAssemblyStartBlur(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              placeholder="e.g. 7:45"
              className="w-full px-3.5 py-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm font-semibold"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
              Assembly End
            </label>
            <input
              type="text"
              defaultValue={assemblyEnd}
              key={`asm-end-${assemblyEnd}`}
              onBlur={(e) => handleMainAssemblyEndBlur(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              placeholder="e.g. 8:00"
              className="w-full px-3.5 py-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm font-semibold"
            />
          </div>
        </div>

        {/* AM/PM toggle */}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setMainAmPmMode('AM')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                mainAmPmMode === 'AM'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
              }`}
            >
              AM
            </button>
            <button
              type="button"
              onClick={() => setMainAmPmMode('PM')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                mainAmPmMode === 'PM'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
              }`}
            >
              PM
            </button>
          </div>
          <span className="text-[11px] text-stone-500 dark:text-stone-400 font-medium">
            Times you type without AM/PM use this mode. Say <b>8:15</b> → <b>08:15 {mainAmPmMode}</b>.
          </span>
        </div>

        {/* Auto-chain toggle */}
        <label className="flex items-center gap-2 mb-3 text-xs font-bold text-stone-700 dark:text-stone-300 cursor-pointer">
          <input
            type="checkbox"
            checked={!!data.autoChainTimes}
            onChange={(e) => toggleAutoChain(e.target.checked)}
            className="rounded text-emerald-800 focus:ring-emerald-700"
          />
          <span>Auto-fill next period's start from previous period's end</span>
        </label>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          {data.periods.map((p, idx) => (
            <div key={p} className="p-2.5 bg-stone-50 dark:bg-stone-950/60 rounded-xl border border-stone-200 dark:border-stone-800">
              <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 block mb-1">
                Period {p}
              </span>
              <input
                type="text"
                defaultValue={data.periodTimes[idx]?.start || ""}
                key={`main-p${idx}-start-${data.periodTimes[idx]?.start || ''}`}
                onBlur={(e) => handleMainPeriodStartBlur(idx, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="Start"
                className="w-full text-xs px-2 py-1 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-md mb-1"
              />
              <input
                type="text"
                defaultValue={data.periodTimes[idx]?.end || ""}
                key={`main-p${idx}-end-${data.periodTimes[idx]?.end || ''}`}
                onBlur={(e) => handleMainPeriodEndBlur(idx, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="End"
                className="w-full text-xs px-2 py-1 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-md"
              />
            </div>
          ))}
        </div>

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

      {/* Friday / Day-specific timings — always visible; checkbox only controls print layout */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 sm:p-6 border border-stone-200 dark:border-stone-800 shadow-xs">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-xl">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                Friday / Day-Specific Timings
              </h2>
              <p className="text-xs text-stone-500 font-medium">Shorter periods or Jumma prayer recess on designated days</p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-bold text-stone-800 dark:text-stone-200 cursor-pointer max-w-[240px] text-right">
            <input
              type="checkbox"
              checked={fridayEnabled}
              onChange={(e) => setFridayEnabled(e.target.checked)}
              className="rounded text-emerald-800 focus:ring-emerald-700"
            />
            <span>Print on its own page (unchecked = merge into main sheet)</span>
          </label>
        </div>

        <div className="space-y-4 animate-in fade-in duration-150">
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

            <div>
              <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                Break Position
              </label>
              <select
                value={fridayBreakAfter}
                onChange={(e) => setFridayBreakAfter(Number(e.target.value))}
                className="w-full px-3.5 py-2 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-xs font-semibold"
              >
                <option value="0">No Break</option>
                {data.periods.map(p => (
                  <option key={p} value={p}>After Period {p}</option>
                ))}
              </select>
            </div>

            <div>
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

          {/* Friday assembly fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                Assembly Start (Friday)
              </label>
              <input
                type="text"
                defaultValue={data.fridayTimings?.assemblyTime?.start || ''}
                key={`ft-asm-start-${data.fridayTimings?.assemblyTime?.start || ''}`}
                onBlur={(e) => handleFridayAssemblyStartBlur(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="e.g. 7:45"
                className="w-full px-3.5 py-2 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-xs font-semibold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                Assembly End (Friday)
              </label>
              <input
                type="text"
                defaultValue={data.fridayTimings?.assemblyTime?.end || ''}
                key={`ft-asm-end-${data.fridayTimings?.assemblyTime?.end || ''}`}
                onBlur={(e) => handleFridayAssemblyEndBlur(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="e.g. 8:00"
                className="w-full px-3.5 py-2 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-xs font-semibold"
              />
            </div>
          </div>

          {/* Friday AM/PM toggle */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setFridayAmPmMode('AM')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  fridayAmPmMode === 'AM'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                }`}
              >
                AM
              </button>
              <button
                type="button"
                onClick={() => setFridayAmPmMode('PM')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  fridayAmPmMode === 'PM'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                }`}
              >
                PM
              </button>
            </div>
            <span className="text-[11px] text-stone-500 dark:text-stone-400 font-medium">
              Times you type without AM/PM use this mode. Say <b>8:15</b> → <b>08:15 {fridayAmPmMode}</b>.
            </span>
          </div>

          <div>
            <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-2">
              Period times for this day
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {data.periods.map((p, idx) => {
                const pt = (data.fridayTimings.periodTimes && data.fridayTimings.periodTimes[idx]) || { start: '', end: '' };
                return (
                  <div key={p} className="p-2 bg-stone-50 dark:bg-stone-950/60 rounded-xl border border-stone-200 dark:border-stone-800">
                    <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 block mb-1">Period {p}</span>
                    <input
                      type="text"
                      defaultValue={pt.start || ''}
                      key={`ft-p${idx}-start-${pt.start || ''}`}
                      onBlur={(e) => handleFridayPeriodStartBlur(idx, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      placeholder="Start"
                      className="w-full text-xs px-2 py-1 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-md mb-1"
                    />
                    <input
                      type="text"
                      defaultValue={pt.end || ''}
                      key={`ft-p${idx}-end-${pt.end || ''}`}
                      onBlur={(e) => handleFridayPeriodEndBlur(idx, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      placeholder="End"
                      className="w-full text-xs px-2 py-1 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-md"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                updateData(prev => ({
                  ...prev,
                  fridayTimings: {
                    ...prev.fridayTimings,
                    periodTimes: (prev.periodTimes || []).map(t => ({ start: t.start, end: t.end })),
                    assemblyTime: { ...prev.assemblyTime }
                  }
                }));
                setAutoFilled({});
                alert('Weekday times copied to Friday. Edit only the periods that differ.');
              }}
              className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold transition"
            >
              Copy weekday times → Friday
            </button>
            <button
              type="button"
              onClick={handleSaveFridayTimings}
              className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shadow-xs transition"
            >
              Save Friday Timings
            </button>
          </div>
        </div>
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