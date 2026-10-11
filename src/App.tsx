import React, { useState, useEffect } from 'react';
import { TimetableProvider, useTimetable } from './context/TimetableContext';
import { ActiveTab } from './types/timetable';
import { TopAppBar } from './components/TopAppBar';
import { BottomNavBar } from './components/BottomNavBar';
import { HelpModal } from './components/HelpModal';
import { ErrorBoundary } from './components/ErrorBoundary';

import { DashboardView } from './views/DashboardView';
import { TimetableEditorView } from './views/TimetableEditorView';
import { ViewTimetablesView } from './views/ViewTimetablesView';
import { SubstituteView } from './views/SubstituteView';
import { FreeStaffView } from './views/FreeStaffView';
import { TeachersRosterView } from './views/TeachersRosterView';
import { SchoolSetupView } from './views/SchoolSetupView';
import { MasterDataView } from './views/MasterDataView';
import { PrintingView } from './views/PrintingView';

const TAB_TITLES: Record<ActiveTab, string> = {
  dashboard: 'Dashboard',
  editor: 'Timetable Editor',
  views: 'View Timetables',
  substitute: 'Substitute Board',
  freestaff: 'Free Staff',
  roster: 'Teachers Roster',
  settings: 'School Setup',
  master: 'Teachers, Classes & Subjects',
  printing: 'Print & Export'
};

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    return (localStorage.getItem('utCurrentTab') as ActiveTab) || 'dashboard';
  });

  const [editorJump, setEditorJump] = useState<{ period?: number; teacher?: string } | undefined>(undefined);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
  const { undo, redo } = useTimetable();

  const handleSelectTab = (tab: ActiveTab, jumpContext?: { period?: number; teacher?: string }) => {
    setActiveTab(tab);
    localStorage.setItem('utCurrentTab', tab);
    if (jumpContext) {
      setEditorJump(jumpContext);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }      if (e.key === 'Escape') {
               const fs = document.getElementById('fullscreenModal');
               if (fs && fs.classList.contains('show')) { fs.classList.remove('show'); return; }
               const more = document.getElementById('moreSheet');
               if (more && more.classList.contains('show')) { more.classList.remove('show'); return; }
               return;
             }
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return (
    <div className="min-h-screen flex flex-col bg-stone-100 dark:bg-stone-950 text-stone-900 dark:text-stone-100 transition-colors duration-200">
      <TopAppBar
        onOpenHelp={() => setIsHelpOpen(true)}
        activeViewTitle={TAB_TITLES[activeTab] || "Timetable"}
      />

      <BottomNavBar currentTab={activeTab} onSelectTab={handleSelectTab} />

      <main className="flex-1 max-w-7xl w-full mx-auto p-3.5 sm:p-6 pb-24 lg:pb-12">
        <ErrorBoundary>
          {activeTab === 'dashboard' && <DashboardView onNavigate={handleSelectTab} />}
          {activeTab === 'editor' && (
            <TimetableEditorView
              initialJump={editorJump}
              onJumpHandled={() => setEditorJump(undefined)}
            />
          )}
          {activeTab === 'views' && <ViewTimetablesView />}
          {activeTab === 'substitute' && <SubstituteView />}
          {activeTab === 'freestaff' && <FreeStaffView />}
          {activeTab === 'roster' && <TeachersRosterView />}
          {activeTab === 'settings' && <SchoolSetupView onNavigate={handleSelectTab} />}
          {activeTab === 'master' && <MasterDataView />}
          {activeTab === 'printing' && <PrintingView />}
        </ErrorBoundary>
      </main>

      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

      <div id="printArea" style={{ display: 'none' }} />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <TimetableProvider>
        <AppContent />
      </TimetableProvider>
    </ErrorBoundary>
  );
}