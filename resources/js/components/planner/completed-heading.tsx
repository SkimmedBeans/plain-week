import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TaskPlacement } from '@/lib/db/tasks';
import { t } from '@/lib/i18n';
import { clearCompletedWithUndo } from '@/lib/planner/task-actions';
import type { PlannerTask } from '@/lib/recurrence/expand';

/**
 * The "Completed (n)" label over a list's done tasks, with Clear completed in
 * Someday lists. With `onToggle` the label is a button that folds or unfolds
 * the done tasks (past days start folded, F29).
 */
export function CompletedHeading({
    placement,
    tasks,
    folded,
    onToggle,
}: {
    placement: TaskPlacement;
    tasks: PlannerTask[];
    folded?: boolean;
    onToggle?: () => void;
}) {
    return (
        <div
            data-completed-label
            className="flex flex-wrap items-center justify-between gap-x-2 border-b border-border px-1.5 pt-3 pb-1 text-xs font-medium text-muted-foreground"
        >
            {onToggle ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    aria-expanded={!folded}
                    aria-label={`${t('planner.completedSection')} (${tasks.length}), ${
                        folded
                            ? t('planner.showCompleted')
                            : t('planner.hideCompleted')
                    }`}
                    onClick={onToggle}
                    className="-ms-2.5 font-medium text-inherit"
                >
                    {folded ? (
                        <ChevronRight className="rtl:rotate-180" />
                    ) : (
                        <ChevronDown />
                    )}
                    Completed ({tasks.length})
                </Button>
            ) : (
                <span>Completed ({tasks.length})</span>
            )}
            {placement.date === null && (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                        void clearCompletedWithUndo(
                            placement.list,
                            tasks.map((task) => task.id),
                        )
                    }
                >
                    {t('planner.clearCompleted')}
                </Button>
            )}
        </div>
    );
}
