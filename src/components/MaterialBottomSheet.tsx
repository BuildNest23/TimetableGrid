import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Check } from 'lucide-react';

interface MaterialBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  options: string[];
  currentValue?: string;
  onSelect: (value: string) => void;
  placeholder?: string;
}

export const MaterialBottomSheet: React.FC<MaterialBottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  options,
  currentValue,
  onSelect,
  placeholder = "Search..."
}) => {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 150);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = options.filter(opt =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div
        className="w-full sm:max-w-md max-h-[85vh] sm:max-h-[80vh] flex flex-col bg-stone-50 dark:bg-stone-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle for mobile thumb ergonomics */}
        <div className="sm:hidden pt-3 pb-1 flex justify-center">
          <div className="w-12 h-1.5 bg-stone-300 dark:bg-stone-700 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-stone-800">
          <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 rounded-full active:bg-stone-200 dark:active:bg-stone-800 transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 py-2.5 border-b border-stone-200 dark:border-stone-800">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3.5 text-stone-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-600 transition"
            />
          </div>
        </div>

        {/* List of items */}
        <div className="flex-1 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800/60 p-2">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-stone-400">
              No matching options found.
            </div>
          ) : (
            filtered.map((opt, i) => {
              const isSelected = opt === currentValue;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    onSelect(opt);
                    onClose();
                  }}
                  className={`w-full min-h-[48px] px-4 py-3 flex items-center justify-between text-left rounded-xl transition ${
                    isSelected
                      ? 'bg-emerald-700 text-white font-bold'
                      : 'text-stone-800 dark:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800/60 font-medium'
                  }`}
                >
                  <span className="truncate">{opt}</span>
                  {isSelected && <Check className="w-4 h-4 ml-2 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
