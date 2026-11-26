import { toast } from 'sonner';
import { toDateKey } from '@/lib/db/dates';
import { getSeries } from '@/lib/db/queries';
import {
    clearCompletedSomeday,
    createUndoLog,
    deleteTask,
    duplicateTask,
    moveTask,
    undoChanges,
    unchangedSince,
    updateTask,
} from '@/lib/db/tasks';
import type { MoveTaskInput, Scope } from '@/lib/db/tasks';
import type { Task, TaskColor } from '@/lib/db/types';
import { isRecurring } from '@/lib/recurrence/expand';
import type { PlannerTask } from '@/lib/recurrence/expand';
import { placementLabel } from './drop';
import { asksScope } from './repeat';
import { nextWeekOf, tomorrowOf } from './quick-moves';
import { saveLocally } from './save-locally';
import { dismissUndoToast, recordDelete, toastWithUndo } from './undo';
import { t } from '@/lib/i18n';

/**
 * The task actions shared by the task dialog and the task context menu. They
 * write to the local database without making the UI wait, and report a failed
 * write with a toast. The ones that return a promise resolve with the item that
 * now stands for the task, or `undefined` when the write failed (already
 * reported), so callers never need a `catch`.
 */

/**
 * Whether a change to this item has to ask "Only this task / This and all
 * future": an occurrence, or an exception whose series still exists. A plain
 * task, a series row or an orphaned exception has nothing to ask about.
 */
export async function needsScope(item: PlannerTask): Promise<boolean> {
    return asksScope(item, isRecurring(item) ? await getSeries(item) : null);
}

/** Runs a write; on failure shows `error` and resolves with `undefined`. */
function settle<T>(write: Promise<T>, error: string): Promise<T | undefined> {
    return write.catch(() => {
        toast.error(error);

        return undefined;
    });
}

export function setTaskColor(
    id: string,
    color: TaskColor,
    scope?: Scope,
): Promise<PlannerTask | undefined> {
    return settle(
        updateTask(id, { color }, { scope }),
        t('planner.updateTaskFailed'),
    );
}

/**
 * Quick moves. "Today" is read when the action runs, so a planner left open
 * overnight counts from the right day.
 */
export function tomorrowMove(task: Task): MoveTaskInput {
    return { date: tomorrowOf(task.date, toDateKey(new Date())) };
}

export function nextWeekMove(task: Task): MoveTaskInput {
    return { date: nextWeekOf(task.date, toDateKey(new Date())) };
}

/** To today. The day is read when the action runs, like the other moves. */
export function todayMove(): MoveTaskInput {
    return { date: toDateKey(new Date()) };
}

/** To the end of the base Someday list (column 0). */
export const SOMEDAY_MOVE: MoveTaskInput = { date: null, list: 0 };

/**
 * Moves a task (an occurrence: only this one) and says where it went in a
 * toast ("Moved to Tue 13 Oct.") whose "Undo" puts it back.
 */
export function moveWithUndo(
    id: string,
    move: MoveTaskInput,
    /** The named list's name, when `move` goes to one. */
    name?: string,
): Promise<PlannerTask | undefined> {
    const undo = createUndoLog();

    return settle(
        moveTask(id, move, { undo }).then((moved) => {
            toastWithUndo(
                t('planner.movedTo', { place: placementLabel(move, name) }),
                () =>
                    saveLocally(undoChanges(undo), {
                        error: t('planner.undoMoveFailed'),
                    }),
            );

            return moved;
        }),
        t('planner.moveTaskFailed'),
    );
}

export function duplicateWithToast(id: string): Promise<Task | undefined> {
    return settle(
        duplicateTask(id).then((copy) => {
            toast.success(t('planner.taskDuplicated'));

            return copy;
        }),
        t('planner.duplicateTaskFailed'),
    );
}

export function clearCompletedWithUndo(
    list: number,
    taskIds: string[],
): Promise<void | undefined> {
    const undo = createUndoLog();

    return settle(
        clearCompletedSomeday(list, taskIds, { undo }).then((count) => {
            if (count > 0) {
                toastWithUndo(t('planner.completedCleared'), () =>
                    saveLocally(undoChanges(undo), {
                        error: t('planner.restoreCompletedFailed'),
                    }),
                );
            }
        }),
        t('planner.clearCompletedFailed'),
    );
}

/**
 * Deletes at once and offers "Undo" in a toast, which puts back everything
 * the delete changed (with scope 'future', the ended series too).
 */
export function deleteWithUndo(
    id: string,
    scope?: Scope,
): Promise<Task | undefined> {
    const undo = createUndoLog();

    return settle(
        deleteTask(id, { scope, undo }).then((deleted) => {
            // The header's "Undo delete" can run long after the toast is
            // gone, so it first checks nothing changed these rows since. The
            // snapshot is read alongside the toast, not before it: the toast
            // (and `u`) must be there as soon as the delete is written.
            const check = unchangedSince(undo);
            const canRestore = () => check.then((unchanged) => unchanged());
            let toastId: string | number | undefined;
            const undoDelete = recordDelete(
                deleted.text,
                () => {
                    if (toastId !== undefined) {
                        dismissUndoToast(toastId);
                    }

                    saveLocally(undoChanges(undo), {
                        error: t('planner.restoreTaskFailed'),
                    });
                },
                canRestore,
            );

            toastId = toastWithUndo(t('planner.taskDeleted'), undoDelete);

            return deleted;
        }),
        t('planner.deleteTaskFailed'),
    );
}
