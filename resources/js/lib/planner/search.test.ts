// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { wipeLocalDatabase } from '@/lib/db/database';
import { createList } from '@/lib/db/lists';
import {
    createTask,
    deleteTask,
    setRecurrence,
    toggleDone,
} from '@/lib/db/tasks';
import { matchesQuery, searchTasks } from './search';

beforeEach(async () => {
    await wipeLocalDatabase();
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
