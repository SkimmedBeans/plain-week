import { describe, expect, it } from 'vite-plus/test';
import {
    compareListKeys,
    cursorAfterRemoval,
    firstInList,
    initialCursor,
    lastInList,
    moveCursor,
    newTaskRowCursor,
    resolveCursor,
    shiftCursorWeeks,
} from './cursor';
import type { CursorList } from './cursor';

const LISTS: CursorList[] = [
    { key: '2026-10-12', taskIds: ['a', 'b', 'c'], openCount: 3 },
    { key: '2026-10-13', taskIds: ['d'], openCount: 1 },
    { key: '2026-10-14', taskIds: [], openCount: 0 },
    { key: 'someday', taskIds: ['s'], openCount: 1 },
];

describe('compareListKeys', () => {
    it('orders days by date, then Someday', () => {
        expect(
            ['2026-10-18', 'someday', '2026-10-12'].sort(compareListKeys),
        ).toEqual(['2026-10-12', '2026-10-18', 'someday']);
    });

    it('orders the Someday lists by column after the base list', () => {
        expect(
            ['someday:2', 'someday', '2026-10-18', 'someday:1'].sort(
                compareListKeys,
            ),
        ).toEqual(['2026-10-18', 'someday', 'someday:1', 'someday:2']);
    });
});

describe('resolveCursor', () => {
    it('follows its task to another list', () => {
        expect(
            resolveCursor(LISTS, {
                listKey: '2026-10-12',
                taskId: 'd',
                index: 0,
            }),
        ).toEqual({ listKey: '2026-10-13', taskId: 'd', index: 0 });
    });

    it('falls back to the same row when its task is gone', () => {
        expect(
            resolveCursor(LISTS, {
                listKey: '2026-10-12',
                taskId: 'x',
                index: 1,
            }),
        ).toEqual({ listKey: '2026-10-12', taskId: 'b', index: 1 });
        expect(
            resolveCursor(LISTS, {
                listKey: '2026-10-13',
                taskId: 'x',
                index: 1,
            }),
        ).toEqual({ listKey: '2026-10-13', taskId: null, index: 1 });
    });

    it('is null when its list is not on screen', () => {
        expect(
            resolveCursor(LISTS, {
                listKey: '2026-10-19',
                taskId: null,
                index: 0,
            }),
        ).toBeNull();
        expect(resolveCursor(LISTS, null)).toBeNull();
    });

    it('keeps a new-task row cursor on that row as tasks are added', () => {
        expect(resolveCursor(LISTS, newTaskRowCursor('2026-10-12'))).toEqual({
            listKey: '2026-10-12',
            taskId: null,
            index: 3,
        });
    });
});

describe('initialCursor', () => {
    it("starts on today's first task, or the first list in another week", () => {
        expect(initialCursor(LISTS, '2026-10-13')?.taskId).toBe('d');
        expect(initialCursor(LISTS, '2026-10-14')).toEqual({
            listKey: '2026-10-14',
            taskId: null,
            index: 0,
        });
        expect(initialCursor(LISTS, '2026-10-30')?.taskId).toBe('a');
        expect(initialCursor([], '2026-10-30')).toBeNull();
    });
});

describe('moveCursor', () => {
    const on = (listKey: string, index: number) =>
        resolveCursor(LISTS, { listKey, taskId: null, index })!;

    it('steps through a list, ending on its new-task row', () => {
        expect(moveCursor(LISTS, on('2026-10-12', 0), 'down').taskId).toBe('b');
        expect(moveCursor(LISTS, on('2026-10-12', 2), 'down')).toEqual({
            listKey: '2026-10-12',
            taskId: null,
            index: 3,
        });
        expect(moveCursor(LISTS, on('2026-10-12', 3), 'down').index).toBe(3);
        expect(moveCursor(LISTS, on('2026-10-12', 0), 'up').taskId).toBe('a');
    });

    it('moves across lists keeping roughly the same row', () => {
        expect(moveCursor(LISTS, on('2026-10-12', 2), 'nextList')).toEqual({
            listKey: '2026-10-13',
            taskId: null,
            index: 1,
        });
        expect(
            moveCursor(LISTS, on('2026-10-13', 0), 'previousList').taskId,
        ).toBe('a');
    });

    it('goes back to the row it was last on in a list', () => {
        const rows = new Map([['2026-10-12', 2]]);

        expect(
            moveCursor(LISTS, on('2026-10-13', 0), 'previousList', rows),
        ).toEqual({ listKey: '2026-10-12', taskId: 'c', index: 2 });
        // A list it has not been on: the same row.
        expect(
            moveCursor(LISTS, on('2026-10-13', 0), 'nextList', rows).listKey,
        ).toBe('2026-10-14');
    });

    it('goes from Sunday on to Someday, and stops at the ends', () => {
        expect(moveCursor(LISTS, on('2026-10-14', 0), 'nextList').taskId).toBe(
            's',
        );
        expect(moveCursor(LISTS, on('someday', 0), 'nextList').listKey).toBe(
            'someday',
        );
        expect(
            moveCursor(LISTS, on('2026-10-12', 1), 'previousList').taskId,
        ).toBe('b');
    });

    it('jumps to the first and last task', () => {
        expect(firstInList(LISTS, on('2026-10-12', 3)).taskId).toBe('a');
        expect(lastInList(LISTS, on('2026-10-12', 0)).taskId).toBe('c');
        expect(lastInList(LISTS, on('2026-10-14', 0)).taskId).toBeNull();
    });
});

describe('cursorAfterRemoval', () => {
    it('lands on the task that takes the row, or the new-task row', () => {
        expect(
            cursorAfterRemoval(LISTS, {
                listKey: '2026-10-12',
                taskId: 'b',
                index: 1,
            }),
        ).toEqual({ listKey: '2026-10-12', taskId: 'c', index: 1 });
        expect(
            cursorAfterRemoval(LISTS, {
                listKey: '2026-10-13',
                taskId: 'd',
                index: 0,
            }),
        ).toEqual({ listKey: '2026-10-13', taskId: null, index: 0 });
    });
});

describe('a list with done tasks', () => {
    // p and q are open, r is done: the row order is p, q, row, r.
    const LISTS: CursorList[] = [
        { key: '2026-10-15', taskIds: ['p', 'q', 'r'], openCount: 2 },
    ];
    const on = (index: number) =>
        resolveCursor(LISTS, { listKey: '2026-10-15', taskId: null, index })!;

    it('keeps the new-task row between the open and done tasks', () => {
        expect(resolveCursor(LISTS, newTaskRowCursor('2026-10-15'))).toEqual({
            listKey: '2026-10-15',
            taskId: null,
            index: 2,
        });
        expect(moveCursor(LISTS, on(1), 'down')).toEqual({
            listKey: '2026-10-15',
            taskId: null,
            index: 2,
        });
        expect(moveCursor(LISTS, on(2), 'down')).toEqual({
            listKey: '2026-10-15',
            taskId: 'r',
            index: 3,
        });
        expect(moveCursor(LISTS, on(3), 'up')).toEqual({
            listKey: '2026-10-15',
            taskId: null,
            index: 2,
        });
    });

    it('resolves a done task one row below its shown order', () => {
        expect(
            resolveCursor(LISTS, {
                listKey: '2026-10-15',
                taskId: 'r',
                index: 0,
            }),
        ).toEqual({ listKey: '2026-10-15', taskId: 'r', index: 3 });
    });

    it('jumps to the first open task and the last done task', () => {
        expect(firstInList(LISTS, on(3)).taskId).toBe('p');
        expect(lastInList(LISTS, on(0))).toEqual({
            listKey: '2026-10-15',
            taskId: 'r',
            index: 3,
        });
    });

    it('moves the row up when an open task is removed', () => {
        expect(
            cursorAfterRemoval(LISTS, {
                listKey: '2026-10-15',
                taskId: 'q',
                index: 1,
            }),
        ).toEqual({ listKey: '2026-10-15', taskId: null, index: 1 });
        // Removing the last done task leaves the cursor on the row.
        expect(
            cursorAfterRemoval(LISTS, {
                listKey: '2026-10-15',
                taskId: 'r',
                index: 3,
            }),
        ).toEqual({ listKey: '2026-10-15', taskId: null, index: 2 });
    });
});

describe('shiftCursorWeeks', () => {
    it('keeps the weekday and row in another week', () => {
        expect(
            shiftCursorWeeks(
                { listKey: '2026-10-12', taskId: 'a', index: 2 },
                1,
            ),
        ).toEqual({ listKey: '2026-10-19', taskId: null, index: 2 });
        expect(
            shiftCursorWeeks(
                { listKey: '2026-10-12', taskId: 'a', index: 0 },
                -1,
            ).listKey,
        ).toBe('2026-10-05');
    });

    it('leaves a Someday cursor as it is', () => {
        const cursor = { listKey: 'someday', taskId: 's', index: 0 };

        expect(shiftCursorWeeks(cursor, 1)).toBe(cursor);
    });

    it('leaves a named Someday cursor as it is', () => {
        const cursor = { listKey: 'someday:1', taskId: 'n1', index: 0 };

        expect(shiftCursorWeeks(cursor, 1)).toBe(cursor);
    });
});

describe('named Someday lists', () => {
    const NAMED: CursorList[] = [
        { key: '2026-10-12', taskIds: ['a'], openCount: 1 },
        { key: 'someday', taskIds: ['s'], openCount: 1 },
        { key: 'someday:1', taskIds: ['n1'], openCount: 1 },
        { key: 'someday:2', taskIds: ['n2'], openCount: 1 },
    ];

    it('walks from Someday on to the named lists, in column order', () => {
        expect(
            moveCursor(
                NAMED,
                resolveCursor(NAMED, {
                    listKey: 'someday',
                    taskId: 's',
                    index: 0,
                })!,
                'nextList',
            ),
        ).toEqual({ listKey: 'someday:1', taskId: 'n1', index: 0 });
        expect(
            moveCursor(
                NAMED,
                resolveCursor(NAMED, {
                    listKey: 'someday:1',
                    taskId: 'n1',
                    index: 0,
                })!,
                'previousList',
            ),
        ).toEqual({ listKey: 'someday', taskId: 's', index: 0 });
    });

    it('stops at the last named list', () => {
        const last = resolveCursor(NAMED, {
            listKey: 'someday:2',
            taskId: 'n2',
            index: 0,
        })!;

        expect(moveCursor(NAMED, last, 'nextList').listKey).toBe('someday:2');
    });
    it('orders named lists by a display rank when one is given', () => {
        const rank = (column: number) =>
            column === 0 ? 0 : column === 5 ? 1 : 2;
        const keys = ['someday:3', 'someday', 'someday:5', '2026-10-12'];

        expect(keys.sort((a, b) => compareListKeys(a, b, rank))).toEqual([
            '2026-10-12',
            'someday',
            'someday:5',
            'someday:3',
        ]);
    });
});
