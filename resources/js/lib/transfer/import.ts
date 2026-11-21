import { Dexie } from 'dexie';
import { generateNKeysBetween } from 'fractional-indexing';
import { v7 as uuidv7 } from 'uuid';
import { notifyLocalChange } from '@/lib/db/changes';
import { db } from '@/lib/db/database';
import type { PlainWeekDatabase } from '@/lib/db/database';
import { nextTimestamp } from '@/lib/db/dates';
import {
    compareListOrder,
    compareSomedayOrder,
    compareTaskOrder,
    somedayColumnOf,
} from '@/lib/db/position';
import type { SomedaySortKey } from '@/lib/db/position';
import { SOMEDAY_COLUMNS } from '@/lib/db/types';
import { t } from '@/lib/i18n';
import type { SomedayList, Task } from '@/lib/db/types';
import { EXPORT_FORMAT, EXPORT_VERSION } from './format';
import type { ExportFile } from './format';
import { backupRows } from './rows';
import { ImportError, taskLabel, validateList, validateTask } from './validate';

export { ImportError } from './validate';

/**
 * Importing a backup ADDS its tasks and named lists next to the existing
 * ones, with new ids; nothing that is already in the local database changes.
 * See "Export format" in docs/architecture.md.
 */

export type ImportSummary = {
    /** Tasks the user will see added: plain tasks plus series. */
    taskCount: number;
    /** How many of `taskCount` repeat. */
    recurringCount: number;
    /** Named lists the user will see added. */
    listCount: number;
};

export type ImportPlan = ImportSummary & {
    /** The rows to write: series first, then plain tasks, then exceptions. */
    tasks: Task[];
    /** Named lists to create (new ids, fresh timestamps); order is kept. */
    lists: SomedayList[];
};

/** Far above any real planner (10 000 tasks are about 5 MB). */
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

export type ApplyImportOptions = {
    database?: PlainWeekDatabase;
    /** Rows per transaction. */
    batchSize?: number;
    /** Called after each committed batch with the rows written so far. */
    onProgress?: (written: number, total: number) => void;
};

/**
 * Reads and validates an export file. Throws an `ImportError` with a message
 * for the user when it is not a Plain Week export, has an unsupported
 * version or holds an invalid task.
 */
export async function parseImport(input: Blob | string): Promise<ExportFile> {
    const size = typeof input === 'string' ? input.length : input.size;

    if (size > MAX_IMPORT_BYTES) {
        throw new ImportError(
            t('settings.transfer.tooLarge', {
                size: MAX_IMPORT_BYTES / 1024 / 1024,
            }),
        );
    }

    const text = typeof input === 'string' ? input : await input.text();
    let data: unknown;

    try {
        data = JSON.parse(text);
    } catch {
        throw new ImportError(t('settings.transfer.notJson'));
    }

    if (
        typeof data !== 'object' ||
        data === null ||
        (data as { format?: unknown }).format !== EXPORT_FORMAT
    ) {
        throw new ImportError(t('settings.transfer.notExport'));
    }

    const file = data as Record<string, unknown>;

    if (file.version !== EXPORT_VERSION) {
        throw new ImportError(
            typeof file.version === 'number' && file.version > EXPORT_VERSION
                ? t('settings.transfer.newerVersion', {
                      version: file.version,
                  })
                : t('settings.transfer.unsupportedVersion', {
                      version: JSON.stringify(file.version),
                  }),
        );
    }

    if (!Array.isArray(file.tasks)) {
        throw new ImportError(t('settings.transfer.noTaskList'));
    }

    const tasks = file.tasks.map((task, index) => validateTask(task, index));
    const ids = new Set<string>();

    tasks.forEach((task, index) => {
        if (ids.has(task.id)) {
            throw new ImportError(
                t('settings.transfer.fieldError', {
                    label: taskLabel(index),
                    field: 'id',
                    rule: t('settings.transfer.rule.duplicateId'),
                }),
            );
        }

        ids.add(task.id);
    });

    // Older exports omit `someday_lists`; a missing key is an empty list.
    let lists: SomedayList[] = [];

    if (file.someday_lists !== undefined) {
        if (!Array.isArray(file.someday_lists)) {
            throw new ImportError('"someday_lists" must be a list of lists.');
        }

        lists = file.someday_lists.map((list, index) =>
            validateList(list, index),
        );
    }

    const listIds = new Set<string>();
    const listColumns = new Set<number>();

    lists.forEach((list, index) => {
        if (listIds.has(list.id)) {
            throw new ImportError(
                `List ${index + 1}: "id" is used by another list in the file.`,
            );
        }

        listIds.add(list.id);

        if (listColumns.has(list.column)) {
            throw new ImportError(
                `List ${index + 1}: "column" is used by another list in the file.`,
            );
        }

        listColumns.add(list.column);
    });

    return {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        exported_at:
            typeof file.exported_at === 'string' ? file.exported_at : '',
        app_version:
            typeof file.app_version === 'string' ? file.app_version : '',
        tasks,
        someday_lists: lists,
    };
}

const SOMEDAY_LIST = 'someday';

type ListEnd = (SomedaySortKey & Pick<Task, 'id'>) | null;

/**
 * The sort key of the last task of each day / the Someday list in the
 * database (`null`: the list is empty).
 */
async function listEnds(
    database: PlainWeekDatabase,
    keys: Set<string>,
): Promise<Map<string, ListEnd>> {
    const ends = new Map<string, ListEnd>();

    await database.transaction('r', database.tasks, async () => {
        for (const key of keys) {
            if (key !== SOMEDAY_LIST) {
                const row = await database.tasks
                    .where('[date+position]')
                    .between([key, Dexie.minKey], [key, Dexie.maxKey])
                    .last();
                ends.set(key, row ?? null);
                continue;
            }

            const rows = await database.tasks
                .where('someday_column')
                .anyOf([...SOMEDAY_COLUMNS])
                .filter((row) => row.date === null)
                .toArray();
            ends.set(
                key,
                rows.reduce<ListEnd>(
                    (last, row) =>
                        last === null || compareSomedayOrder(row, last) > 0
                            ? row
                            : last,
                    null,
                ),
            );
        }
    });

    return ends;
}

/** What an import adds, for the preview (no database access). */
export function summarizeImport(file: ExportFile): ImportSummary {
    const rows = backupRows(file.tasks);
    const series = new Set(
        rows.filter((task) => task.recurrence !== null).map((task) => task.id),
    );
    // Exceptions of a series in the file are part of it; the others become
    // plain tasks. Only exceptions of a series can be deleted here.
    const visible = rows.filter(
        (task) =>
            task.deleted_at === null &&
            (task.series_id === null || !series.has(task.series_id)),
    );

    // Only live lists are imported; a hand-edited file's tombstones are
    // dropped (a deleted list's tasks already moved to Someday, so its
    // tombstone is pure noise).
    return {
        taskCount: visible.length,
        recurringCount: series.size,
        listCount: file.someday_lists.filter((list) => list.deleted_at === null)
            .length,
    };
}

/**
 * Turns a parsed file into the rows to add: new UUID v7 ids, `series_id`
 * remapped to the new series (an exception whose series is not in the file
 * becomes a plain task), positions appended after the existing tasks of each
 * day / the Someday list keeping the file's order, and fresh `created_at` /
 * `updated_at`. Named lists become new rows too: new ids, a column after
 * every existing named list (deleted ones included) and positions after the
 * existing lists; a hand-edited file's deleted (tombstoned) lists are dropped
 * since a deleted list's tasks already moved to the base Someday. `done` and
 * `done_at` are kept. Reads the database, never writes it; call it right
 * before `applyImport` so positions are current.
 */
export async function planImport(
    file: ExportFile,
    database: PlainWeekDatabase = db,
): Promise<ImportPlan> {
    const kept = backupRows(file.tasks);
    const series = new Set(
        kept.filter((task) => task.recurrence !== null).map((task) => task.id),
    );
    const kindOrder = (task: Task) =>
        task.recurrence !== null ? 0 : task.series_id === null ? 1 : 2;
    // Series first, so their (time-ordered) ids are smaller and both a
    // partial import and the sync push write a series before its exceptions.
    const rows = kept
        .map((task) =>
            task.series_id === null || series.has(task.series_id)
                ? task
                : { ...task, series_id: null, occurrence_date: null },
        )
        .sort((a, b) => kindOrder(a) - kindOrder(b));

    const now = nextTimestamp();
    const newIds = new Map(rows.map((task) => [task.id, uuidv7()]));
    const byList = new Map<string, Task[]>();

    // Named lists: new UUID v7 ids, a column after every existing named list
    // (deleted ones included, so a column is never reused) and positions
    // after the existing lists, the file's order kept.
    const existingLists = (await database.someday_lists.toArray()).sort(
        compareListOrder,
    );
    const maxColumn = existingLists.reduce(
        (max, list) => Math.max(max, list.column),
        2,
    );
    const listEnd =
        existingLists.length > 0
            ? existingLists[existingLists.length - 1].position
            : null;
    // Only live lists are imported; a hand-edited file's tombstones are
    // dropped (a deleted list's tasks already moved to Someday, so its
    // tombstone is pure noise).
    const liveLists = file.someday_lists.filter(
        (list) => list.deleted_at === null,
    );
    const listPositions =
        liveLists.length > 0
            ? generateNKeysBetween(listEnd, null, liveLists.length)
            : [];
    const listRows = liveLists.map((list, index) => ({
        ...list,
        id: uuidv7(),
        column: maxColumn + index + 1,
        position: listPositions[index],
        created_at: now,
        updated_at: now,
        deleted_at: null,
    }));

    // A task in an imported named list (its Someday column matches a list's)
    // lands in that list's new column; base-column tasks and orphans (a
    // column with no matching list) land in the base Someday list.
    const listColumnRemap = new Map<number, number>();
    liveLists.forEach((list, index) => {
        listColumnRemap.set(list.column, listRows[index].column);
    });

    rows.forEach((task) => {
        const column = task.someday_column ?? 0;
        const key =
            task.date !== null
                ? task.date
                : listColumnRemap.has(column)
                  ? `someday-list:${column}`
                  : SOMEDAY_LIST;
        const list = byList.get(key) ?? [];
        list.push(task);
        byList.set(key, list);
    });

    // The last existing task of each day and of the base Someday list; the
    // new named-list columns have no existing tasks, so they start at the top.
    const endKeys = new Set<string>();
    let hasSomeday = false;

    byList.forEach((_tasks, key) => {
        if (key === SOMEDAY_LIST || key.startsWith('someday-list:')) {
            hasSomeday = true;
        } else {
            endKeys.add(key);
        }
    });

    if (hasSomeday) {
        endKeys.add(SOMEDAY_LIST);
    }

    const ends = await listEnds(database, endKeys);
    const sortKeys = new Map<string, SomedaySortKey>();

    // Appended after the last task of each list, in the file's order. A day
    // keeps each task's column; a named list takes its new column; the base
    // Someday list takes the column of its last task (0 when empty), so
    // imported base Someday tasks land at the end of that single list.
    byList.forEach((tasks, key) => {
        const isDay = key !== SOMEDAY_LIST && !key.startsWith('someday-list:');
        const isSomeday = key === SOMEDAY_LIST;
        const isNamedList = key.startsWith('someday-list:');
        const end = isNamedList ? null : (ends.get(key) ?? null);
        const sorted = [...tasks].sort(
            isDay ? compareTaskOrder : compareSomedayOrder,
        );
        const keys = generateNKeysBetween(
            end?.position ?? null,
            null,
            sorted.length,
        );

        sorted.forEach((task, i) =>
            sortKeys.set(task.id, {
                someday_column: isDay
                    ? task.someday_column
                    : isSomeday
                      ? end === null
                          ? 0
                          : somedayColumnOf(end)
                      : listColumnRemap.get(
                            Number(key.slice('someday-list:'.length)),
                        )!,
                position: keys[i],
            }),
        );
    });

    return {
        ...summarizeImport(file),
        tasks: rows.map((task) => ({
            ...task,
            id: newIds.get(task.id) as string,
            ...sortKeys.get(task.id),
            series_id:
                task.series_id === null
                    ? null
                    : (newIds.get(task.series_id) as string),
            subtasks: task.subtasks.map((subtask) => ({ ...subtask })),
            created_at: now,
            updated_at: now,
            deleted_at: task.deleted_at === null ? null : now,
        })),
        lists: listRows,
    };
}

function nextTick(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Writes a plan to the local database: the named lists (and their outbox
 * entries) in one transaction, then the tasks in batches, each in one
 * transaction with its outbox entries (so a signed-in user syncs them),
 * yielding to the event loop between batches so a large import does not
 * freeze the UI. Batches already written stay if a later one fails.
 */
export async function applyImport(
    plan: ImportPlan,
    { database = db, batchSize = 500, onProgress }: ApplyImportOptions = {},
): Promise<void> {
    const total = plan.tasks.length;

    try {
        // Named lists first, so a task that lands in one finds it; their
        // outbox entries ride in the same transaction.
        if (plan.lists.length > 0) {
            await database.transaction(
                'rw',
                database.someday_lists,
                database.list_outbox,
                async () => {
                    await database.someday_lists.bulkAdd(plan.lists);
                    await database.list_outbox.bulkPut(
                        plan.lists.map((list) => ({
                            list_id: list.id,
                        })),
                    );
                },
            );
        }

        for (let start = 0; start < total; start += batchSize) {
            const batch = plan.tasks.slice(start, start + batchSize);

            await database.transaction(
                'rw',
                database.tasks,
                database.outbox,
                async () => {
                    await database.tasks.bulkAdd(batch);
                    await database.outbox.bulkPut(
                        batch.map((task) => ({
                            task_id: task.id,
                            revision: 1,
                        })),
                    );
                },
            );

            onProgress?.(start + batch.length, total);
            await nextTick();
        }
    } finally {
        // Wake the sync engine once for what was written.
        if (total > 0 || plan.lists.length > 0) {
            notifyLocalChange();
        }
    }
}
