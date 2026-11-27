import { toItem } from '@/lib/recurrence/expand';
import type { Subtask, Task, WeekSlot } from './types';

export function weekEntryId(taskId: string, subtaskId?: string): string {
    return taskId + '@week' + (subtaskId === undefined ? '' : '@' + subtaskId);
}

export function weekEntrySource(id: string) {
    const separator = id.indexOf('@week');
    if (separator < 0) {
        return null;
    }

    return {
        taskId: id.slice(0, separator),
        subtaskId: id.slice(separator + '@week@'.length) || undefined,
    };
}

export function weekEntry(task: Task, slot: WeekSlot, subtask?: Subtask) {
    return toItem({
        ...task,
        ...slot,
        id: weekEntryId(task.id, subtask?.id),
        someday_column: null,
        ...(subtask && {
            text: subtask.text,
            done: subtask.done,
            done_at: null,
            subtasks: [],
            notes: '',
            time: null,
        }),
    });
}
