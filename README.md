<div align="center">

<img src="./public/pwa-192x192.png" alt="ClassGrid Logo" width="120" height="120" />

# ClassGrid

**Universal School Timetable — build, edit, view, and print school timetables offline.**

A modern, offline-first PWA. No account. No server. Everything stays on your device.

[![Live App](https://img.shields.io/badge/Live%20App-classgrid-1B4D3E?style=for-the-badge)](https://littlevase.github.io/classgrid/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)

[**Open the App**](https://littlevase.github.io/classgrid/) · [Report a Bug](https://github.com/littlevase/classgrid/issues)

</div>

---

## ✨ Features

- **Full school setup** — periods, days, breaks, assembly
- **Timetable editor** — Fast Add form or Grid View
- **2nd subject per period** — Parallel, Rotation, or Same-teacher mode
- **Conflict detection** — with "mark as intentional" for overlaps
- **Friday / Day-Specific timing** — merge into the main sheet or print separately
- **Auto-chaining times** — type only the ends; the next start fills in
- **5 view layouts** — Whole School, All Teachers, Timings, Class Wise, Teacher Wise
- **Print & PNG export** — A4 landscape, with school logo
- **Substitute board** — recommendations by workload and subject match
- **Free Staff by period** — with live absence awareness
- **Long leaves & single-day leaves**
- **Excel export** — real `.xlsx` workbook, offline
- **Undo/Redo** — 30 steps
- **Scenarios** — save and switch between timetable variants
- **JSON backup & restore** — including WhatsApp share
- **Dark mode, PWA installable, fully offline**

---

## 🚀 Getting Started

### Use it
1. Open **[littlevase.github.io/classgrid](https://littlevase.github.io/classgrid/)**
2. **Install as an app:**
   - **Android (Chrome):** menu → *Add to Home screen*
   - **iOS (Safari):** share → *Add to Home Screen*
   - **Desktop (Chrome/Edge):** install icon in the address bar
3. Start with **School Setup**, then **Master Lists**, then **Editor**
4. Preview in **Views**, print from **Print**

The app has a built-in **Help** (❓ icon) with a full walkthrough.

### Develop it
```bash
git clone https://github.com/littlevase/classgrid.git
cd classgrid
npm install
npm run dev        # http://localhost:3000
npm run build      # production build → dist/
npm run preview    # preview the build
