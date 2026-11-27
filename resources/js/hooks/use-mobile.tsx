import { useSyncExternalStore } from 'react';

const MOBILE_BREAKPOINT = 768;
// The planner's desktop breakpoint (F55): Tailwind's `lg`.
const DESKTOP_BREAKPOINT = 1024;

const mql =
    typeof window === 'undefined'
        ? undefined
        : window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

const belowLgMql =
    typeof window === 'undefined'
        ? undefined
        : window.matchMedia(`(max-width: ${DESKTOP_BREAKPOINT - 1}px)`);

function mediaQueryListener(
    mql: MediaQueryList | undefined,
    callback: (event: MediaQueryListEvent) => void,
) {
    if (!mql) {
        return () => {};
    }

    mql.addEventListener('change', callback);

    return () => {
        mql.removeEventListener('change', callback);
    };
}

function isSmallerThanBreakpoint(mql: MediaQueryList | undefined): boolean {
    return mql?.matches ?? false;
}

function getServerSnapshot(): boolean {
    return false;
}

export function useIsMobile(): boolean {
    return useSyncExternalStore(
        (callback) => mediaQueryListener(mql, callback),
        () => isSmallerThanBreakpoint(mql),
        getServerSnapshot,
    );
}

/**
 * Below the planner's desktop breakpoint (F55): the Notes view is one
 * note per row there, collapsed to its heading until pressed.
 */
export function useIsBelowLg(): boolean {
    return useSyncExternalStore(
        (callback) => mediaQueryListener(belowLgMql, callback),
        () => isSmallerThanBreakpoint(belowLgMql),
        getServerSnapshot,
    );
}
