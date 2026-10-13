import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useTimetable } from '../context/TimetableContext';
import {
  buildClassCardHTML,
  buildTeacherCardHTML,
  buildPeriodCardHTML,
  buildCardDocumentHTML,
  getFreeTeachersForPeriod
} from '../utils/printEngine';
import { getPeriodTimes, PeriodTimeInfo } from '../utils/timings';
import { triggerPrint } from '../utils/printUtils';
import {
  Search,
  X,
  Clock,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Printer,
  Image as ImageIcon,
  Share2,
  Loader2,
  AlertCircle,
  Info
} from 'lucide-react';

interface PopupItem {
  type: 'class' | 'teacher' | 'period';
  id: string | number;
}

export const ViewTimetablesView: React.FC = () => {
  const {
    data,
    teacherPeriodSummary,
    getLeavesForDate,
    getTeacherTotalPeriods
  } = useTimetable();

  const [search, setSearch] = useState<string>('');
  const [popupItem, setPopupItem] = useState<PopupItem | null>(null);
  const [history, setHistory] = useState<PopupItem[]>([]);

  // Shared timings result using getPeriodTimes helper
  const timings = useMemo(() => {
    return getPeriodTimes(data);
  }, [data]);

  // Strip toggle: "Normal" | "Friday" (per-visit only, not stored)
  // Only shown if Friday timings are enabled and at least one period differs (or break/assembly differs)
  const showStripToggle = useMemo(() => {
    return timings.fridayEnabled && (timings.hasDifferingPeriods || timings.hasAnyDifference);
  }, [timings]);

  // Default: on Friday (the day set in fridayTimings.dayIndex), strip opens on "Friday". On other days "Normal".
  const [stripTimingMode, setStripTimingMode] = useState<'normal' | 'friday'>(() => {
    const ft = data.fridayTimings;
    if (ft && ft.enabled) {
      const jsDay = new Date().getDay();
      const todayIndex = jsDay === 0 ? 6 : jsDay - 1; // 0=Mon ... 4=Fri
      const targetDayIndex = typeof ft.dayIndex === 'number' ? ft.dayIndex : 4;
      if (todayIndex === targetDayIndex) {
        return 'friday';
      }
    }
    return 'normal';
  });

  // Action loading states
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [isSavingImage, setIsSavingImage] = useState<boolean>(false);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  // Preview sizing
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState<number>(0.5);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Focus management
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    setToast(msg);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, 2400);
  }, []);

  // Filtered classes
  const query = search.trim().toLowerCase();

  const filteredClasses = useMemo(() => {
    if (!query) return data.classes;
    return data.classes.filter(c => {
      const name = (c[0] || '').toLowerCase();
      const incharge = (c[1] || '').toLowerCase();
      const section = (c[2] || '').toLowerCase();
      return name.includes(query) || incharge.includes(query) || section.includes(query);
    });
  }, [data.classes, query]);

  // Base teachers respecting hideEmptyTeachersInTT
  const baseTeachers = useMemo(() => {
    if (!data.hideEmptyTeachersInTT) return data.teachers;
    return data.teachers.filter(t =>
      data.periods.some((_, pi) => teacherPeriodSummary(t, pi) !== 'Free')
    );
  }, [data.teachers, data.periods, data.hideEmptyTeachersInTT, teacherPeriodSummary]);

  // Filtered teachers
  const filteredTeachers = useMemo(() => {
    if (!query) return baseTeachers;
    return baseTeachers.filter(t => {
      const name = t.toLowerCase();
      const info = data.teacherInfo[t] || { qual: '', rank: '', desig: '' };
      return (
        name.includes(query) ||
        (info.qual || '').toLowerCase().includes(query) ||
        (info.rank || '').toLowerCase().includes(query) ||
        (info.desig || '').toLowerCase().includes(query)
      );
    });
  }, [baseTeachers, query, data.teacherInfo]);

  // Class sections grouping
  const sectionsGrouped = useMemo(() => {
    const rawSections = Array.from(new Set(data.classes.map(c => (c[2] || '').trim())));
    const named = rawSections.filter(s => s.length > 0);
    const hasUnsectioned = rawSections.some(s => s.length === 0);

    const result: Array<{ name: string; isOther: boolean; classes: typeof data.classes }> = [];

    named.forEach(secName => {
      const secClasses = filteredClasses.filter(c => (c[2] || '').trim() === secName);
      if (secClasses.length > 0) {
        result.push({ name: secName, isOther: false, classes: secClasses });
      }
    });

    if (hasUnsectioned) {
      const unsecClasses = filteredClasses.filter(c => !(c[2] || '').trim());
      if (unsecClasses.length > 0) {
        result.push({ name: 'OTHER CLASSES', isOther: true, classes: unsecClasses });
      }
    }

    return result;
  }, [data.classes, filteredClasses]);

  // Break and Period groupings for School Timings strip grid
  // Affects ONLY the timings strip on the View page. Does NOT affect cards.
  const timingsLayout = useMemo(() => {
    const isFriday = stripTimingMode === 'friday';
    const breakInfo = isFriday ? timings.fridayBreak : timings.normalBreak;
    const breakAfter = breakInfo.breakAfter;

    const bIdx = data.periods.indexOf(breakAfter);
    const hasBreak = breakAfter > 0 && bIdx >= 0 && bIdx < data.periods.length - 1;

    let group1: PeriodTimeInfo[] = [];
    let group2: PeriodTimeInfo[] = [];

    if (hasBreak) {
      group1 = timings.periods.slice(0, bIdx + 1);
      group2 = timings.periods.slice(bIdx + 1);
    } else {
      group1 = timings.periods;
      group2 = [];
    }

    const breakText = breakInfo.time
      ? `${breakInfo.label.toUpperCase()} · ${breakInfo.time}`
      : breakInfo.label.toUpperCase();

    return {
      hasBreak,
      breakText,
      group1,
      group2
    };
  }, [data.periods, stripTimingMode, timings]);

  // Open modal from card tile
  const openClassPopup = (className: string) => {
    lastFocusedElementRef.current = document.activeElement as HTMLElement | null;
    setHistory([]);
    setPopupItem({ type: 'class', id: className });
  };

  const openTeacherPopup = (teacherName: string) => {
    lastFocusedElementRef.current = document.activeElement as HTMLElement | null;
    setHistory([]);
    setPopupItem({ type: 'teacher', id: teacherName });
  };

  const openPeriodPopup = (periodNum: number) => {
    lastFocusedElementRef.current = document.activeElement as HTMLElement | null;
    setHistory([]);
    setPopupItem({ type: 'period', id: periodNum });
  };

  // Close modal
  const closePopup = useCallback(() => {
    setPopupItem(null);
    setHistory([]);
  }, []);

  // Navigate to teacher chip from class/period popup
  const navigateToTeacher = (t: string) => {
    if (popupItem) {
      setHistory(prev => [...prev, popupItem]);
    }
    setPopupItem({ type: 'teacher', id: t });
  };

  // Navigate to class chip from teacher popup
  const navigateToClass = (cName: string) => {
    if (popupItem) {
      setHistory(prev => [...prev, popupItem]);
    }
    setPopupItem({ type: 'class', id: cName });
  };

  // Back button for chip navigation
  const handleBack = () => {
    if (history.length === 0) return;
    const nextHistory = [...history];
    const prevItem = nextHistory.pop()!;
    setHistory(nextHistory);
    setPopupItem(prevItem);
  };

  // Current item index & sibling navigation
  const { currentIndex, prevItem, nextItem } = useMemo(() => {
    if (!popupItem) return { currentIndex: -1, prevItem: null, nextItem: null };

    if (popupItem.type === 'class') {
      const idx = filteredClasses.findIndex(c => c[0] === popupItem.id);
      if (idx === -1) return { currentIndex: -1, prevItem: null, nextItem: null };
      const prev = idx > 0 ? filteredClasses[idx - 1][0] : filteredClasses[filteredClasses.length - 1][0];
      const next = idx < filteredClasses.length - 1 ? filteredClasses[idx + 1][0] : filteredClasses[0][0];
      return {
        currentIndex: idx,
        prevItem: { type: 'class' as const, id: prev },
        nextItem: { type: 'class' as const, id: next }
      };
    }

    if (popupItem.type === 'teacher') {
      const idx = filteredTeachers.findIndex(t => t === popupItem.id);
      if (idx === -1) return { currentIndex: -1, prevItem: null, nextItem: null };
      const prev = idx > 0 ? filteredTeachers[idx - 1] : filteredTeachers[filteredTeachers.length - 1];
      const next = idx < filteredTeachers.length - 1 ? filteredTeachers[idx + 1] : filteredTeachers[0];
      return {
        currentIndex: idx,
        prevItem: { type: 'teacher' as const, id: prev },
        nextItem: { type: 'teacher' as const, id: next }
      };
    }

    // Period navigation
    const pNum = typeof popupItem.id === 'number' ? popupItem.id : Number(popupItem.id);
    const idx = data.periods.indexOf(pNum);
    if (idx === -1) return { currentIndex: -1, prevItem: null, nextItem: null };
    const prev = idx > 0 ? data.periods[idx - 1] : data.periods[data.periods.length - 1];
    const next = idx < data.periods.length - 1 ? data.periods[idx + 1] : data.periods[0];
    return {
      currentIndex: idx,
      prevItem: { type: 'period' as const, id: prev },
      nextItem: { type: 'period' as const, id: next }
    };
  }, [popupItem, filteredClasses, filteredTeachers, data.periods]);

  // Keyboard navigation: Esc to close, Left/Right arrow keys for prev/next
  useEffect(() => {
    if (!popupItem) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePopup();
      } else if (e.key === 'ArrowLeft' && prevItem) {
        e.preventDefault();
        setPopupItem(prevItem);
      } else if (e.key === 'ArrowRight' && nextItem) {
        e.preventDefault();
        setPopupItem(nextItem);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [popupItem, prevItem, nextItem, closePopup]);

  // Focus lock and restoration
  useEffect(() => {
    if (popupItem) {
      closeButtonRef.current?.focus();
    } else if (lastFocusedElementRef.current) {
      lastFocusedElementRef.current.focus();
    }
  }, [popupItem]);

  // Compute preview scale to fit container while maintaining A4 portrait aspect ratio (794 x 1123)
  useEffect(() => {
    if (!popupItem) return;
    const container = previewContainerRef.current;
    if (!container) return;

    const updateScale = () => {
      const containerWidth = container.clientWidth || 320;
      const containerHeight = container.clientHeight || 450;
      const scaleX = (containerWidth - 16) / 794;
      const scaleY = (containerHeight - 16) / 1123;
      const scale = Math.max(0.2, Math.min(scaleX, scaleY, 0.75));
      setPreviewScale(scale);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, [popupItem]);

  // Active item's card HTML (always shows both times, independent of strip toggle)
  const cardHtml = useMemo(() => {
    if (!popupItem) return '';
    if (popupItem.type === 'class') {
      return buildClassCardHTML(data, String(popupItem.id));
    }
    if (popupItem.type === 'teacher') {
      return buildTeacherCardHTML(data, String(popupItem.id), teacherPeriodSummary);
    }
    // Period card
    const periodNum = typeof popupItem.id === 'number' ? popupItem.id : Number(popupItem.id);
    return buildPeriodCardHTML(data, periodNum, {
      getLeavesForDate,
      getTeacherTotalPeriods
    });
  }, [popupItem, data, teacherPeriodSummary, getLeavesForDate, getTeacherTotalPeriods]);

  // Full document HTML for the iframe
  const iframeDocHtml = useMemo(() => {
    if (!cardHtml) return '';
    return buildCardDocumentHTML(cardHtml);
  }, [cardHtml]);

  // Teacher free periods count
  const teacherFreePeriods = useMemo(() => {
    if (!popupItem || popupItem.type !== 'teacher') return 0;
    const t = String(popupItem.id);
    return data.periods.filter((_, pi) => teacherPeriodSummary(t, pi) === 'Free').length;
  }, [popupItem, data.periods, teacherPeriodSummary]);

  // Related chips for horizontal scrollable chip bar
  const relatedChips = useMemo(() => {
    if (!popupItem) return [];

    if (popupItem.type === 'class') {
      const targetClass = data.classes.find(c => c[0] === popupItem.id);
      if (!targetClass) return [];
      const teachers = new Set<string>();
      (targetClass[4] || []).forEach(t => {
        if (t && t !== '—' && t !== 'Free') teachers.add(t);
      });
      if (targetClass[5]) {
        targetClass[5].forEach(s2 => {
          if (s2?.teacher && s2.teacher !== '—' && s2.teacher !== 'Free') {
            teachers.add(s2.teacher);
          }
        });
      }
      return Array.from(teachers).map(t => ({ label: t, type: 'teacher' as const, id: t }));
    }

    if (popupItem.type === 'teacher') {
      const t = String(popupItem.id);
      const classes = new Set<string>();
      data.classes.forEach(c => {
        const incharge = c[1];
        if (incharge === t) classes.add(c[0]);
        (c[4] || []).forEach(teach => {
          if (teach === t) classes.add(c[0]);
        });
        if (c[5]) {
          c[5].forEach(s2 => {
            if (s2?.teacher === t) classes.add(c[0]);
          });
        }
      });
      return Array.from(classes).map(cName => ({ label: cName, type: 'class' as const, id: cName }));
    }

    // Period popup: show free teachers chips
    const periodNum = typeof popupItem.id === 'number' ? popupItem.id : Number(popupItem.id);
    const pIdx = Math.max(0, data.periods.indexOf(periodNum));
    const freeStaff = getFreeTeachersForPeriod(data, pIdx, {
      getLeavesForDate,
      getTeacherTotalPeriods
    });
    return freeStaff.map(t => ({ label: t, type: 'teacher' as const, id: t }));
  }, [popupItem, data, teacherPeriodSummary, getLeavesForDate, getTeacherTotalPeriods]);

  // Actions: Print, Save Image, Share
  const handlePrint = () => {
    if (!popupItem || !cardHtml) return;
    setIsPrinting(true);
    try {
      const doc = buildCardDocumentHTML(cardHtml);
      triggerPrint(doc);
    } catch (err) {
      console.error('Print error:', err);
      showToast('Failed to start print.');
    } finally {
      setTimeout(() => setIsPrinting(false), 500);
    }
  };

  const generateImageBlob = async (): Promise<Blob | null> => {
    if (!cardHtml) return null;

    // Render HTML card inside an SVG foreignObject for high-resolution PNG rasterization
    const width = 794;
    const height = 1123;
    const scale = 2; // 2x for sharp print quality

    const svgXml = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px; height:${height}px; background:#fff; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            ${cardHtml}
          </div>
        </foreignObject>
      </svg>
    `;

    const svgBlob = new Blob([svgXml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(scale, scale);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0);
        }
        URL.revokeObjectURL(url);
        canvas.toBlob(resolve, 'image/png');
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  };

  const handleSaveImage = async () => {
    if (!popupItem) return;
    setIsSavingImage(true);
    try {
      const blob = await generateImageBlob();
      if (!blob) throw new Error('Blob generation failed');

      let fileName = '';
      if (popupItem.type === 'class') {
        fileName = `Timetable-Class-${popupItem.id}.png`;
      } else if (popupItem.type === 'teacher') {
        fileName = `Timetable-${popupItem.id}.png`;
      } else {
        fileName = `${data.schoolName || 'School'} - Period ${popupItem.id}.png`;
      }

      const link = document.createElement('a');
      link.download = fileName;
      link.href = URL.createObjectURL(blob);
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1500);

      showToast('Image saved.');
    } catch (err) {
      console.error('Save image error:', err);
      showToast('Failed to save image.');
    } finally {
      setIsSavingImage(false);
    }
  };

  const handleShare = async () => {
    if (!popupItem) return;
    setIsSharing(true);
    try {
      const blob = await generateImageBlob();
      if (!blob) throw new Error('Blob generation failed');

      let fileName = '';
      if (popupItem.type === 'class') {
        fileName = `Timetable-Class-${popupItem.id}.png`;
      } else if (popupItem.type === 'teacher') {
        fileName = `Timetable-${popupItem.id}.png`;
      } else {
        fileName = `${data.schoolName || 'School'} - Period ${popupItem.id}.png`;
      }

      const file = new File([blob], fileName, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: fileName.replace('.png', ''),
        });
        showToast('Shared successfully.');
      } else {
        // Fallback: download
        const link = document.createElement('a');
        link.download = fileName;
        link.href = URL.createObjectURL(blob);
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1500);
        showToast('Image saved.');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Share error:', err);
        showToast('Failed to share.');
      }
    } finally {
      setIsSharing(false);
    }
  };

  // Render a period tile for the View page timings strip
  const renderPeriodTile = (item: PeriodTimeInfo) => {
    const timeDisplay = stripTimingMode === 'friday'
      ? (item.friday || item.normal || '—')
      : (item.normal || '—');

    return (
      <button
        key={item.period}
        type="button"
        onClick={() => openPeriodPopup(item.period)}
        aria-label={`Open Period ${item.period}`}
        className="w-full flex flex-col items-center justify-center p-3 sm:p-3.5 bg-stone-50 dark:bg-stone-800/80 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-stone-200 dark:border-stone-700/80 hover:border-emerald-500/60 rounded-2xl text-center shadow-2xs transition cursor-pointer active:scale-98 group"
      >
        <span className="text-xs sm:text-sm font-bold text-stone-800 dark:text-stone-200 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition">
          Period {item.period}
        </span>
        <div className="mt-1 text-center">
          <span className="text-xs font-medium text-stone-500 dark:text-stone-400 break-words">
            {timeDisplay}
          </span>
        </div>
      </button>
    );
  };

  // Render a group of period tiles in a 2-column grid, with odd tile centered at same column width
  const renderPeriodGrid = (items: PeriodTimeInfo[]) => {
    if (items.length === 0) return null;

    const rows: PeriodTimeInfo[][] = [];
    for (let i = 0; i < items.length; i += 2) {
      rows.push(items.slice(i, i + 2));
    }

    return (
      <div className="space-y-2.5 sm:space-y-3">
        {rows.map((row, rIdx) => {
          if (row.length === 2) {
            return (
              <div key={rIdx} className="grid grid-cols-2 gap-2.5 sm:gap-3">
                {renderPeriodTile(row[0])}
                {renderPeriodTile(row[1])}
              </div>
            );
          }
          // Odd tile sitting alone on its row, centred under the two tiles above it with the same width as one column tile
          return (
            <div key={rIdx} className="grid grid-cols-2 gap-2.5 sm:gap-3">
              <div className="col-span-2 flex justify-center">
                <div className="w-[calc(50%-0.3125rem)] sm:w-[calc(50%-0.375rem)]">
                  {renderPeriodTile(row[0])}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-24">
      {/* ---------------- A) HEADER CARD ---------------- */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold font-serif text-stone-900 dark:text-stone-100">
              {data.schoolName || 'School Timetable'}
            </h1>
            <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
              {data.academicYear || 'Academic Year'} · {data.classes.length} classes · {data.teachers.length} teachers · {data.periods.length} periods
            </p>
          </div>
        </div>

        {/* Search box filtering both lists live */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search class or teacher"
            className="w-full pl-10 pr-9 py-2.5 bg-stone-50 dark:bg-stone-800/70 border border-stone-200 dark:border-stone-700/80 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 dark:focus:ring-emerald-500 text-stone-900 dark:text-stone-100 transition placeholder:text-stone-400"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-1 rounded-full transition"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ---------------- B) SCHOOL TIMINGS CARD ---------------- */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-xl">
              <Clock className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">School Timings</h2>
          </div>

          {/* 2) VIEW PAGE TIMINGS STRIP TOGGLE: "Normal" | "Friday" */}
          {/* Shown only if Friday timings are enabled and at least one period differs */}
          {showStripToggle && (
            <div className="inline-flex items-center gap-1 p-0.5 bg-stone-100 dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setStripTimingMode('normal')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  stripTimingMode === 'normal'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                }`}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => setStripTimingMode('friday')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  stripTimingMode === 'friday'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                }`}
              >
                {timings.fridayDayName}
              </button>
            </div>
          )}
        </div>

        {/* Assembly tile if Friday mode and assemblyTime set (above first group, not tappable) */}
        {stripTimingMode === 'friday' && timings.assemblyTime && (
          <div className="w-full py-2.5 px-4 bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700/80 rounded-2xl text-center select-none shadow-2xs">
            <span className="text-xs font-bold text-stone-800 dark:text-stone-200">
              Assembly
            </span>
            <span className="text-xs font-medium text-stone-500 dark:text-stone-400 ml-1.5">
              · {timings.assemblyTime}
            </span>
          </div>
        )}

        {/* Timings 2-Column Grid (Group 1, Break Line if set, Group 2) */}
        <div className="space-y-3">
          {renderPeriodGrid(timingsLayout.group1)}

          {timingsLayout.hasBreak && (
            <div
              className="w-full py-2.5 px-4 rounded-xl border border-dashed border-amber-300 dark:border-amber-800/80 bg-amber-50/50 dark:bg-amber-950/20 text-center select-none shadow-2xs relative overflow-hidden"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(45deg, rgba(217, 119, 6, 0.08), rgba(217, 119, 6, 0.08) 6px, transparent 6px, transparent 12px)'
              }}
            >
              <span className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                {timingsLayout.breakText}
              </span>
            </div>
          )}

          {timingsLayout.hasBreak && timingsLayout.group2.length > 0 && (
            renderPeriodGrid(timingsLayout.group2)
          )}
        </div>

        {/* Small hint & notes under the grid */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-100 dark:border-stone-800 text-xs text-stone-500 dark:text-stone-400">
          <div className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Tap a period to see who teaches each class.</span>
          </div>

          {/* Friday note if Friday mode and note is not empty */}
          {stripTimingMode === 'friday' && timings.fridayNote && (
            <span className="text-stone-600 dark:text-stone-300 font-medium">
              {timings.fridayNote}
            </span>
          )}
        </div>
      </div>

      {/* ---------------- C) CLASSES CARD ---------------- */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-xl">
              <span className="text-xs font-bold px-0.5">Cl</span>
            </div>
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">Classes</h2>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-stone-700">
            {filteredClasses.length} of {data.classes.length}
          </span>
        </div>

        {/* Classes grouped by Section */}
        {filteredClasses.length === 0 ? (
          <div className="text-center py-10 text-stone-400 dark:text-stone-500 text-sm">
            No classes found matching "{search}"
          </div>
        ) : (
          <div className="space-y-6">
            {sectionsGrouped.map((section) => (
              <div key={section.name} className="space-y-3">
                {/* Centred label with lines on both sides */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-stone-200 dark:bg-stone-800" />
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 px-1">
                    {section.name} {section.isOther ? '' : 'SECTION'}
                  </span>
                  <div className="flex-1 h-px bg-stone-200 dark:bg-stone-800" />
                </div>

                {/* Class tiles (equal width grid, text wrapping) */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {section.classes.map((cls) => {
                    const cName = cls[0];
                    const incharge = cls[1];
                    return (
                      <button
                        key={cName}
                        type="button"
                        onClick={() => openClassPopup(cName)}
                        className="p-3.5 text-left rounded-2xl bg-stone-50 dark:bg-stone-800/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-stone-200 dark:border-stone-700/80 hover:border-emerald-500/60 transition group cursor-pointer flex flex-col justify-between shadow-2xs space-y-2 active:scale-98 min-h-[76px]"
                      >
                        <div className="font-bold text-sm text-stone-900 dark:text-stone-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition break-words">
                          {cName}
                        </div>
                        <div className="text-xs text-stone-500 dark:text-stone-400 font-medium break-words">
                          Incharge: {incharge || '—'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------------- D) TEACHERS CARD ---------------- */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-xl">
              <span className="text-xs font-bold px-0.5">Tr</span>
            </div>
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">Teachers</h2>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-stone-700">
            {filteredTeachers.length} of {baseTeachers.length}
          </span>
        </div>

        {filteredTeachers.length === 0 ? (
          <div className="text-center py-10 text-stone-400 dark:text-stone-500 text-sm">
            No teachers found matching "{search}"
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredTeachers.map((t) => {
              const info = data.teacherInfo[t] || { qual: '', rank: '', desig: '' };
              const teachingCount = data.periods.filter(
                (_, pi) => teacherPeriodSummary(t, pi) !== 'Free'
              ).length;
              const totalPeriods = data.periods.length;
              const subLabel = info.qual || info.rank || '';

              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => openTeacherPopup(t)}
                  className="p-3.5 text-left rounded-2xl bg-stone-50 dark:bg-stone-800/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-stone-200 dark:border-stone-700/80 hover:border-emerald-500/60 transition group cursor-pointer flex flex-col justify-between shadow-2xs space-y-2.5 active:scale-98 min-h-[76px]"
                >
                  <div className="flex items-start justify-between gap-1.5 w-full">
                    <div className="font-bold text-sm text-stone-900 dark:text-stone-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition break-words">
                      {t}
                    </div>
                    {subLabel && (
                      <span className="text-[10px] font-semibold text-stone-500 dark:text-stone-400 px-1.5 py-0.5 rounded-md bg-stone-100 dark:bg-stone-700/60 shrink-0 break-words max-w-[45%] text-right">
                        {subLabel}
                      </span>
                    )}
                  </div>

                  <div className="w-full space-y-1.5">
                    <div className="text-xs text-stone-500 dark:text-stone-400 font-medium">
                      {teachingCount} of {totalPeriods} periods
                    </div>

                    {/* Row of P small bars: green if teaching, grey if free */}
                    <div className="flex items-center gap-1 h-1.5 w-full">
                      {data.periods.map((_, pi) => {
                        const isTeaching = teacherPeriodSummary(t, pi) !== 'Free';
                        return (
                          <div
                            key={pi}
                            className={`flex-1 h-full rounded-full transition-colors ${
                              isTeaching
                                ? 'bg-emerald-600 dark:bg-emerald-500'
                                : 'bg-stone-200 dark:bg-stone-700'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ---------------- 2) POPUP OVERLAY ---------------- */}
      {popupItem && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) closePopup();
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
        >
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-xl max-h-[calc(100vh-2rem)] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            {/* POPUP HEADER */}
            <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3 shrink-0 bg-white dark:bg-stone-900">
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Back button if navigated from a chip */}
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="p-1.5 -ml-1 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full transition cursor-pointer"
                    title="Back"
                    aria-label="Back"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                )}

                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100 truncate">
                    {popupItem.type === 'class'
                      ? `Class ${popupItem.id}`
                      : popupItem.type === 'teacher'
                      ? String(popupItem.id)
                      : `Period ${popupItem.id}`}
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                    {popupItem.type === 'class' ? (
                      <>
                        Incharge: {data.classes.find(c => c[0] === popupItem.id)?.[1] || '—'} ·{' '}
                        {currentIndex >= 0 ? currentIndex + 1 : 1} of {filteredClasses.length}
                      </>
                    ) : popupItem.type === 'teacher' ? (
                      <>
                        {data.teacherInfo[String(popupItem.id)]?.qual || data.teacherInfo[String(popupItem.id)]?.rank || 'Staff'} ·{' '}
                        {data.periods.length - teacherFreePeriods} of {data.periods.length} periods ·{' '}
                        {currentIndex >= 0 ? currentIndex + 1 : 1} of {filteredTeachers.length}
                      </>
                    ) : (
                      (() => {
                        const pNum = typeof popupItem.id === 'number' ? popupItem.id : Number(popupItem.id);
                        const pIdx = Math.max(0, data.periods.indexOf(pNum));
                        const curItem = timings.periods[pIdx] || timings.periods[0];
                        let pTime = curItem.normal || '—';
                        if (curItem.friday !== null) {
                          pTime = `${curItem.normal || '—'} / ${curItem.friday}`;
                        }
                        return `${pTime} · ${pIdx + 1} of ${data.periods.length} · ${relatedChips.length} free`;
                      })()
                    )}
                  </p>
                </div>
              </div>

              {/* Close X Button */}
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closePopup}
                className="p-2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* OPTIONAL AMBER NOTICE BAR (Teachers free in 4+ periods) */}
            {popupItem.type === 'teacher' && teacherFreePeriods >= 4 && (
              <div className="px-5 py-2.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60 flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300 shrink-0">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>Free in {teacherFreePeriods} of {data.periods.length} periods.</span>
              </div>
            )}

            {/* SCROLLABLE BODY */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col items-center">
              {/* Scaled A4 card preview container */}
              <div
                ref={previewContainerRef}
                className="w-full flex items-center justify-center overflow-hidden py-2 min-h-[300px]"
              >
                <div
                  className="bg-white rounded-lg shadow-md border border-stone-200 dark:border-stone-700 origin-top relative shrink-0 overflow-hidden"
                  style={{
                    width: `${794 * previewScale}px`,
                    height: `${1123 * previewScale}px`,
                    transform: `scale(1)`
                  }}
                >
                  <iframe
                    ref={iframeRef}
                    title="Card Preview"
                    srcDoc={iframeDocHtml}
                    className="border-0 pointer-events-none select-none origin-top-left absolute top-0 left-0 max-w-none shrink-0"
                    style={{
                      width: '794px',
                      height: '1123px',
                      transform: `scale(${previewScale})`,
                      transformOrigin: 'top left'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* RELATED CHIPS BAR */}
            {relatedChips.length > 0 && (
              <div className="px-4 sm:px-5 py-2.5 border-t border-stone-100 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-900/60 shrink-0">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  <span className="text-[11px] font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider shrink-0 mr-1">
                    {popupItem.type === 'class' ? 'Teachers:' : popupItem.type === 'teacher' ? 'Classes:' : 'Free staff:'}
                  </span>
                  {relatedChips.map(chip => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => {
                        if (chip.type === 'teacher') navigateToTeacher(String(chip.id));
                        else navigateToClass(String(chip.id));
                      }}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 hover:border-emerald-600 hover:text-emerald-700 dark:hover:text-emerald-400 transition shrink-0 cursor-pointer shadow-2xs"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* POPUP FOOTER ACTIONS & NAV */}
            <div className="px-5 py-3.5 border-t border-stone-200 dark:border-stone-800 flex flex-col items-center gap-2.5 shrink-0 bg-white dark:bg-stone-900">
              {/* Action Buttons: Print, Image, Share */}
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={isPrinting}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                >
                  {isPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                  <span>Print</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveImage}
                  disabled={isSavingImage}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                >
                  {isSavingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                  <span>Image</span>
                </button>

                <button
                  type="button"
                  onClick={handleShare}
                  disabled={isSharing}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold transition cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isSharing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
                  <span>Share</span>
                </button>
              </div>
              {/* Prev / Next items */}
              <div className="flex items-center justify-center gap-6">
                <button
                  type="button"
                  onClick={() => prevItem && setPopupItem(prevItem)}
                  disabled={!prevItem}
                  className="p-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                  title="Previous (Left Arrow)"
                  aria-label="Previous item"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => nextItem && setPopupItem(nextItem)}
                  disabled={!nextItem}
                  className="p-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                  title="Next (Right Arrow)"
                  aria-label="Next item"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-60 px-4 py-2 bg-stone-900 text-white text-xs font-semibold rounded-full shadow-lg border border-stone-700 animate-in fade-in slide-in-from-bottom-2 duration-150">
          {toast}
        </div>
      )}
    </div>
  );
};