import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { t } from '@/lib/i18n';

type PendingUndo = {
    toastId?: string | number;
    run: () => void | Promise<void>;
    label?: string;
};

export const UNDO_HISTORY_LIMIT = 50;
let pending: PendingUndo[] = [];
const historyListeners = new Set<() => void>();
let latestUndo: PendingUndo | undefined;
let undoing: Promise<void> | undefined;

function updateHistory() {
    latestUndo = pending.at(-1);
    historyListeners.forEach((listener) => listener());
}

function subscribeHistory(listener: () => void) {
    historyListeners.add(listener);
    return () => {
        historyListeners.delete(listener);
    };
}

export function useLatestUndo() {
    return useSyncExternalStore(subscribeHistory, () => latestUndo);
}

export function recordUndo(run: PendingUndo['run'], label?: string): void {
    pending = [...pending, { run, label }].slice(-UNDO_HISTORY_LIMIT);
    updateHistory();
}

export function toastWithUndo(
    message: string,
    onUndo: PendingUndo['run'],
    openAction?: { label: string; onClick: () => void },
    historyLabel = message,
): string | number {
    const entry: PendingUndo = { run: onUndo, label: historyLabel };
    const toastId = toast(message, {
        action: { label: t('planner.undo'), onClick: () => undoEntry(entry) },
        cancel: openAction,
    });
    entry.toastId = toastId;
    pending = [...pending, entry].slice(-UNDO_HISTORY_LIMIT);
    updateHistory();

    return toastId;
}

function undoEntry(entry: PendingUndo) {
    if (!pending.includes(entry)) {
        return;
    }
    if (undoing) {
        void undoing.then(() => undoEntry(entry));
        return;
    }
    pending = pending.filter((other) => other !== entry);
    updateHistory();
    if (entry.toastId !== undefined) {
        toast.dismiss(entry.toastId);
    }
    undoing = Promise.resolve()
        .then(entry.run)
        .catch(() => {
            toast.error(t('planner.undoChangeFailed'));
        })
        .finally(() => {
            undoing = undefined;
        });
}

export function undoLatest(): boolean {
    if (!latestUndo) {
        return false;
    }
    if (undoing) {
        void undoing.then(undoLatest);
    } else {
        undoEntry(latestUndo);
    }
    return true;
}

/** Test helper. */
export function clearUndoHistory(): void {
    pending = [];
    updateHistory();
}
