import React, { useState } from 'react';
import { Undo2, Redo2, Moon, Sun, HelpCircle, Download, Share, X } from 'lucide-react';
import { useTimetable } from '../context/TimetableContext';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface TopAppBarProps {
  onOpenHelp: () => void;
  activeViewTitle: string;
}

export const TopAppBar: React.FC<TopAppBarProps> = ({ onOpenHelp, activeViewTitle }) => {
  const { canUndo, canRedo, undo, redo, savedFlash, darkMode, toggleDarkMode } = useTimetable();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showInstallModal, setShowInstallModal] = useState<null | 'ios' | 'other'>(null);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowInstallModal('ios');
      return;
    }
    if (isInstallable) {
      const ok = await install();
      if (!ok) {
        // User dismissed or prompt failed → show fallback instructions
        setShowInstallModal('other');
      }
      return;
    }
    setShowInstallModal('other');
  };

  const showInstallButton = !isInstalled;

  return (
    <header className="sticky top-0 z-30 bg-white/90 dark:bg-stone-900/90 backdrop-blur-md border-b border-stone-200 dark:border-stone-800 transition-colors">
      <div className="max-w-7xl mx-auto px-3.5 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-emerald-800 dark:bg-emerald-700 flex items-center justify-center text-white font-black text-sm shrink-0 shadow-xs">
            CG
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-stone-900 dark:text-stone-100 truncate flex items-center gap-2">
              ClassGrid
              <span className="hidden md:inline-block text-xs font-medium text-stone-400">·</span>
              <span className="hidden md:inline-block text-xs font-semibold text-emerald-800 dark:text-emerald-400">
                {activeViewTitle}
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <div
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all duration-300 ${
              savedFlash
                ? 'bg-emerald-600 text-white scale-105 shadow-xs'
                : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
            }`}
            title="All changes are automatically saved offline on your device"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
            <span className="text-[11px]">Saved</span>
          </div>

          <div className="flex items-center bg-stone-100 dark:bg-stone-800 rounded-xl p-0.5">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              className="p-1.5 sm:p-2 text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white disabled:opacity-30 disabled:pointer-events-none rounded-lg active:bg-stone-200 dark:active:bg-stone-700 transition"
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              className="p-1.5 sm:p-2 text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white disabled:opacity-30 disabled:pointer-events-none rounded-lg active:bg-stone-200 dark:active:bg-stone-700 transition"
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {showInstallButton && (
            <button
              type="button"
              onClick={handleInstallClick}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition"
              title="Install ClassGrid as an app"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Install</span>
            </button>
          )}

          <button
            type="button"
            onClick={toggleDarkMode}
            className="p-2 text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 active:scale-95 transition"
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            aria-label="Toggle theme"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onOpenHelp}
            className="p-2 text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 active:scale-95 transition"
            title="User Guide & Help"
            aria-label="Help"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showInstallModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setShowInstallModal(null)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-3xl p-6 shadow-2xl border border-stone-200 dark:border-stone-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-xl">
                  <Download className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                  Install ClassGrid
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInstallModal(null)}
                className="p-1.5 -mr-1.5 -mt-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded-full"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {showInstallModal === 'ios' && (
              <>
                <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed mb-4">
                  On iPhone and iPad, apps are installed from <b>Safari</b> (not Chrome).
                  Follow these steps:
                </p>
                <ol className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed space-y-2 mb-4 list-decimal pl-5">
                  <li>
                    Tap the <b>Share</b> button
                    <span className="inline-flex items-center justify-center align-middle mx-1 px-1.5 py-0.5 bg-stone-100 dark:bg-stone-800 rounded-md">
                      <Share className="w-3 h-3" />
                    </span>
                    in Safari&apos;s toolbar (bottom on iPhone, top on iPad).
                  </li>
                  <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
                  <li>Tap <b>Add</b> in the top-right corner.</li>
                  <li>ClassGrid will appear on your home screen and open full-screen, without browser bars.</li>
                </ol>
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
                  <b>Tip:</b> If you opened this page in Chrome or another browser on iOS, first copy the URL and paste it into Safari.
                </div>
              </>
            )}

            {showInstallModal === 'other' && (
              <>
                <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed mb-4">
                  Your current browser doesn&apos;t show an automatic install option.
                  ClassGrid works best installed from one of these:
                </p>
                <ul className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed space-y-2 mb-4 list-disc pl-5">
                  <li>
                    <b>Android:</b> Open in <b>Chrome</b> → tap ⋮ (three dots) → <b>Install app</b>
                  </li>
                  <li>
                    <b>iPhone / iPad:</b> Open in <b>Safari</b> → tap Share → <b>Add to Home Screen</b>
                  </li>
                  <li>
                    <b>Windows / macOS:</b> Open in <b>Chrome</b> or <b>Edge</b> → look for the install icon in the address bar
                  </li>
                </ul>
                <div className="p-3 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900/60 rounded-xl text-[11px] text-sky-900 dark:text-sky-200 leading-relaxed">
                  Once installed, ClassGrid runs offline and gets its own home-screen icon.
                </div>
              </>
            )}

            <button
              type="button"
              onClick={() => setShowInstallModal(null)}
              className="w-full mt-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl transition"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </header>
  );
};