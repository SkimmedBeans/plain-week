import { Button } from '@/components/ui/button';
import type { TaskPlacement } from '@/lib/db/tasks';
import { t } from '@/lib/i18n';
import { clearCompletedWithUndo } from '@/lib/planner/task-actions';
import type { PlannerTask } from '@/lib/recurrence/expand';

export function CompletedHeading({
    placement,
    tasks,
}: {
    placement: TaskPlacement;
    tasks: PlannerTask[];
}) {
    return (
        <div
            data-completed-label
            className="flex flex-wrap items-center justify-between gap-x-2 border-b border-border px-1.5 pt-3 pb-1 text-xs font-medium text-muted-foreground"
        >
            <span>Completed ({tasks.length})</span>
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
