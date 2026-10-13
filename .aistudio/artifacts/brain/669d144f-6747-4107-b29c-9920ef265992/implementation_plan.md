# Implementation Plan: Live School Day Dashboard & Workload Collapse

Transform `src/views/DashboardView.tsx` into a real-time school day command center that tracks the current period, assembly, or break as the day progresses, with full preview capabilities and a reorganized, responsive layout.

## 1. Architecture & Utilities

### 1.1 `src/hooks/useNow.ts`
- Create a lightweight React hook that maintains the current local `Date`.
- Updates every 10 seconds (or on `visibilitychange`) with minute precision.
- Exposes `{ now, setOverrideTime, isLive, resetToLive }` to power real-time updates and interactive period jumps/testing.

### 1.2 `src/utils/liveSchedule.ts` (Pure Logic)
- **Time parsing & formatting**: Parse `"HH:mm"` times into minutes from midnight for exact comparisons.
- **Day detection**:
  - Determine current weekday index (0 for Monday, etc. matching `data.days`).
  - Check if today matches `data.fridayTimings.dayIndex` and if Friday timings are active.
  - Return whether today is an active school day (`dayIndex < data.daysPerWeek`).
- **Timing slot resolution**:
  - Use `getPeriodTimes(data)` and day-specific timings (`data.periodTimes` vs `data.fridayTimings.periodTimes`).
  - Account for morning Assembly (`data.assemblyTime` or `fridayTimings.assemblyTime`).
  - Account for Break after period $B$ with its exact start/end window.
- **Schedule state machine**:
  - Evaluates current time against slots:
    - `'weekend'` / `'not_in_session'`: Outside school days.
    - `'before_school'`: Before assembly / Period 1.
    - `'assembly'`: During morning assembly.
    - `'period'`: During an active period (with period number, start/end, remaining minutes, progress %).
    - `'break'`: During school break (with break label, start/end, remaining minutes).
    - `'after_school'`: After the final period has concluded.
- **Class allocations resolver**:
  - For the active period and day, extract each class's assigned subject and teacher from `data.assignments`.
  - Match teachers against active leaves (`getLeavesForDate(todayKey)`) to flag absent teachers and substitution requirements.

## 2. Dashboard Component Restructure (`src/views/DashboardView.tsx`)

Following the exact order specified:
1. **Compact Top Bar**:
   - School name, academic year, auto-save status indicator.
   - Clean, compact "Open Timetable Editor" button.
2. **"Right Now" Live Card**:
   - Header with current clock time, date, live pulse indicator, and school session status.
   - Time remaining badge and subtle progress bar for active period/break/assembly.
   - **Period Jumper**: Segmented horizontal chips allowing quick switching to preview Period 1, Period 2, Break, etc., with a "Jump to Live" badge when browsing another period.
   - **Class Allocations Grid**:
     - Search filter to instantly find specific classes, teachers, or subjects.
     - Responsive grid of compact class cards showing:
       - Class name (bold)
       - Subject badge (with color coding)
       - Teacher name
       - Amber leave notice if the assigned teacher is marked on leave today.
     - Free/Unassigned periods clearly distinguished.
     - Collapsible class container if the user wants to collapse the class list.
   - **Off-Hours / Break States**:
     - Friendly cards when before school, during break, or after school, with next upcoming period details.
3. **Timetable Health Banner**:
   - Retained exactly as is with conflict/unassigned warnings and jump-to-fix editor buttons.
4. **Staff On Leave Today**:
   - Retained with leave tags and quick link to Substitute Board.
5. **Metric Cards**:
   - Clean responsive grid (Classes, Teachers, Periods/Day, Subjects, Days/Week).
6. **Teacher Weekly Workload (Moved to Bottom, Collapsed by Default)**:
   - Header wrapped in an accessible `<button>` with rotating chevron, `aria-expanded`, and `aria-controls`.
   - Smooth animated disclosure via `motion.div` / height transition.
   - Persists open/closed state in `localStorage` under `utWorkloadOpen`.
   - Preserves table columns and "Full Roster →" link.
7. **Quick Action Buttons**:
   - Preserved buttons for Master Data and Settings.

## 3. Verification Plan
- **TypeScript & Build**: Run `compile_applet` and `lint_applet` to verify no errors. (Completed: Clean build, zero TypeScript errors)
- **Live Detection**: Test with varied times (morning before school, assembly, period 1, break, period 5, after school, weekend). (Completed: Tested and verified)
- **Period Jumper**: Confirm tapping any period chip displays that period's class allocations cleanly, and "Live" returns to actual clock. (Completed: Interactive jumper with live clock toggle)
- **Teacher Leave Highlighting**: Confirm teachers on leave today show amber badge in the active class tiles. (Completed: Amber badge and substitute alert notice)
- **Workload Collapse**: Verify localStorage persistence and toggle animation. (Completed: CSS grid accordion with utWorkloadOpen in localStorage)
