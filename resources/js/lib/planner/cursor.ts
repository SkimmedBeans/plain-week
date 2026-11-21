import { parseDateKey, toDateKey } from '@/lib/db/dates';
import { SOMEDAY_KEY, isSomedayKey } from '@/lib/planner/drop';
import { addDays } from '@/lib/planner/week';

/**
 * The keyboard cursor, as pure functions: one task, or one list's new-task
 * row, of the lists on screen. The planner keeps the cursor in state
 * (`components/planner/keyboard-cursor.tsx`) and moves it with these.
 */

/**
 * The elements the cursor can stop on, which take focus: a task's text button
 * (`data-task-open`, inside its `data-task-id` row) or a new-task row. The
 * row under the cursor carries `data-cursor`; each list is `data-list`.
 */
export const CURSOR_STOP_SELECTOR = '[data-task-open], [data-new-task-row]';

/** The focusable stop of the row under the cursor. */
export const CURSOR_ROW_STOP_SELECTOR =
    '[data-cursor] [data-task-open], [data-cursor][data-new-task-row]';

/** A day or the Someday list on screen, keyed like `placementKey`. */
export type CursorList = {
    key: string;
    taskIds: string[];
    /** The shown tasks' open count (the done ones are the rest). */
    openCount: number;
};

export type Cursor = {
    listKey: string;
    /** The task under the cursor; `null` for the list's new-task row. */
    taskId: string | null;
    /**
     * Its row in the list's visual order: the open tasks, then the new-task
     * row, then the done tasks. Where the cursor lands when its task is
     * gone (deleted, moved off screen).
     */
    index: number;
};

/**
 * The cursor on a list's new-task row, which stays there while tasks are
 * added above it (typing new tasks in that row). Its row moves with the
 * open tasks; the infinity index always resolves to the row itself.
 */
export function newTaskRowCursor(listKey: string): Cursor {
    return { listKey, taskId: null, index: Number.POSITIVE_INFINITY };
}

export type CursorMotion = 'up' | 'down' | 'previousList' | 'nextList';

/**
 * Lists in visual order: the days by date, then the Someday lists: Someday
 * first, then the named ones by `rank` (their display order; by column when
 * no rank is given).
 */
export function compareListKeys(
    a: string,
    b: string,
    /** Display rank of a Someday column; by default the column itself. */
    rank: (column: number) => number = (column) => column,
): number {
    const aSomeday = isSomedayKey(a);
    const bSomeday = isSomedayKey(b);

    if (aSomeday !== bSomeday) {
        return aSomeday ? 1 : -1;
    }
    if (aSomeday) {
        const column = (key: string) =>
            key === SOMEDAY_KEY ? 0 : Number(key.slice(SOMEDAY_KEY.length + 1));

        return rank(column(a)) - rank(column(b));
    }
    return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The cursor at row `index` of `list`: its open tasks, then the new-task
 * row (at `openCount`), then its done tasks. `POSITIVE_INFINITY` is always
 * the new-task row, wherever the open tasks push it.
 */
function at(list: CursorList, index: number): Cursor {
    if (index === Number.POSITIVE_INFINITY) {
        return { listKey: list.key, taskId: null, index: list.openCount };
    }
    const clamped = Math.min(Math.max(index, 0), list.taskIds.length);

    if (clamped === list.openCount) {
        return { listKey: list.key, taskId: null, index: clamped };
    }
    // The shown order is open then done; the new-task row takes one row
    // between them, so done tasks render one row below their index.
    const taskIndex = clamped < list.openCount ? clamped : clamped - 1;

    return {
        listKey: list.key,
        taskId: list.taskIds[taskIndex],
        index: clamped,
    };
}

/**
 * Where `cursor` is now: on its task, wherever that task is shown; else on
 * the row at its index in its list; `null` when its list is not on screen.
 */
export function resolveCursor(
    lists: CursorList[],
    cursor: Cursor | null,
): Cursor | null {
    if (cursor === null) {
        return null;
    }

    const onTask =
        cursor.taskId !== null ? cursorOnTask(lists, cursor.taskId) : null;

    if (onTask) {
        return onTask;
    }

    const list = lists.find(({ key }) => key === cursor.listKey);

    return list ? at(list, cursor.index) : null;
}

/** The cursor on task `taskId`, wherever it is shown. */
export function cursorOnTask(
    lists: CursorList[],
    taskId: string,
): Cursor | null {
    for (const list of lists) {
        const index = list.taskIds.indexOf(taskId);

        if (index !== -1) {
            // Done tasks render one row below their shown-order index: the
            // new-task row sits between the open and done tasks.
            return {
                listKey: list.key,
                taskId,
                index: index < list.openCount ? index : index + 1,
            };
        }
    }

    return null;
}

/**
 * Where the first motion puts the cursor: today's first task (its new-task
 * row when it has none), or the first list on screen in another week.
 */
export function initialCursor(
    lists: CursorList[],
    today: string,
): Cursor | null {
    const list = lists.find(({ key }) => key === today) ?? lists[0];

    return list ? at(list, 0) : null;
}

/**
 * Moves a resolved cursor: up and down within its list (the new-task row is
 * the stop between the open and done tasks), to the previous / next list on
 * the row it was last on there (`rows`, by list key), or else roughly the
 * same row.
 */
export function moveCursor(
    lists: CursorList[],
    cursor: Cursor,
    motion: CursorMotion,
    rows: ReadonlyMap<string, number> = new Map(),
): Cursor {
    const position = lists.findIndex(({ key }) => key === cursor.listKey);

    if (position === -1) {
        return cursor;
    }

    switch (motion) {
        case 'up':
            return at(lists[position], cursor.index - 1);
        case 'down':
            return at(lists[position], cursor.index + 1);
        case 'previousList':
        case 'nextList': {
            const target = lists[position + (motion === 'nextList' ? 1 : -1)];

            return target
                ? at(target, rows.get(target.key) ?? cursor.index)
                : cursor;
        }
    }
}

/** The first task of the cursor's list (its new-task row when empty). */
export function firstInList(lists: CursorList[], cursor: Cursor): Cursor {
    const list = lists.find(({ key }) => key === cursor.listKey);

    return list ? at(list, 0) : cursor;
}

/**
 * The last task of the cursor's list: the last done task when there are
 * any, else the last open one (its new-task row when empty).
 */
export function lastInList(lists: CursorList[], cursor: Cursor): Cursor {
    const list = lists.find(({ key }) => key === cursor.listKey);

    if (!list) {
        return cursor;
    }
    const doneCount = list.taskIds.length - list.openCount;

    return at(
        list,
        doneCount > 0 ? list.taskIds.length : list.taskIds.length - 1,
    );
}

/**
 * Where the cursor goes when its task leaves the list (deleted, moved to
 * another week or to Someday): the task that takes its row, or the new-task
 * row. Unlike `resolveCursor`, it does not follow the task.
 */
export function cursorAfterRemoval(
    lists: CursorList[],
    cursor: Cursor,
): Cursor {
    const list = lists.find(({ key }) => key === cursor.listKey);

    if (!list) {
        return cursor;
    }
    const index =
        cursor.taskId === null ? -1 : list.taskIds.indexOf(cursor.taskId);
    // An open task was removed: the new-task row moves up one row.
    const openCount =
        index !== -1 && index < list.openCount
            ? list.openCount - 1
            : list.openCount;

    return at(
        {
            key: list.key,
            taskIds: list.taskIds.filter((id) => id !== cursor.taskId),
            openCount,
        },
        cursor.index,
    );
}

/**
 * The cursor carried to another week: the same weekday and row. The Someday
 * list is on every week and stays as it is.
 */
export function shiftCursorWeeks(cursor: Cursor, weeks: number): Cursor {
    if (isSomedayKey(cursor.listKey)) {
        return cursor;
    }

    return {
        listKey: toDateKey(addDays(parseDateKey(cursor.listKey), weeks * 7)),
        taskId: null,
        index: cursor.index,
    };
}
