import React, { useState, useEffect, useMemo } from 'react';
import { X, Undo2, Redo2, History } from 'lucide-react';
import { useTimetable } from '../context/TimetableContext';
import { useBackClose } from '../hooks/useBackClose';
import { HistoryEntry } from '../utils/changeLog';

interface ChangeHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PAGE = 10;

function formatTime(ts: number): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) return time;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}

interface Item {
  entry: HistoryEntry;
  undone: boolean;
  isNextUndo: boolean;
  isNextRedo: boolean;
}

export const ChangeHistoryModal: React.FC<ChangeHistoryModalProps> = ({ isOpen, onClose }) => {
  const { changeLog, undo, redo } = useTimetable();
  const [visible, setVisible] = useState(PAGE);

  useBackClose(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setVisible(PAGE);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const items: Item[] = useMemo(() => {
    const { undo: u, redo: r } = changeLog;
    // Newest first. Undone changes sit on top (they are newer than the active ones).
    const undone: Item[] = r.map((entry, i) => ({
      entry,
      undone: true,
      isNextUndo: false,
      isNextRedo: i === r.length - 1
    }));
    const active: Item[] = [...u].reverse().map((entry, i) => ({
      entry,
      undone: false,
      isNextUndo: i === 0,
      isNextRedo: false
    }));
    return [...undone, ...active];
  }, [changeLog]);

  if (!isOpen) return null;

  const canUndo = changeLog.undo.length > 0;
  const canRedo = changeLog.redo.length > 0;
  const shown = items.slice(0, visible);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Recent changes"
        className="w-full sm:max-w-md h-[88vh] sm:h-auto sm:max-h-[85vh] flex flex-col bg-stone-50 dark:bg-stone-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden pt-3 pb-1 flex justify-center">
          <div className="w-12 h-1.5 bg-stone-300 dark:bg-stone-700 rounded-full" />
        </div>

        <div className="flex items-start justify-between gap-3 px-5 pt-2 pb-3 border-b border-stone-200 dark:border-stone-800">
          <div>
            <h3 className="text-base font-extrabold text-stone-900 dark:text-stone-100">Recent changes</h3>
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5">
              Saved on this device. Stays after refresh.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 -mr-2 -mt-1 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 rounded-full"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-2.5">
          {items.length === 0 && (
            <div className="text-center py-14 px-6">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-stone-200 dark:bg-stone-800 flex items-center justify-center text-stone-500">
                <History className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-stone-800 dark:text-stone-200">No changes yet</p>
              <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                Every edit you make will be listed here with what it was before and after.
              </p>
            </div>
          )}

          {shown.map(({ entry, undone, isNextUndo, isNextRedo }) => (
            <div
              key={entry.id}
              className={`bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-2xl p-3.5 space-y-2 ${
                undone ? 'opacity-70' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  <span className="text-[11px] font-bold text-stone-600 dark:text-stone-400">{formatTime(entry.ts)}</span>
                  <span className="text-[10px] font-extrabold tracking-wide px-2 py-0.5 rounded-full bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                    {entry.tag}
                  </span>
                  {undone && (
                    <span className="text-[10px] font-extrabold tracking-wide px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300">
                      UNDONE
                    </span>
                  )}
                </div>
                {isNextUndo && (
                  <button
                    type="button"
                    onClick={undo}
                    className="shrink-0 min-h-[34px] px-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold transition"
                  >
                    Undo
                  </button>
                )}
                {isNextRedo && (
                  <button
                    type="button"
                    onClick={redo}
                    className="shrink-0 min-h-[34px] px-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold transition"
                  >
                    Redo
                  </button>
                )}
                {!isNextUndo && !isNextRedo && !undone && (
                  <span className="shrink-0 text-[10px] font-bold text-stone-500 text-right leading-tight">
                    Undo newer<br />first
                  </span>
                )}
              </div>

              <div className="text-[13px] font-extrabold text-stone-900 dark:text-stone-100 break-words">{entry.where}</div>

              {entry.rows.map((r, i) => (
                <div key={i} className="space-y-1">
                  {entry.rows.length > 1 && (
                    <div className="text-[11px] font-bold text-stone-600 dark:text-stone-400 break-words">{r.label}</div>
                  )}
                  <div className="flex gap-1.5 items-stretch">
                    <div className="flex-1 min-w-0 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 px-2 py-1.5 text-xs leading-snug break-words">
                      <span className="block text-[9px] font-extrabold tracking-wider">BEFORE</span>
                      {r.before}
                    </div>
                    <div className="flex items-center text-stone-400 font-extrabold">→</div>
                    <div className="flex-1 min-w-0 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 px-2 py-1.5 text-xs leading-snug break-words">
                      <span className="block text-[9px] font-extrabold tracking-wider">AFTER</span>
                      {r.after}
                    </div>
                  </div>
                </div>
              ))}
              {entry.more > 0 && (
                <div className="text-[11px] font-bold text-stone-500">+ {entry.more} more changes</div>
              )}
            </div>
          ))}

          {items.length > visible && (
            <button
              type="button"
              onClick={() => setVisible(v => v + PAGE)}
              className="w-full min-h-[44px] rounded-xl border border-dashed border-stone-400 dark:border-stone-600 text-xs font-bold text-stone-700 dark:text-stone-300"
            >
              Show {Math.min(PAGE, items.length - visible)} more changes
            </button>
          )}
        </div>

        <div className="flex gap-2.5 px-3.5 pt-3 pb-4 border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="flex-1 min-h-[46px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-extrabold disabled:opacity-35 disabled:pointer-events-none transition"
          >
            <Undo2 className="w-4 h-4" /> Undo last change
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            className="flex-1 min-h-[46px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-stone-200 dark:bg-stone-800 text-stone-800 dark:text-stone-200 text-sm font-extrabold disabled:opacity-35 disabled:pointer-events-none transition"
          >
            <Redo2 className="w-4 h-4" /> Redo
          </button>
        </div>
      </div>
    </div>
  );
};
