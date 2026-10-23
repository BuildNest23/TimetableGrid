import { useEffect, useRef } from 'react';
import { pushBackEntry, removeBackEntry } from '../utils/backStack';

/**
 * Use in every popup / bottom sheet. While `isOpen` is true, the phone's Back
 * button calls `onClose` (closing the popup) instead of leaving the app.
 */
export function useBackClose(isOpen: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const id = pushBackEntry(() => closeRef.current());
    return () => removeBackEntry(id);
  }, [isOpen]);
}
