/**
 * Makes the phone/browser Back button behave like a normal app:
 *  - Back closes the popup that is open (picker, confirm box, help, sheets...)
 *  - otherwise Back goes to the previous screen (tab)
 *  - only Back on the first screen leaves the app
 *
 * It works with the browser history: every popup / screen change adds one
 * history entry, and Back removes it again.
 *
 * Note: history.back() is asynchronous in browsers, so every history change
 * made by the app goes through a small queue. That keeps "close one popup and
 * immediately open another" from confusing the history.
 */

type ModalEntry = { id: number; close: () => void };
type HistState = { utTab?: string; utModal?: number } | null;

let modalStack: ModalEntry[] = [];
let nextId = 1;
/** history.back() calls WE made (to drop an entry) whose popstate must be ignored */
let ignorePops = 0;
let pendingBack: (() => void) | null = null;
let tabHandler: ((tab: string) => void) | null = null;
let listening = false;

// ---- tiny queue so history changes never overlap -------------------------
type Op = () => Promise<void> | void;
const queue: Op[] = [];
let draining = false;

function enqueue(op: Op) {
  queue.push(op);
  if (!draining) void drain();
}

async function drain() {
  draining = true;
  while (queue.length) {
    const op = queue.shift()!;
    try {
      await op();
    } catch {
      /* ignore */
    }
  }
  draining = false;
}

/** Go back one entry and wait until the browser has really done it. */
function backAndWait(): Promise<void> {
  return new Promise<void>(resolve => {
    ignorePops++;
    pendingBack = resolve;
    history.back();
    setTimeout(() => {
      if (pendingBack === resolve) {
        // the browser never answered: forget this call
        pendingBack = null;
        ignorePops = Math.max(0, ignorePops - 1);
        resolve();
      }
    }, 400);
  });
}

function inStack(id: unknown): boolean {
  return modalStack.some(m => m.id === id);
}

function onPop(e: PopStateEvent) {
  if (ignorePops > 0) {
    ignorePops--;
    const done = pendingBack;
    pendingBack = null;
    if (done) done();
    return;
  }

  const state = (e.state || null) as HistState;

  // 1) A popup is open: Back closes the top one.
  if (modalStack.length) {
    const top = modalStack.pop()!;
    top.close();
    // We may have landed on a leftover entry of a popup that is already gone: skip it.
    if (state && state.utModal !== undefined && !inStack(state.utModal)) {
      history.back();
    }
    return;
  }

  // 2) Landed on a leftover popup entry with nothing open: skip over it.
  if (state && state.utModal !== undefined) {
    history.back();
    return;
  }

  // 3) Normal screen change.
  if (state && state.utTab && tabHandler) {
    tabHandler(state.utTab);
  }
}

/** Call once at startup. Returns a cleanup function. */
export function initBackNav(currentTab: string, onTab: (tab: string) => void): () => void {
  tabHandler = onTab;
  try {
    const st = history.state as HistState;
    if (st && (st.utTab || st.utModal !== undefined)) {
      // Page was refreshed: the entry already exists, just refresh what it says.
      history.replaceState({ utTab: currentTab }, '');
    } else {
      // First visit: make Home the base entry, then stack the current screen on top of it.
      history.replaceState({ utTab: 'dashboard' }, '');
      if (currentTab !== 'dashboard') history.pushState({ utTab: currentTab }, '');
    }
  } catch {
    /* history API blocked: Back simply behaves as before */
  }
  if (!listening) {
    window.addEventListener('popstate', onPop);
    listening = true;
  }
  return () => {
    window.removeEventListener('popstate', onPop);
    listening = false;
    tabHandler = null;
  };
}

/** A new screen (tab) was opened by the user. */
export function pushTabEntry(tab: string) {
  enqueue(() => {
    try {
      history.pushState({ utTab: tab }, '');
    } catch {
      /* ignore */
    }
  });
}

/** A popup opened. `close` is called when the user presses Back. */
export function pushBackEntry(close: () => void): number {
  const id = nextId++;
  modalStack.push({ id, close });
  enqueue(() => {
    try {
      history.pushState({ utModal: id }, '');
    } catch {
      /* ignore */
    }
  });
  return id;
}

/** A popup closed by itself (button, tap outside...). Drops its history entry. */
export function removeBackEntry(id: number) {
  const idx = modalStack.findIndex(m => m.id === id);
  if (idx < 0) return; // already closed through the Back button
  modalStack.splice(idx, 1);
  enqueue(async () => {
    const st = history.state as HistState;
    if (st && st.utModal === id) {
      await backAndWait();
    }
    // else: a newer screen/popup sits on top of it; the leftover entry is skipped later
  });
}
