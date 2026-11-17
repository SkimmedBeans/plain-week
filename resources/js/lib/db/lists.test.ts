import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { onLocalChange } from './changes';
import { db, wipeLocalDatabase } from './database';
import {
    createList,
    deleteList,
    LIST_NAME_MAX,
    queryLists,
    renameList,
} from './lists';
import { querySomedayTasks } from './queries';
import { createTask, listTasksIn, moveTask } from './tasks';

const DAY = '2026-10-12';

beforeEach(async () => {
    await wipeLocalDatabase();
});

async function texts(list: number) {
    return (await listTasksIn({ date: null, list })).map((task) => task.text);
}

describe('list repository', () => {
    it('creates a named list in the next unused column with an outbox entry', async () => {
        const list = await createList('Ideas');

        expect(list).toMatchObject({
            name: 'Ideas',
            column: 3,
            deleted_at: null,
        });
        expect(list.position).not.toBe('');
        expect(list.created_at).toBe(list.updated_at);
        expect(await db.someday_lists.get(list.id)).toEqual(list);
        expect(await db.list_outbox.get(list.id)).toEqual({
            list_id: list.id,
        });
    });

    it('trims names and enforces the 1–60 character limit', async () => {
        expect((await createList('  Padded  ')).name).toBe('Padded');
        expect(() => createList('')).toThrow();
        expect(() => createList('   ')).toThrow();
        expect(() => createList('x'.repeat(LIST_NAME_MAX + 1))).toThrow();
        expect((await createList('y'.repeat(LIST_NAME_MAX))).name).toBe(
            'y'.repeat(LIST_NAME_MAX),
        );
    });

    it('never reuses a column, even of a deleted list', async () => {
        const first = await createList('A');
        const second = await createList('B');

        await deleteList(first.id);

        const third = await createList('C');

        expect([first.column, second.column, third.column]).toEqual([3, 4, 5]);
    });

    it('renames a list and rewrites its outbox entry', async () => {
        const list = await createList('A');
        const renamed = await renameList(list.id, ' B ');

        expect(renamed).toMatchObject({ id: list.id, name: 'B' });
        expect(renamed?.updated_at).not.toBe(list.updated_at);
        expect(await db.someday_lists.get(list.id)).toEqual(renamed);
        expect(await db.list_outbox.get(list.id)).toEqual({
            list_id: list.id,
        });
    });

    it('returns null when renaming or deleting a missing list', async () => {
        expect(await renameList('missing', 'A')).toBeNull();
        expect(await deleteList('missing')).toBeNull();
    });

    it('notifies listeners after a change, not after a no-op', async () => {
        let calls = 0;
        const unsubscribe = onLocalChange(() => calls++);

        await createList('A');
        await renameList('missing', 'B');
        unsubscribe();

        expect(calls).toBe(1);
    });

    it('lists live lists in position order, without tombstones', async () => {
        const a = await createList('A');
        const b = await createList('B');

        expect((await queryLists()).map((list) => list.name)).toEqual([
            'A',
            'B',
        ]);

        await db.someday_lists.put({ ...a, position: 'zzz' });
        await deleteList(b.id);

        expect((await queryLists()).map((list) => list.name)).toEqual(['A']);
    });
});

describe('deleting a list', () => {
    it('soft-deletes the row and queues it for sync', async () => {
        const list = await createList('A');
        const deleted = await deleteList(list.id);
        const stored = (await db.someday_lists.get(list.id))!;

        expect(deleted).toMatchObject({ id: list.id, deleted_at: null });
        expect(stored.deleted_at).not.toBeNull();
        expect(stored.deleted_at).toBe(stored.updated_at);
        expect(await db.list_outbox.get(list.id)).toEqual({
            list_id: list.id,
        });
        expect(await queryLists()).toEqual([]);
        expect(await deleteList(list.id)).toBeNull();
    });

    it('moves the list tasks to the end of Someday, in order, and queues each one', async () => {
        const list = await createList('A');
        await createTask({ text: 'base', date: null, list: 0 });
        const one = await createTask({
            text: 'one',
            date: null,
            list: list.column,
        });
        const two = await createTask({
            text: 'two',
            date: null,
            list: list.column,
        });
        const three = await createTask({
            text: 'three',
            date: null,
            list: list.column,
        });

        await deleteList(list.id);

        expect(await texts(0)).toEqual(['base', 'one', 'two', 'three']);
        expect(await texts(list.column)).toEqual([]);
        for (const task of [one, two, three]) {
            expect((await db.tasks.get(task.id))?.someday_column).toBe(0);
            expect((await db.outbox.get(task.id))?.revision).toBe(2);
        }
    });

    it('keeps the order the tasks had in the list', async () => {
        const list = await createList('A');
        await createTask({ text: 'base', date: null, list: 0 });
        const one = await createTask({
            text: 'one',
            date: null,
            list: list.column,
        });
        await createTask({ text: 'two', date: null, list: list.column });
        const three = await createTask({
            text: 'three',
            date: null,
            list: list.column,
        });

        await moveTask(three.id, {
            date: null,
            list: list.column,
            beforeId: one.id,
        });
        await deleteList(list.id);

        expect(await texts(0)).toEqual(['base', 'three', 'one', 'two']);
    });
});

describe('querySomedayTasks per list', () => {
    it('returns only the tasks of the requested list', async () => {
        const list = await createList('A');
        await createTask({ text: 'base', date: null, list: 0 });
        await createTask({ text: 'one', date: null, list: list.column });
        await createTask({ text: 'two', date: null, list: list.column });

        expect(
            (await querySomedayTasks(DAY, list.column)).map((t) => t.text),
        ).toEqual(['one', 'two']);
        expect((await querySomedayTasks(DAY, 0)).map((t) => t.text)).toEqual([
            'base',
        ]);
    });

    it('shows orphaned tasks in Someday when their list is missing locally', async () => {
        const list = await createList('A');
        await createTask({ text: 'orphan', date: null, list: list.column });

        await db.someday_lists.delete(list.id);

        expect((await querySomedayTasks(DAY, 0)).map((t) => t.text)).toEqual([
            'orphan',
        ]);
    });
});
