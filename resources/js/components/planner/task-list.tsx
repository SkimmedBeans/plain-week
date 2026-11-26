import { useDroppable } from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
    Fragment,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
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
import type { ParsedNewTask } from '@/lib/planner/smart-input';
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
    // A day before today shows its done tasks folded (F29) until unfolded.
    const isPastDay =
        placement.date !== null && placement.date < toDateKey(new Date());
    const [unfolded, setUnfolded] = useState(false);
    const folded = isPastDay && !unfolded;
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
    const allDone = listTasks.filter((task) => task.done);
    // Folded done tasks are not rendered: drops and the keyboard cursor only
    // see the shown rows.
    const visibleTasks = useMemo(
        () => (folded ? listTasks.filter((task) => !task.done) : listTasks),
        [folded, listTasks],
    );
    const shownTasks = tasks === undefined ? undefined : visibleTasks;
    const doneCount = allDone.length;
    const firstDoneId = doneCount > 0 ? allDone[0].id : null;
    const taskCount = visibleTasks.length;
    const openTotal = listTasks.length - doneCount;
    const scroller = useRef<HTMLDivElement | null>(null);
    const [overflow, setOverflow] = useState({ top: false, bottom: false });
    const measure = useCallback(() => {
        const element = scroller.current;
        if (!element) {
            return;
        }
        const top = element.scrollTop > 1;
        const bottom =
            element.scrollHeight - element.clientHeight - element.scrollTop > 1;
        setOverflow((current) =>
            current.top === top && current.bottom === bottom
                ? current
                : { top, bottom },
        );
    }, []);

    useEffect(() => {
        const element = scroller.current;
        if (!element || typeof ResizeObserver === 'undefined') {
            return;
        }
        const observer = new ResizeObserver(measure);
        observer.observe(element);

        return () => observer.disconnect();
    }, [measure]);

    useLayoutEffect(measure, [measure, taskCount]);
    const listKey = placementKey(placement);
    const { setNodeRef } = useDroppable({
        id: listDroppableId(listKey),
        data: {
            type: 'list',
            placement,
            tasks: visibleTasks,
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
                openCount: openTotal,
            });
        }
    }, [registerList, listKey, placement, shownTasks, openTotal]);

    // A new task pushes the empty row down: keep it in view while typing in
    // it, in a list that scrolls inside its cell (desktop).
    useLayoutEffect(() => {
        const input = newTaskInput.current;

        if (input !== null && document.activeElement === input) {
            input.scrollIntoView?.({ block: 'nearest' });
        }
    }, [taskCount]);

    const handleSubmit = (
        { text, date, time, color }: ParsedNewTask,
        input: string,
    ) => {
        const target = date === null ? placement : { ...placement, date };
        // A task dated elsewhere leaves this list: say where it went.
        const leavesList = date !== null && date !== placement.date;

        createTask({ ...target, text, time, ...(color && { color }) })
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
            ref={(element) => {
                setNodeRef(element);
                scroller.current = element;
            }}
            data-list={listKey}
            data-overflow-top={overflow.top || undefined}
            data-overflow-bottom={overflow.bottom || undefined}
            onScroll={measure}
            // A soft fade where the list runs past its cell (F28). A mask
            // only paints: taps and drops still reach the rows under it.
            style={
                overflow.top || overflow.bottom
                    ? {
                          maskImage: `linear-gradient(to bottom, ${
                              overflow.top ? 'transparent' : 'black'
                          }, black 2rem, black calc(100% - 2rem), ${
                              overflow.bottom ? 'transparent' : 'black'
                          })`,
                      }
                    : undefined
            }
            className={cn(
                'flex flex-col *:shrink-0 lg:-mx-2 lg:min-h-0 lg:flex-1 lg:[scrollbar-width:thin] lg:overflow-y-auto lg:px-2',
                className,
            )}
        >
            <SortableContext
                items={visibleTasks.map((task) => task.id)}
                strategy={verticalListSortingStrategy}
            >
                {visibleTasks.map((task, index) => (
                    <Fragment key={rowKey(task)}>
                        {task.id === firstDoneId && (
                            <>
                                {/* The end of the open tasks: a drop line
                                    before the first done task shows above
                                    the empty row and Completed. */}
                                {indicatorBefore === task.id && (
                                    <DropIndicator />
                                )}
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
                                    tasks={allDone}
                                    folded={folded}
                                    onToggle={
                                        isPastDay
                                            ? () => setUnfolded(folded)
                                            : undefined
                                    }
                                />
                            </>
                        )}
                        {indicatorBefore === task.id &&
                            task.id !== firstDoneId && <DropIndicator />}
                        <TaskRow
                            task={task}
                            isCursor={cursor?.taskId === task.id}
                            stripe={index % 2 === 1}
                            placement={placement}
                            tasks={visibleTasks}
                            name={name}
                            onOpen={onOpenTask}
                            onToggleDone={handleToggleDone}
                        />
                        {indicatorBefore === null &&
                            index === taskCount - 1 && <DropIndicator />}
                    </Fragment>
                ))}
            </SortableContext>
            {folded && doneCount > 0 && (
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
                    <CompletedHeading
                        placement={placement}
                        tasks={allDone}
                        folded
                        onToggle={() => setUnfolded(true)}
                    />
                </>
            )}
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
