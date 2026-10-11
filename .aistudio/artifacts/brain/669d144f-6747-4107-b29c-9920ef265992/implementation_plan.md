# Bug Fix Plan - ClassGrid Core Engine & UI

## Objective
Address and fix all identified bugs across the Timetable Editor, context data handling, Dashboard, and PWA asset caching while strictly preserving the current working build and deployment setup.

---

## Identified Bugs & Proposed Solutions

### 1. Timetable Editor: Day Selection Wiped Out on Save
- **File:** `src/views/TimetableEditorView.tsx` (Line 133)
- **Issue:** When configuring a combined 2nd subject in Same-Teacher mode (e.g. `Urdu/English` on Monday) and clicking Save, `if (mode === 'same') days = [];` resets the user's selected days to an empty array.
- **Fix:** Remove the forced wipeout so `slot2Draft.days` is preserved when saving a same-teacher slot.

### 2. Context: Class Rename Misses Conflict Exceptions
- **File:** `src/context/TimetableContext.tsx` (`cascadeClassRename`)
- **Issue:** Renaming a class in the Master Data tab updates class lists, but leaves old class names in `conflictExceptions`. This causes suppressed intentional conflicts to reappear or malfunction.
- **Fix:** Update `prev.conflictExceptions[].classes` inside `cascadeClassRename` to replace `oldName` with `newName`.

### 3. Dashboard: Dismiss Button Triggers Full Browser Reload
- **File:** `src/views/DashboardView.tsx` (Line 98)
- **Issue:** Dismissing the getting-started guide calls `window.location.reload()`, causing an unneeded full browser reload that disrupts the user experience and resets transient UI states.
- **Fix:** Replace the reload with React state (`useState`) while keeping `localStorage.setItem('utHideGS', '1')` for persistence.

### 4. PWA: Missing Precache Assets in Vite Config
- **File:** `vite.config.ts`
- **Issue:** `includeAssets` in `VitePWA` lists only `favicon.ico`, `apple-touch-icon.png`, and `icon.svg`. The newly generated PNG icons (`pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-512x512.png`) are not precached by the service worker.
- **Fix:** Add all PWA icons to `includeAssets` so they are cached offline on mobile devices.

### 5. Data Normalization: Out-of-Range Days Validation
- **File:** `src/context/TimetableContext.tsx` (`normalize`)
- **Issue:** If the user decreases `daysPerWeek` (e.g., from 6 days to 5 days), existing slots could retain out-of-range day indexes.
- **Fix:** Ensure `normalize()` filters day indexes against `base.daysPerWeek` for both `rotation` and `same` modes.

---

## Verification Plan
1. **Automated Verification:**
   - Run `lint_applet` to ensure zero TypeScript/linter errors.
   - Run `compile_applet` to confirm the production build completes successfully with assets intact.
2. **Behavioral Checks:**
   - Verify same-teacher day selections persist across saves and reloads.
   - Verify class renaming retains suppressed conflicts.
   - Verify the Dashboard dismiss button closes smoothly without reloading the window.
