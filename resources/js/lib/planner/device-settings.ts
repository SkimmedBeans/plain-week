import { readStorage, writeStorage } from '@/lib/storage';

/**
 * A planner setting kept in this browser (per device, guests too), as an
 * external store for `useSyncExternalStore` that follows other tabs through
 * the `storage` event. `read` turns the stored string (null when absent) into
 * the value; `write` turns a value back (null removes the key).
 */
export function deviceSetting<T>(
    key: string,
    read: (raw: string | null) => T,
    write: (value: T) => string | null,
) {
    const listeners = new Set<() => void>();
    let cachedRaw: string | null | undefined;
    let cached: T;

    const notify = () => listeners.forEach((listener) => listener());
    const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === key) {
            notify();
        }
    };

    const get = (): T => {
        const raw = readStorage('local', key);

        // A stable value per stored string, as useSyncExternalStore needs.
        if (raw !== cachedRaw) {
            cachedRaw = raw;
            cached = read(raw);
        }

        return cached;
    };

    return {
        subscribe: (listener: () => void): (() => void) => {
            if (listeners.size === 0) {
                window.addEventListener('storage', onStorage);
            }
            listeners.add(listener);

            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) {
                    window.removeEventListener('storage', onStorage);
                }
            };
        },
        get,
        set: (value: T): void => {
            writeStorage('local', key, write(value));
            notify();
        },
    };
}

function readKeys(raw: string | null): readonly string[] {
    try {
        const value: unknown = raw === null ? [] : JSON.parse(raw);

        return Array.isArray(value)
            ? value.filter((item): item is string => typeof item === 'string')
            : [];
    } catch {
        return [];
    }
}

/**
 * The Someday lists collapsed to a chip on this device (F26): 'someday' for
 * the base list, a named list's id otherwise.
 */
export const collapsedLists = deviceSetting<readonly string[]>(
    'plain-week.collapsed-lists',
    readKeys,
    (keys) => (keys.length === 0 ? null : JSON.stringify(keys)),
);

/** Collapses or expands one list (see `collapsedLists`). */
export function setListCollapsed(key: string, collapsed: boolean): void {
    const keys = collapsedLists.get().filter((item) => item !== key);
    collapsedLists.set(collapsed ? [...keys, key] : keys);
}

/** The key of a Someday list in `collapsedLists`. */
export function collapseKey(list: { id?: string }): string {
    return list.id ?? 'someday';
}

/** Compact rows (F32): shorter rows, named-list tasks clamped to two lines. */
export const compactDensity = deviceSetting<boolean>(
    'plain-week.compact',
    (raw) => raw === 'on',
    (on) => (on ? 'on' : null),
);

export type PlannerView = 'week' | 'lists' | 'notes';

export function isPlannerView(value: unknown): value is PlannerView {
    return value === 'week' || value === 'lists' || value === 'notes';
}

/**
 * The planner's view on this device (F30, F38): the week (days and
 * Someday), the named task lists, or the notes, each with the whole screen.
 */
export const plannerView = deviceSetting<PlannerView>(
    'plain-week.view',
    (raw) => (isPlannerView(raw) ? raw : 'week'),
    (view) => (view === 'week' ? null : view),
);
