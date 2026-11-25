import { useSyncExternalStore } from 'react';
import { collapsedLists, compactDensity } from '@/lib/planner/device-settings';
import { carryOverSetting } from '@/lib/planner/preferences';

/** Whether "Move unfinished tasks to today" is on, on this device. */
export function useCarryOverSetting(): boolean {
    return useSyncExternalStore(
        carryOverSetting.subscribe,
        carryOverSetting.isEnabled,
        carryOverSetting.isEnabled,
    );
}

/** The Someday lists collapsed on this device (F26). */
export function useCollapsedLists(): readonly string[] {
    return useSyncExternalStore(
        collapsedLists.subscribe,
        collapsedLists.get,
        collapsedLists.get,
    );
}

/** Whether compact rows are on, on this device (F32). */
export function useCompactDensity(): boolean {
    return useSyncExternalStore(
        compactDensity.subscribe,
        compactDensity.get,
        compactDensity.get,
    );
}
