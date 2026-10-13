import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTimetable } from '../context/TimetableContext';
import {
  computePrintStudioPages,
  findBestFitFontSize,
  buildPrintableHtml,
  PageLayoutOptions,
  A4_LANDSCAPE,
  A4_PORTRAIT,
  HATCHED_BG,
  MARGIN_PX
} from '../utils/printEngine';
import { esc } from '../utils/printHtml';
import {
  Printer,
  Maximize2,
  Minimize2,
  RotateCcw,
  Sliders,
  CheckSquare,
  Square,
  Layers,
  Sparkles,
  Info,
  ChevronDown,
  AlertTriangle
} from 'lucide-react';

export const PrintStudioView: React.FC = () => {
  const { data, updateData, teacherPeriodSummary, getTeacherTotalPeriods } = useTimetable();

  // Settings state (with persistence into TimetableData)
  const [type, setType] = useState<'whole' | 'allteachers' | 'class' | 'teacher' | 'roster'>('whole');
  const [selectedClass, setSelectedClass] = useState<string>(data.classes[0]?.[0] || '');
  const [selectedTeacher, setSelectedTeacher] = useState<string>(data.teachers[0] || '');

  const [fontPt, setFontPt] = useState<number>(() => data.printFontPt || 7.5);
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>(() => data.printOrientation || 'landscape');
  const [showTimes, setShowTimes] = useState<boolean>(() => data.printTimes ?? false);
  const [showBreakCol, setShowBreakCol] = useState<boolean>(() => data.printBreakCol ?? true);
  const [oneSectionPerPage, setOneSectionPerPage] = useState<boolean>(false);

  // Safety reduction & layout error checking
  const [safetyReductionPx, setSafetyReductionPx] = useState<number>(0);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const safetyAttemptRef = useRef<number>(0);
  const [measureKey, setMeasureKey] = useState<number>(0);
  const pageInnerRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Preview container scale state
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState<number>(0.85);

  // Re-measure when custom fonts or logo image load (Requirement 7)
  useEffect(() => {
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        setMeasureKey(k => k + 1);
      });
    }
  }, []);

  useEffect(() => {
    if (data.schoolLogo) {
      const img = new Image();
      img.src = data.schoolLogo;
      img.onload = () => setMeasureKey(k => k + 1);
      img.onerror = () => setMeasureKey(k => k + 1);
    }
  }, [data.schoolLogo]);

  // Sync settings into global TimetableData for persistence
  const persistChanges = (partial: {
    printFontPt?: number;
    printOrientation?: 'landscape' | 'portrait';
    printTimes?: boolean;
    printBreakCol?: boolean;
  }) => {
    updateData(prev => ({ ...prev, ...partial }), true);
  };

  const resetSafetyState = () => {
    safetyAttemptRef.current = 0;
    setSafetyReductionPx(0);
    setLayoutError(null);
  };

  const handleFontChange = (val: number) => {
    resetSafetyState();
    setFontPt(val);
    persistChanges({ printFontPt: val });
  };

  const handleOrientationChange = (o: 'landscape' | 'portrait') => {
    resetSafetyState();
    setOrientation(o);
    persistChanges({ printOrientation: o });
  };

  const handleTypeChange = (t: 'whole' | 'allteachers' | 'class' | 'teacher' | 'roster') => {
    resetSafetyState();
    setType(t);
    // Teacher wise is portrait by default
    if (t === 'teacher') {
      setOrientation('portrait');
      persistChanges({ printOrientation: 'portrait' });
    }
  };

  const handleClassChange = (c: string) => {
    resetSafetyState();
    setSelectedClass(c);
  };

  const handleTeacherChange = (t: string) => {
    resetSafetyState();
    setSelectedTeacher(t);
  };

  const handleToggleTimes = () => {
    resetSafetyState();
    const next = !showTimes;
    setShowTimes(next);
    persistChanges({ printTimes: next });
  };

  const handleToggleBreak = () => {
    resetSafetyState();
    const next = !showBreakCol;
    setShowBreakCol(next);
    persistChanges({ printBreakCol: next });
  };

  const handleToggleOneSectionPerPage = () => {
    resetSafetyState();
    setOneSectionPerPage(prev => !prev);
  };

  // Layout calculations
  const layoutOpts: PageLayoutOptions = useMemo(() => ({
    type,
    selectedClass,
    selectedTeacher,
    fontPt,
    orientation,
    showTimes,
    showBreakCol,
    oneSectionPerPage,
    teacherPeriodSummary,
    getTeacherTotalPeriods,
    safetyReductionPx
  }), [type, selectedClass, selectedTeacher, fontPt, orientation, showTimes, showBreakCol, oneSectionPerPage, teacherPeriodSummary, getTeacherTotalPeriods, safetyReductionPx]);

  const layoutResult = useMemo(() => {
    return computePrintStudioPages(data, layoutOpts);
  }, [data, layoutOpts, measureKey]);

  // Fit to 1 page or Fit to 2 pages handlers
  const handleAutoFit = (targetPages: number) => {
    resetSafetyState();
    const bestPt = findBestFitFontSize(data, {
      type,
      selectedClass,
      selectedTeacher,
      orientation,
      showTimes,
      showBreakCol,
      oneSectionPerPage,
      teacherPeriodSummary,
      getTeacherTotalPeriods
    }, targetPages);
    handleFontChange(bestPt);
  };

  // Adjust preview scaling to fit the right pane / screen width
  useEffect(() => {
    const updateScale = () => {
      if (!previewContainerRef.current) return;
      const containerWidth = previewContainerRef.current.clientWidth - 32; // padding
      const targetWidth = orientation === 'landscape' ? A4_LANDSCAPE.width : A4_PORTRAIT.width;
      const calculated = Math.min(1.0, Math.max(0.28, containerWidth / targetWidth));
      setPreviewScale(calculated);
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [orientation]);

  // Direct print mechanism without --mult: matches exact generated A4 pages
  const handlePrint = () => {
    const printArea = document.getElementById('printArea');
    if (!printArea) return;

    const printableHtml = buildPrintableHtml(data, layoutResult, layoutOpts);

    // Inject dynamic @page style for A4
    const styleId = 'dynamicPrintStudioPage';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      @media print {
        @page { size: A4 ${orientation}; margin: 8mm; }
        html, body { background: #fff !important; color: #000 !important; }
        #root > div > :not(#printArea) { display: none !important; }
        #root > div { min-height: 0 !important; display: block !important; }
        #printArea { display: block !important; width: 100% !important; background: #fff !important; }
      }
    `;

    printArea.innerHTML = printableHtml;
    printArea.style.display = 'block';

    const cleanup = () => {
      printArea.innerHTML = '';
      printArea.style.display = 'none';
      window.removeEventListener('afterprint', cleanup);
      clearTimeout(fallbackTimer);
    };

    const isAndroid = !!(window.AndroidPrint && typeof window.AndroidPrint.printPage === 'function');
    const fallbackMs = isAndroid ? 60000 : 5000;
    const fallbackTimer = window.setTimeout(cleanup, fallbackMs);
    window.addEventListener('afterprint', cleanup);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          if (isAndroid) {
            window.AndroidPrint!.printPage!();
          } else {
            window.print();
          }
        } catch (err) {
          console.error('Print error:', err);
        }
      });
    });
  };

  // Status readability badge color and text
  const readabilityStatus = useMemo(() => {
    if (fontPt >= 7.0) {
      return {
        label: 'Legible & Crisp',
        color: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800'
      };
    }
    if (fontPt >= 5.5) {
      return {
        label: 'Small font (compact)',
        color: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800'
      };
    }
    return {
      label: 'Too small to read',
      color: 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800'
    };
  }, [fontPt]);

  const pageWidthPx = orientation === 'landscape' ? A4_LANDSCAPE.width : A4_PORTRAIT.width;
  const pageHeightPx = orientation === 'landscape' ? A4_LANDSCAPE.height : A4_PORTRAIT.height;

  // Post-render safety check: compare real scrollHeight with usable page height (Requirement 4)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const usableHeightPx = pageHeightPx - MARGIN_PX * 2;
    let maxOverflow = 0;

    for (let i = 0; i < layoutResult.pages.length; i++) {
      const el = pageInnerRefs.current[i];
      if (el) {
        const scrollH = el.scrollHeight;
        if (scrollH > usableHeightPx + 1.5) {
          const overflow = scrollH - usableHeightPx;
          if (overflow > maxOverflow) {
            maxOverflow = overflow;
          }
        }
      }
    }

    const totalRenderedRows = layoutResult.pages.reduce((acc, p) => acc + (p.rowCount || 0), 0);
    const rowsMismatch = totalRenderedRows !== layoutResult.totalExpectedRows;

    if (maxOverflow > 0) {
      if (safetyAttemptRef.current < 5) {
        safetyAttemptRef.current += 1;
        const increment = Math.max(8, Math.ceil(maxOverflow) + 4);
        setSafetyReductionPx(prev => prev + increment);
        return;
      } else {
        setLayoutError('Some rows do not fit, reduce the size');
        return;
      }
    }

    if (rowsMismatch) {
      setLayoutError('Some rows do not fit, reduce the size');
      return;
    }

    // All rows fit cleanly with no overflow
    setLayoutError(null);
  }, [layoutResult, pageHeightPx]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      {/* ---------------- LEFT PANE: CONTROLS ---------------- */}
      <div className="w-full lg:w-80 shrink-0 space-y-4">
        {/* Main Card */}
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-5 shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-xl">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">Print Studio</h2>
                <p className="text-[11px] text-stone-500">Live Paper &amp; Ruled Layout</p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 font-bold">
              A4 Only
            </span>
          </div>

          {/* Timetable Type */}
          <div>
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-2">
              Timetable Type
            </label>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-stone-100 dark:bg-stone-800 rounded-xl">
              {[
                { id: 'whole' as const, label: 'Whole School' },
                { id: 'allteachers' as const, label: 'All Teachers' },
                { id: 'class' as const, label: 'Class Wise' },
                { id: 'teacher' as const, label: 'Teacher Wise' },
                { id: 'roster' as const, label: 'Teachers Roster' },
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleTypeChange(opt.id)}
                  className={`py-2 px-2.5 rounded-lg text-xs font-bold transition text-center ${
                    type === opt.id
                      ? 'bg-white dark:bg-stone-900 text-emerald-800 dark:text-emerald-300 shadow-xs'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Target Selectors if class or teacher wise */}
            {type === 'class' && (
              <div className="mt-2.5">
                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1">
                  Select Class
                </label>
                <div className="relative">
                  <select
                    value={selectedClass}
                    onChange={(e) => handleClassChange(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl text-xs font-bold text-stone-900 dark:text-stone-100 appearance-none focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
                  >
                    {data.classes.map(c => (
                      <option key={c[0]} value={c[0]}>{c[0]} {c[1] ? `(${c[1]})` : ''}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-stone-400 absolute right-3 top-2.5 pointer-events-none" />
                </div>
              </div>
            )}

            {type === 'teacher' && (
              <div className="mt-2.5">
                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1">
                  Select Teacher
                </label>
                <div className="relative">
                  <select
                    value={selectedTeacher}
                    onChange={(e) => handleTeacherChange(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl text-xs font-bold text-stone-900 dark:text-stone-100 appearance-none focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
                  >
                    {data.teachers.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-stone-400 absolute right-3 top-2.5 pointer-events-none" />
                </div>
              </div>
            )}
          </div>

          {/* Size Slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                Text &amp; Row Size
              </label>
              <span className="text-xs font-mono font-bold text-emerald-800 dark:text-emerald-400">
                {fontPt.toFixed(2)} pt
              </span>
            </div>
            <input
              type="range"
              min={4.0}
              max={16.0}
              step={0.25}
              value={fontPt}
              onChange={(e) => handleFontChange(parseFloat(e.target.value))}
              className="w-full accent-emerald-700 cursor-pointer h-2 bg-stone-200 dark:bg-stone-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-stone-400 mt-1 font-mono">
              <span>4 pt</span>
              <span>8 pt</span>
              <span>12 pt</span>
              <span>16 pt</span>
            </div>

            {/* Auto-Fit Buttons */}
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button
                type="button"
                onClick={() => handleAutoFit(1)}
                className="py-2 px-3 bg-stone-100 dark:bg-stone-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 hover:text-emerald-800 dark:hover:text-emerald-300 text-stone-700 dark:text-stone-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-95 border border-stone-200 dark:border-stone-700"
                title="Find the largest text size that fits on 1 page"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>Fit to 1 page</span>
              </button>
              <button
                type="button"
                onClick={() => handleAutoFit(2)}
                className="py-2 px-3 bg-stone-100 dark:bg-stone-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 hover:text-emerald-800 dark:hover:text-emerald-300 text-stone-700 dark:text-stone-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-95 border border-stone-200 dark:border-stone-700"
                title="Find the largest text size that fits within 2 pages"
              >
                <Layers className="w-3.5 h-3.5 text-emerald-600" />
                <span>Fit to 2 pages</span>
              </button>
            </div>
          </div>

          {/* Orientation Toggle */}
          <div>
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-2">
              Orientation
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleOrientationChange('landscape')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border ${
                  orientation === 'landscape'
                    ? 'bg-emerald-800 dark:bg-emerald-700 text-white border-emerald-800 shadow-xs'
                    : 'bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700'
                }`}
              >
                <span className="w-4 h-3 border border-current rounded-xs inline-block" />
                <span>Landscape</span>
              </button>
              <button
                type="button"
                onClick={() => handleOrientationChange('portrait')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border ${
                  orientation === 'portrait'
                    ? 'bg-emerald-800 dark:bg-emerald-700 text-white border-emerald-800 shadow-xs'
                    : 'bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700'
                }`}
              >
                <span className="w-3 h-4 border border-current rounded-xs inline-block" />
                <span>Portrait</span>
              </button>
            </div>
          </div>

          {/* Checkboxes */}
          <div className="space-y-2.5 pt-1 border-t border-stone-100 dark:border-stone-800">
            <button
              type="button"
              onClick={handleToggleTimes}
              className="w-full flex items-center gap-2.5 text-left text-xs font-bold text-stone-700 dark:text-stone-300 py-1"
            >
              {showTimes ? (
                <CheckSquare className="w-4 h-4 text-emerald-700 shrink-0" />
              ) : (
                <Square className="w-4 h-4 text-stone-400 shrink-0" />
              )}
              <span>Show period times in header</span>
            </button>

            <button
              type="button"
              onClick={handleToggleBreak}
              className="w-full flex items-center gap-2.5 text-left text-xs font-bold text-stone-700 dark:text-stone-300 py-1"
            >
              {showBreakCol ? (
                <CheckSquare className="w-4 h-4 text-emerald-700 shrink-0" />
              ) : (
                <Square className="w-4 h-4 text-stone-400 shrink-0" />
              )}
              <span>Show hatched break column</span>
            </button>

            {type === 'whole' && (
              <button
                type="button"
                onClick={handleToggleOneSectionPerPage}
                className="w-full flex items-center gap-2.5 text-left text-xs font-bold text-stone-700 dark:text-stone-300 py-1"
              >
                {oneSectionPerPage ? (
                  <CheckSquare className="w-4 h-4 text-emerald-700 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-stone-400 shrink-0" />
                )}
                <span>One section per page</span>
              </button>
            )}
          </div>

          {/* Print Button */}
          <button
            type="button"
            onClick={handlePrint}
            disabled={!!layoutError}
            className={`w-full min-h-[46px] py-3 px-4 rounded-2xl text-sm font-bold shadow-sm transition flex items-center justify-center gap-2 ${
              layoutError
                ? 'bg-stone-300 dark:bg-stone-700 text-stone-500 dark:text-stone-400 cursor-not-allowed border border-stone-300 dark:border-stone-600'
                : 'bg-emerald-800 hover:bg-emerald-900 text-white active:scale-98 cursor-pointer'
            }`}
            title={layoutError ? 'Some rows do not fit, reduce the size before printing' : 'Print Timetable'}
          >
            <Printer className="w-4 h-4" />
            <span>Print Timetable</span>
          </button>
        </div>

        {/* Tip info card */}
        <div className="p-4 bg-stone-100 dark:bg-stone-900/60 rounded-2xl border border-stone-200 dark:border-stone-800 text-[11px] text-stone-500 leading-relaxed space-y-1">
          <div className="font-bold text-stone-700 dark:text-stone-300 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-emerald-600" />
            <span>Ink-Saving Ruled Design</span>
          </div>
          <p>
            Pure white sheet, solid black lines, serif school titles, and centered section bands. No ink-wasting color fills.
          </p>
        </div>
      </div>

      {/* ---------------- RIGHT PANE: LIVE A4 PAPER PREVIEW ---------------- */}
      <div className="flex-1 w-full min-w-0 space-y-3" ref={previewContainerRef}>
        {/* Warning bar if content overflows or rows are missing (Requirement 4) */}
        {layoutError && (
          <div className="bg-red-50 dark:bg-red-950/70 border-2 border-red-500 text-red-900 dark:text-red-200 px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2.5 shadow-xs">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
            <span>{layoutError}</span>
          </div>
        )}

        {/* Status bar above preview (Requirement 6) */}
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-3 px-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${readabilityStatus.color}`}>
              {fontPt.toFixed(2)} pt · {readabilityStatus.label}
            </span>
            <span className="text-xs font-bold text-stone-700 dark:text-stone-300">
              {layoutResult.pageCount} {layoutResult.pageCount === 1 ? 'Page' : 'Pages'}
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-stone-700">
              Rows shown: <b className="text-stone-900 dark:text-stone-100">{layoutResult.totalRowsShown} of {layoutResult.totalExpectedRows}</b>
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-medium text-stone-500">
            <span>Last page: <b>{layoutResult.lastPageFullness}%</b> full</span>
            <span className="text-stone-300 dark:text-stone-700">·</span>
            <span>Zoom: <b>{Math.round(previewScale * 100)}%</b></span>
          </div>
        </div>

        {/* Render stacked A4 pages */}
        <div className="space-y-6 pb-12 flex flex-col items-center">
          {layoutResult.pages.map((page) => (
            <div
              key={page.pageNumber}
              style={{
                width: pageWidthPx * previewScale,
                height: pageHeightPx * previewScale,
              }}
              className="relative transition-all duration-150"
            >
              {/* Scaled paper sheet (overflow-visible to prevent clipping rows) */}
              <div
                style={{
                  width: pageWidthPx,
                  height: pageHeightPx,
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top left',
                  padding: `${MARGIN_PX}px`, // 8mm padding
                  boxSizing: 'border-box'
                }}
                className="bg-white text-black shadow-lg rounded-xs border border-stone-300 flex flex-col overflow-visible select-text font-sans"
              >
                {/* Title block on page 1 */}
                {page.isFirstPage && (
                  <div
                    dangerouslySetInnerHTML={{ __html: page.headerHtml }}
                    className="shrink-0"
                  />
                )}

                {/* Table with repeated header */}
                <div
                  ref={(el) => { pageInnerRefs.current[page.pageNumber - 1] = el; }}
                  className="flex-1 flex flex-col min-h-0 overflow-visible"
                >
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      tableLayout: 'fixed',
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word',
                      background: '#fff',
                      border: '0.75pt solid #000',
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                      WebkitPrintColorAdjust: 'exact',
                      printColorAdjust: 'exact'
                    }}
                  >
                    <thead dangerouslySetInnerHTML={{ __html: page.tableHeaderHtml }} />
                    <tbody dangerouslySetInnerHTML={{ __html: page.rowsHtml }} />
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
