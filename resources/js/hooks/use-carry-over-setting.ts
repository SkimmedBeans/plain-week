import { useSyncExternalStore } from 'react';
import {
    collapsedLists,
    compactDensity,
    expandedNotes,
    plannerView,
    stripedRows,
    todayColor,
} from '@/lib/planner/device-settings';
import type { PlannerView } from '@/lib/planner/device-settings';
import type { TaskColor } from '@/lib/db/types';
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

/** The planner's view on this device: Week or Lists (F30). */
export function usePlannerView(): PlannerView {
    return useSyncExternalStore(
        plannerView.subscribe,
        plannerView.get,
        plannerView.get,
    );
}

/** The notes expanded in the Notes view on this device (F55). */
export function useExpandedNotes(): readonly string[] {
    return useSyncExternalStore(
        expandedNotes.subscribe,
        expandedNotes.get,
        expandedNotes.get,
    );
}

/** Whether striped rows are on, on this device (F36, F37). */
export function useStripedRows(): boolean {
    return useSyncExternalStore(
        stripedRows.subscribe,
        stripedRows.get,
        stripedRows.get,
    );
}

/** Today's colour on this device (F37). */
export function useTodayColor(): TaskColor {
    return useSyncExternalStore(
        todayColor.subscribe,
        todayColor.get,
        todayColor.get,
    );
}
