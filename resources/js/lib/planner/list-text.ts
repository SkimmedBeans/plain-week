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

export type ParsedTask = {
    text: string;
    done: boolean;
    subtasks: { text: string; done: boolean }[];
};

/**
 * Reads note text back as tasks (F24, the reverse of `listToPlainText`):
 * every non-empty line is a task, a line starting with "-" (or "•", "*")
 * after one is its sub-task (" ✓" at the end marks it done), and tasks after
 * a "Completed" line are done. Leading list markers and "[ ]" / "[x]" boxes
 * are dropped.
 */
export function parsePlainTextList(
    text: string,
    completedLabel = 'Completed',
): ParsedTask[] {
    const tasks: ParsedTask[] = [];
    let done = false;

    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trimEnd();
        const trimmed = line.trim();

        if (trimmed === '') {
            continue;
        }
        if (
            trimmed.toLocaleLowerCase() === completedLabel.toLocaleLowerCase()
        ) {
            done = true;
            continue;
        }

        const indented = /^\s+[-•*]\s+/.test(line);
        let body = trimmed.replace(/^[-•*]\s+/, '');
        let checked = false;
        const box = /^\[( |x|X)\]\s*/.exec(body);
        if (box) {
            checked = box[1] !== ' ';
            body = body.slice(box[0].length);
        }
        if (body.endsWith(' ✓')) {
            checked = true;
            body = body.slice(0, -2).trimEnd();
        }
        if (body === '') {
            continue;
        }

        const parent = tasks[tasks.length - 1];
        if (indented && parent) {
            parent.subtasks.push({ text: body, done: checked });
        } else {
            tasks.push({ text: body, done: done || checked, subtasks: [] });
        }
    }

    return tasks;
}
