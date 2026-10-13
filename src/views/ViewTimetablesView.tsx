import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useTimetable } from '../context/TimetableContext';
import {
  buildClassCardHTML,
  buildTeacherCardHTML,
  buildPeriodCardHTML,
  buildCardDocumentHTML,
  getPeriodTimes,
  getFreeTeachersForPeriod,
  hasDifferingFridayTimings,
  TimingMode,
  PeriodTimingItem
} from '../utils/printEngine';
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

// Session-level memory for timing mode choice
let sessionTimingMode: TimingMode = 'both';

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

  // Check if Friday timings differ from Normal
  const showTimingSwitch = useMemo(() => {
    return hasDifferingFridayTimings(data);
  }, [data]);

  // Timing switch: Normal | Friday | Both (session only, default Both when differing Friday timings exist)
  const [timingMode, setTimingModeState] = useState<TimingMode>(() => {
    if (hasDifferingFridayTimings(data)) {
      return sessionTimingMode;
    }
    return 'normal';
  });

  const handleSetTimingMode = useCallback((mode: TimingMode) => {
    sessionTimingMode = mode;
    setTimingModeState(mode);
  }, []);

  const timingsResult = useMemo(() => {
    return getPeriodTimes(data, timingMode);
  }, [data, timingMode]);

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

  // Break and Period groupings for School Timings grid
  const timingsLayout = useMemo(() => {
    const ft = data.fridayTimings;
    const isFriday = timingMode === 'friday';
    const isBoth = timingMode === 'both';

    let breakAfter = data.breakAfter;
    let breakLabel = 'Break';
    let breakTime = '';

    const nbStart = data.periodTimes?.[data.breakAfter - 1]?.end;
    const nbEnd = data.periodTimes?.[data.breakAfter]?.start;
    const normalBreakTime = (nbStart || nbEnd) ? `${nbStart || '—'} - ${nbEnd || '—'}` : '';

    if (isFriday) {
      if (ft && ft.breakAfter && ft.breakAfter > 0) {
        breakAfter = ft.breakAfter;
      }
      breakLabel = ft?.breakLabel || 'Break';
      const fbStart = ft?.periodTimes?.[breakAfter - 1]?.end;
      const fbEnd = ft?.periodTimes?.[breakAfter]?.start;
      breakTime = (fbStart || fbEnd) ? `${fbStart || '—'} - ${fbEnd || '—'}` : normalBreakTime;
    } else if (isBoth) {
      breakAfter = data.breakAfter;
      breakLabel = 'Break';
      const fbStart = ft?.periodTimes?.[data.breakAfter - 1]?.end;
      const fbEnd = ft?.periodTimes?.[data.breakAfter]?.start;
      const fridayBreakTime = (fbStart || fbEnd) ? `${fbStart || '—'} - ${fbEnd || '—'}` : '';
      if (normalBreakTime && fridayBreakTime && normalBreakTime !== fridayBreakTime) {
        breakTime = `${normalBreakTime} · ${timingsResult.dayShort} ${fridayBreakTime}`;
      } else {
        breakTime = normalBreakTime;
      }
    } else {
      breakAfter = data.breakAfter;
      breakLabel = 'Break';
      breakTime = normalBreakTime;
    }

    // A break is valid if breakAfter is within 1 and periods.length - 1
    const bIdx = data.periods.indexOf(breakAfter);
    const hasBreak = breakAfter > 0 && bIdx >= 0 && bIdx < data.periods.length - 1;

    let group1: PeriodTimingItem[] = [];
    let group2: PeriodTimingItem[] = [];

    if (hasBreak) {
      group1 = timingsResult.periods.slice(0, bIdx + 1);
      group2 = timingsResult.periods.slice(bIdx + 1);
    } else {
      group1 = timingsResult.periods;
      group2 = [];
    }

    const breakText = breakTime ? `${breakLabel.toUpperCase()} · ${breakTime}` : breakLabel.toUpperCase();

    return {
      hasBreak,
      breakText,
      group1,
      group2
    };
  }, [data, timingMode, timingsResult]);

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

  // Navigate to class chip from teacher/period popup
  const navigateToClass = (cName: string) => {
    if (popupItem) {
      setHistory(prev => [...prev, popupItem]);
    }
    setPopupItem({ type: 'class', id: cName });
  };

  // Navigate to period chip
  const navigateToPeriod = (pNum: number) => {
    if (popupItem) {
      setHistory(prev => [...prev, popupItem]);
    }
    setPopupItem({ type: 'period', id: pNum });
  };

  // Back button in popup
  const handleBack = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setPopupItem(prev);
  };

  // Current item list navigation for popup chevrons
  const currentList = useMemo(() => {
    if (!popupItem) return [];
    if (popupItem.type === 'class') {
      return filteredClasses.map(c => c[0]);
    }
    if (popupItem.type === 'teacher') {
      return filteredTeachers;
    }
    return data.periods;
  }, [popupItem, filteredClasses, filteredTeachers, data.periods]);

  const currentIndex = useMemo(() => {
    if (!popupItem) return -1;
    if (popupItem.type === 'period') {
      const pNum = typeof popupItem.id === 'number' ? popupItem.id : Number(popupItem.id);
      return (currentList as number[]).indexOf(pNum);
    }
    return (currentList as string[]).indexOf(String(popupItem.id));
  }, [popupItem, currentList]);

  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex >= 0 && currentIndex < currentList.length - 1;

  const handlePrev = useCallback(() => {
    if (!canGoPrev || !popupItem) return;
    const prevId = currentList[currentIndex - 1];
    setPopupItem({ type: popupItem.type, id: prevId });
  }, [canGoPrev, popupItem, currentList, currentIndex]);

  const handleNext = useCallback(() => {
    if (!canGoNext || !popupItem) return;
    const nextId = currentList[currentIndex + 1];
    setPopupItem({ type: popupItem.type, id: nextId });
  }, [canGoNext, popupItem, currentList, currentIndex]);

  // Keyboard navigation: Esc to close, Left/Right arrow for prev/next
  useEffect(() => {
    if (!popupItem) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePopup();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [popupItem, closePopup, handlePrev, handleNext]);

  // Focus trap / restore
  useEffect(() => {
    if (popupItem) {
      setTimeout(() => closeButtonRef.current?.focus(), 60);
    } else {
      if (lastFocusedElementRef.current && typeof lastFocusedElementRef.current.focus === 'function') {
        lastFocusedElementRef.current.focus();
      }
    }
  }, [popupItem]);

  // Scaled A4 preview calculation via ResizeObserver
  useEffect(() => {
    if (!popupItem) return;
    const container = previewContainerRef.current;
    if (!container) return;

    const updateScale = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width && height) {
        // A4 page width = 794px, height = 1123px
        const padX = width < 480 ? 12 : 24;
        const padY = 16;
        const availableW = Math.max(120, width - padX);
        const availableH = Math.max(160, height - padY);
        const scaleW = availableW / 794;
        const scaleH = availableH / 1123;
        setPreviewScale(Math.min(scaleW, scaleH, 1.0));
      }
    };

    updateScale();
    const observer = new ResizeObserver(() => updateScale());
    observer.observe(container);
    return () => observer.disconnect();
  }, [popupItem]);

  // Active item's card HTML
  const cardHtml = useMemo(() => {
    if (!popupItem) return '';
    if (popupItem.type === 'class') {
      return buildClassCardHTML(data, String(popupItem.id), { timingMode });
    }
    if (popupItem.type === 'teacher') {
      return buildTeacherCardHTML(data, String(popupItem.id), teacherPeriodSummary, { timingMode });
    }
    // Period card
    const periodNum = typeof popupItem.id === 'number' ? popupItem.id : Number(popupItem.id);
    const targetDayIdx = timingMode === 'friday' && data.fridayTimings ? data.fridayTimings.dayIndex : undefined;
    return buildPeriodCardHTML(data, periodNum, {
      timingMode,
      getLeavesForDate,
      getTeacherTotalPeriods,
      targetDayIdx
    });
  }, [popupItem, data, timingMode, teacherPeriodSummary, getLeavesForDate, getTeacherTotalPeriods]);

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
    const targetDayIdx = timingMode === 'friday' && data.fridayTimings ? data.fridayTimings.dayIndex : undefined;
    const freeStaff = getFreeTeachersForPeriod(data, pIdx, {
      getLeavesForDate,
      getTeacherTotalPeriods,
      targetDayIdx
    });
    return freeStaff.map(t => ({ label: t, type: 'teacher' as const, id: t }));
  }, [popupItem, data, teacherPeriodSummary, timingMode, getLeavesForDate, getTeacherTotalPeriods]);

  // Actions: Print, Save Image, Share
  const handlePrint = () => {
    if (!popupItem || !cardHtml) return;
    setIsPrinting(true);
    try {
      triggerPrint(cardHtml, { orientation: 'portrait', margin: '4mm' });
      showToast('Printing...');
    } catch (err) {
      console.error('Print error:', err);
      showToast('Failed to print.');
    } finally {
      setIsPrinting(false);
    }
  };

  const generateImageBlob = async (): Promise<Blob | null> => {
    const iframe = iframeRef.current;
    if (!iframe) return null;
    const doc = iframe.contentDocument;
    if (!doc) return null;

    const serializer = new XMLSerializer();
    let contentXml = serializer.serializeToString(doc.body);
    contentXml = contentXml
      .replace(/^<body[^>]*>/i, '<div xmlns="http://www.w3.org/1999/xhtml" style="width:794px; height:1123px; margin:0; padding:0; background:#fff; box-sizing:border-box;">')
      .replace(/<\/body>$/i, '</div>');

    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123"><foreignObject width="100%" height="100%">${contentXml}</foreignObject></svg>`;

    return new Promise<Blob | null>((resolve) => {
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 794 * 2;
        canvas.height = 1123 * 2;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.scale(2, 2);
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

  // Render a period tile
  const renderPeriodTile = (item: PeriodTimingItem) => (
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
      {timingMode === 'both' ? (
        <div className="mt-1 flex flex-col items-center leading-tight text-center">
          {item.normalTime && (
            <span className="text-xs font-medium text-stone-600 dark:text-stone-300 break-words">
              {item.normalTime}
            </span>
          )}
          {item.fridayTime && (
            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 break-words mt-0.5">
              {timingsResult.dayShort} {item.fridayTime}
            </span>
          )}
          {!item.normalTime && !item.fridayTime && (
            <span className="text-xs text-stone-400 dark:text-stone-500">
              —
            </span>
          )}
        </div>
      ) : (
        <div className="mt-1 text-center">
          <span className="text-xs font-medium text-stone-500 dark:text-stone-400 break-words">
            {item.displayTime || '—'}
          </span>
        </div>
      )}
    </button>
  );

  // Render a group of period tiles in a 2-column grid, with odd tile centered at same column width
  const renderPeriodGrid = (items: PeriodTimingItem[]) => {
    if (items.length === 0) return null;

    const rows: PeriodTimingItem[][] = [];
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

          {/* 1) TIMING SWITCH: Normal | Friday | Both (Shown only if Friday timings differ from Normal) */}
          {showTimingSwitch && (
            <div className="inline-flex items-center gap-1 p-0.5 bg-stone-100 dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => handleSetTimingMode('normal')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  timingMode === 'normal'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                }`}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => handleSetTimingMode('friday')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  timingMode === 'friday'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                }`}
              >
                {timingsResult.dayName}
              </button>
              <button
                type="button"
                onClick={() => handleSetTimingMode('both')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  timingMode === 'both'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                }`}
              >
                Both
              </button>
            </div>
          )}
        </div>

        {/* Assembly tile if Friday mode and assemblyTime set (above first group, not tappable) */}
        {timingMode === 'friday' && timingsResult.assemblyTimeText && (
          <div className="w-full py-2.5 px-4 bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700/80 rounded-2xl text-center select-none shadow-2xs">
            <span className="text-xs font-bold text-stone-800 dark:text-stone-200">
              Assembly
            </span>
            <span className="text-xs font-medium text-stone-500 dark:text-stone-400 ml-1.5">
              · {timingsResult.assemblyTimeText}
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
          {timingMode === 'friday' && timingsResult.note && (
            <span className="text-stone-600 dark:text-stone-300 font-medium">
              {timingsResult.note}
            </span>
          )}

          {/* Differing break note if Both mode */}
          {timingMode === 'both' && timingsResult.differingBreakNote && (
            <span className="text-amber-700 dark:text-amber-300 font-medium">
              * {timingsResult.differingBreakNote}
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

        {filteredClasses.length === 0 ? (
          <div className="py-10 text-center text-stone-400 dark:text-stone-500 text-sm">
            No classes found matching "{search}"
          </div>
        ) : (
          <div className="space-y-5">
            {sectionsGrouped.map((sec) => (
              <div key={sec.name} className="space-y-3">
                {/* Centered label with horizontal lines */}
                <div className="flex items-center gap-3 my-2">
                  <div className="flex-1 h-px bg-stone-200 dark:bg-stone-800" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 px-1">
                    {sec.isOther ? 'OTHER CLASSES' : `${sec.name.toUpperCase()} SECTION`}
                  </span>
                  <div className="flex-1 h-px bg-stone-200 dark:bg-stone-800" />
                </div>

                {/* Grid of class tiles with wrapping class and incharge names */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {sec.classes.map((c) => (
                    <button
                      key={c[0]}
                      type="button"
                      onClick={() => openClassPopup(c[0])}
                      className="p-3 sm:p-3.5 text-left rounded-2xl bg-stone-50 dark:bg-stone-800/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-stone-200 dark:border-stone-700/80 hover:border-emerald-500/60 transition group cursor-pointer flex flex-col justify-between shadow-2xs active:scale-98 min-h-[72px]"
                    >
                      <div className="font-bold text-sm text-stone-900 dark:text-stone-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition break-words">
                        {c[0]}
                      </div>
                      <div className="text-xs text-stone-500 dark:text-stone-400 mt-1 break-words">
                        Incharge: {c[1] || '—'}
                      </div>
                    </button>
                  ))}
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
          <div className="py-10 text-center text-stone-400 dark:text-stone-500 text-sm">
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
                        const curItem = timingsResult.periods[pIdx] || timingsResult.periods[0];
                        let pTime = curItem.displayTime || '—';
                        if (timingMode === 'both') {
                          pTime = `${curItem.normalTime || '—'} / ${timingsResult.dayShort} ${curItem.fridayTime || '—'}`;
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

            {/* TIMING SWITCH INSIDE POPUP: Normal | Friday | Both */}
            {showTimingSwitch && (
              <div className="px-5 py-2 bg-stone-50/90 dark:bg-stone-900/80 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-2 shrink-0">
                <span className="text-xs font-semibold text-stone-500 dark:text-stone-400">Timings:</span>
                <div className="flex items-center gap-1 p-0.5 bg-stone-100 dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700">
                  <button
                    type="button"
                    onClick={() => handleSetTimingMode('normal')}
                    className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      timingMode === 'normal'
                        ? 'bg-emerald-800 text-white shadow-xs'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                    }`}
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetTimingMode('friday')}
                    className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      timingMode === 'friday'
                        ? 'bg-emerald-800 text-white shadow-xs'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                    }`}
                  >
                    {timingsResult.dayName}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetTimingMode('both')}
                    className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      timingMode === 'both'
                        ? 'bg-emerald-800 text-white shadow-xs'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                    }`}
                  >
                    Both
                  </button>
                </div>
              </div>
            )}

            {/* OPTIONAL AMBER NOTICE BAR (Teacher free in >= 4 periods) */}
            {popupItem.type === 'teacher' && teacherFreePeriods >= 4 && (
              <div className="px-5 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/50 flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200 shrink-0">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Free in {teacherFreePeriods} of {data.periods.length} periods
                </span>
              </div>
            )}

            {/* HORIZONTAL CHIP BAR */}
            {relatedChips.length > 0 && (
              <div className="px-5 py-2.5 border-b border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400 shrink-0">
                  {popupItem.type === 'class' ? 'Teachers:' : popupItem.type === 'teacher' ? 'Classes:' : 'Free Staff:'}
                </span>
                {relatedChips.map((chip, idx) => (
                  <button
                    key={`${chip.type}-${chip.id}-${idx}`}
                    type="button"
                    onClick={() => {
                      if (chip.type === 'teacher') navigateToTeacher(chip.id);
                      else navigateToClass(chip.id);
                    }}
                    className="shrink-0 px-2.5 py-1 rounded-full text-xs font-medium bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-500/60 transition cursor-pointer shadow-2xs"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

            {/* PREVIEW AREA (Scaled A4 portrait page inside iframe) */}
            <div
              ref={previewContainerRef}
              className="relative flex-1 bg-stone-100 dark:bg-stone-950 overflow-hidden flex items-center justify-center p-2 sm:p-4 min-h-[360px]"
            >
              {/* Circular Chevron Left Button */}
              <button
                type="button"
                onClick={handlePrev}
                disabled={!canGoPrev}
                aria-label="Previous item"
                className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 shadow-md flex items-center justify-center hover:bg-stone-50 dark:hover:bg-stone-800 transition active:scale-95 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              {/* Scaled A4 iframe container */}
              <div
                style={{
                  width: `${794 * previewScale}px`,
                  height: `${1123 * previewScale}px`,
                  transition: 'width 0.15s ease-out, height 0.15s ease-out'
                }}
                className="relative shadow-xl rounded-md overflow-hidden bg-white shrink-0"
              >
                <iframe
                  ref={iframeRef}
                  srcDoc={iframeDocHtml}
                  title="Card Preview"
                  tabIndex={-1}
                  className="border-0 pointer-events-none select-none bg-white origin-top-left"
                  style={{
                    width: '794px',
                    height: '1123px',
                    transform: `scale(${previewScale})`,
                    transformOrigin: '0 0'
                  }}
                />
              </div>

              {/* Circular Chevron Right Button */}
              <button
                type="button"
                onClick={handleNext}
                disabled={!canGoNext}
                aria-label="Next item"
                className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 shadow-md flex items-center justify-center hover:bg-stone-50 dark:hover:bg-stone-800 transition active:scale-95 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              {/* Toast message inside dialog */}
              {toast && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 bg-stone-900/90 text-white dark:bg-stone-100 dark:text-stone-900 rounded-full text-xs font-semibold shadow-lg pointer-events-none transition-all">
                  {toast}
                </div>
              )}
            </div>

            {/* POPUP FOOTER (Three round 48px icon buttons) */}
            <div className="p-3.5 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 flex items-center justify-center gap-5 shrink-0">
              {/* Print Button */}
              <button
                type="button"
                onClick={handlePrint}
                disabled={isPrinting}
                className="w-12 h-12 rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 hover:bg-emerald-50 hover:border-emerald-500/60 dark:hover:bg-emerald-950/40 text-stone-800 dark:text-stone-100 shadow-xs flex items-center justify-center transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                title="Print"
                aria-label="Print"
              >
                {isPrinting ? (
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                ) : (
                  <Printer className="w-5 h-5" />
                )}
              </button>

              {/* Save as Image Button */}
              <button
                type="button"
                onClick={handleSaveImage}
                disabled={isSavingImage}
                className="w-12 h-12 rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 hover:bg-emerald-50 hover:border-emerald-500/60 dark:hover:bg-emerald-950/40 text-stone-800 dark:text-stone-100 shadow-xs flex items-center justify-center transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                title="Save as image"
                aria-label="Save as image"
              >
                {isSavingImage ? (
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                ) : (
                  <ImageIcon className="w-5 h-5" />
                )}
              </button>

              {/* Share Button */}
              <button
                type="button"
                onClick={handleShare}
                disabled={isSharing}
                className="w-12 h-12 rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 hover:bg-emerald-50 hover:border-emerald-500/60 dark:hover:bg-emerald-950/40 text-stone-800 dark:text-stone-100 shadow-xs flex items-center justify-center transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                title="Share"
                aria-label="Share"
              >
                {isSharing ? (
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                ) : (
                  <Share2 className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};