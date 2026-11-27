import { useLayoutEffect, useRef, useState } from 'react';
import {
    CollapsedLists,
    type CollapsibleList,
} from '@/components/planner/collapsed-lists';
import { AddList } from '@/components/planner/add-list';
import { ArchivedListsDialog } from '@/components/planner/archived-lists';
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
import { useIsBelowLg } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Archive, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
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
    const view = usePlannerView();
    const showWeek = view === 'week';
    const belowLg = useIsBelowLg();
    const viewScrollPositions = useRef<Partial<Record<typeof view, number>>>(
        {},
    );

    useLayoutEffect(() => {
        if (!belowLg) {
            return;
        }

        const positions = viewScrollPositions.current;
        const remembered = positions[view];
        if (remembered !== undefined || view !== 'week') {
            window.scrollTo({ top: remembered ?? 0, behavior: 'instant' });
        }

        const rememberScroll = () => {
            positions[view] = window.scrollY;
        };
        window.addEventListener('scroll', rememberScroll, { passive: true });
        return () => window.removeEventListener('scroll', rememberScroll);
    }, [belowLg, view]);

    // Right after a week change `tasks` still holds the previous week's days.
    const loaded = tasks?.[days[0]] !== undefined;
    useScrollToToday(grid, {
        weekStartKey: days[0],
        showsToday: days.includes(today),
        ready: loaded && showWeek,
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
    // Lists shows the task lists, Notes the lists converted to notes (F38).
    const viewLists = (namedLists ?? []).filter(
        (list) => (typeof list.note === 'string') === (view === 'notes'),
    );
    const noteRows = view === 'notes' && belowLg;
    const [createdNoteId, setCreatedNoteId] = useState<string | null>(null);
    const [archiveOpen, setArchiveOpen] = useState(false);
    const listsShown = noteRows
        ? viewLists
        : viewLists.filter((list) => !isCollapsed(list));
    // Below `lg` the Notes view is one note per row (F55): no chips, every
    // note stays in the list, collapsed to its heading until pressed.
    const chips = noteRows
        ? []
        : (showWeek
              ? isCollapsed(someday)
                  ? [someday]
                  : []
              : viewLists
          ).filter(isCollapsed);
    const anyShown = listsShown.length > 0;

    return (
        <>
            {/* Desktop: the view switch above the grid; phones have it in
                the sticky header (F38). */}
            <div className="mb-6 shrink-0 max-lg:hidden lg:mb-5">
                <ViewBar />
            </div>
            {!showWeek && (
                <div className="mb-6 flex shrink-0 flex-wrap gap-2 lg:mb-5">
                    <AddList
                        key={view}
                        kind={view === 'notes' ? 'note' : 'list'}
                        onCreateNote={noteRows ? setCreatedNoteId : undefined}
                    />
                    {!noteRows && viewLists.length > 0 && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            data-test="collapse-all"
                            onClick={() =>
                                setListsCollapsed(
                                    viewLists.map(collapseKey),
                                    anyShown,
                                )
                            }
                            className="rounded-full"
                        >
                            {anyShown ? <ChevronsDownUp /> : <ChevronsUpDown />}
                            {anyShown
                                ? t('planner.collapseAll')
                                : t('planner.expandAll')}
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="rounded-full"
                        onClick={() => setArchiveOpen(true)}
                    >
                        <Archive />
                        {t(
                            view === 'notes'
                                ? 'planner.archivedNotes'
                                : 'planner.archivedLists',
                        )}
                    </Button>
                    <ArchivedListsDialog
                        kind={view === 'notes' ? 'note' : 'list'}
                        open={archiveOpen}
                        onOpenChange={setArchiveOpen}
                        weekStart={weekStart}
                        today={today}
                        onOpenTask={onOpenTask}
                    />
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
                // Phones (F52): the collapsed rows sit above the grid,
                // under the Add / Expand all bar.
                <div
                    ref={grid}
                    data-density={compact ? 'compact' : undefined}
                    data-stripes={stripes || undefined}
                    data-lists-view
                    data-notes-view={view === 'notes' ? '' : undefined}
                    className={cn(
                        'grid grid-cols-1 content-start items-start gap-6 max-lg:order-2',
                        view === 'notes'
                            ? 'lg:flex lg:flex-wrap'
                            : 'lg:grid-cols-[repeat(auto-fit,minmax(22rem,1fr))]',
                    )}
                >
                    {listsShown.map((list) => {
                        const namedIndex = (namedLists ?? []).indexOf(list);
                        // The droppable carries the list's index in the live
                        // order (every list, archived included) — the index
                        // `moveListTo` writes against: the Notes view below
                        // `lg` (F56) reorders the notes against the full order.
                        const index = (lists ?? []).indexOf(list);
                        return (
                            <SomedaySection
                                key={list.id}
                                list={list}
                                weekStart={weekStart}
                                today={today}
                                onOpenTask={onOpenTask}
                                paper
                                index={index}
                                canMoveEarlier={namedIndex > 0}
                                canMoveLater={
                                    namedIndex < (namedLists ?? []).length - 1
                                }
                                compactNoteRow={noteRows}
                                onCloseNewNote={
                                    noteRows && list.id === createdNoteId
                                        ? () => setCreatedNoteId(null)
                                        : undefined
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
                className={
                    showWeek
                        ? // Week: after the day grid, on every screen.
                          'mt-10 lg:mt-6'
                        : // Lists and Notes: directly under the Add / Expand all
                          // bar on phones (F52), after the grid on desktop.
                          'max-lg:order-1 max-lg:mb-10 lg:mt-6'
                }
            />
        </>
    );
}
