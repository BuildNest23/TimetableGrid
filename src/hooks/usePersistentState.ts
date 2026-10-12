import { useState, useEffect, useCallback, Dispatch, SetStateAction } from 'react';

/**
 * Like useState, but the value survives a page refresh (stored in localStorage).
 * Safe if storage is blocked/unavailable.
 */
export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch {
      /* ignore */
    }
    return initial;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);

  return [value, setValue];
}

/** Remembers window scroll position per key across refreshes. */
export function useScrollRestore(key: string, ready: boolean = true) {
  useEffect(() => {
    if (!ready) return;
    let saved = 0;
    try { saved = Number(sessionStorage.getItem(key)) || 0; } catch { /* ignore */ }
    if (saved > 0) {
      requestAnimationFrame(() => window.scrollTo({ top: saved, behavior: 'auto' }));
    }
    let t: number | undefined;
    const onScroll = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        try { sessionStorage.setItem(key, String(window.scrollY)); } catch { /* ignore */ }
      }, 150);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(t);
    };
  }, [key, ready]);
}
