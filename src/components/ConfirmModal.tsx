import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, HelpCircle, CheckCircle, Info } from 'lucide-react';

export interface ConfirmDialogOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  type?: 'confirm' | 'prompt';
  defaultValue?: string;
  icon?: 'warning' | 'info' | 'success' | 'question';
}

interface ConfirmModalProps {
  isOpen: boolean;
  options: ConfirmDialogOptions;
  onConfirm: (val?: string) => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  options,
  onConfirm,
  onCancel
}) => {
  const [inputValue, setInputValue] = useState(options.defaultValue || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setInputValue(options.defaultValue || "");
      if (options.type === 'prompt') {
        setTimeout(() => inputRef.current?.focus(), 150);
      }
    }
  }, [isOpen, options.defaultValue, options.type]);

  if (!isOpen) return null;

  const renderIcon = () => {
    if (options.danger || options.icon === 'warning') {
      return <AlertTriangle className="w-8 h-8 text-rose-600" />;
    }
    if (options.icon === 'success') {
      return <CheckCircle className="w-8 h-8 text-emerald-600" />;
    }
    if (options.icon === 'question') {
      return <HelpCircle className="w-8 h-8 text-amber-600" />;
    }
    return <Info className="w-8 h-8 text-sky-600" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-3xl p-6 shadow-2xl border border-stone-200 dark:border-stone-800 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-3">
          <div className="p-3 bg-stone-100 dark:bg-stone-800 rounded-2xl">
            {renderIcon()}
          </div>
        </div>

        <h3 className="text-lg font-bold text-center text-stone-900 dark:text-stone-100 mb-2">
          {options.title || "Confirm Action"}
        </h3>

        <p className="text-sm text-stone-600 dark:text-stone-400 text-center leading-relaxed mb-4 whitespace-pre-line">
          {options.message}
        </p>

        {options.type === 'prompt' && (
          <div className="mb-5">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
              placeholder="Enter value..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') onConfirm(inputValue);
                if (e.key === 'Escape') onCancel();
              }}
            />
          </div>
        )}

        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-[44px] py-2.5 px-4 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 font-bold text-sm rounded-xl transition"
          >
            {options.cancelText || "Cancel"}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(options.type === 'prompt' ? inputValue : undefined)}
            className={`flex-1 min-h-[44px] py-2.5 px-4 font-bold text-sm text-white rounded-xl shadow-sm transition ${
              options.danger
                ? 'bg-rose-700 hover:bg-rose-800'
                : 'bg-emerald-700 hover:bg-emerald-800'
            }`}
          >
            {options.confirmText || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
};
