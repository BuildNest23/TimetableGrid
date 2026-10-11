import React, { useState } from 'react';
import { useTimetable } from '../context/TimetableContext';
import { QUAL_LIST, RANK_LIST, DESIG_LIST } from '../types/timetable';
import { MaterialBottomSheet } from '../components/MaterialBottomSheet';
import { ConfirmModal, ConfirmDialogOptions } from '../components/ConfirmModal';
import {
  Users,
  BookOpen,
  School,
  Plus,
  ArrowUp,
  ArrowDown,
  Pencil,
  Trash2,
  ChevronDown
} from 'lucide-react';

export const MasterDataView: React.FC = () => {
  const {
    data,
    updateData,
    cascadeTeacherRename,
    cascadeSubjectRename,
    cascadeClassRename
  } = useTimetable();

  const [activeTab, setActiveTab] = useState<'teacher' | 'subject' | 'class'>('teacher');
  const [editingIdx, setEditingIdx] = useState<number>(-1);

  // Form states
  const [nameInput, setNameInput] = useState("");
  const [qualInput, setQualInput] = useState("");
  const [rankInput, setRankInput] = useState("");
  const [desigInput, setDesigInput] = useState("");
  const [inchargeInput, setInchargeInput] = useState("");
  const [sectionInput, setSectionInput] = useState("");

  // BottomSheet Picker states
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

  // Confirm modal state
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    options: ConfirmDialogOptions;
    action?: (val?: string) => void;
  }>({
    isOpen: false,
    options: { message: "" }
  });

  const resetForm = () => {
    setEditingIdx(-1);
    setNameInput("");
    setQualInput("");
    setRankInput("");
    setDesigInput("");
    setInchargeInput("");
    setSectionInput("");
  };

  const handleEdit = (idx: number) => {
    setEditingIdx(idx);
    if (activeTab === 'teacher') {
      const t = data.teachers[idx];
      const info = data.teacherInfo[t] || { qual: "", rank: "", desig: "" };
      setNameInput(t);
      setQualInput(info.qual);
      setRankInput(info.rank);
      setDesigInput(info.desig);
    } else if (activeTab === 'subject') {
      setNameInput(data.subjects[idx]);
    } else {
      const c = data.classes[idx];
      setNameInput(c[0]);
      setInchargeInput(c[1]);
      setSectionInput(c[2]);
    }
  };

  const handleSave = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      alert("Please enter a name.");
      return;
    }

    if (activeTab === 'teacher') {
      if (editingIdx >= 0) {
        const oldName = data.teachers[editingIdx];
        if (oldName !== trimmed && data.teachers.includes(trimmed)) {
          alert("Another teacher already has this name.");
          return;
        }
        cascadeTeacherRename(oldName, trimmed);
        updateData(prev => {
          const next = [...prev.teachers];
          next[editingIdx] = trimmed;
          const info = { ...prev.teacherInfo };
          info[trimmed] = { qual: qualInput, rank: rankInput, desig: desigInput };
          return { ...prev, teachers: next, teacherInfo: info };
        });
      } else {
        if (data.teachers.includes(trimmed)) {
          alert("Teacher already exists.");
          return;
        }
        updateData(prev => {
          const next = [...prev.teachers, trimmed];
          const info = { ...prev.teacherInfo };
          info[trimmed] = { qual: qualInput, rank: rankInput, desig: desigInput };
          return { ...prev, teachers: next, teacherInfo: info };
        });
      }
    } else if (activeTab === 'subject') {
      if (editingIdx >= 0) {
        const oldName = data.subjects[editingIdx];
        if (oldName !== trimmed && data.subjects.includes(trimmed)) {
          alert("Subject already exists.");
          return;
        }
        cascadeSubjectRename(oldName, trimmed);
        updateData(prev => {
          const next = [...prev.subjects];
          next[editingIdx] = trimmed;
          return { ...prev, subjects: next };
        });
      } else {
        if (data.subjects.includes(trimmed)) {
          alert("Subject already exists.");
          return;
        }
        updateData(prev => ({
          ...prev,
          subjects: [...prev.subjects, trimmed]
        }));
      }
    } else {
      if (editingIdx >= 0) {
        const oldName = data.classes[editingIdx][0];
        if (oldName !== trimmed && data.classes.some((c, j) => j !== editingIdx && c[0] === trimmed)) {
          alert("Class already exists.");
          return;
        }
        cascadeClassRename(oldName, trimmed);
        updateData(prev => {
          const next = [...prev.classes];
          const current = next[editingIdx];
          next[editingIdx] = [trimmed, inchargeInput, sectionInput, current[3], current[4], current[5]];
          return { ...prev, classes: next };
        });
      } else {
        if (data.classes.some(c => c[0] === trimmed)) {
          alert("Class already exists.");
          return;
        }
        updateData(prev => ({
          ...prev,
          classes: [
            ...prev.classes,
            [
              trimmed,
              inchargeInput,
              sectionInput,
              prev.periods.map(() => ""),
              prev.periods.map(() => ""),
              prev.periods.map(() => null)
            ]
          ]
        }));
      }
    }

    resetForm();
  };

  const handleRemove = (idx: number) => {
    if (activeTab === 'teacher') {
      const name = data.teachers[idx];
      setConfirmState({
        isOpen: true,
        options: {
          title: `Remove ${name}?`,
          message: `This will remove ${name} from all assigned periods and substitute boards.`,
          danger: true,
          confirmText: "Remove"
        },
        action: () => {
          updateData(prev => {
            const nextTeachers = prev.teachers.filter((_, i) => i !== idx);
            const nextClasses = prev.classes.map(c => {
              const incharge = c[1] === name ? "" : c[1];
              const teachers = c[4].map(t => t === name ? "" : t);
              const slot2s = (c[5] || []).map(s => s && s.teacher === name ? { ...s, teacher: "" } : s);
              return [c[0], incharge, c[2], c[3], teachers, slot2s] as typeof c;
            });
            const nextInfo = { ...prev.teacherInfo };
            delete nextInfo[name];

            // Clean leaves
            const nextLeaves: Record<string, string[]> = {};
            Object.keys(prev.teacherLeaves || {}).forEach(d => {
              const filtered = (prev.teacherLeaves[d] || []).filter(t => t !== name);
              if (filtered.length) nextLeaves[d] = filtered;
            });

            // Clean long leaves
            const nextLongLeaves = (prev.longLeaves || []).filter(ll => ll.teacher !== name);

            // Clean conflict exceptions
            const nextExceptions = (prev.conflictExceptions || []).filter(ex => ex.teacher !== name);

            // Clean persisted absent teacher
            try {
              if (localStorage.getItem('utAbsentTeacher') === name) {
                localStorage.removeItem('utAbsentTeacher');
              }
            } catch {}

            return {
              ...prev,
              teachers: nextTeachers,
              classes: nextClasses,
              teacherInfo: nextInfo,
              teacherLeaves: nextLeaves,
              longLeaves: nextLongLeaves,
              conflictExceptions: nextExceptions
            };
          });
          resetForm();
        }
      });
    } else if (activeTab === 'subject') {
      const name = data.subjects[idx];
      setConfirmState({
        isOpen: true,
        options: {
          title: `Remove ${name}?`,
          message: `This will clear ${name} from all timetable slots where it is scheduled.`,
          danger: true,
          confirmText: "Remove"
        },
        action: () => {
          updateData(prev => {
            const nextSubs = prev.subjects.filter((_, i) => i !== idx);
            const nextClasses = prev.classes.map(c => {
              const subs = c[3].map(s => s === name ? "" : s);
              const slot2s = (c[5] || []).map(s => s && s.subject === name ? { ...s, subject: "" } : s);
              return [c[0], c[1], c[2], subs, c[4], slot2s] as typeof c;
            });
            return { ...prev, subjects: nextSubs, classes: nextClasses };
          });
          resetForm();
        }
      });
    } else {
      const name = data.classes[idx][0];
      setConfirmState({
        isOpen: true,
        options: {
          title: `Remove ${name}?`,
          message: `This will permanently delete ${name} and all its period schedules.`,
          danger: true,
          confirmText: "Remove"
        },
        action: () => {
          updateData(prev => ({
            ...prev,
            classes: prev.classes.filter((_, i) => i !== idx)
          }));
          resetForm();
        }
      });
    }
  };

  const handleMove = (idx: number, delta: number) => {
    const targetIdx = idx + delta;
    if (activeTab === 'teacher') {
      if (targetIdx < 0 || targetIdx >= data.teachers.length) return;
      updateData(prev => {
        const next = [...prev.teachers];
        const temp = next[idx];
        next[idx] = next[targetIdx];
        next[targetIdx] = temp;
        return { ...prev, teachers: next };
      });
    } else if (activeTab === 'subject') {
      if (targetIdx < 0 || targetIdx >= data.subjects.length) return;
      updateData(prev => {
        const next = [...prev.subjects];
        const temp = next[idx];
        next[idx] = next[targetIdx];
        next[targetIdx] = temp;
        return { ...prev, subjects: next };
      });
    } else {
      if (targetIdx < 0 || targetIdx >= data.classes.length) return;
      updateData(prev => {
        const next = [...prev.classes];
        const temp = next[idx];
        next[idx] = next[targetIdx];
        next[targetIdx] = temp;
        return { ...prev, classes: next };
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab Selector */}
      <div className="grid grid-cols-3 gap-1.5 p-1 bg-stone-200/80 dark:bg-stone-800 rounded-2xl">
        <button
          type="button"
          onClick={() => { setActiveTab('teacher'); resetForm(); }}
          className={`min-h-[44px] py-2.5 px-3 flex items-center justify-center gap-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'teacher'
              ? 'bg-white dark:bg-stone-900 text-emerald-800 dark:text-emerald-400 shadow-xs'
              : 'text-stone-600 dark:text-stone-300 hover:text-stone-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Teachers ({data.teachers.length})</span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('subject'); resetForm(); }}
          className={`min-h-[44px] py-2.5 px-3 flex items-center justify-center gap-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'subject'
              ? 'bg-white dark:bg-stone-900 text-emerald-800 dark:text-emerald-400 shadow-xs'
              : 'text-stone-600 dark:text-stone-300 hover:text-stone-900'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Subjects ({data.subjects.length})</span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('class'); resetForm(); }}
          className={`min-h-[44px] py-2.5 px-3 flex items-center justify-center gap-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'class'
              ? 'bg-white dark:bg-stone-900 text-emerald-800 dark:text-emerald-400 shadow-xs'
              : 'text-stone-600 dark:text-stone-300 hover:text-stone-900'
          }`}
        >
          <School className="w-4 h-4" />
          <span>Classes ({data.classes.length})</span>
        </button>
      </div>

      {/* Input / Edit Form Card */}
      <div className="bg-white dark:bg-stone-900 rounded-2xl p-4 sm:p-5 border border-stone-200 dark:border-stone-800 shadow-xs">
        <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 mb-3 flex items-center justify-between">
          <span>
            {editingIdx >= 0
              ? `Edit ${activeTab === 'teacher' ? 'Teacher' : activeTab === 'subject' ? 'Subject' : 'Class'}`
              : `Add New ${activeTab === 'teacher' ? 'Teacher' : activeTab === 'subject' ? 'Subject' : 'Class'}`}
          </span>
          {editingIdx >= 0 && (
            <span className="text-xs text-amber-600 font-semibold">Editing row #{editingIdx + 1}</span>
          )}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className={activeTab === 'subject' ? 'sm:col-span-2' : ''}>
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
              Name *
            </label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={
                activeTab === 'teacher'
                  ? "e.g. Mr. Tariq"
                  : activeTab === 'subject'
                  ? "e.g. Chemistry"
                  : "e.g. 10th EM"
              }
              className="w-full px-3.5 py-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          {activeTab === 'teacher' && (
            <>
              <div>
                <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                  Group (Science / Arts / IT)
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setPickerConfig({
                      isOpen: true,
                      title: "Select Group",
                      options: ["(None)", ...QUAL_LIST],
                      current: qualInput,
                      onSelect: (v) => setQualInput(v === "(None)" ? "" : v)
                    })
                  }
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm text-left flex items-center justify-between"
                >
                  <span className={qualInput ? "font-semibold text-stone-900 dark:text-stone-100" : "text-stone-400"}>
                    {qualInput || "— Select Group —"}
                  </span>
                  <ChevronDown className="w-4 h-4 text-stone-400" />
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                  Grade (SST / EST / PST / PT / IT)
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setPickerConfig({
                      isOpen: true,
                      title: "Select Grade",
                      options: ["(None)", ...RANK_LIST],
                      current: rankInput,
                      onSelect: (v) => setRankInput(v === "(None)" ? "" : v)
                    })
                  }
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm text-left flex items-center justify-between"
                >
                  <span className={rankInput ? "font-semibold text-stone-900 dark:text-stone-100" : "text-stone-400"}>
                    {rankInput || "— Select Grade —"}
                  </span>
                  <ChevronDown className="w-4 h-4 text-stone-400" />
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                  Designation
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setPickerConfig({
                      isOpen: true,
                      title: "Select Designation",
                      options: ["(None)", ...DESIG_LIST],
                      current: desigInput,
                      onSelect: (v) => setDesigInput(v === "(None)" ? "" : v)
                    })
                  }
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm text-left flex items-center justify-between"
                >
                  <span className={desigInput ? "font-semibold text-stone-900 dark:text-stone-100" : "text-stone-400"}>
                    {desigInput || "— Select Designation —"}
                  </span>
                  <ChevronDown className="w-4 h-4 text-stone-400" />
                </button>
              </div>
            </>
          )}

          {activeTab === 'class' && (
            <>
              <div>
                <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                  Class Incharge
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setPickerConfig({
                      isOpen: true,
                      title: "Select Incharge",
                      options: ["(None)", ...data.teachers],
                      current: inchargeInput,
                      onSelect: (v) => setInchargeInput(v === "(None)" ? "" : v)
                    })
                  }
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm text-left flex items-center justify-between"
                >
                  <span className={inchargeInput ? "font-semibold text-stone-900 dark:text-stone-100" : "text-stone-400"}>
                    {inchargeInput || "— Select Incharge —"}
                  </span>
                  <ChevronDown className="w-4 h-4 text-stone-400" />
                </button>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                  Section (Optional, e.g. High / Middle)
                </label>
                <input
                  type="text"
                  value={sectionInput}
                  onChange={(e) => setSectionInput(e.target.value)}
                  placeholder="e.g. High Section"
                  className="w-full px-3.5 py-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 min-h-[44px] py-2.5 px-4 bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{editingIdx >= 0 ? "Update" : "Save to List"}</span>
          </button>
          {editingIdx >= 0 && (
            <button
              type="button"
              onClick={resetForm}
              className="min-h-[44px] py-2.5 px-4 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-bold text-xs rounded-xl transition"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* List of Saved Items */}
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/30 flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
            Saved {activeTab === 'teacher' ? 'Teachers' : activeTab === 'subject' ? 'Subjects' : 'Classes'}
          </h4>
          <span className="text-xs text-stone-400 font-semibold">
            {activeTab === 'teacher' ? data.teachers.length : activeTab === 'subject' ? data.subjects.length : data.classes.length} items
          </span>
        </div>

        <div className="divide-y divide-stone-100 dark:divide-stone-800/60">
          {activeTab === 'teacher' &&
            data.teachers.map((t, idx) => {
              const info = data.teacherInfo[t] || { qual: "", rank: "", desig: "" };
              const badges = [info.rank, info.qual, info.desig].filter(Boolean);
              return (
                <div
                  key={t}
                  className="p-3 sm:px-4 flex items-center justify-between gap-3 hover:bg-stone-50/50 dark:hover:bg-stone-800/30 transition"
                >
                  <div className="min-w-0 flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-500 text-[11px] font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                        {t}
                      </div>
                      {badges.length > 0 && (
                        <div className="text-xs text-stone-500 font-medium truncate">
                          {badges.join(" · ")}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleMove(idx, -1)}
                      disabled={idx === 0}
                      className="p-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 disabled:opacity-20 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800"
                      title="Move up"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(idx, 1)}
                      disabled={idx === data.teachers.length - 1}
                      className="p-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 disabled:opacity-20 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800"
                      title="Move down"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEdit(idx)}
                      className="p-1.5 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 rounded-lg"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(idx)}
                      className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}

          {activeTab === 'subject' &&
            data.subjects.map((s, idx) => (
              <div
                key={s}
                className="p-3 sm:px-4 flex items-center justify-between gap-3 hover:bg-stone-50/50 dark:hover:bg-stone-800/30 transition"
              >
                <div className="min-w-0 flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-500 text-[11px] font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                    {s}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleMove(idx, -1)}
                    disabled={idx === 0}
                    className="p-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 disabled:opacity-20 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800"
                    title="Move up"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(idx, 1)}
                    disabled={idx === data.subjects.length - 1}
                    className="p-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 disabled:opacity-20 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800"
                    title="Move down"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEdit(idx)}
                    className="p-1.5 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 rounded-lg"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(idx)}
                    className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

          {activeTab === 'class' &&
            data.classes.map((c, idx) => (
              <div
                key={c[0]}
                className="p-3 sm:px-4 flex items-center justify-between gap-3 hover:bg-stone-50/50 dark:hover:bg-stone-800/30 transition"
              >
                <div className="min-w-0 flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-500 text-[11px] font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                      {c[0]}
                    </div>
                    <div className="text-xs text-stone-500 font-medium truncate">
                      {c[1] ? `Incharge: ${c[1]}` : "No incharge"} {c[2] ? `· ${c[2]} Section` : ""}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleMove(idx, -1)}
                    disabled={idx === 0}
                    className="p-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 disabled:opacity-20 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800"
                    title="Move up"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(idx, 1)}
                    disabled={idx === data.classes.length - 1}
                    className="p-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 disabled:opacity-20 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800"
                    title="Move down"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEdit(idx)}
                    className="p-1.5 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 rounded-lg"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(idx)}
                    className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* BottomSheet Picker Modal */}
      <MaterialBottomSheet
        isOpen={pickerConfig.isOpen}
        onClose={() => setPickerConfig(prev => ({ ...prev, isOpen: false }))}
        title={pickerConfig.title}
        options={pickerConfig.options}
        currentValue={pickerConfig.current}
        onSelect={pickerConfig.onSelect}
      />

      {/* Confirmation Modal */}
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
