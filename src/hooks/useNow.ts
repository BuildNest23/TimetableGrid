import { useState, useEffect } from 'react';

/**
 * Hook to provide current live timestamp, updating automatically
 * and syncing immediately when the document becomes visible.
 */
export function useNow(refreshIntervalMs: number = 10000): Date {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = setInterval(update, refreshIntervalMs);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        update();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', update);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', update);
    };
  }, [refreshIntervalMs]);

  return now;
}
