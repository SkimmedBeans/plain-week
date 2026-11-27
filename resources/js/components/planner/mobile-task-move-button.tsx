import { Check, GripVertical } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useMobileTaskMove } from '@/hooks/use-mobile-task-move';
import { t } from '@/lib/i18n';

export function MobileTaskMoveButton({
    compact = false,
}: {
    compact?: boolean;
}) {
    const { movingTasks, toggleMovingTasks } = useMobileTaskMove();
    const touch = useRef<{ x: number; y: number } | null>(null);
    const handledTouch = useRef(false);
    const label = t(
        movingTasks ? 'planner.finishMovingTasks' : 'planner.startMovingTasks',
    );

    return (
        <Button
            type="button"
            variant={movingTasks ? 'default' : 'outline'}
            size={compact ? 'icon-sm' : 'sm'}
            onPointerDown={(event) => {
                handledTouch.current = false;
                touch.current =
                    event.pointerType === 'touch'
                        ? { x: event.clientX, y: event.clientY }
                        : null;
            }}
            onPointerCancel={() => {
                touch.current = null;
            }}
            onPointerUp={(event) => {
                const start = touch.current;
                touch.current = null;
                if (
                    start &&
                    Math.hypot(
                        event.clientX - start.x,
                        event.clientY - start.y,
                    ) < 10
                ) {
                    handledTouch.current = true;
                    toggleMovingTasks();
                }
            }}
            onClick={(event) => {
                if (event.detail === 0 || !handledTouch.current) {
                    toggleMovingTasks();
                }
            }}
            aria-label={label}
            aria-pressed={movingTasks}
            title={label}
            className="touch-manipulation rounded-full lg:hidden"
        >
            {movingTasks ? <Check /> : <GripVertical />}
            {!compact && (
                <span className="hidden min-[380px]:inline">
                    {t('planner.moveTasksMode')}
                </span>
            )}
        </Button>
    );
}
