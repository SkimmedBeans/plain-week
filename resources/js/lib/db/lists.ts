import { v7 as uuidv7 } from 'uuid';
import { notifyLocalChange } from './changes';
import { db } from './database';
import { nextTimestamp } from './dates';
import { compareListOrder, positionBetween } from './position';
import { listToPlainText } from '@/lib/planner/list-text';
import type { SomedayList, TaskColor } from './types';

/** The maximum length of a list name (the server enforces the same). */
export const LIST_NAME_MAX = 60;

/** The maximum length of a note's text (F24; the server enforces the same). */
export const NOTE_MAX = 20000;

/**
 * A list name for a create or rename: trimmed, and 1–60 characters. Throws
 * otherwise.
 */
function normaliseName(name: string): string {
    const trimmed = name.trim();

    if (trimmed.length === 0 || trimmed.length > LIST_NAME_MAX) {
        throw new Error('A list name must be 1–60 characters.');
    }

    return trimmed;
}

/**
 * Runs `build` and writes the list rows it returns, plus a `list_outbox`
 * entry for each, in one read-write transaction, then wakes the sync engine
 * (the same pattern as the task writes in `tasks.ts`).
 */
async function writeLists<T>(
    build: () => Promise<{ rows: SomedayList[]; result: T }>,
): Promise<T> {
    let written = 0;
    const result = await db.transaction(
        'rw',
        [db.someday_lists, db.list_outbox],
        async () => {
            const built = await build();
            const rows = [
                ...new Map(built.rows.map((row) => [row.id, row])).values(),
            ];

            await db.someday_lists.bulkPut(rows);
            await db.list_outbox.bulkPut(
                rows.map((row) => ({ list_id: row.id })),
            );

            written = rows.length;

            return built.result;
        },
    );

    if (written > 0) {
        notifyLocalChange();
    }

    return result;
}

/**
 * The live named lists (tombstones left out), in their `position` order.
 * Someday itself (column 0) is not a row and is not returned.
 */
export async function queryLists(): Promise<SomedayList[]> {
    const lists = await db.someday_lists
        .filter((list) => list.deleted_at === null)
        .toArray();

    return lists.sort(compareListOrder);
}

/**
 * Adds a new named Someday list and writes it plus its outbox entry. The
 * column is the max over all lists (deleted ones included) plus one, so it
 * is never reused and never 0–2.
 */
export function createList(name: string): Promise<SomedayList> {
    const trimmed = normaliseName(name);

    return writeLists(async () => {
        const now = nextTimestamp();
        const lists = await db.someday_lists.toArray();
        const column = Math.max(2, ...lists.map((list) => list.column)) + 1;
        // After the last list, so a new list is shown at the end.
        const last = lists.reduce<string | null>(
            (max, list) =>
                list.deleted_at === null &&
                (max === null || list.position > max)
                    ? list.position
                    : max,
            null,
        );
        const list: SomedayList = {
            id: uuidv7(),
            name: trimmed,
            column,
            position: positionBetween(last, null),
            created_at: now,
            updated_at: now,
            deleted_at: null,
        };

        return { rows: [list], result: list };
    });
}

/**
 * Renames a list and rewrites its outbox entry. `null` when the list does
 * not exist (or was deleted).
 */
export async function renameList(
    id: string,
    name: string,
): Promise<SomedayList | null> {
    return updateList(id, { name: normaliseName(name) });
}

export function setListColor(
    id: string,
    color: TaskColor,
): Promise<SomedayList | null> {
    return updateList(id, { color });
}

/** Archives a list (hidden from the planner, tasks kept) or restores it. */
export function setListArchived(
    id: string,
    archived: boolean,
): Promise<SomedayList | null> {
    return updateList(id, { archived });
}

/** Ends a note (F24): the list holds tasks again (see `noteToTasks`). */
export function clearListNote(id: string): Promise<SomedayList | null> {
    return updateList(id, { note: null });
}

/** Saves a note's text (F24), cut to `NOTE_MAX` characters. */
export function setListNote(
    id: string,
    note: string,
): Promise<SomedayList | null> {
    return updateList(id, { note: note.slice(0, NOTE_MAX) });
}

/**
 * Turns a named list into a note (F24), in one write: its tasks become the
 * note's lines in the "Copy all tasks" format (`listToPlainText`: open tasks,
 * sub-tasks indented, then "Completed" and the done ones) and are deleted.
 * Returns the deleted task ids (for Undo, `undoListToNote`), or null when the
 * list is gone or already a note.
 */
export async function convertListToNote(id: string): Promise<string[] | null> {
    let written = false;
    const result = await db.transaction(
        'rw',
        [db.someday_lists, db.list_outbox, db.tasks, db.outbox],
        async () => {
            const list = await db.someday_lists.get(id);

            if (
                !list ||
                list.deleted_at !== null ||
                typeof list.note === 'string'
            ) {
                return null;
            }

            const now = nextTimestamp(list.updated_at);
            const rows = (
                await db.tasks
                    .where('someday_column')
                    .equals(list.column)
                    .filter(
                        (task) =>
                            task.date === null && task.deleted_at === null,
                    )
                    .toArray()
            ).sort((a, b) =>
                a.position === b.position
                    ? a.id < b.id
                        ? -1
                        : 1
                    : a.position < b.position
                      ? -1
                      : 1,
            );
            const note = listToPlainText(rows).slice(0, NOTE_MAX);

            for (const task of rows) {
                await db.tasks.put({
                    ...task,
                    deleted_at: now,
                    updated_at: now,
                });
                const entry = await db.outbox.get(task.id);
                await db.outbox.put({
                    task_id: task.id,
                    revision: (entry?.revision ?? 0) + 1,
                });
            }

            await db.someday_lists.put({ ...list, note, updated_at: now });
            await db.list_outbox.put({ list_id: id });
            written = true;

            return rows.map((task) => task.id);
        },
    );

    if (written) {
        notifyLocalChange();
    }

    return result;
}

/** Undoes `convertListToNote`: the tasks come back and the note goes. */
export async function undoListToNote(
    id: string,
    taskIds: string[],
): Promise<void> {
    await db.transaction(
        'rw',
        [db.someday_lists, db.list_outbox, db.tasks, db.outbox],
        async () => {
            const list = await db.someday_lists.get(id);

            if (!list) {
                return;
            }

            const now = nextTimestamp(list.updated_at);

            for (const taskId of taskIds) {
                const task = await db.tasks.get(taskId);
                if (!task) {
                    continue;
                }
                await db.tasks.put({
                    ...task,
                    deleted_at: null,
                    updated_at: now,
                });
                const entry = await db.outbox.get(taskId);
                await db.outbox.put({
                    task_id: taskId,
                    revision: (entry?.revision ?? 0) + 1,
                });
            }

            await db.someday_lists.put({
                ...list,
                note: null,
                updated_at: now,
            });
            await db.list_outbox.put({ list_id: id });
        },
    );
    notifyLocalChange();
}

function updateList(
    id: string,
    patch: Pick<Partial<SomedayList>, 'name' | 'color' | 'archived' | 'note'>,
): Promise<SomedayList | null> {
    return writeLists(async () => {
        const list = await db.someday_lists.get(id);

        if (!list || list.deleted_at !== null) {
            return { rows: [], result: null };
        }

        const updated: SomedayList = {
            ...list,
            ...patch,
            updated_at: nextTimestamp(list.updated_at),
        };

        return { rows: [updated], result: updated };
    });
}

/**
 * Evenly-spaced positions for the given order (lists made before ordering
 * existed all share one position); only the lists whose position actually
 * changed are returned, ready to be written.
 */
function reassignPositions(order: SomedayList[]): SomedayList[] {
    const now = nextTimestamp();
    const rows: SomedayList[] = [];
    let position: string | null = null;

    for (const list of order) {
        position = positionBetween(position, null);

        if (list.position !== position) {
            rows.push({ ...list, position, updated_at: now });
        }
    }

    return rows;
}

/**
 * Moves a list one place earlier (`-1`) or later (`1`) among the live lists.
 * The lists are given fresh, evenly spread positions in their new order, and
 * only the ones whose position changed are written and pushed. `null` when
 * the list does not exist, was deleted, or is already at that end.
 */
export async function moveList(
    id: string,
    direction: -1 | 1,
): Promise<SomedayList | null> {
    return writeLists(async () => {
        const live = (await db.someday_lists.toArray())
            .filter((list) => list.deleted_at === null)
            .sort(compareListOrder);
        const from = live.findIndex((list) => list.id === id);
        const to = from + direction;

        if (from === -1 || to < 0 || to >= live.length) {
            return { rows: [], result: null };
        }

        const order = [...live];
        [order[from], order[to]] = [order[to], order[from]];
        const rows = reassignPositions(order);

        return {
            rows,
            result: rows.find((list) => list.id === id) ?? live[from],
        };
    });
}

/**
 * Moves a list so that it comes before the list at index `to` of the live
 * order (`0` is before the first, `live.length` is after the last). Same
 * write as `moveList`. `null` when the list does not exist, was deleted, or
 * the index is out of range; the list itself, unchanged, when it already
 * sits there (nothing is written).
 */
export async function moveListTo(
    id: string,
    to: number,
): Promise<SomedayList | null> {
    return writeLists(async () => {
        const live = (await db.someday_lists.toArray())
            .filter((list) => list.deleted_at === null)
            .sort(compareListOrder);
        const from = live.findIndex((list) => list.id === id);

        if (from === -1 || to < 0 || to > live.length) {
            return { rows: [], result: null };
        }

        const order = [...live];
        const [moved] = order.splice(from, 1);
        order.splice(to > from ? to - 1 : to, 0, moved);

        if (order.every((list, index) => list.id === live[index].id)) {
            return { rows: [], result: live[from] };
        }

        const rows = reassignPositions(order);

        return {
            rows,
            result: rows.find((list) => list.id === id) ?? live[from],
        };
    });
}

/**
 * Soft-deletes a list and moves its tasks to the end of Someday (column 0),
 * in one transaction, keeping their relative order. Each moved task gets a
 * task outbox entry so the move is pushed. `null` when the list does not
 * exist (or was already deleted).
 */
export async function deleteList(id: string): Promise<SomedayList | null> {
    let written = false;
    const result = await db.transaction(
        'rw',
        [db.someday_lists, db.list_outbox, db.tasks, db.outbox],
        async () => {
            const list = await db.someday_lists.get(id);

            if (!list || list.deleted_at !== null) {
                return null;
            }

            const now = nextTimestamp();

            // The last position in Someday (column 0): the moved tasks go
            // after it, in the order they are shown in their list.
            const baseRows = await db.tasks
                .where('someday_column')
                .equals(0)
                .filter((task) => task.date === null)
                .toArray();
            let cursor =
                baseRows.reduce(
                    (last, task) =>
                        task.position > last ? task.position : last,
                    '',
                ) || null;

            const rows = (
                await db.tasks
                    .where('someday_column')
                    .equals(list.column)
                    .filter((task) => task.date === null)
                    .toArray()
            ).sort((a, b) =>
                a.position === b.position
                    ? a.id < b.id
                        ? -1
                        : 1
                    : a.position < b.position
                      ? -1
                      : 1,
            );

            for (const task of rows) {
                cursor = positionBetween(cursor, null);
                await db.tasks.put({
                    ...task,
                    date: null,
                    someday_column: 0,
                    position: cursor,
                    updated_at: now,
                });
                const entry = await db.outbox.get(task.id);
                await db.outbox.put({
                    task_id: task.id,
                    revision: (entry?.revision ?? 0) + 1,
                });
            }

            await db.someday_lists.put({
                ...list,
                deleted_at: now,
                updated_at: now,
            });
            await db.list_outbox.put({ list_id: id });

            written = true;
            return list;
        },
    );

    if (written) {
        notifyLocalChange();
    }

    return result;
}
