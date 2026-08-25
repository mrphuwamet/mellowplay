import { useEffect } from 'react';
import { useNavigate, NavigateOptions, To } from 'react-router-dom';

/**
 * Stopping someone from losing work they have not saved.
 *
 * Two different exits need catching and they cannot be caught the same way:
 *
 *  - Refreshing, closing the tab, or leaving the site is the browser's to
 *    decide, and only `beforeunload` gets a say. The wording is the browser's;
 *    no site has been allowed to write that sentence for years.
 *  - Clicking another CRM menu never leaves the page at all, so the browser
 *    never asks. That one is ours to handle, and it is the one that can carry
 *    a real dialog offering to save first.
 *
 * This app mounts a plain <BrowserRouter>, so react-router's own useBlocker —
 * which needs a data router — is not available. Instead a page registers a
 * guard here, and App's navigate goes through useGuardedNavigate: changing
 * that single line covers every menu item, breadcrumb and logo click at once,
 * rather than each call site remembering to ask.
 */

/** Returns true when it is fine to leave. A page that wants to stop the move
 *  returns false and shows its own dialog. */
type Guard = (to: To) => boolean;

let activeGuard: Guard | null = null;

/** Registers the guard and returns the function that removes it again. */
export const registerUnsavedGuard = (guard: Guard): (() => void) => {
  activeGuard = guard;
  return () => { if (activeGuard === guard) activeGuard = null; };
};

export const mayLeave = (to: To): boolean => (activeGuard ? activeGuard(to) : true);

/**
 * Navigate, unless the page on screen has unsaved work and says no.
 *
 * A drop-in replacement for useNavigate, so a screen adopts the guard by
 * changing its import rather than its logic.
 */
export const useGuardedNavigate = () => {
  const navigate = useNavigate();
  return (to: To | number, options?: NavigateOptions) => {
    if (typeof to === 'number') return navigate(to);
    if (!mayLeave(to)) return;
    return navigate(to, options);
  };
};

/**
 * Warn on refresh and on close while `dirty`, and hand in-app navigation to
 * `onBlocked` so the page can offer to save first.
 *
 * `onBlocked` gets where they were trying to go, so the page can carry on to
 * it once the question is answered.
 */
export const useUnsavedChanges = (dirty: boolean, onBlocked: (to: To) => void) => {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Assigning returnValue is what still triggers the prompt in Chrome and
      // Safari; preventDefault alone is enough only in newer Firefox.
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    const unregister = registerUnsavedGuard(to => {
      onBlocked(to);
      return false;
    });

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      unregister();
    };
  }, [dirty, onBlocked]);
};
