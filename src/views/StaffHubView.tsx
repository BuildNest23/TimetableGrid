import React from 'react';
import { ActiveTab } from '../types/timetable';
import { SubstituteView } from './SubstituteView';
import { FreeStaffView } from './FreeStaffView';
import { TeachersRosterView } from './TeachersRosterView';

type HubView = 'substitute' | 'freestaff' | 'roster';

interface StaffHubViewProps {
  view: HubView;
  onSelectView: (tab: ActiveTab) => void;
  initialTeacher?: string;
  onTeacherHandled?: () => void;
}

const SEGMENTS: { id: HubView; label: string }[] = [
  { id: 'substitute', label: 'Substitute' },
  { id: 'freestaff', label: 'Free Staff' },
  { id: 'roster', label: 'Teachers Roster' }
];

/**
 * One tab, three views: Substitute, Free Staff and Teachers Roster.
 * The active view is still tracked by App as the current tab id, so existing
 * navigation (for example "open roster" from the dashboard) keeps working.
 */
export const StaffHubView: React.FC<StaffHubViewProps> = ({
  view,
  onSelectView,
  initialTeacher,
  onTeacherHandled
}) => {
  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Staff views"
        className="grid grid-cols-3 gap-1 p-1 bg-stone-200/70 dark:bg-stone-800 rounded-2xl"
      >
        {SEGMENTS.map(s => {
          const active = view === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelectView(s.id)}
              className={`min-h-[40px] px-2 py-2 rounded-xl text-xs font-bold leading-tight transition ${
                active
                  ? 'bg-emerald-800 dark:bg-emerald-700 text-white shadow-xs'
                  : 'text-stone-600 dark:text-stone-300 hover:bg-white/70 dark:hover:bg-stone-700'
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {view === 'substitute' && (
        <SubstituteView initialTeacher={initialTeacher} onTeacherHandled={onTeacherHandled} />
      )}
      {view === 'freestaff' && <FreeStaffView />}
      {view === 'roster' && <TeachersRosterView />}
    </div>
  );
};
