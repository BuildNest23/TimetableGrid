import React, { useState, useEffect, useMemo, useRef } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';
import { useTimetable } from '../context/TimetableContext';
import { Slot2, ClassItem, DAY_NAMES } from '../types/timetable';
import { MaterialBottomSheet } from '../components/MaterialBottomSheet';
import { ConfirmModal, ConfirmDialogOptions } from '../components/ConfirmModal';
import {
  Zap,
  Grid3X3,
  Layers,
  ChevronDown,
  Pencil,
  Trash2,
  Check,
  AlertTriangle,
  RotateCcw,
  Info
} from 'lucide-react';

interface TimetableEditorViewProps {
  initialJump?: { period?: number; teacher?: string };
  onJumpHandled?: () => void;
}

export const TimetableEditorView: React.FC<TimetableEditorViewProps> = ({ initialJump, onJumpHandled }) => {
  const {
    data,
    updateData,
    computeConflicts,
    getTeacherTotalPeriods,
    markConflictIntentional,
    removeConflictException
  } = useTimetable();

  const [editorMode, setEditorMode] = usePersistentState<'fast' | 'grid'>('utEditorMode', 'fast');
  const [selectedClassIdx, setSelectedClassIdx] = usePersistentState<number>('utEditorClassIdx', 0);
  const [selectedPeriodIdx, setSelectedPeriodIdx] = usePersistentState<number>('utEditorPeriodIdx', 0);

  const [subjectDraft, setSubjectDraft] = useState<string>("");
  const [teacherDraft, setTeacherDraft] = useState<string>("");
  const [slot2Draft, setSlot2Draft] = useState<Slot2 | null>(null);
  const [show2ndSlot, setShow2ndSlot] = useState<boolean>(false);
  const [isEditingRow, setIsEditingRow] = useState<boolean>(false);

  const [pickerConfig, setPickerConfig] = useState<{
    isOpen: boolean;
    title: string;
    options: string[];
    current?: string;
    onSelect: (val: string) => void;
  }>({
    isOpen: false,
    title: "",
    options: [],
    onSelect: () => {}
  });

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    options: ConfirmDialogOptions;
    action?: () => void;
  }>({
    isOpen: false,
    options: { message: "" }
  });

  // Guard against stale saved indexes (e.g. classes/periods were removed)
  useEffect(() => {
    if (selectedClassIdx >= data.classes.length) setSelectedClassIdx(0);
    if (selectedPeriodIdx >= data.periods.length) setSelectedPeriodIdx(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.classes.length, data.periods.length]);

  const conflicts = useMemo(() => computeConflicts(), [computeConflicts]);
  const safeClassIdx = data.classes.length > 0
    ? Math.max(0, Math.min(selectedClassIdx, data.classes.length - 1))
    : 0;
  const currentClass = data.classes[safeClassIdx] || data.classes[0];

  const currentClassName = currentClass?.[0] ?? '';
  const currentSubject = currentClass?.[3]?.[selectedPeriodIdx] ?? '';
  const currentTeacher = currentClass?.[4]?.[selectedPeriodIdx] ?? '';
  const currentSlot2JSON = JSON.stringify(currentClass?.[5]?.[selectedPeriodIdx] ?? null);

  useEffect(() => {
    if (!currentClass) return;
    setSubjectDraft(currentSubject);
    setTeacherDraft(currentTeacher);
    const s2 = JSON.parse(currentSlot2JSON);
    setSlot2Draft(s2 ? { ...s2 } : null);
    setShow2ndSlot(!!s2);
    setIsEditingRow(!!(currentSubject || currentTeacher || s2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeClassIdx, selectedPeriodIdx, currentClassName, currentSubject, currentTeacher, currentSlot2JSON]);

  const jumpTargetRef = useRef<HTMLDivElement>(null);
  const dataClassesRef = useRef(data.classes);
  dataClassesRef.current = data.classes;

  useEffect(() => {
    if (!initialJump || initialJump.period === undefined || !initialJump.teacher) return;
    const p = initialJump.period;
    const t = initialJump.teacher;
    const classes = dataClassesRef.current;
    const ci = classes.findIndex(c => {
      if (c[4][p] === t) return true;
      const s2 = c[5] ? c[5][p] : null;
      return s2 && s2.teacher === t;
    });
    if (ci >= 0) {
      setSelectedClassIdx(ci);
      setSelectedPeriodIdx(p);
      setTimeout(() => {
        jumpTargetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
    }
    onJumpHandled?.();
  }, [initialJump, onJumpHandled]);

  if (!data.classes.length) {
    return (
      <div className="bg-white dark:bg-stone-900 rounded-3xl p-8 sm:p-12 border border-stone-200 dark:border-stone-800 text-center max-w-lg mx-auto my-6 shadow-xs">
        <div className="w-14 h-14 mx-auto mb-4 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-400 rounded-2xl flex items-center justify-center">
          <Layers className="w-7 h-7" />
        </div>
        <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 mb-2">No Classes Found</h3>
        <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
          Please add at least one class in the "Classes &amp; Subjects" section first to start assigning subjects and teachers.
        </p>
      </div>
    );
  }

  const handleSavePeriod = () => {
    if (!subjectDraft.trim()) {
      alert("Please select a subject.");
      return;
    }
    if (!teacherDraft.trim()) {
      alert("Please select a teacher.");
      return;
    }

    let finalSlot2: Slot2 | null = null;
    if (show2ndSlot && slot2Draft && slot2Draft.subject) {
      const mode = slot2Draft.mode || 'parallel';
      let days = (slot2Draft.days || []).slice();
      if (mode === 'rotation' && days.length === 0) days = [data.daysPerWeek - 1];
      if (mode === 'parallel') days = [];
      const tea = mode === 'same' ? teacherDraft.trim() : (slot2Draft.teacher || "").trim();

      finalSlot2 = {
        subject: slot2Draft.subject.trim(),
        teacher: tea,
        mode,
        days
      };
    }

    updateData(prev => {
      if (!prev.classes.length) return prev;
      const targetIdx = Math.max(0, Math.min(selectedClassIdx, prev.classes.length - 1));
      const nextClasses = [...prev.classes];
      const cls = nextClasses[targetIdx];
      if (!cls) return prev;
      const subs = [...cls[3]];
      const teas = [...cls[4]];
      const s2s = cls[5] ? [...cls[5]] : prev.periods.map(() => null);

      subs[selectedPeriodIdx] = subjectDraft.trim();
      teas[selectedPeriodIdx] = teacherDraft.trim();
      s2s[selectedPeriodIdx] = finalSlot2;

      nextClasses[targetIdx] = [cls[0], cls[1], cls[2], subs, teas, s2s] as ClassItem;
      return { ...prev, classes: nextClasses };
    });

    let nextIdx = -1;
    for (let i = selectedPeriodIdx + 1; i < data.periods.length; i++) {
      if (!currentClass[3][i] && !currentClass[4][i]) {
        nextIdx = i;
        break;
      }
    }
    if (nextIdx < 0) {
      for (let i = 0; i < selectedPeriodIdx; i++) {
        if (!currentClass[3][i] && !currentClass[4][i]) {
          nextIdx = i;
          break;
        }
      }
    }

    if (nextIdx >= 0) {
      setSelectedPeriodIdx(nextIdx);
    }
  };

  // Clears only the scheduled periods of every class. Teachers, subjects, classes,
  // incharges and all other settings are kept, so a new timetable can be started quickly.
  const handleResetTimetable = () => {
    setConfirmState({
      isOpen: true,
      options: {
        title: "Reset Timetable?",
        message: "This clears all assigned subjects and teachers from every class timetable. Your teachers, subjects and classes are NOT deleted.",
        danger: true,
        confirmText: "Reset Timetable"
      },
      action: () => {
        updateData(prev => ({
          ...prev,
          classes: prev.classes.map(c => [
            c[0],
            c[1],
            c[2],
            prev.periods.map(() => ""),
            prev.periods.map(() => ""),
            prev.periods.map(() => null)
          ] as ClassItem),
          conflictExceptions: []
        }));
        setSubjectDraft("");
        setTeacherDraft("");
        setSlot2Draft(null);
        setShow2ndSlot(false);
        setSelectedPeriodIdx(0);
      }
    });
  };

  const handleClearPeriod = (pi: number) => {
    setConfirmState({
      isOpen: true,
      options: {
        title: `Clear Period ${data.periods[pi]}?`,
        message: `This will remove the assigned subject and teacher for ${currentClass[0]}.`,
        danger: true,
        confirmText: "Clear"
      },
      action: () => {
        updateData(prev => {
          if (!prev.classes.length) return prev;
          const targetIdx = Math.max(0, Math.min(selectedClassIdx, prev.classes.length - 1));
          const nextClasses = [...prev.classes];
          const cls = nextClasses[targetIdx];
          if (!cls) return prev;
          const subs = [...cls[3]];
          const teas = [...cls[4]];
          const s2s = cls[5] ? [...cls[5]] : prev.periods.map(() => null);

          subs[pi] = "";
          teas[pi] = "";
          s2s[pi] = null;

          nextClasses[targetIdx] = [cls[0], cls[1], cls[2], subs, teas, s2s] as ClassItem;
          return { ...prev, classes: nextClasses };
        });
      }
    });
  };

  const hasConflict = (pi: number, teacher: string) => {
    if (!teacher) return false;
    const pConflicts = conflicts[pi];
    return !!pConflicts && !!pConflicts[teacher];
  };

  // --- Mode descriptions for the 2nd-subject panel ---
  const modeDescriptions: Record<'parallel' | 'rotation' | 'same', { title: string; body: string; example: string }> = {
    parallel: {
      title: "Parallel — two subjects at the same time",
      body: "Both subjects are taught every day in the same period. Use this when the class splits into two groups (e.g., half go to Bio lab, half go to Computer lab) with two different teachers.",
      example: "Bio - Dr. Imran  |  Computer Science - Sir Kamran"
    },
    rotation: {
      title: "Rotation — swap subjects on different days",
      body: "The 2nd subject replaces the 1st subject on the days you tick below. Use this when the class has IST on some days and Drawing on others.",
      example: "Mon–Wed: IST - Qari Saeed   |   Thu–Fri: Drawing - Mr. Aslam"
    },
    same: {
      title: "Same Teacher — one teacher, two subjects",
      body: "The same teacher teaches both subjects together on the days you tick. Doesn't double-count their weekly workload.",
      example: "Maths/Bio - Dr. Imran (every day)"
    }
  };

  return (
    <div className="space-y-4">
      {/* Deliberate overlaps chip bar */}
      {(data.conflictExceptions || []).length > 0 && (
        <div className="p-3 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900/60 rounded-2xl">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="w-3.5 h-3.5 text-sky-700 dark:text-sky-300" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-200">
              Deliberate Overlaps ({data.conflictExceptions.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.conflictExceptions.map((ex, ei) => (
              <span
                key={ei}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-stone-900 border border-sky-300 dark:border-sky-800 rounded-lg text-[11px] font-semibold text-sky-900 dark:text-sky-200"
              >
                <span>
                  P{data.periods[ex.period]}: <b>{ex.teacher}</b> in {ex.classes.join(" + ")}
                </span>
                <button
                  type="button"
                  onClick={() => removeConflictException(ei)}
                  className="text-stone-400 hover:text-rose-600 ml-0.5 leading-none"
                  title="Remove this overlap"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5 p-1 bg-stone-200/80 dark:bg-stone-800 rounded-2xl">
        <button
          type="button"
          onClick={() => setEditorMode('fast')}
          className={`min-h-[44px] py-2.5 px-3 flex items-center justify-center gap-2 rounded-xl text-xs font-bold transition ${
            editorMode === 'fast'
              ? 'bg-white dark:bg-stone-900 text-emerald-800 dark:text-emerald-400 shadow-xs'
              : 'text-stone-600 dark:text-stone-300 hover:text-stone-900'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>Fast Add Mode</span>
        </button>

        <button
          type="button"
          onClick={() => setEditorMode('grid')}
          className={`min-h-[44px] py-2.5 px-3 flex items-center justify-center gap-2 rounded-xl text-xs font-bold transition ${
            editorMode === 'grid'
              ? 'bg-white dark:bg-stone-900 text-emerald-800 dark:text-emerald-400 shadow-xs'
              : 'text-stone-600 dark:text-stone-300 hover:text-stone-900'
          }`}
        >
          <Grid3X3 className="w-4 h-4" />
          <span>Full Grid View</span>
        </button>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
        {data.classes.map((c, i) => (
          <button
            key={`${i}-${c[0]}`}
            type="button"
            onClick={() => setSelectedClassIdx(i)}
            className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              safeClassIdx === i
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-800 hover:bg-stone-50'
            }`}
          >
            {c[0]}
          </button>
        ))}
      </div>

      {editorMode === 'fast' ? (
        <div className="space-y-4">
          <div
            ref={jumpTargetRef}
            className="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2 mb-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                  Editing {currentClass[0]}
                </span>
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                  Period {data.periods[selectedPeriodIdx]}
                  {data.periodTimes[selectedPeriodIdx]?.start && (
                    <span className="text-xs font-medium text-stone-400 ml-2">
                      ({data.periodTimes[selectedPeriodIdx].start} - {data.periodTimes[selectedPeriodIdx].end})
                    </span>
                  )}
                </h3>
              </div>

              <button
                type="button"
                onClick={() =>
                  setPickerConfig({
                    isOpen: true,
                    title: "Select Period",
                    options: data.periods.map(
                      (p, i) => `Period ${p}${currentClass[3][i] ? " ✓" : ""}`
                    ),
                    current: `Period ${data.periods[selectedPeriodIdx]}${currentClass[3][selectedPeriodIdx] ? " ✓" : ""}`,
                    onSelect: (v) => {
                      const match = v.match(/\d+/);
                      if (match) {
                        const pNum = parseInt(match[0]);
                        const idx = data.periods.indexOf(pNum);
                        if (idx >= 0) setSelectedPeriodIdx(idx);
                      }
                    }
                  })
                }
                className="px-3 py-1.5 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
              >
                <span>Change Period</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                  1st Subject *
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setPickerConfig({
                      isOpen: true,
                      title: "Choose Subject",
                      options: data.subjects,
                      current: subjectDraft,
                      onSelect: (v) => setSubjectDraft(v)
                    })
                  }
                  className="w-full min-h-[46px] px-3.5 py-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm text-left flex items-center justify-between"
                >
                  <span className={subjectDraft ? "font-bold text-stone-900 dark:text-stone-100" : "text-stone-400"}>
                    {subjectDraft || "— Choose Subject —"}
                  </span>
                  <ChevronDown className="w-4 h-4 text-stone-400" />
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                  1st Teacher *
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setPickerConfig({
                      isOpen: true,
                      title: "Choose Teacher",
                      options: data.teachers.map(t => `${t} (${getTeacherTotalPeriods(t)} periods)`),
                      current: teacherDraft ? `${teacherDraft} (${getTeacherTotalPeriods(teacherDraft)} periods)` : undefined,
                      onSelect: (v) => {
                        const clean = v.replace(/\s*\(\d+\s+periods\)$/, '').trim();
                        setTeacherDraft(clean);
                      }
                    })
                  }
                  className={`w-full min-h-[46px] px-3.5 py-2.5 border rounded-xl text-sm text-left flex items-center justify-between ${
                    hasConflict(selectedPeriodIdx, teacherDraft)
                      ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-400 text-rose-800 dark:text-rose-200'
                      : 'bg-stone-50 dark:bg-stone-950 border-stone-300 dark:border-stone-700'
                  }`}
                >
                  <span className={teacherDraft ? "font-bold text-stone-900 dark:text-stone-100" : "text-stone-400"}>
                    {teacherDraft || "— Choose Teacher —"}
                  </span>
                  <ChevronDown className="w-4 h-4 text-stone-400" />
                </button>
              </div>
            </div>

            {hasConflict(selectedPeriodIdx, teacherDraft) && (
              <div className="mt-3 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between gap-2 text-xs text-rose-800 dark:text-rose-200">
                <span className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  {teacherDraft} is double-booked in another class at Period {data.periods[selectedPeriodIdx]}.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const cnames = conflicts[selectedPeriodIdx][teacherDraft]?.classes || [];
                    const cdays = conflicts[selectedPeriodIdx][teacherDraft]?.days || [];
                    markConflictIntentional(selectedPeriodIdx, teacherDraft, cnames, cdays);
                  }}
                  className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold shrink-0 transition"
                >
                  Allow Overlap
                </button>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-stone-200 dark:border-stone-800">
              {!show2ndSlot ? (
                <button
                  type="button"
                  onClick={() => {
                    setShow2ndSlot(true);
                    if (!slot2Draft) {
                      setSlot2Draft({ subject: "", teacher: "", mode: 'parallel', days: [] });
                    }
                  }}
                  className="text-xs font-bold text-emerald-800 dark:text-emerald-400 hover:underline flex items-center gap-1.5"
                >
                  <Layers className="w-4 h-4" />
                  <span>+ Add 2nd Subject (Bio/Comp parallel, IST/Drawing rotation, etc.)</span>
                </button>
              ) : (
                <div className="space-y-3 bg-stone-50 dark:bg-stone-950/60 p-3.5 rounded-2xl border border-stone-200 dark:border-stone-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-emerald-700" /> 2nd Subject Configuration
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShow2ndSlot(false);
                        setSlot2Draft(null);
                      }}
                      className="text-xs font-semibold text-rose-600 hover:underline"
                    >
                      Remove 2nd Slot
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-1 p-1 bg-stone-200 dark:bg-stone-800 rounded-xl text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setSlot2Draft(prev => ({ ...prev!, mode: 'parallel', days: [] }))}
                      title="Both subjects taught every day in the same period"
                      className={`py-1.5 rounded-lg transition ${
                        slot2Draft?.mode === 'parallel'
                          ? 'bg-white dark:bg-stone-900 text-emerald-800 dark:text-emerald-400 shadow-xs'
                          : 'text-stone-600 dark:text-stone-400'
                      }`}
                    >
                      Parallel
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSlot2Draft(prev => ({
                          ...prev!,
                          mode: 'rotation',
                          days: prev?.days.length ? prev.days : Array.from({ length: data.daysPerWeek }, (_, k) => k)
                        }))
                      }
                      title="2nd subject replaces the 1st on selected days"
                      className={`py-1.5 rounded-lg transition ${
                        slot2Draft?.mode === 'rotation'
                          ? 'bg-white dark:bg-stone-900 text-emerald-800 dark:text-emerald-400 shadow-xs'
                          : 'text-stone-600 dark:text-stone-400'
                      }`}
                    >
                      Rotation
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSlot2Draft(prev => ({
                          ...prev!,
                          mode: 'same',
                          teacher: teacherDraft,
                          days: prev?.days.length ? prev.days : Array.from({ length: data.daysPerWeek }, (_, k) => k)
                        }))
                      }
                      title="Same teacher teaches both subjects together"
                      className={`py-1.5 rounded-lg transition ${
                        slot2Draft?.mode === 'same'
                          ? 'bg-white dark:bg-stone-900 text-emerald-800 dark:text-emerald-400 shadow-xs'
                          : 'text-stone-600 dark:text-stone-400'
                      }`}
                    >
                      Same Teacher
                    </button>
                  </div>

                  {/* Mode explanation box */}
                  {slot2Draft?.mode && modeDescriptions[slot2Draft.mode] && (
                    <div className="p-2.5 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900/60 rounded-xl">
                      <div className="flex items-start gap-2">
                        <Info className="w-3.5 h-3.5 text-sky-700 dark:text-sky-300 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-bold text-sky-900 dark:text-sky-200 mb-0.5">
                            {modeDescriptions[slot2Draft.mode].title}
                          </div>
                          <div className="text-[11px] text-sky-800 dark:text-sky-300 leading-relaxed mb-1">
                            {modeDescriptions[slot2Draft.mode].body}
                          </div>
                          <div className="text-[10px] text-sky-700 dark:text-sky-400 italic font-mono">
                            e.g. {modeDescriptions[slot2Draft.mode].example}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                        2nd Subject
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setPickerConfig({
                            isOpen: true,
                            title: "Select 2nd Subject",
                            options: data.subjects,
                            current: slot2Draft?.subject,
                            onSelect: (v) =>
                              setSlot2Draft(prev => ({
                                subject: v,
                                teacher: prev?.teacher || "",
                                mode: prev?.mode || 'parallel',
                                days: prev?.days || []
                              }))
                          })
                        }
                        className="w-full min-h-[44px] px-3.5 py-2.5 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm text-left flex items-center justify-between"
                      >
                        <span className={slot2Draft?.subject ? "font-bold text-stone-900 dark:text-stone-100" : "text-stone-400"}>
                          {slot2Draft?.subject || "— Choose 2nd Subject —"}
                        </span>
                        <ChevronDown className="w-4 h-4 text-stone-400" />
                      </button>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                        2nd Teacher
                      </label>
                      {slot2Draft?.mode === 'same' ? (
                        <div className="w-full min-h-[44px] px-3.5 py-2.5 bg-stone-100 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 rounded-xl text-sm font-semibold text-stone-500 flex items-center">
                          {teacherDraft || "Same as 1st"} (= same teacher)
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setPickerConfig({
                              isOpen: true,
                              title: "Select 2nd Teacher",
                              options: data.teachers.map(t => `${t} (${getTeacherTotalPeriods(t)} periods)`),
                              current: slot2Draft?.teacher ? `${slot2Draft.teacher} (${getTeacherTotalPeriods(slot2Draft.teacher)} periods)` : undefined,
                              onSelect: (v) => {
                                const clean = v.replace(/\s*\(\d+\s+periods\)$/, '').trim();
                                setSlot2Draft(prev => ({
                                  subject: prev?.subject || "",
                                  teacher: clean,
                                  mode: prev?.mode || 'parallel',
                                  days: prev?.days || []
                                }));
                              }
                            })
                          }
                          className="w-full min-h-[44px] px-3.5 py-2.5 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm text-left flex items-center justify-between"
                        >
                          <span className={slot2Draft?.teacher ? "font-bold text-stone-900 dark:text-stone-100" : "text-stone-400"}>
                            {slot2Draft?.teacher || "— Choose 2nd Teacher —"}
                          </span>
                          <ChevronDown className="w-4 h-4 text-stone-400" />
                        </button>
                      )}
                    </div>
                  </div>

                  {(slot2Draft?.mode === 'rotation' || slot2Draft?.mode === 'same') && (
                    <div>
                      <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1.5">
                        {slot2Draft.mode === 'rotation'
                          ? "2nd subject is taught on these days (1st subject on the others):"
                          : "Combined subject is taught on these days:"}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {DAY_NAMES.slice(0, data.daysPerWeek).map((dayName, dIdx) => {
                          const isDayOn = (slot2Draft.days || []).includes(dIdx);
                          return (
                            <button
                              key={dayName}
                              type="button"
                              onClick={() => {
                                const cur = slot2Draft.days || [];
                                const next = isDayOn
                                  ? cur.filter(x => x !== dIdx)
                                  : [...cur, dIdx].sort((a, b) => a - b);
                                if (next.length === 0) return;
                                setSlot2Draft(prev => ({ ...prev!, days: next }));
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                                isDayOn
                                  ? 'bg-emerald-800 text-white'
                                  : 'bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
                              }`}
                            >
                              {dayName.slice(0, 3)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2.5 mt-5">
              <button
                type="button"
                onClick={handleSavePeriod}
                className="flex-1 min-h-[46px] py-2.5 px-4 bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{isEditingRow ? "Update Period" : "Save & Next Empty"}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSubjectDraft("");
                  setTeacherDraft("");
                  setSlot2Draft(null);
                  setShow2ndSlot(false);
                }}
                className="min-h-[46px] py-2.5 px-3.5 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-bold text-xs rounded-xl transition flex items-center gap-1"
                title="Reset form"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/30 flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                Periods Overview — {currentClass[0]}
              </h4>
              <span className="text-xs text-stone-400 font-semibold">
                {currentClass[3].filter(Boolean).length} of {data.periods.length} assigned
              </span>
            </div>

            <div className="divide-y divide-stone-100 dark:divide-stone-800/60">
              {data.periods.map((p, pi) => {
                const sub = currentClass[3][pi];
                const tea = currentClass[4][pi];
                const s2 = currentClass[5] ? currentClass[5][pi] : null;
                const isConflict = hasConflict(pi, tea) || (s2?.teacher ? hasConflict(pi, s2.teacher) : false);
                const isSelected = selectedPeriodIdx === pi;

                return (
                  <div
                    key={p}
                    className={`p-3.5 flex items-center justify-between gap-3 transition ${
                      isSelected
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                        : isConflict
                        ? 'bg-rose-50/50 dark:bg-rose-950/20'
                        : 'hover:bg-stone-50/40 dark:hover:bg-stone-800/20'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-8 h-8 rounded-xl font-bold text-xs flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-emerald-800 text-white'
                            : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
                        }`}
                      >
                        P{p}
                      </span>

                      <div className="min-w-0">
                        {sub || tea ? (
                          <>
                            <div className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate flex items-center gap-1.5">
                              {s2 && s2.mode === 'same' ? (
                                <span>
                                  {sub}/{s2.subject}{s2.days && s2.days.length > 0 ? ` (${s2.days.map(d => (DAY_NAMES[d] || "").slice(0, 3)).join(", ")})` : ''}{tea ? ` - ${tea}` : ''}
                                </span>
                              ) : (
                                <>
                                  <span>{sub || "—"}</span>
                                  {tea && <span className="font-normal text-stone-500">· {tea}</span>}
                                </>
                              )}
                              {isConflict && (
                                <span className="text-[10px] bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 px-1.5 py-0.5 rounded-md font-bold">
                                  Conflict
                                </span>
                              )}
                            </div>
                            {s2 && (s2.subject || s2.teacher) && s2.mode !== 'same' && (
                              <div className="text-xs text-stone-500 truncate flex items-center gap-1 mt-0.5">
                                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                  + {s2.subject}
                                </span>
                                {s2.teacher && <span>({s2.teacher})</span>}
                                <span className="text-[10px] text-stone-400">
                                  [{s2.mode === 'rotation' ? `Rotation: ${s2.days.map(d => (DAY_NAMES[d] || "").slice(0, 3)).join(", ")}` : s2.mode}]
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-stone-400 italic">Empty Period</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPeriodIdx(pi);
                          jumpTargetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className="p-2 text-emerald-800 dark:text-emerald-400 hover:bg-emerald-100/50 dark:hover:bg-emerald-950/60 rounded-xl"
                        title="Edit Period"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleClearPeriod(pi)}
                        className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-xl"
                        title="Clear Period"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-stone-50 dark:bg-stone-800 border-b border-stone-200 dark:border-stone-800">
                <tr>
                  <th className="py-3 px-3 font-bold text-stone-700 dark:text-stone-300 sticky left-0 bg-stone-50 dark:bg-stone-800 z-10 w-28">
                    Class
                  </th>
                  {data.periods.map((p, i) => (
                    <th key={p} className="py-3 px-3 font-bold text-stone-700 dark:text-stone-300 text-center min-w-[130px]">
                      <div>Period {p}</div>
                      {data.periodTimes[i]?.start && (
                        <div className="text-[10px] text-stone-400 font-normal">
                          {data.periodTimes[i].start}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60">
                {data.classes.map((cls, ci) => (
                  <tr key={cls[0]} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/30">
                    <th className="py-3 px-3 font-bold text-stone-900 dark:text-stone-100 sticky left-0 bg-white dark:bg-stone-900 z-10 border-r border-stone-200 dark:border-stone-800">
                      <div>{cls[0]}</div>
                      {cls[1] && <div className="text-[10px] text-stone-400 font-medium">({cls[1]})</div>}
                    </th>
                    {data.periods.map((p, pi) => {
                      const sub = cls[3][pi];
                      const tea = cls[4][pi];
                      const s2 = cls[5] ? cls[5][pi] : null;
                      const isConflict = hasConflict(pi, tea);

                      return (
                        <td
                          key={p}
                          onClick={() => {
                            setSelectedClassIdx(ci);
                            setSelectedPeriodIdx(pi);
                            setEditorMode('fast');
                          }}
                          className={`py-2 px-2.5 text-center cursor-pointer transition border-r border-stone-100 dark:border-stone-800/60 ${
                            isConflict
                              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200'
                              : sub
                              ? 'hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30'
                              : 'bg-stone-50/40 dark:bg-stone-900/40 text-stone-300'
                          }`}
                        >
                          {sub || tea ? (
                            <div className="space-y-0.5">
                              {s2 && s2.mode === 'same' ? (
                                <div>
                                  <div className="font-bold text-stone-900 dark:text-stone-100 leading-tight">
                                    {sub}/{s2.subject}{s2.days && s2.days.length > 0 ? ` (${s2.days.map(d => (DAY_NAMES[d] || "").slice(0, 3)).join(", ")})` : ''}
                                  </div>
                                  {tea && (
                                    <div className="text-[10px] text-stone-500 font-medium leading-tight">
                                      - {tea}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <>
                                  <div className="font-bold text-stone-900 dark:text-stone-100 leading-tight">
                                    {sub || "—"}
                                  </div>
                                  <div className="text-[10px] text-stone-500 font-medium leading-tight">
                                    {tea || "—"}
                                  </div>
                                  {s2 && (
                                    <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold leading-tight">
                                      + {s2.subject} {s2.mode === 'rotation' && s2.days && s2.days.length > 0 ? `(${s2.days.map(d => (DAY_NAMES[d] || "").slice(0, 3)).join(", ")})` : ''}
                                    </div>
                                  )}
                                </>
                              )}
                              {isConflict && (
                                <div className="text-[9px] text-rose-600 font-black">
                                  CONFLICT
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-stone-300 dark:text-stone-700 text-xs">+</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-rose-200 dark:border-rose-900/60 shadow-xs space-y-3">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
            Start a New Timetable
          </h4>
          <p className="text-[11px] text-stone-500 mt-1 leading-relaxed">
            Clears all assigned periods in every class. Your teachers, subjects and classes are kept.
          </p>
        </div>
        <button
          type="button"
          onClick={handleResetTimetable}
          className="w-full min-h-[44px] py-2.5 px-4 flex items-center justify-center gap-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reset Timetable</span>
        </button>
      </div>

      <MaterialBottomSheet
        isOpen={pickerConfig.isOpen}
        onClose={() => setPickerConfig(prev => ({ ...prev, isOpen: false }))}
        title={pickerConfig.title}
        options={pickerConfig.options}
        currentValue={pickerConfig.current}
        onSelect={pickerConfig.onSelect}
      />

      <ConfirmModal
        isOpen={confirmState.isOpen}
        options={confirmState.options}
        onConfirm={() => {
          confirmState.action?.();
          setConfirmState(prev => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};