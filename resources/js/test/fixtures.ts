import type { SomedayList, Task } from '@/lib/db/types';

export function makeTask(overrides: Partial<Task> = {}): Task {
    return {
        id: crypto.randomUUID(),
        text: 'Task',
        date: '2026-10-12',
        someday_column: null,
        position: 'a0',
        done: false,
        done_at: null,
        color: 'none',
        time: null,
        notes: '',
        subtasks: [],
        created_at: '2026-10-12T10:00:00.000Z',
        updated_at: '2026-10-12T10:00:00.000Z',
        deleted_at: null,
        recurrence: null,
        series_id: null,
        occurrence_date: null,
        ...overrides,
    };
}

/** A named list (column 3 is the first one a named list can have). */
export function makeList(overrides: Partial<SomedayList> = {}): SomedayList {
    return {
        id: crypto.randomUUID(),
        name: 'List',
        column: 3,
        position: 'a0',
        created_at: '2026-10-12T10:00:00.000Z',
        updated_at: '2026-10-12T10:00:00.000Z',
        deleted_at: null,
        ...overrides,
    };
}
