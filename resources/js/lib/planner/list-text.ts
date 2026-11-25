import type { Task } from '@/lib/db/types';

/**
 * A list's tasks as plain text for the clipboard (F23): one task per line,
 * open tasks first in their shown order, each task's sub-tasks under it
 * indented as "  - text" (a done sub-task ends in " ✓"), then, when any are
 * done, a blank line, "Completed" and the done tasks in the same format.
 * Empty when the list has no tasks.
 */
export function listToPlainText(
    tasks: Pick<Task, 'text' | 'done' | 'subtasks'>[],
    completedLabel = 'Completed',
): string {
    const lines = (group: typeof tasks) =>
        group.flatMap((task) => [
            task.text,
            ...task.subtasks.map(
                (subtask) => `  - ${subtask.text}${subtask.done ? ' ✓' : ''}`,
            ),
        ]);
    const open = lines(tasks.filter((task) => !task.done));
    const done = lines(tasks.filter((task) => task.done));

    if (done.length === 0) {
        return open.join('\n');
    }

    return [
        ...open,
        ...(open.length > 0 ? [''] : []),
        completedLabel,
        ...done,
    ].join('\n');
}
