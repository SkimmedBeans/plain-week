import { useState } from 'react';
import { TaskList } from '@/components/planner/task-list';
import {
    ListDialog,
    type ListCardIdentity,
} from '@/components/planner/list-dialog';
import { Button } from '@/components/ui/button';
import { parseDateKey } from '@/lib/db/dates';
import type { PlannerTask } from '@/lib/recurrence/expand';
import { formatDay, formatWeekday } from '@/lib/planner/format';
import { weekdayIndex } from '@/lib/planner/week';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = {
    /** 'YYYY-MM-DD'. */
    date: string;
    tasks: PlannerTask[] | undefined;
    isToday: boolean;
    /** Monday of the shown week (the card's drop resolution uses it). */
    weekStart: Date;
    onOpenTask: (taskId: string) => void;
    className?: string;
};

/**
 * One day: its header ("Mon … 12 Oct") over its ruled task list, which fills
 * the rest of the day's cell on desktop. Saturday and Sunday get a quieter
 * header so the weekend reads apart from the work week.
 *
 * The header is a real button (F11): clicking or pressing Enter/Space opens
 * the day's list card — a full, live view of the day's tasks.
 */
export function DayColumn({
    date,
    tasks,
    isToday,
    weekStart,
    onOpenTask,
    className,
}: Props) {
    const dayLabel = formatDay(date);
    const weekday = formatWeekday(date);
    const isWeekend = weekdayIndex(parseDateKey(date)) >= 5;
    const [cardIdentity, setCardIdentity] = useState<ListCardIdentity | null>(
        null,
    );

    const newTaskLabel = t('planner.newTaskForDay', {
        weekday,
        day: dayLabel,
    });

    return (
        <section
            aria-label={t('planner.dayLabel', { weekday, day: dayLabel })}
            aria-current={isToday ? 'date' : undefined}
            className={cn(
                'flex min-h-0 min-w-0 flex-col',
                // A soft tint that bleeds 10px past the start, end and top
                // (and the bottom of the desktop cell), padded back so the
                // header and rows stay in place. The scroll margin (80px) keeps
                // it clear of the sticky mobile header (64px) when scrolled to.
                isToday &&
                    '-mx-2.5 -mt-2.5 rounded-t-lg bg-planner-accent/6 px-2.5 pt-2.5 max-lg:scroll-mt-20 lg:-mb-2.5 lg:rounded-b-lg lg:pb-2.5 dark:bg-planner-accent/10',
                className,
            )}
        >
            <h2
                className={cn(
                    'flex items-baseline border-b-2 px-2.5 pb-3 text-lg leading-7 lg:text-xl',
                    isToday
                        ? 'border-planner-accent text-planner-accent'
                        : isWeekend &&
                              'border-muted-foreground/25 text-muted-foreground/70',
                )}
            >
                <Button
                    type="button"
                    data-list-card-target={`day:${date}`}
                    variant="ghost"
                    className="h-7 flex-1 items-baseline justify-between gap-2 self-stretch rounded-none border-0 px-0 py-0 text-inherit hover:bg-transparent hover:text-inherit dark:hover:bg-transparent"
                    onClick={() => setCardIdentity({ kind: 'day', date })}
                >
                    <span className="font-bold tracking-tight">{weekday}</span>
                    <span
                        className={cn(
                            'text-muted-foreground/70',
                            isToday
                                ? 'text-planner-accent-muted'
                                : isWeekend && 'text-muted-foreground/50',
                        )}
                    >
                        {dayLabel}
                    </span>
                </Button>
            </h2>
            <TaskList
                placement={{ date }}
                tasks={tasks}
                newTaskLabel={newTaskLabel}
                onOpenTask={onOpenTask}
            />
            <ListDialog
                identity={cardIdentity}
                weekStart={weekStart}
                placement={{ date }}
                tasks={tasks}
                newTaskLabel={newTaskLabel}
                onOpenTask={onOpenTask}
                onClose={() => setCardIdentity(null)}
            />
        </section>
    );
}
