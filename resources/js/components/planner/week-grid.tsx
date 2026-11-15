import { DayColumn } from '@/components/planner/day-column';
import { SomedaySection } from '@/components/planner/someday-section';
import { useSomedayLists, useWeekTasks } from '@/hooks/use-tasks';
import { weekLayout } from '@/lib/planner/week';

type Props = {
    weekStart: Date;
    /** 'YYYY-MM-DD' of today, to highlight it. */
    today: string;
    onOpenTask: (taskId: string) => void;
};

/**
 * The week and Someday on one five-track grid. On desktop Monday to Friday
 * fill the top row; below them Saturday sits under Monday, Sunday under
 * Tuesday and Someday spans Wednesday to Friday. Named Someday lists follow
 * Someday, one grid track each, wrapping to new rows. Smaller screens show a
 * single column: the days in order, then Someday and its named lists in
 * column order. The DOM keeps that reading order on every screen.
 */
export function WeekGrid({ weekStart, today, onOpenTask }: Props) {
    const tasks = useWeekTasks(weekStart);
    const lists = useSomedayLists();
    const { weekdays, weekend } = weekLayout(weekStart);

    // The visual order of the Someday lists is by column (the keyboard
    // cursor walks the same order); `position` is kept for future reordering.
    const namedLists =
        lists === undefined
            ? undefined
            : [...lists].sort((a, b) => a.column - b.column);

    return (
        <div className="grid grid-cols-1 gap-x-6 gap-y-10 lg:grid-cols-5 lg:gap-y-12">
            {[...weekdays, ...weekend].map(({ date, rows }) => (
                <DayColumn
                    key={date}
                    date={date}
                    tasks={tasks?.[date]}
                    rows={rows}
                    isToday={date === today}
                    onOpenTask={onOpenTask}
                />
            ))}
            <SomedaySection
                list={{ column: 0, name: 'Someday' }}
                weekStart={weekStart}
                today={today}
                onOpenTask={onOpenTask}
                className="lg:col-span-3"
            />
            {namedLists?.map((list) => (
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
                />
            ))}
        </div>
    );
}
