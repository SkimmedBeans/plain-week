import { toast } from 'sonner';
import { v7 as uuidv7 } from 'uuid';
import {
    clearListNote,
    convertListToNote,
    setListNote,
    undoListToNote,
} from '@/lib/db/lists';
import { db } from '@/lib/db/database';
import {
    createTask,
    createUndoLog,
    toggleDone,
    undoChanges,
} from '@/lib/db/tasks';
import type { SomedayList } from '@/lib/db/types';
import { t } from '@/lib/i18n';
import { parsePlainTextList } from './list-text';
import { toastWithUndo } from './undo';
import { plannerView, setListCollapsed } from './device-settings';

function openConverted(list: SomedayList, view: 'lists' | 'notes') {
    return {
        label: t(
            view === 'notes' ? 'planner.openInNotes' : 'planner.openInLists',
        ),
        onClick: () => {
            setListCollapsed(list.id, false);
            plannerView.set(view);
        },
    };
}

/** Converts a named list to a note (F24), with Undo. */
export async function listToNoteWithUndo(list: SomedayList): Promise<void> {
    try {
        const ids = await convertListToNote(list.id);
        if (ids === null) {
            toast.error(t('planner.noteConvertFailed'));

            return;
        }
        toastWithUndo(
            t('planner.listToNoteDone', { name: list.name }),
            () => {
                void undoListToNote(list.id, ids);
            },
            openConverted(list, 'notes'),
        );
    } catch {
        toast.error(t('planner.noteConvertFailed'));
    }
}

/**
 * Converts a note back to tasks (F24): each line becomes a task in the
 * list (see `parsePlainTextList`), then the note ends.
 */
export async function noteToTasks(list: SomedayList): Promise<void> {
    try {
        const tables = [
            db.someday_lists,
            db.list_outbox,
            db.tasks,
            db.outbox,
            db.meta,
        ];
        const undo = createUndoLog();
        const converted = await db.transaction('rw', tables, async () => {
            const current = await db.someday_lists.get(list.id);
            if (
                current?.deleted_at !== null ||
                typeof current.note !== 'string'
            ) {
                return null;
            }

            const parsed = parsePlainTextList(
                current.note,
                t('planner.completedSection'),
            );
            for (const item of parsed) {
                const task = await createTask(
                    {
                        text: item.text,
                        date: null,
                        list: current.column,
                        subtasks: item.subtasks.map((subtask) => ({
                            id: uuidv7(),
                            ...subtask,
                        })),
                    },
                    { undo },
                );
                if (item.done) {
                    await toggleDone(task.id, { undo });
                }
            }
            const updated = await clearListNote(current.id);
            const taskIds = [...undo.before.keys()];
            const created = await db.tasks.bulkGet(taskIds);
            return updated
                ? {
                      snapshot: current.note,
                      count: parsed.length,
                      updatedAt: updated.updated_at,
                      taskIds,
                      created,
                  }
                : null;
        });
        if (converted === null) {
            toast.error(t('planner.noteConvertFailed'));
            return;
        }

        toastWithUndo(
            t('planner.noteToTasksDone', { count: converted.count }),
            () => {
                void db
                    .transaction('rw', tables, async () => {
                        const current = await db.someday_lists.get(list.id);
                        if (
                            current?.updated_at !== converted.updatedAt ||
                            current.deleted_at !== null
                        ) {
                            throw new Error('The converted list changed');
                        }
                        const tasks = await db.tasks.bulkGet(converted.taskIds);
                        if (
                            tasks.some(
                                (task, index) =>
                                    task?.updated_at !==
                                    converted.created[index]?.updated_at,
                            )
                        ) {
                            throw new Error('A converted task changed');
                        }
                        await undoChanges(undo);
                        await setListNote(list.id, converted.snapshot);
                    })
                    .catch(() => toast.error(t('planner.noteConvertFailed')));
            },
            openConverted(list, 'lists'),
        );
    } catch {
        toast.error(t('planner.noteConvertFailed'));
    }
}
