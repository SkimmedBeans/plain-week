import { describe, expect, it } from 'vite-plus/test';
import { parseDateKey } from '@/lib/db/dates';
import type { Task } from '@/lib/db/types';
import {
    edgeDropDate,
    originalSpot,
    placementKey,
    placementLabel,
    resolveDrop,
    resolveListDrop,
    resolveListReorder,
} from './drop';

const MONDAY = '2026-10-12';
const TUESDAY = '2026-10-13';
const WEEK = parseDateKey(MONDAY);

function task(id: string, overrides: Partial<Task> = {}): Task {
    return {
        id,
        text: id,
        date: MONDAY,
        someday_column: null,
        position: id,
        done: false,
        done_at: null,
        color: 'none',
        time: null,
        notes: '',
        subtasks: [],
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-10-01T00:00:00.000Z',
        deleted_at: null,
        recurrence: null,
        series_id: null,
        occurrence_date: null,
        ...overrides,
    };
}

const a = task('a');
const b = task('b');
const c = task('c');
const monday = [a, b, c];

describe('resolveListDrop', () => {
    it('lands an open task at the end of the open ones when the day has done tasks', () => {
        // Stored order a, done1, b; shown: a, b, then Completed: done1.
        const done1 = task('a5', { done: true });
        const x = task('z');
        const shown = [a, b, done1, x];
        const dayWithX = [a, b, x, done1];

        // Dropped on the lower half of the last open task, or on a done row.
        for (const slot of [2, 3, 4]) {
            expect(resolveListDrop(x, { date: TUESDAY }, shown, slot)).toEqual({
                move: { date: TUESDAY, afterId: 'b', beforeId: null },
                indicator: { listKey: TUESDAY, beforeTaskId: 'a5' },
            });
        }

        // Within its own day: moving the last open task to the end is no move.
        expect(resolveListDrop(x, { date: MONDAY }, dayWithX, 4)).toBeNull();
        // Moving a above b, at the end of the open ones.
        expect(resolveListDrop(a, { date: MONDAY }, [a, b, done1], 2)).toEqual({
            move: { date: MONDAY, afterId: 'b', beforeId: null },
            indicator: { listKey: MONDAY, beforeTaskId: 'a5' },
        });
    });

    it('reorders within a day', () => {
        expect(resolveListDrop(c, { date: MONDAY }, monday, 0)).toEqual({
            move: { date: MONDAY, afterId: null, beforeId: 'a' },
            indicator: { listKey: MONDAY, beforeTaskId: 'a' },
        });
        expect(resolveListDrop(a, { date: MONDAY }, monday, 2)?.move).toEqual({
            date: MONDAY,
            afterId: 'b',
            beforeId: 'c',
        });
        expect(resolveListDrop(a, { date: MONDAY }, monday, 3)?.move).toEqual({
            date: MONDAY,
            afterId: 'c',
            beforeId: null,
        });
    });

    it('returns null when the task would stay where it is', () => {
        expect(resolveListDrop(b, { date: MONDAY }, monday, 1)).toBeNull();
        expect(resolveListDrop(b, { date: MONDAY }, monday, 2)).toBeNull();
    });

    it('moves to another day between the rows of the slot', () => {
        const d = task('d', { date: TUESDAY });

        expect(resolveListDrop(a, { date: TUESDAY }, [d], 1)).toEqual({
            move: { date: TUESDAY, afterId: 'd', beforeId: null },
            indicator: { listKey: TUESDAY, beforeTaskId: null },
        });
        expect(resolveListDrop(a, { date: TUESDAY }, [], 0)?.move).toEqual({
            date: TUESDAY,
            afterId: null,
            beforeId: null,
        });
    });

    it('moves to and from Someday', () => {
        const s = task('s', { date: null, someday_column: 0 });

        expect(resolveListDrop(a, { date: null, list: 0 }, [s], 0)).toEqual({
            move: {
                date: null,
                list: 0,
                afterId: null,
                beforeId: 's',
            },
            indicator: { listKey: 'someday', beforeTaskId: 's' },
        });
        expect(resolveListDrop(s, { date: MONDAY }, monday, 1)?.move).toEqual({
            date: MONDAY,
            afterId: 'a',
            beforeId: 'b',
        });
        // A task dropped where it already is does nothing.
        expect(resolveListDrop(s, { date: null, list: 0 }, [s], 1)).toBeNull();
    });

    it('uses only untimed tasks as neighbours in a day', () => {
        const t1 = task('t1', { time: '09:00', position: 'z' });
        const t2 = task('t2', { time: '10:00', position: 'y' });
        const day = [t1, t2, a, b];
        const other = task('x', { date: TUESDAY });

        // Dropped among the timed tasks: lands before the first untimed one.
        expect(resolveListDrop(other, { date: MONDAY }, day, 1)).toEqual({
            move: { date: MONDAY, afterId: null, beforeId: 'a' },
            indicator: { listKey: MONDAY, beforeTaskId: 'a' },
        });
        expect(resolveListDrop(other, { date: MONDAY }, day, 3)?.move).toEqual({
            date: MONDAY,
            afterId: 'a',
            beforeId: 'b',
        });
        // Moving an untimed task above the timed ones keeps it first untimed.
        expect(resolveListDrop(a, { date: MONDAY }, day, 0)).toBeNull();
    });

    it('keeps a timed task in its slot by time', () => {
        const t1 = task('t1', { time: '09:00' });
        const t2 = task('t2', { time: '10:00' });
        const late = task('late', { time: '09:30', date: TUESDAY });

        expect(
            resolveListDrop(t1, { date: MONDAY }, [t1, t2, a], 3),
        ).toBeNull();
        expect(
            resolveListDrop(late, { date: MONDAY }, [t1, t2, a], 3)?.indicator,
        ).toEqual({ listKey: MONDAY, beforeTaskId: 't2' });
    });

    it('treats Someday as positional even for timed tasks', () => {
        const s1 = task('s1', { date: null, someday_column: 0, time: '09:00' });
        const s2 = task('s2', { date: null });

        expect(
            resolveListDrop(s2, { date: null, list: 0 }, [s1, s2], 0)?.move,
        ).toEqual({
            date: null,
            list: 0,
            afterId: null,
            beforeId: 's1',
        });
    });

    it('moves to and between named Someday lists', () => {
        const n1 = task('n1', { date: null, someday_column: 1 });
        const n2 = task('n2', { date: null, someday_column: 2 });

        expect(
            resolveListDrop(a, { date: null, list: 1 }, [n1], 0, 'Ideas'),
        ).toEqual({
            move: { date: null, list: 1, afterId: null, beforeId: 'n1' },
            name: 'Ideas',
            indicator: { listKey: 'someday:1', beforeTaskId: 'n1' },
        });
        expect(
            resolveListDrop(n1, { date: null, list: 2 }, [n2], 1, 'Later')
                ?.move,
        ).toEqual({ date: null, list: 2, afterId: 'n2', beforeId: null });
        // A named list is its own list: staying put is a no-op.
        expect(
            resolveListDrop(n1, { date: null, list: 1 }, [n1], 1, 'Ideas'),
        ).toBeNull();
        // Someday and a named list are different lists.
        expect(
            resolveListDrop(n1, { date: null, list: 0 }, [], 0, 'Someday')
                ?.move,
        ).toEqual({ date: null, list: 0, afterId: null, beforeId: null });
    });
});

describe('resolveDrop', () => {
    it('drops above or below the task under the pointer', () => {
        const target = {
            type: 'task' as const,
            placement: { date: MONDAY },
            tasks: monday,
            taskId: 'b',
        };

        expect(resolveDrop(c, { ...target, below: false }, WEEK)?.move).toEqual(
            { date: MONDAY, afterId: 'a', beforeId: 'b' },
        );
        expect(resolveDrop(a, { ...target, below: true }, WEEK)?.move).toEqual({
            date: MONDAY,
            afterId: 'b',
            beforeId: 'c',
        });
    });

    it('appends when dropped on the list (its empty rows)', () => {
        expect(
            resolveDrop(
                task('x', { date: TUESDAY }),
                { type: 'list', placement: { date: MONDAY }, tasks: monday },
                WEEK,
            )?.move,
        ).toEqual({ date: MONDAY, afterId: 'c', beforeId: null });
    });

    it('moves to the same weekday of the next or previous week on an edge', () => {
        const wednesday = task('w', { date: '2026-10-14' });

        expect(
            resolveDrop(wednesday, { type: 'edge', direction: 1 }, WEEK),
        ).toEqual({ move: { date: '2026-10-21' }, indicator: null });
        expect(
            resolveDrop(wednesday, { type: 'edge', direction: -1 }, WEEK),
        ).toEqual({ move: { date: '2026-10-07' }, indicator: null });
    });

    it('does nothing when an edge drop lands on the same day', () => {
        const wednesday = task('w', { date: '2026-10-14' });

        // The previous week of W43 is the task's own week.
        expect(
            resolveDrop(
                wednesday,
                { type: 'edge', direction: -1 },
                parseDateKey('2026-10-19'),
            ),
        ).toBeNull();
    });

    it('passes the named list’s name through', () => {
        const n1 = task('n1', { date: null, someday_column: 1 });

        expect(
            resolveDrop(
                a,
                {
                    type: 'task',
                    placement: { date: null, list: 1 },
                    tasks: [n1],
                    name: 'Ideas',
                    taskId: 'n1',
                    below: true,
                },
                WEEK,
            ),
        ).toEqual({
            move: { date: null, list: 1, afterId: 'n1', beforeId: null },
            name: 'Ideas',
            indicator: { listKey: 'someday:1', beforeTaskId: null },
        });
        expect(
            resolveDrop(
                task('x', { date: TUESDAY }),
                {
                    type: 'list',
                    placement: { date: null, list: 2 },
                    tasks: [n1],
                    name: 'Later',
                },
                WEEK,
            )?.move,
        ).toEqual({ date: null, list: 2, afterId: 'n1', beforeId: null });
    });
});

describe('edgeDropDate', () => {
    it('targets the week beyond the shown one', () => {
        const friday = task('f', { date: '2026-10-16' });

        expect(edgeDropDate(friday, parseDateKey('2026-10-19'), 1)).toBe(
            '2026-10-30',
        );
    });

    it('keeps Sunday as the last day of the week', () => {
        const sunday = task('s', { date: '2026-10-18' });

        expect(edgeDropDate(sunday, WEEK, 1)).toBe('2026-10-25');
        expect(edgeDropDate(sunday, WEEK, -1)).toBe('2026-10-11');
    });

    it('crosses month and year boundaries', () => {
        const thursday = task('t', { date: '2026-12-31' });

        expect(edgeDropDate(thursday, parseDateKey('2026-12-28'), 1)).toBe(
            '2027-01-07',
        );
        expect(edgeDropDate(thursday, parseDateKey('2026-12-28'), -1)).toBe(
            '2026-12-24',
        );
    });

    it('sends a Someday task to the Monday of that week', () => {
        const someday = task('s', { date: null });

        expect(edgeDropDate(someday, WEEK, 1)).toBe('2026-10-19');
        expect(edgeDropDate(someday, WEEK, -1)).toBe('2026-10-05');
    });
});

describe('placementKey and placementLabel', () => {
    it('names days and Someday', () => {
        expect(placementKey({ date: MONDAY })).toBe(MONDAY);
        expect(placementKey({ date: null, list: 0 })).toBe('someday');
        expect(placementLabel({ date: MONDAY })).toBe('Mon 12 Oct');
        expect(placementLabel({ date: null, list: 0 })).toBe('Someday');
    });

    it('names named lists by column, the label from the list name', () => {
        expect(placementKey({ date: null, list: 1 })).toBe('someday:1');
        expect(placementKey({ date: null, list: 2 })).toBe('someday:2');
        expect(placementLabel({ date: null, list: 1 }, 'Ideas')).toBe('Ideas');
        // Without a name it falls back to Someday.
        expect(placementLabel({ date: null, list: 1 })).toBe('Someday');
    });
});

describe('originalSpot', () => {
    it('puts a task back between its positional neighbours', () => {
        expect(
            originalSpot(b, { placement: { date: MONDAY }, tasks: monday }),
        ).toEqual({
            date: MONDAY,
            afterId: 'a',
            beforeId: 'c',
        });
    });

    it('skips timed tasks in a day', () => {
        const timed = task('t', { time: '09:00' });

        expect(
            originalSpot(a, {
                placement: { date: MONDAY },
                tasks: [timed, a, b],
            }),
        ).toEqual({ date: MONDAY, afterId: undefined, beforeId: 'b' });
    });
});

describe('resolveListReorder', () => {
    const lists = [{ listId: 'a' }, { listId: 'b' }, { listId: 'c' }];

    it("maps a column hit to the dragged list's target index", () => {
        // A to after C: lands last (index 2 of 3).
        expect(resolveListReorder(lists, 'a', 'c', false)).toEqual({
            toIndex: 3,
        });
        // C to before A: lands first.
        expect(resolveListReorder(lists, 'c', 'a', true)).toEqual({
            toIndex: 0,
        });
        // A to before C: lands in the middle.
        expect(resolveListReorder(lists, 'a', 'c', true)).toEqual({
            toIndex: 2,
        });
    });

    it('is a no-op when the list would land where it already is', () => {
        // B is already after A and already before C.
        expect(resolveListReorder(lists, 'b', 'a', false)).toBeNull();
        expect(resolveListReorder(lists, 'b', 'c', true)).toBeNull();
        // A is already before B.
        expect(resolveListReorder(lists, 'a', 'b', true)).toBeNull();
    });

    it('returns null for a missing dragged or hit list', () => {
        expect(resolveListReorder(lists, 'missing', 'a', true)).toBeNull();
        expect(resolveListReorder(lists, 'a', 'missing', true)).toBeNull();
    });
});
