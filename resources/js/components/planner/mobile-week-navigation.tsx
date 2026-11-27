import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, useState } from 'react';
import type { HTMLAttributes } from 'react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { parseDateKey, weekDateKeys } from '@/lib/db/dates';
import { t } from '@/lib/i18n';
import { dateFormat, formatLongDate } from '@/lib/planner/format';
import { addWeeks } from '@/lib/planner/week';

function weekRange(weekStart: Date): string {
    return dateFormat({ day: 'numeric', month: 'short' }).formatRange(
        weekStart,
        parseDateKey(weekDateKeys(weekStart)[6]),
    );
}

export function MobileWeekNavigation({
    weekStart,
    onPreviousWeek,
    onNextWeek,
    onGoToWeekOf,
    swipeHandlers,
}: {
    weekStart: Date;
    onPreviousWeek: () => void;
    onNextWeek: () => void;
    onGoToWeekOf: (date: Date) => void;
    swipeHandlers?: HTMLAttributes<HTMLDivElement>;
}) {
    const [open, setOpen] = useState(false);
    const jumpDestination = useRef<string | null>(null);
    const touch = useRef<{ x: number; y: number } | null>(null);
    const range = weekRange(weekStart);

    return (
        <nav
            aria-label={t('planner.weekNav')}
            className="flex min-w-0 flex-1 items-center rounded-full border border-border bg-background p-0.5"
        >
            <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className="touch-manipulation"
                aria-label={t('planner.previousWeek')}
                onClick={onPreviousWeek}
            >
                <ChevronLeft className="rtl:rotate-180" />
            </Button>
            <div
                {...swipeHandlers}
                data-week-swipe-area
                className="min-w-0 flex-1 touch-pan-y"
            >
                <DropdownMenu open={open} onOpenChange={setOpen}>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            aria-label={t('planner.jumpToWeekOrDay', { range })}
                            onPointerDown={(event) => {
                                if (event.pointerType === 'touch') {
                                    event.preventDefault();
                                    touch.current = {
                                        x: event.clientX,
                                        y: event.clientY,
                                    };
                                }
                            }}
                            onPointerUp={(event) => {
                                const start = touch.current;
                                touch.current = null;
                                if (
                                    event.pointerType === 'touch' &&
                                    start &&
                                    Math.hypot(
                                        event.clientX - start.x,
                                        event.clientY - start.y,
                                    ) < 10
                                ) {
                                    setOpen((open) => !open);
                                }
                            }}
                            onPointerCancel={() => {
                                touch.current = null;
                            }}
                            className="h-10 w-full min-w-0 touch-pan-y px-2 font-semibold"
                        >
                            <span className="truncate" aria-live="polite">
                                {range}
                            </span>
                            <ChevronDown />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="start"
                        onCloseAutoFocus={(event) => {
                            const destination = jumpDestination.current;
                            jumpDestination.current = null;
                            if (!destination) {
                                return;
                            }
                            const target = document.querySelector<HTMLElement>(
                                '[data-planner-jump="' +
                                    CSS.escape(destination) +
                                    '"]',
                            );
                            if (target) {
                                event.preventDefault();
                                target.focus({ preventScroll: true });
                                target.scrollIntoView({ block: 'start' });
                            }
                        }}
                    >
                        <DropdownMenuLabel>
                            {t('planner.nearbyWeeks')}
                        </DropdownMenuLabel>
                        {[-2, -1, 1, 2].map((offset) => {
                            const week = addWeeks(weekStart, offset);
                            return (
                                <DropdownMenuItem
                                    key={offset}
                                    onSelect={() => onGoToWeekOf(week)}
                                >
                                    {weekRange(week)}
                                </DropdownMenuItem>
                            );
                        })}
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>
                            {t('planner.daysThisWeek')}
                        </DropdownMenuLabel>
                        {weekDateKeys(weekStart).map((day) => (
                            <DropdownMenuItem
                                key={day}
                                onSelect={() => {
                                    jumpDestination.current = day;
                                }}
                            >
                                {formatLongDate(day)}
                            </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem
                            onSelect={() => {
                                jumpDestination.current = 'someday';
                            }}
                        >
                            {t('planner.someday')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className="touch-manipulation"
                aria-label={t('planner.nextWeek')}
                onClick={onNextWeek}
            >
                <ChevronRight className="rtl:rotate-180" />
            </Button>
        </nav>
    );
}
