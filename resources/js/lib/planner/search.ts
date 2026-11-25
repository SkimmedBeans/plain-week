import { db } from '@/lib/db/database';
import { parseDateKey, toDateKey } from '@/lib/db/dates';
import type { SomedayList, Task, TaskColor } from '@/lib/db/types';
import { t } from '@/lib/i18n';
import { occurrenceId, occursOn, toItem } from '@/lib/recurrence/expand';
import type { SeriesItem } from '@/lib/recurrence/expand';
import { formatShortDate, formatWeekday } from './format';

/** The most results a search shows. */
export const SEARCH_LIMIT = 50;

/** How far ahead a series is searched for its next occurrence. */
const SERIES_LOOKAHEAD_DAYS = 731;

export type SearchResult = {
    /** The id the task dialog opens: a task, or a series' next occurrence. */
    openId: string;
    text: string;
    done: boolean;
    color: TaskColor;
    repeats: boolean;
    /** Where it lives: "Thu 26 Nov", "Someday" or a list's name. */
    where: string;
};

/** Lower case, without accents, so "cafe" finds "Café". */
export function normalizeForSearch(text: string): string {
    return text
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLocaleLowerCase();
}

/** Whether a task's text, notes or sub-tasks hold every word of `query`. */
export function matchesQuery(
    task: Pick<Task, 'text' | 'notes' | 'subtasks'>,
    query: string,
): boolean {
    const words = normalizeForSearch(query).split(/\s+/).filter(Boolean);

    if (words.length === 0) {
        return false;
    }

    const haystack = normalizeForSearch(
        [task.text, task.notes, ...task.subtasks.map((s) => s.text)].join('\n'),
    );

    return words.every((word) => haystack.includes(word));
}

function addDays(dateKey: string, days: number): string {
    const date = parseDateKey(dateKey);
    date.setDate(date.getDate() + days);

    return toDateKey(date);
}

/** The first date on or after `from` the series occurs on, if any. */
function nextOccurrence(series: SeriesItem, from: string): string | null {
    let date = series.date > from ? series.date : from;

    for (let i = 0; i < SERIES_LOOKAHEAD_DAYS; i++) {
        if (series.recurrence.until && date > series.recurrence.until) {
            return null;
        }
        if (occursOn(series, date)) {
            return date;
        }
        date = addDays(date, 1);
    }

    return null;
}

function whereLabel(
    task: Pick<Task, 'date' | 'someday_column'>,
    lists: Map<number, SomedayList>,
): string {
    if (task.date !== null) {
        return `${formatWeekday(task.date)} ${formatShortDate(task.date)}`;
    }

    const column = task.someday_column ?? 0;

    return column === 0
        ? t('planner.someday')
        : (lists.get(column)?.name ?? t('planner.someday'));
}

/**
 * Finds tasks whose text, notes or sub-tasks contain every word of `query`,
 * in the local database (F33): days, Someday and every named list, collapsed
 * or archived ones too. A repeating task is found once, opening on its next
 * occurrence. Open tasks come first, then by date (Someday last).
 */
export async function searchTasks(
    query: string,
    today: string = toDateKey(new Date()),
): Promise<SearchResult[]> {
    if (normalizeForSearch(query).trim() === '') {
        return [];
    }

    const [rows, listRows] = await Promise.all([
        db.tasks.toArray(),
        db.someday_lists.toArray(),
    ]);
    const lists = new Map(
        listRows
            .filter((list) => list.deleted_at === null)
            .map((list) => [list.column, list]),
    );
    const found: (SearchResult & { sortDate: string })[] = [];

    for (const row of rows) {
        if (row.deleted_at !== null || !matchesQuery(row, query)) {
            continue;
        }

        if (row.recurrence !== null && row.date !== null) {
            const series = toItem(row) as SeriesItem;
            const next = nextOccurrence(series, today);

            if (next === null) {
                continue;
            }

            found.push({
                openId: occurrenceId(row.id, next),
                text: row.text,
                done: false,
                color: row.color,
                repeats: true,
                where: whereLabel({ date: next, someday_column: null }, lists),
                sortDate: next,
            });
            continue;
        }

        found.push({
            openId: row.id,
            text: row.text,
            done: row.done,
            color: row.color,
            repeats: row.series_id !== null,
            where: whereLabel(row, lists),
            sortDate: row.date ?? '9999-99-99',
        });
    }

    found.sort(
        (a, b) =>
            Number(a.done) - Number(b.done) ||
            a.sortDate.localeCompare(b.sortDate) ||
            a.text.localeCompare(b.text),
    );

    return found
        .slice(0, SEARCH_LIMIT)
        .map(({ sortDate: _sortDate, ...result }) => result);
}
