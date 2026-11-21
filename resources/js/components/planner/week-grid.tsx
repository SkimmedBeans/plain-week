import { useRef } from 'react';
import { DayColumn } from '@/components/planner/day-column';
import { SomedaySection } from '@/components/planner/someday-section';
import { useScrollToToday } from '@/hooks/use-scroll-to-today';
import { useSomedayLists, useWeekTasks } from '@/hooks/use-tasks';
import { weekDateKeys } from '@/lib/db/dates';
import { cn } from '@/lib/utils';

type Props = {
    weekStart: Date;
    /** 'YYYY-MM-DD' of today, to highlight it. */
    today: string;
    onOpenTask: (taskId: string) => void;
};

/**
 * The week and Someday on one grid that fills the window on desktop, laid
 * out by the window's shape (`week-*` variants in `app.css`). Every column —
 * the days, Someday and the named lists — is exactly one track wide:
 *
 * - wide: five tracks, Monday to Friday on top; below them Saturday, Sunday
 *   and Someday;
 * - near square: four tracks, Monday to Thursday, then Friday, Saturday,
 *   Sunday and Someday;
 * - tall: two tracks, Monday and Tuesday, Wednesday and Thursday, Friday and
 *   Saturday, then Sunday and Someday.
 *
 * Every cell takes its share of the height and scrolls its own list; rows
 * keep a minimum height, so a very short window scrolls the page. Smaller
 * screens show a single column: the days in order, then Someday and its named
 * lists. The DOM keeps that reading order (Monday to Sunday, then Someday and
 * the named lists) on every screen, and scrolls to today there when the
 * current week is shown (to the top on another week).
 *
 * Named Someday lists follow Someday, one track each, in extra rows that share
 * the window's height with the week (`auto-rows-*`), so they stay on screen.
 */
export function WeekGrid({ weekStart, today, onOpenTask }: Props) {
    const tasks = useWeekTasks(weekStart);
    const lists = useSomedayLists();
    const grid = useRef<HTMLDivElement>(null);
    const days = weekDateKeys(weekStart);

    // Right after a week change `tasks` still holds the previous week's days.
    const loaded = tasks?.[days[0]] !== undefined;
    useScrollToToday(grid, {
        weekStartKey: days[0],
        showsToday: days.includes(today),
        ready: loaded,
    });

    // Named lists come in their display order (`position`, see `queryLists`);
    // the keyboard cursor walks the same order.
    const namedLists = lists;

    return (
        <div
            ref={grid}
            className={cn(
                'grid grid-cols-1 gap-x-6 gap-y-10 lg:min-h-0 lg:flex-1 lg:gap-y-8',
                'lg:week-wide:auto-rows-[minmax(10rem,2fr)] lg:week-wide:grid-cols-5 lg:week-wide:grid-rows-[minmax(14rem,3fr)_minmax(10rem,2fr)]',
                'lg:week-square:auto-rows-[minmax(12rem,1fr)] lg:week-square:grid-cols-4 lg:week-square:grid-rows-[repeat(2,minmax(12rem,1fr))]',
                'lg:week-tall:auto-rows-[minmax(12rem,1fr)] lg:week-tall:grid-cols-2 lg:week-tall:grid-rows-[repeat(4,minmax(12rem,1fr))]',
            )}
        >
            {days.map((date) => (
                <DayColumn
                    key={date}
                    date={date}
                    tasks={tasks?.[date]}
                    isToday={date === today}
                    onOpenTask={onOpenTask}
                />
            ))}
            <SomedaySection
                list={{ column: 0, name: 'Someday' }}
                weekStart={weekStart}
                today={today}
                onOpenTask={onOpenTask}
            />
            {namedLists?.map((list, index) => (
                <SomedaySection
                    key={list.id}
                    list={{
                        column: list.column,
                        name: list.name,
                        id: list.id,
                    }}
                    weekStart={weekStart}
                    today={today}
                    onOpenTask={onOpenTask}
                    index={index}
                    canMoveEarlier={index > 0}
                    canMoveLater={index < namedLists.length - 1}
                />
            ))}
        </div>
    );
}
