import { useDroppable } from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Fragment, useLayoutEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { CompletedHeading } from '@/components/planner/completed-heading';
import {
    useKeyboardCursor,
    useKeyboardCursorApi,
} from '@/components/planner/keyboard-cursor';
import { NewTaskRow } from '@/components/planner/new-task-row';
import {
    listDroppableId,
    usePlannerDnd,
} from '@/components/planner/planner-dnd';
import { TaskRow } from '@/components/planner/task-row';
import { toDateKey } from '@/lib/db/dates';
import { createTask, toggleDone } from '@/lib/db/tasks';
import type { TaskPlacement } from '@/lib/db/tasks';
import type { PlannerTask } from '@/lib/recurrence/expand';
import { placementKey } from '@/lib/planner/drop';
import { formatShortDate, formatWeekday } from '@/lib/planner/format';
import { rowKey } from '@/lib/planner/repeat';
import type { ListDropData } from '@/lib/planner/drop';
import { parseNewTaskInput } from '@/lib/planner/smart-input';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = {
    /** The day or the Someday list this list shows. */
    placement: TaskPlacement;
    /** The named list's name, when `placement` is in one. */
    name?: string;
    /** Sorted tasks; `undefined` while the first local read is in progress. */
    tasks: PlannerTask[] | undefined;
    /** Accessible label of the empty row, e.g. "New task for Mon 12 Oct". */
    newTaskLabel: string;
    onOpenTask: (taskId: string) => void;
    className?: string;
};

/** The insertion line shown while a dragged task is over this spot. */
export function DropIndicator() {
    return (
        <div data-drop-indicator className="relative h-0">
            <div className="absolute inset-x-0 -top-px z-[11] h-0.5 rounded-full bg-primary" />
        </div>
    );
}

/**
 * A ruled list: the open tasks, then one empty row that appends new ones,
 * then the done ones under a "Completed (n)" label (the row is last when
 * there are no done tasks). Creating
 * with Enter keeps focus in that row, now below the new task, so typing can
 * go on. On desktop the list fills the rest of its cell: ruled lines carry on
 * below the last row to the bottom (a click there focuses the empty row, a
 * drop there lands at the end of the list), and the list scrolls on its own
 * when its tasks do not fit.
 */
export function TaskList({
    placement,
    name,
    tasks,
    newTaskLabel,
    onOpenTask,
    className,
}: Props) {
    const newTaskInput = useRef<HTMLInputElement>(null);
    // Done tasks are shown below the open ones (and below the empty row),
    // under "Completed"; each group keeps its stored order, so an unticked
    // task returns to its place. The drag-and-drop data and the keyboard
    // cursor use this shown order.
    const listTasks = useMemo(() => {
        const all = tasks ?? [];

        return [
            ...all.filter((task) => !task.done),
            ...all.filter((task) => task.done),
        ];
    }, [tasks]);
    const shownTasks = tasks === undefined ? undefined : listTasks;
    const doneCount = listTasks.filter((task) => task.done).length;
    const firstDoneId =
        doneCount > 0 ? listTasks[listTasks.length - doneCount].id : null;
    const taskCount = listTasks.length;
    const listKey = placementKey(placement);
    const { setNodeRef } = useDroppable({
        id: listDroppableId(listKey),
        data: {
            type: 'list',
            placement,
            tasks: listTasks,
            name,
        } satisfies ListDropData,
    });
    const { indicator } = usePlannerDnd();
    const indicatorBefore =
        indicator?.listKey === listKey ? indicator.beforeTaskId : undefined;
    const cursor = useKeyboardCursor();
    const { registerList, returnToList } = useKeyboardCursorApi();
    const cursorOnNewRow =
        cursor?.listKey === listKey && cursor.taskId === null;

    // Tell the keyboard cursor what this list shows.
    useLayoutEffect(() => {
        if (shownTasks !== undefined) {
            return registerList(listKey, {
                placement,
                tasks: shownTasks,
                openCount: taskCount - doneCount,
            });
        }
    }, [registerList, listKey, placement, shownTasks, taskCount, doneCount]);

    // A new task pushes the empty row down: keep it in view while typing in
    // it, in a list that scrolls inside its cell (desktop).
    useLayoutEffect(() => {
        const input = newTaskInput.current;

        if (input !== null && document.activeElement === input) {
            input.scrollIntoView?.({ block: 'nearest' });
        }
    }, [taskCount]);

    const handleSubmit = (input: string) => {
        const { text, date, time } = parseNewTaskInput(
            input,
            toDateKey(new Date()),
        );
        const target = date === null ? placement : { ...placement, date };
        // A task dated elsewhere leaves this list: say where it went.
        const leavesList = date !== null && date !== placement.date;

        createTask({ ...target, text, time })
            .then(() => {
                if (leavesList) {
                    toast(
                        t('planner.addedTo', {
                            weekday: formatWeekday(date),
                            date: formatShortDate(date),
                        }),
                    );
                }
            })
            .catch(() => toast.error(t('planner.saveFailed', { text: input })));
    };

    // Esc leaves the list and puts the keyboard cursor on its new-task row.
    const handleCancel = () => returnToList(listKey);

    const handleToggleDone = (taskId: string) => {
        toggleDone(taskId).catch(() =>
            toast.error(t('planner.updateTaskFailed')),
        );
    };

    return (
        // On desktop the list scrolls inside its cell (its rows keep their
        // height); its 8px side padding leaves room for the lifted look of
        // the row being typed in.
        <div
            ref={setNodeRef}
            data-list={listKey}
            className={cn(
                'flex flex-col *:shrink-0 lg:-mx-2 lg:min-h-0 lg:flex-1 lg:[scrollbar-width:thin] lg:overflow-y-auto lg:px-2',
                className,
            )}
        >
            <SortableContext
                items={listTasks.map((task) => task.id)}
                strategy={verticalListSortingStrategy}
            >
                {listTasks.map((task, index) => (
                    <Fragment key={rowKey(task)}>
                        {task.id === firstDoneId && (
                            <>
                                {/* The empty row sits between the open tasks
                                    and the Completed section. */}
                                <NewTaskRow
                                    ref={newTaskInput}
                                    label={newTaskLabel}
                                    isCursor={cursorOnNewRow}
                                    onSubmit={handleSubmit}
                                    onCancel={handleCancel}
                                />
                                <CompletedHeading
                                    placement={placement}
                                    tasks={listTasks.slice(-doneCount)}
                                />
                            </>
                        )}
                        {indicatorBefore === task.id && <DropIndicator />}
                        <TaskRow
                            task={task}
                            isCursor={cursor?.taskId === task.id}
                            placement={placement}
                            tasks={listTasks}
                            name={name}
                            onOpen={onOpenTask}
                            onToggleDone={handleToggleDone}
                        />
                        {indicatorBefore === null &&
                            index === taskCount - 1 && <DropIndicator />}
                    </Fragment>
                ))}
            </SortableContext>
            {doneCount === 0 && (
                <>
                    {indicatorBefore === null && taskCount === 0 && (
                        <DropIndicator />
                    )}
                    <NewTaskRow
                        ref={newTaskInput}
                        label={newTaskLabel}
                        isCursor={cursorOnNewRow}
                        onSubmit={handleSubmit}
                        onCancel={handleCancel}
                    />
                </>
            )}
            {/* Desktop: ruled lines down to the bottom of the cell. Pointer
                only; the empty row above is the keyboard's way in. */}
            <div
                aria-hidden
                data-list-filler
                onClick={() => newTaskInput.current?.focus()}
                className="min-h-0 flex-1 cursor-text bg-ruled max-lg:hidden"
            />
        </div>
    );
}
