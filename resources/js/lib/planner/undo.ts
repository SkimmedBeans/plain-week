import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { t } from '@/lib/i18n';

/**
 * The toasts that offer "Undo" (a move, a delete), and the `u` shortcut that
 * presses the newest one still on screen. A toast that was dismissed or timed
 * out cannot be undone with `u`: restoring its old snapshot could overwrite
 * later edits.
 */

type PendingUndo = { toastId: string | number; run: () => void };

/** Undo toasts on screen, oldest first. */
let pending: PendingUndo[] = [];

function forget(entry: PendingUndo) {
    pending = pending.filter((other) => other !== entry);
}

/**
 * Shows `message` with an "Undo" action that runs `onUndo` once. Returns the
 * toast's id (see `dismissUndoToast`).
 */
export function toastWithUndo(
    message: string,
    onUndo: () => void,
    openAction?: { label: string; onClick: () => void },
): string | number {
    let done = false;
    const run = () => {
        forget(entry);

        if (!done) {
            done = true;
            onUndo();
        }
    };
    const toastId = toast(message, {
        action: { label: t('planner.undo'), onClick: run },
        cancel: openAction,
        onDismiss: () => forget(entry),
        onAutoClose: () => forget(entry),
    });
    const entry: PendingUndo = { toastId, run };

    pending.push(entry);

    return toastId;
}

/** Closes an "Undo" toast without running it (its change was undone elsewhere). */
export function dismissUndoToast(toastId: string | number): void {
    pending = pending.filter((entry) => entry.toastId !== toastId);
    toast.dismiss(toastId);
}

/**
 * Undoes what the newest "Undo" toast on screen offers and closes it.
 * Returns whether there was one.
 */
export function undoLatest(): boolean {
    const entry = pending.at(-1);

    if (!entry) {
        return false;
    }

    entry.run();
    toast.dismiss(entry.toastId);

    return true;
}

/**
 * The session's recent deletes, for the header's "Undo delete" button. Unlike
 * the toasts they stay until the page reloads, so a restore first checks that
 * nothing touched the deleted rows since (`canRestore`). Only deletes are kept:
 * a delete can be put back safely, an old move could overwrite later edits.
 */

export const DELETE_HISTORY_LIMIT = 20;

type DeleteEntry = {
    title: string;
    /** Puts the task back; the delete leaves the history first. */
    undo: () => void;
    /** Whether the rows are still exactly as the delete left them. */
    canRestore: () => Promise<boolean>;
};

let deletes: DeleteEntry[] = [];
const listeners = new Set<() => void>();
let snapshot = { count: 0, latestTitle: null as string | null };

function changed() {
    snapshot = {
        count: deletes.length,
        latestTitle: deletes.at(-1)?.title ?? null,
    };
    listeners.forEach((listener) => listener());
}

/**
 * Records a delete. Returns the function every route (toast, `u`, header)
 * calls to undo it: it runs `restore` at most once and drops the entry.
 */
export function recordDelete(
    title: string,
    restore: () => void,
    canRestore: () => Promise<boolean>,
): () => void {
    let done = false;
    const entry: DeleteEntry = {
        title,
        canRestore,
        undo: () => {
            if (done) {
                return;
            }

            done = true;
            deletes = deletes.filter((other) => other !== entry);
            changed();
            restore();
        },
    };

    deletes = [...deletes, entry].slice(-DELETE_HISTORY_LIMIT);
    changed();

    return entry.undo;
}

/** Undoes the newest recorded delete, if its rows were not changed since. */
export async function undoLastDelete(): Promise<void> {
    const entry = deletes.at(-1);

    if (!entry) {
        return;
    }

    if (!(await entry.canRestore())) {
        deletes = deletes.filter((other) => other !== entry);
        changed();
        toast('Already restored or changed since, so not undone.');

        return;
    }

    entry.undo();
    toast(`Restored "${entry.title}".`);
}

function subscribe(listener: () => void) {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

/** How many deletes can be undone, and the newest one's title. */
export function useDeleteHistory(): {
    count: number;
    latestTitle: string | null;
} {
    return useSyncExternalStore(subscribe, () => snapshot);
}

/** Test helper: forgets the history. */
export function clearDeleteHistory(): void {
    deletes = [];
    changed();
}
