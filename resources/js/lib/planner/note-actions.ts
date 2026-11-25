import { toast } from 'sonner';
import { v7 as uuidv7 } from 'uuid';
import {
    clearListNote,
    convertListToNote,
    undoListToNote,
} from '@/lib/db/lists';
import { createTask, toggleDone } from '@/lib/db/tasks';
import type { SomedayList } from '@/lib/db/types';
import { t } from '@/lib/i18n';
import { parsePlainTextList } from './list-text';
import { toastWithUndo } from './undo';

/** Converts a named list to a note (F24), with Undo. */
export async function listToNoteWithUndo(list: SomedayList): Promise<void> {
    try {
        const ids = await convertListToNote(list.id);
        if (ids === null) {
            toast.error(t('planner.noteConvertFailed'));

            return;
        }
        toastWithUndo(t('planner.listToNoteDone', { name: list.name }), () => {
            void undoListToNote(list.id, ids);
        });
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
        const parsed = parsePlainTextList(
            list.note ?? '',
            t('planner.completedSection'),
        );

        for (const item of parsed) {
            const task = await createTask({
                text: item.text,
                date: null,
                list: list.column,
                subtasks: item.subtasks.map((subtask) => ({
                    id: uuidv7(),
                    ...subtask,
                })),
            });
            if (item.done) {
                await toggleDone(task.id);
            }
        }

        await clearListNote(list.id);
        toast(t('planner.noteToTasksDone', { count: parsed.length }));
    } catch {
        toast.error(t('planner.noteConvertFailed'));
    }
}
