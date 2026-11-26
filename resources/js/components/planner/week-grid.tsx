import { useRef } from 'react';
import {
    CollapsedLists,
    type CollapsibleList,
} from '@/components/planner/collapsed-lists';
import { AddList } from '@/components/planner/add-list';
import { DayColumn } from '@/components/planner/day-column';
import { ViewBar } from '@/components/planner/view-bar';
import { SomedaySection } from '@/components/planner/someday-section';
import {
    useCollapsedLists,
    useCompactDensity,
    usePlannerView,
    useStripedRows,
} from '@/hooks/use-carry-over-setting';
import { t } from '@/lib/i18n';
import { useScrollToToday } from '@/hooks/use-scroll-to-today';
import { useSomedayLists, useWeekTasks } from '@/hooks/use-tasks';
import { weekDateKeys } from '@/lib/db/dates';
import { collapseKey, setListsCollapsed } from '@/lib/planner/device-settings';
import { Button } from '@/components/ui/button';
import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
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
 * A collapsed list (F26, per device) leaves the grid and shows as a chip in
 * the row after it. Compact density (F32) is set here for the whole grid.
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
    // Archived lists (F31) are not shown; Someday's header lists them.
    const namedLists = lists?.filter((list) => !list.archived);
    const collapsed = useCollapsedLists();
    const compact = useCompactDensity();
    const stripes = useStripedRows();
    const someday: CollapsibleList = { column: 0, name: 'Someday' };
    const isCollapsed = (list: CollapsibleList) =>
        collapsed.includes(collapseKey(list));
    const view = usePlannerView();
    const showWeek = view === 'week';
    // Lists shows the task lists, Notes the lists converted to notes (F38).
    const viewLists = (namedLists ?? []).filter(
        (list) => (typeof list.note === 'string') === (view === 'notes'),
    );
    const listsShown = viewLists.filter((list) => !isCollapsed(list));
    const chips = (
        showWeek ? (isCollapsed(someday) ? [someday] : []) : viewLists
    ).filter(isCollapsed);

    return (
        <>
            {/* Desktop: the view switch above the grid; phones have it in
                the sticky header (F38). */}
            <div className="mb-6 shrink-0 max-lg:hidden lg:mb-5">
                <ViewBar />
            </div>
            {!showWeek && (
                <div className="mb-6 flex shrink-0 gap-2 lg:mb-5">
                    <AddList
                        key={view}
                        kind={view === 'notes' ? 'note' : 'list'}
                    />
                    {viewLists.length > 0 && (
                        // Collapse every list of this view to a chip, or
                        // expand them all again (F45).
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            data-test="collapse-all"
                            onClick={() =>
                                setListsCollapsed(
                                    viewLists.map((list) => collapseKey(list)),
                                    listsShown.length > 0,
                                )
                            }
                            className="rounded-full"
                        >
                            {listsShown.length > 0 ? (
                                <ChevronsDownUp />
                            ) : (
                                <ChevronsUpDown />
                            )}
                            {listsShown.length > 0
                                ? t('planner.collapseAll')
                                : t('planner.expandAll')}
                        </Button>
                    )}
                </div>
            )}
            {!showWeek && viewLists.length === 0 && (
                <p className="text-sm text-muted-foreground">
                    {view === 'notes'
                        ? t('planner.noNotes')
                        : t('planner.noLists')}
                </p>
            )}
            {showWeek ? (
                <div
                    ref={grid}
                    data-density={compact ? 'compact' : undefined}
                    data-stripes={stripes || undefined}
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
                            weekStart={weekStart}
                            onOpenTask={onOpenTask}
                        />
                    ))}
                    {!isCollapsed(someday) && (
                        <SomedaySection
                            list={someday}
                            weekStart={weekStart}
                            today={today}
                            onOpenTask={onOpenTask}
                        />
                    )}
                </div>
            ) : (
                <div
                    ref={grid}
                    data-density={compact ? 'compact' : undefined}
                    data-stripes={stripes || undefined}
                    data-lists-view
                    className="grid grid-cols-1 gap-x-6 gap-y-10 lg:min-h-0 lg:flex-1 lg:auto-rows-[minmax(14rem,1fr)] lg:grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] lg:gap-y-8"
                >
                    {listsShown.map((list) => {
                        const index = (namedLists ?? []).indexOf(list);

                        return (
                            <SomedaySection
                                key={list.id}
                                list={list}
                                weekStart={weekStart}
                                today={today}
                                onOpenTask={onOpenTask}
                                index={index}
                                canMoveEarlier={index > 0}
                                canMoveLater={
                                    index < (namedLists ?? []).length - 1
                                }
                            />
                        );
                    })}
                </div>
            )}
            <CollapsedLists
                lists={chips}
                weekStart={weekStart}
                today={today}
                onOpenTask={onOpenTask}
            />
        </>
    );
}
