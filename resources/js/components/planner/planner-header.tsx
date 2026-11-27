import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Search,
    Undo2,
} from 'lucide-react';
import { useState } from 'react';
import type { HTMLAttributes } from 'react';
import { AccountButton } from '@/components/planner/account-button';
import { MobileWeekNavigation } from '@/components/planner/mobile-week-navigation';
import { HintedLabel } from '@/components/planner/shortcut-hint';
import { ViewBar } from '@/components/planner/view-bar';
import { usePlannerView } from '@/hooks/use-carry-over-setting';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { searchDialogStore } from '@/lib/planner/search-dialog';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    dateFormat,
    formatMonthTitle,
    formatWeekNumber,
} from '@/lib/planner/format';
import { parseDateKey, weekDateKeys } from '@/lib/db/dates';
import { undoLatest, useLatestUndo } from '@/lib/planner/undo';
import { isoWeekNumber, weekThursday } from '@/lib/planner/week';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = {
    weekStart: Date;
    isCurrentWeek: boolean;
    onPreviousWeek: () => void;
    onNextWeek: () => void;
    onToday: () => void;
    onGoToWeekOf: (date: Date) => void;
    swipeHandlers?: HTMLAttributes<HTMLDivElement>;
};

/**
 * "October 2026 W42" with
 * the account button and week navigation. The title turns the planner accent
 * when another week is shown; clicking it returns to today.
 */
export function PlannerHeader({
    weekStart,
    isCurrentWeek,
    onPreviousWeek,
    onNextWeek,
    onToday,
    onGoToWeekOf,
    swipeHandlers,
}: Props) {
    // ISO weeks belong to the month and year of their Thursday.
    const thursday = weekThursday(weekStart);
    const week = isoWeekNumber(weekStart);
    // The title and the Today pill both go back to the current week.
    const todayHint = (
        <HintedLabel label={t('planner.currentWeek')} action="week.today" all />
    );
    const latestUndo = useLatestUndo();
    const undoLabel = latestUndo?.label
        ? t('planner.undoAction', { action: latestUndo.label })
        : t('planner.undo');

    // The week arrows only change the Week view (F39).
    const view = usePlannerView();
    const weekShown = view === 'week';
    const days = weekDateKeys(weekStart);
    const [weekPickerOpen, setWeekPickerOpen] = useState(false);
    const range = dateFormat({ day: 'numeric', month: 'short' }).formatRange(
        weekStart,
        parseDateKey(days[6]),
    );
    return (
        // On phones the header sticks to the top with the view switch as its
        // second row (F38); on desktop the switch sits above the grid.
        <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm lg:static lg:backdrop-blur-none">
            <div className="flex items-center justify-between gap-3 px-4 py-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:px-6 lg:pt-5 lg:pb-0">
                <div className="flex min-w-0 items-center gap-2.5 max-lg:flex-1">
                    <h1 className="flex min-w-0 items-baseline gap-2.5 text-3xl leading-tight font-bold tracking-tighter max-lg:hidden lg:text-4xl">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    onClick={onToday}
                                    disabled={isCurrentWeek}
                                    aria-label={
                                        isCurrentWeek
                                            ? undefined
                                            : t('planner.goToCurrentWeek')
                                    }
                                    className={cn(
                                        'h-auto min-w-0 shrink truncate rounded-md p-0 font-[inherit] text-3xl leading-[inherit] tracking-[inherit] hover:bg-transparent disabled:opacity-100 lg:text-4xl',
                                        !isCurrentWeek &&
                                            // Phones make room for the Today pill.
                                            'text-planner-accent hover:text-planner-accent/80 max-sm:text-2xl',
                                    )}
                                >
                                    <span className="lg:hidden">
                                        {formatMonthTitle(thursday, 'short')}
                                    </span>
                                    <span className="max-lg:hidden">
                                        {formatMonthTitle(thursday, 'long')}
                                    </span>
                                </Button>
                            </TooltipTrigger>
                            {!isCurrentWeek && (
                                <TooltipContent side="bottom">
                                    {todayHint}
                                </TooltipContent>
                            )}
                        </Tooltip>
                        <span
                            className={cn(
                                'shrink-0 text-muted-foreground/50',
                                !isCurrentWeek && 'max-sm:hidden',
                            )}
                        >
                            <abbr
                                title={t('planner.weekTitle', { week })}
                                className="no-underline"
                            >
                                {formatWeekNumber(week)}
                            </abbr>
                        </span>
                    </h1>
                    <div className="flex min-w-0 flex-1 lg:hidden">
                        {weekShown ? (
                            <MobileWeekNavigation
                                weekStart={weekStart}
                                onPreviousWeek={onPreviousWeek}
                                onNextWeek={onNextWeek}
                                onGoToWeekOf={onGoToWeekOf}
                                swipeHandlers={swipeHandlers}
                            />
                        ) : (
                            <h1 className="truncate text-xl font-bold tracking-tight">
                                {t(
                                    view === 'notes'
                                        ? 'planner.viewNotes'
                                        : 'planner.viewLists',
                                )}
                            </h1>
                        )}
                    </div>
                </div>
                <div className="hidden lg:block">
                    {weekShown && (
                        <nav
                            aria-label={t('planner.weekNav')}
                            className="flex items-center gap-2"
                        >
                            <Button
                                variant="outline"
                                className="h-11 w-36 rounded-full"
                                onClick={onPreviousWeek}
                            >
                                <ChevronLeft className="size-5 rtl:rotate-180" />
                                {t('planner.previousWeek')}
                            </Button>
                            <Popover
                                open={weekPickerOpen}
                                onOpenChange={setWeekPickerOpen}
                            >
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className="h-11 w-40 rounded-full"
                                        aria-label={t('planner.jumpToWeek', {
                                            range,
                                        })}
                                    >
                                        <CalendarDays />
                                        <span className="truncate">
                                            {range}
                                        </span>
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                    className="w-auto p-0"
                                    align="center"
                                >
                                    <Calendar
                                        mode="single"
                                        weekStartsOn={1}
                                        captionLayout="dropdown"
                                        defaultMonth={weekStart}
                                        startMonth={
                                            new Date(
                                                weekStart.getFullYear() - 20,
                                                0,
                                            )
                                        }
                                        endMonth={
                                            new Date(
                                                weekStart.getFullYear() + 20,
                                                11,
                                            )
                                        }
                                        selected={weekStart}
                                        onSelect={(_, date) => {
                                            onGoToWeekOf(date);
                                            setWeekPickerOpen(false);
                                        }}
                                    />
                                </PopoverContent>
                            </Popover>
                            <Button
                                variant="outline"
                                data-test="desktop-today-button"
                                className="h-11 w-20 rounded-full"
                                onClick={onToday}
                                disabled={isCurrentWeek}
                            >
                                {t('planner.today')}
                            </Button>
                            <Button
                                variant="outline"
                                className="h-11 w-36 rounded-full"
                                onClick={onNextWeek}
                            >
                                {t('planner.nextWeek')}
                                <ChevronRight className="size-5 rtl:rotate-180" />
                            </Button>
                        </nav>
                    )}
                </div>
                <nav
                    aria-label={t('planner.weekNav')}
                    className="flex shrink-0 items-center gap-1.5 lg:justify-self-end"
                >
                    <Tooltip>
                        <TooltipTrigger asChild>
                            {/* A disabled button gets no pointer events, so the
                            tooltip hangs on a wrapper. */}
                            <span className="inline-flex max-lg:hidden">
                                <Button
                                    variant="ghost"
                                    size="icon-lg"
                                    className="size-10 rounded-full"
                                    onClick={undoLatest}
                                    disabled={!latestUndo}
                                    aria-label={undoLabel}
                                    data-test="undo-task-action"
                                >
                                    <Undo2 className="size-5 rtl:-scale-x-100" />
                                </Button>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                            {latestUndo
                                ? undoLabel
                                : t('planner.nothingToUndo')}
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon-lg"
                                className="size-10 rounded-full max-lg:hidden"
                                onClick={() => searchDialogStore.open()}
                                aria-label={t('planner.search')}
                                data-test="search-tasks"
                            >
                                <Search className="size-5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                            <HintedLabel
                                label={t('planner.search')}
                                action="general.search"
                            />
                        </TooltipContent>
                    </Tooltip>
                    <div className="max-lg:order-last">
                        <AccountButton />
                    </div>
                </nav>
            </div>
            <div className="lg:hidden">
                <ViewBar />
            </div>
        </header>
    );
}
