# Centered Period Header & 2-Column Class Grid with Centered Odd Card

Center the "Classes in Period" heading and period timing, position the class count badge on the far right, place the search bar directly below, and format the class tiles into a 2-column grid where odd final tiles are neatly centered under the row above.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following layout decisions have been confirmed through user clarification:
> - **Grid Architecture**: 2 columns across both mobile and desktop views, with any odd trailing card centered under the two cards above it.
> - **Header Structure**: "Classes in Period [X]" centered on top, time window centered below it, and the count badge (`13 of 13`) aligned to the far right.
> - **Search Positioning**: Full-width filter/search bar placed directly below the centered header block.

---

## 1. Overview & Core Changes

2. **Header & Count Badge Placement**:
   - Title: `Classes in Period [X]` rendered bold in the center.
   - Time: `(start – end)` rendered below the title in the center.
   - Collapse Button: Positioned on the right of the header.
   - Class Count Badge (`13 of 13`): Moved from the header to the end of the last class on the right side in the card (and positioned next to the centered odd 13th card).

2. **Search Bar Placement**:
   - Sits full-width directly beneath the centered header with quick-clear button and search icon.

3. **2-Column Class Grid with Centered Odd Card**:
   - The class cards are arranged in 2 columns (`grid grid-cols-2 gap-2.5 sm:gap-3`).
   - For an odd count of classes (such as 13), the final card spans across the 2 columns (`col-span-2`) and is horizontally centered (`flex justify-center`) with width matching the column tiles (`w-[calc(50%-0.3125rem)] sm:w-[calc(50%-0.375rem)]`).
   - Works dynamically for any number of classes (13, 15, or even counts).

---

## 2. Component Layout & Visual Hierarchy

```
┌────────────────────────────────────────────────────────────────────────┐
│  [Right Now / School Live Card]                                        │
│                                                                        │
│  [Spacer / Anchor]       Classes in Period 1             [13 of 13] [▼]│
│                             (08:00 – 08:40)                            │
│                                                                        │
│  [🔍 Filter class, subject, teacher...                              ✕] │
│                                                                        │
│  ┌───────────────────────────┐      ┌───────────────────────────┐      │
│  │ Class 6A                  │      │ Class 6B                  │      │
│  │ Math · Mr. Smith          │      │ English · Ms. Jane        │      │
│  └───────────────────────────┘      └───────────────────────────┘      │
│  ┌───────────────────────────┐      ┌───────────────────────────┐      │
│  │ ...                       │      │ ...                       │      │
│  └───────────────────────────┘      └───────────────────────────┘      │
│                                                                        │
│                ┌───────────────────────────┐                           │
│                │ Class 10C (Odd 13th Card) │                           │
│                │ Biology · Dr. Ray         │                           │
│                └───────────────────────────┘                           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Implementation Plan Details

- **File**: `src/views/DashboardView.tsx`
- **Header Refactor**:
  - Replace the current left-aligned flex row with a grid/flex layout:
    - Left zone: Equal-width spacer or secondary affordance to ensure perfect geometric centering.
    - Center zone: Flex column (`items-center text-center`) containing title and subtitle time.
    - Right zone: Flex row (`items-center justify-end gap-2`) containing `{filteredAllocations.length} of {allocations.length}` and the collapse/expand chevron.
- **Search Bar**:
  - Position below the header block with `w-full`.
- **Grid Layout**:
  - Update `renderClassAllocations`:
    - Iterate in pairs or map with `isOddLast` check.
    - When `isOddLast` is true, wrap in `col-span-2 flex justify-center` with a matching column width container (`w-[calc(50%-0.3125rem)] sm:w-[calc(50%-0.375rem)]`).
    - Standard cards maintain full width within their single column.
