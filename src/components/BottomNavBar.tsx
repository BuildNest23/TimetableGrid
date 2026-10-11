import React, { useState } from 'react';
import {
  LayoutDashboard,
  CalendarClock,
  TableProperties,
  UserCheck,
  Menu,
  Settings,
  BookOpen,
  Clock,
  Users,
  Printer,
  X
} from 'lucide-react';
import { ActiveTab } from '../types/timetable';

interface BottomNavBarProps {
  currentTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({ currentTab, onSelectTab }) => {
  const [showMoreSheet, setShowMoreSheet] = useState(false);

  const mainTabs = [
    { id: 'dashboard' as ActiveTab, label: 'Home', icon: LayoutDashboard },
    { id: 'editor' as ActiveTab, label: 'Editor', icon: CalendarClock },
    { id: 'views' as ActiveTab, label: 'Views', icon: TableProperties },
    { id: 'substitute' as ActiveTab, label: 'Substitute', icon: UserCheck },
  ];

  const moreTabs = [
    { id: 'master' as ActiveTab, label: 'Teachers, Classes & Subjects', icon: BookOpen, desc: 'Manage master lists and assignments' },
    { id: 'freestaff' as ActiveTab, label: 'Free Staff', icon: Clock, desc: 'Find teachers with no scheduled class' },
    { id: 'roster' as ActiveTab, label: 'Teachers Roster', icon: Users, desc: 'Staff directory with groups & workloads' },
    { id: 'settings' as ActiveTab, label: 'School Setup', icon: Settings, desc: 'Configure periods, days, and backup' },
    { id: 'printing' as ActiveTab, label: 'Print & Export', icon: Printer, desc: 'Print timetables and export Excel' },
  ];

  const isMoreActive = moreTabs.some(t => t.id === currentTab);

  return (
    <>
      {/* Desktop Top Navigation Bar (Hidden on Mobile) */}
      <nav className="hidden lg:flex items-center justify-center gap-1.5 py-2.5 px-4 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800">
        {[...mainTabs, ...moreTabs].map(tab => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                isActive
                  ? 'bg-emerald-800 dark:bg-emerald-700 text-white shadow-xs'
                  : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Mobile Bottom Navigation Bar (Always visible on mobile) */}
      <nav
        id="bottomNavBar"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-stone-200 dark:border-stone-800 pb-safe transition-colors"
      >
        <div className="grid grid-cols-5 h-16 items-center px-1">
          {mainTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`flex flex-col items-center justify-center h-full py-1 rounded-2xl transition active:scale-95 ${
                  isActive
                    ? 'text-emerald-800 dark:text-emerald-400 font-black'
                    : 'text-stone-500 dark:text-stone-400 font-semibold hover:text-stone-800'
                }`}
              >
                <div
                  className={`p-1 rounded-full transition ${
                    isActive ? 'bg-emerald-100 dark:bg-emerald-950/80' : ''
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] tracking-tight mt-0.5">{tab.label}</span>
              </button>
            );
          })}

          {/* More Sheet Trigger */}
          <button
            type="button"
            onClick={() => setShowMoreSheet(true)}
            className={`flex flex-col items-center justify-center h-full py-1 rounded-2xl transition active:scale-95 ${
              isMoreActive
                ? 'text-emerald-800 dark:text-emerald-400 font-black'
                : 'text-stone-500 dark:text-stone-400 font-semibold hover:text-stone-800'
            }`}
          >
            <div
              className={`p-1 rounded-full transition ${
                isMoreActive ? 'bg-emerald-100 dark:bg-emerald-950/80' : ''
              }`}
            >
              <Menu className="w-5 h-5" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5">More</span>
          </button>
        </div>
      </nav>

      {/* More Slide-Up Bottom Sheet */}
      {showMoreSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setShowMoreSheet(false)}
        >
          <div
            className="w-full bg-white dark:bg-stone-900 rounded-t-3xl border-t border-stone-200 dark:border-stone-800 pb-safe shadow-2xl animate-in slide-in-from-bottom duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle */}
            <div className="pt-3 pb-1 flex justify-center">
              <div className="w-12 h-1.5 bg-stone-300 dark:bg-stone-700 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-stone-200 dark:border-stone-800">
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                School Management
              </h3>
              <button
                type="button"
                onClick={() => setShowMoreSheet(false)}
                className="p-1.5 -mr-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation List */}
            <div className="p-3 divide-y divide-stone-100 dark:divide-stone-800/60 max-h-[60vh] overflow-y-auto">
              {moreTabs.map(tab => {
                const Icon = tab.icon;
                const isActive = currentTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      onSelectTab(tab.id);
                      setShowMoreSheet(false);
                    }}
                    className={`w-full min-h-[56px] px-4 py-3 flex items-center gap-3.5 text-left rounded-2xl transition active:bg-stone-200 dark:active:bg-stone-800 ${
                      isActive
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                        : 'text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800/40'
                    }`}
                  >
                    <div
                      className={`p-2.5 rounded-xl shrink-0 ${
                        isActive
                          ? 'bg-emerald-700 text-white'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate">{tab.label}</div>
                      <div className="text-xs text-stone-500 truncate">{tab.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
