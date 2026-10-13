# Print Studio & Black & White Ruled Timetable System

Add a dedicated **Print Studio** tab featuring a live A4 paper preview and interactive text-size scaling, while restyling all timetable print layouts to the ink-friendly **Design 2 · Black & White Ruled** aesthetic (Georgia/Times serif title, double rules, hatched break column, and centered section bands) with multi-page overflow protection.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following design decisions were confirmed during interactive clarification and are locked into this plan:

- **Confirmed Decision 1 (Mobile A4 Preview)**: Scaled down dynamically with CSS transform to fit screen width, with vertical stacking and smooth scrolling for multi-page documents.
- **Confirmed Decision 2 (Title Block Divider)**: Classic double rule (two thin black rules separated by a 2px crisp gap) underneath the serif school header.
- **Confirmed Decision 3 (Section Labels)**: Centered across the full table width with upper/lower rule accents, overriding the left-aligned look from the reference sample.

---

## 1. Overview & Core Concept

- **What It Does**: Provides a dedicated, professional print production suite (`printstudio`) that allows administrators to preview timetables rendered on true A4 pages, fine-tune text and row sizing with a real-time point slider (4 pt to 16 pt in 0.25 pt increments), auto-fit to 1 or 2 pages using binary search, and print crisp, black-and-white ruled sheets without row clipping.
- **Target Audience**: School administrators, principals, and schedule coordinators preparing schedules for notice boards, staff rooms, and classroom doors.
- **Key Value**: Eliminates clipped or unreadable printouts for schools with large staff rosters (e.g. 13 classes and 22 teachers) by cleanly packing complete rows across multiple numbered pages with repeated headers.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Navigating to Print Studio**:
   - The user taps the new **Print Studio** item (Printer icon) in the bottom navigation bar or views menu.
   - On desktop, a two-pane layout opens: interactive print controls on the left (w-80 / 320px) and live paper preview on the right.
   - On mobile/tablet, controls collapse smoothly above the centered page stack.
2. **Adjusting & Fitting**:
   - The user selects the timetable type (Whole School, All Teachers, Class Wise, or Teacher Wise).
   - Tapping **"Fit to 1 page"** or **"Fit to 2 pages"** triggers a rapid binary search that calculates the maximum legible point size that fits without creating extra pages.
   - The user can nudge the slider manually (4 pt to 16 pt).
3. **Status Indicator & Inspection**:
   - Above the preview, a live status bar displays:
     - Current font size in pt.
     - Total page count (e.g., "Page 1 of 2").
     - Last page capacity/fullness percentage.
     - Readability badge: Green ($\ge 7\text{ pt}$), Amber ($5.5\text{ pt} - 6.75\text{ pt}$ "Small"), or Red ($< 5.5\text{ pt}$ "Too small").
4. **One-Click Print**:
   - Clicking **"Print"** loads the exact measured multi-page DOM into `#printArea` and invokes `window.print()`, guaranteeing 100% fidelity between preview and printed paper.

### Visual Identity: Design 2 · Black & White Ruled
- **Paper & Ink**: Pure white background (`#FFFFFF`), solid black typography (`#000000`), zero color fills for clean photocopying and ink economy.
- **Header Typography**:
  - School name: Centered in an elegant serif typeface (`Georgia, 'Times New Roman', serif`), bold, prominent tracking.
  - Sub-kicker: Sheet title in uppercase small-caps with wide letter-spacing (`letter-spacing: 0.18em`).
  - School logo: Positioned at top-left if configured in `data.schoolLogo`, maintaining strict center alignment for the title text.
  - Title divider: Classic crisp double rule (1px rule, 2px white gap, 1px rule).
- **Table Structure**:
  - Header row: Uppercase, bold, tracked, bordered by a heavy top rule (1.5pt) and a medium bottom rule (1pt).
  - Data rows: Single thin horizontal rule (0.5pt) beneath each row. **Zero vertical lines**.
  - Row labels (Class or Teacher in column 1): Bold, left-aligned serif text.
  - Cells: Centered two-line hierarchy — Subject in bold, teacher underneath in slightly smaller italics. Slot 2 combinations (rotation, parallel, same-teacher) formatted cleanly.
  - Break Column: Narrow hatched diagonal stripe (`repeating-linear-gradient(45deg, #000, #000 1px, transparent 1px, transparent 5px)` at 15% opacity) placed after `data.breakAfter`.
  - Section Bands ("Middle Section", "High Section"): Centered across the full table width with thin upper rule and medium lower rule, uppercase, bold, and tracked.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Off-Screen Layout Measurement & Discrete Page Packing**:
  - *Chosen Approach*: Render candidate rows into an off-screen container matching A4 printable dimensions (accounting for 8mm margins and header/footer heights). Pack whole rows into Page 1 until the available height is filled, then roll remaining rows into Page 2, repeating the table column header on every subsequent page.
  - *Why*: Browsers frequently break table rows awkwardly across page breaks. Discrete pre-split page containers ensure no row is ever cut in half and provide an identical live preview.
- **Decision 2: Binary Search for Auto-Fit ("Fit to 1 page" / "Fit to 2 pages")**:
  - *Chosen Approach*: Binary search over font size values between 4.0 pt and 16.0 pt (granularity 0.25 pt, ~6 iterations max).
  - *Why*: Instantaneous calculations (< 30ms) finding the optimal point size without trial-and-error guesswork by the user.
- **Decision 3: Dual-Mode Styling (Studio + Classic Print tab)**:
  - *Chosen Approach*: Update `printHtml.ts` with the "Black & White Ruled" design while keeping the existing "Print & Export" tab functional for Excel, teacher strips, and by-section prints.
  - *Why*: Preserves 100% backwards compatibility and existing workflows while ensuring all printed outputs look uniform, modern, and ink-efficient.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TimetableGrid Navigation                         │
│  [Dashboard] [Editor] [Views] [Substitute] [FreeStaff] [Print Studio]  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     PrintStudioView (New Tab)                          │
├───────────────────────────────────┬────────────────────────────────────┤
│  Left Pane: Controls              │  Right Pane: Live A4 Preview Stack │
│  - Timetable Type Selector        │  - Responsive Scale Wrapper        │
│  - Point Size Slider (4-16 pt)    │  - Page Status Bar (pt, fullness)  │
│  - "Fit to 1 Page" / "Fit to 2"   │  - Page 1 (Title + Header + Rows)  │
│  - Orientation (Landscape/Port)   │  - Page 2..N (Repeated Header)     │
│  - Checkboxes (Times, Break Col)  │  - Running Page Footers (Page X/Y) │
│  - Print Button -> window.print() │                                    │
└───────────────────────────────────┴────────────────────────────────────┘
                                    │
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
┌───────────────────────────────────┐ ┌──────────────────────────────────┐
│        printEngine.ts             │ │         printHtml.ts             │
│ - Discrete A4 Row Packing Math    │ │ - Design 2 Black & White Ruled   │
│ - Binary Search Font Size Fitting │ │ - Centered Section Bands         │
│ - Hatched Break Column Generator  │ │ - Hatched Break Column Styling   │
│ - Exact Print Area Injection      │ │ - Classic Double Rules           │
└───────────────────────────────────┘ └──────────────────────────────────┘
```

### Data Schema Extensions (`src/types/timetable.ts`)
- Add `'printstudio'` to `ActiveTab` union.
- Extend `TimetableData` with persistent print preferences:
  - `printFontPt?: number;` (default 7.5)
  - `printTimes?: boolean;` (default false)
  - `printBreakCol?: boolean;` (default true)
  - `printOrientation?: 'landscape' | 'portrait';`

### Testing & Verification Checklist
1. **Middle & High Section Test (13 Classes, 22 Teachers, 8 Periods)**:
   - At 7 pt: Fits cleanly on 1 page in landscape.
   - At 12 pt: Splits automatically across 2 or more pages.
   - Repeated header appears on Page 2.
   - Section rows are centered with double framing rules.
   - No rows cut in half across page boundaries.
2. **Mobile Viewport Test**:
   - Preview scales down with CSS transform to fit small device screens with smooth vertical scrolling.
3. **Compilation & Build**:
   - `lint_applet` passes with 0 errors.
   - `compile_applet` succeeds cleanly.
