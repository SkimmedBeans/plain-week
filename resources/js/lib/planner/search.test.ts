// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { wipeLocalDatabase } from '@/lib/db/database';
import {
    convertListToNote,
    createList,
    deleteList,
    setListNote,
    setListArchived,
} from '@/lib/db/lists';
import {
    createTask,
    deleteTask,
    setRecurrence,
    toggleDone,
} from '@/lib/db/tasks';
import { matchesQuery, searchPlanner, searchTasks } from './search';

beforeEach(async () => {
    await wipeLocalDatabase();
});

it('finds list names and the matching line of an archived note alongside tasks', async () => {
    const list = await createList('Café supplies');
    const note = await createList('Recipes');
    await convertListToNote(note.id);
    await setListNote(note.id, 'Breakfast\nCafé pastry\nDinner');
    await setListArchived(note.id, true);
    const removed = await createList('Café deleted');
    await deleteList(removed.id);
    const task = await createTask({
        text: 'Café booking',
        date: null,
        list: 0,
    });

    const results = await searchPlanner('cafe');
    expect(results).toMatchObject([
        { kind: 'list', openId: list.id, where: 'Lists' },
        {
            kind: 'note',
            openId: note.id,
            snippet: 'Café pastry',
            where: 'Archived notes',
        },
        { kind: 'task', openId: task.id, where: 'Someday' },
    ]);
});

describe('matchesQuery', () => {
    const task = (text: string, notes = '', subtasks: string[] = []) => ({
        text,
        notes,
        subtasks: subtasks.map((s, i) => ({
            id: `${i}`,
            text: s,
            done: false,
        })),
    });

    it('needs every word, in any order, ignoring case and accents', () => {
        expect(matchesQuery(task('Café with Ana'), 'ana CAFE')).toBe(true);
        expect(matchesQuery(task('Café with Ana'), 'ana tea')).toBe(false);
    });

    it('looks in notes and sub-tasks too', () => {
        expect(matchesQuery(task('Trip', 'book the ferry'), 'ferry')).toBe(
            true,
        );
        expect(matchesQuery(task('Trip', '', ['Passport']), 'pass')).toBe(true);
    });

    it('matches nothing for an empty query', () => {
        expect(matchesQuery(task('Anything'), '  ')).toBe(false);
    });
});

describe('searchTasks', () => {
    it('finds tasks in days, Someday and named lists, open ones first', async () => {
        const shed = await createList('Shed');
        const done = await createTask({
            text: 'Paint fence',
            date: '2026-10-12',
        });
        await toggleDone(done.id);
        await createTask({
            text: 'Paint shed door',
            date: null,
            list: shed.column,
        });
        await createTask({ text: 'Paint ideas', date: null, list: 0 });
        await createTask({ text: 'Paint room', date: '2026-10-14' });
        const gone = await createTask({
            text: 'Paint gone',
            date: '2026-10-14',
        });
        await deleteTask(gone.id);

        const results = await searchTasks('paint', '2026-10-13');

        expect(results.map((r) => [r.text, r.where, r.done])).toEqual([
            ['Paint room', 'Wed 14 Oct', false],
            ['Paint ideas', 'Someday', false],
            ['Paint shed door', 'Shed', false],
            ['Paint fence', 'Mon 12 Oct', true],
        ]);
    });

    it('finds a repeating task once, opening its next occurrence', async () => {
        const task = await createTask({ text: 'Gym', date: '2026-10-12' });
        await setRecurrence(task.id, { type: 'weekly', weekdays: [1, 3] });

        const results = await searchTasks('gym', '2026-10-13');

        expect(results).toHaveLength(1);
        expect(results[0].repeats).toBe(true);
        expect(results[0].openId).toContain('2026-10-14');
    });
});
