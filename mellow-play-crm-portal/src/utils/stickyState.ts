import { useEffect, useRef, useState } from 'react';

/**
 * State that survives a page reload.
 *
 * Working through a list means filtering it, then doing something to a row,
 * then coming back — and a refresh in the middle put every filter back to its
 * default, so the narrowing had to be redone each time. This keeps it.
 *
 * sessionStorage rather than localStorage: a filter is what someone is doing
 * right now in this tab, not a preference. Closing the tab ends it, and a
 * second tab opens clean instead of inheriting a filter set somewhere else.
 */
export function useStickyState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = sessionStorage.getItem(key);
      return saved === null ? initial : (JSON.parse(saved) as T);
    } catch {
      // Corrupt or unreadable (private mode, quota) — the default still works.
      return initial;
    }
  });

  // Skips the write on first render: restoring a value and immediately writing
  // it back is pointless, and it would overwrite a good value with a default
  // if the component ever mounts before its data arrives.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
  }, [key, value]);

  return [value, setValue];
}

/** Forgets everything stored under a prefix — the "clear all filters" case. */
export function clearStickyState(prefix: string) {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(prefix)) keys.push(k);
    }
    keys.forEach(k => sessionStorage.removeItem(k));
  } catch { /* nothing to clear if storage is unavailable */ }
}
