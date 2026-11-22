import { Trash2 } from 'lucide-react';
import {
    Fragment,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { toast } from 'sonner';
import { CompletedHeading } from '@/components/planner/completed-heading';
import { NewTaskRow } from '@/components/planner/new-task-row';
import {
    ListCardDnd,
    listDroppableId,
    usePlannerDnd,
} from '@/components/planner/planner-dnd';
import { TaskRow } from '@/components/planner/task-row';
import { DropIndicator } from '@/components/planner/task-list';
import { Button } from '@/components/ui/button';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useSomedayLists } from '@/hooks/use-tasks';
import { toDateKey } from '@/lib/db/dates';
import { deleteList, renameList, LIST_NAME_MAX } from '@/lib/db/lists';
import { createTask, toggleDone, type TaskPlacement } from '@/lib/db/tasks';
import type { PlannerTask } from '@/lib/recurrence/expand';
import { t } from '@/lib/i18n';
import { placementKey, type ListDropData } from '@/lib/planner/drop';
import {
    formatDay,
    formatShortDate,
    formatWeekday,
} from '@/lib/planner/format';
import { rowKey } from '@/lib/planner/repeat';
import { parseNewTaskInput } from '@/lib/planner/smart-input';
import { TASK_COLOR_STYLES } from '@/lib/planner/task-colors';
import { cn } from '@/lib/utils';

/**
 * What the list card shows (F11): a named list (F6), the base Someday column,
 * or a single day. One `ListDialog` serves every list; the session remounts
 * per identity, and every openable list header carries `data-list-card-target`
 * with the matching key so focus can return to it on close.
 */
export type ListCardIdentity =
    | { kind: 'named'; id: string }
    | { kind: 'someday' }
    | { kind: 'day'; date: string };

/** Stable key for an identity: remounts the session and targets focus return. */
export function listCardKey(identity: ListCardIdentity): string {
    switch (identity.kind) {
        case 'named':
            return `named:${identity.id}`;
        case 'someday':
            return 'someday';
        case 'day':
            return `day:${identity.date}`;
    }
}

type Props = {
    /** The list to show; null keeps the card closed. */
    identity: ListCardIdentity | null;
    /** Monday of the shown week: the card's drop resolution uses it. */
    weekStart: Date;
    /** The list's placement: a day, or a Someday list (column 0 / named). */
    placement: TaskPlacement;
    /** The list's tasks, live from the column's own query. */
    tasks: PlannerTask[] | undefined;
    /** Accessible label of the empty row, e.g. "New task for Mon 12 Oct". */
    newTaskLabel: string;
    onOpenTask: (taskId: string) => void;
    onClose: () => void;
};

/**
 * The list card (F11): a dialog that shows any list — a day, the base Someday
 * column, or a named list — as a full, live view of that list's tasks: the
 * same rows, order and writes as the page's column. The card runs its task
 * list in its own nested DnD context (dnd-kit ids are unique per context, and
 * the grid's `PlannerDnd` already registers the same droppable and sortable
 * ids, so a second `TaskList` in the grid's context would break it). Edits
 * write to the local database as they happen; Esc or a click outside closes
 * the card and focus returns to the list's header button. The named card keeps
 * the F6 name field (live rename) and delete on top of its tasks.
 */
export function ListDialog(props: Props) {
    const { identity, ...rest } = props;
    return identity === null ? null : (
        <ListDialogSession
            key={listCardKey(identity)}
            identity={identity}
            {...rest}
        />
    );
}

function ListDialogSession({
    identity,
    weekStart,
    placement,
    tasks,
    newTaskLabel,
    onOpenTask,
    onClose,
}: Omit<Props, 'identity'> & { identity: ListCardIdentity }) {
    const isNamed = identity.kind === 'named';
    // Resolve the named list: its name and the close-when-deleted check.
    // `lists` is undefined while the first read runs; only after that does a
    // missing row mean the list went away.
    const lists = useSomedayLists();
    const list = isNamed ? lists?.find((l) => l.id === identity.id) : undefined;
    const color = list?.color ?? 'none';
    const known = lists !== undefined;
    const open = !isNamed || (known && list !== undefined);
    const contentRef = useRef<HTMLDivElement>(null);
    const [deleteOpen, setDeleteOpen] = useState(false);

    // Deleted here or on another device (through sync): nothing left to show.
    useEffect(() => {
        if (isNamed && known && list === undefined) {
            onClose();
        }
    }, [isNamed, known, list, onClose]);

    // The name shown in the card's rows (move labels) and, for the named
    // card, in its editable name field. Days have no list name.
    const name = isNamed
        ? list?.name
        : identity.kind === 'someday'
          ? t('planner.someday')
          : undefined;

    const handleOpenTask = (taskId: string) => {
        // Close the card so only one dialog is open; the task's editor takes
        // over, and its own close returns focus to the task's row in the grid.
        onClose();
        onOpenTask(taskId);
    };

    const handleDelete = () => {
        if (list === undefined) {
            return;
        }

        void deleteList(list.id).then((deleted) => {
            if (deleted === null) {
                toast.error(t('planner.listDeleteFailed'));
            }
            // A successful delete closes the card through the effect above.
        });
    };

    // Day and Someday cards get a fixed, non-editable title; the named card
    // keeps the F6 name field (live rename) and delete on top of its tasks.
    const dayTitle =
        identity.kind === 'day'
            ? `${formatWeekday(identity.date)} ${formatDay(identity.date)}`
            : t('planner.someday');
    const srTitle = isNamed
        ? t('planner.listCardTitle')
        : identity.kind === 'day'
          ? t('planner.dayLabel', {
                weekday: formatWeekday(identity.date),
                day: formatDay(identity.date),
            })
          : t('planner.someday');

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent
                ref={contentRef}
                showCloseButton={false}
                aria-describedby={undefined}
                // Focus the dialog itself: no tooltip pops up and no on-screen
                // keyboard opens on touch devices.
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    contentRef.current?.focus();
                }}
                // The delete confirm is portalled outside this content: a
                // click on it must not close the card.
                onInteractOutside={(event) => {
                    if (
                        event.target instanceof Element &&
                        event.target.closest('[role="alertdialog"]')
                    ) {
                        event.preventDefault();
                    }
                }}
                // Back to the list's header button.
                onCloseAutoFocus={(event) => {
                    const header = document.querySelector<HTMLElement>(
                        `[data-list-card-target="${CSS.escape(
                            listCardKey(identity),
                        )}"]`,
                    );

                    if (header) {
                        event.preventDefault();
                        header.focus();
                    }
                }}
                className="top-4 max-h-[calc(100dvh-2rem)] translate-y-0 gap-4 overflow-y-auto bg-secondary p-4 text-secondary-foreground sm:top-16 sm:max-h-[calc(100dvh-8rem)] sm:max-w-md sm:p-6"
            >
                <DialogTitle className="sr-only">{srTitle}</DialogTitle>
                {isNamed ? (
                    <>
                        {/* Uncontrolled (the session remounts per list):
                            typing never waits on the database round trip, and a
                            remote rename made while the card is open shows next
                            time it opens. */}
                        <div className="flex items-start gap-2 border-b border-foreground/30 pb-1">
                            <Input
                                defaultValue={name}
                                maxLength={LIST_NAME_MAX}
                                aria-label={t('planner.listName')}
                                onChange={(event) => {
                                    const field = event.target;
                                    const value = field.value;

                                    // A list always has a name: only write real
                                    // ones (an empty field reverts on blur).
                                    if (value.trim() !== '') {
                                        void renameList(
                                            identity.id,
                                            value,
                                        ).catch(() =>
                                            toast.error(
                                                t('planner.renameFailed'),
                                            ),
                                        );
                                    }
                                }}
                                onBlur={(event) => {
                                    if (
                                        event.target.value.trim() === '' &&
                                        list !== undefined
                                    ) {
                                        event.target.value = list.name;
                                    }
                                }}
                                className={cn(
                                    'min-h-0 min-w-0 flex-1 border-0 p-0 text-2xl leading-snug font-medium shadow-none focus-visible:ring-0',
                                    color === 'none'
                                        ? 'rounded-none bg-transparent dark:bg-transparent'
                                        : 'rounded-full px-2.5',
                                    TASK_COLOR_STYLES[color].pill,
                                )}
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t('common.delete')}
                                onClick={() => setDeleteOpen(true)}
                                className="mt-0.5 shrink-0 rounded-full hover:bg-transparent"
                            >
                                <Trash2 className="size-5" />
                            </Button>
                        </div>
                    </>
                ) : (
                    <h2 className="border-b-2 border-foreground pb-3 text-lg font-bold tracking-tight lg:text-xl">
                        {dayTitle}
                    </h2>
                )}
                <ListCardDnd weekStart={weekStart}>
                    <ListCardTaskList
                        placement={placement}
                        name={name}
                        tasks={tasks}
                        newTaskLabel={newTaskLabel}
                        onOpenTask={handleOpenTask}
                    />
                </ListCardDnd>
            </DialogContent>
            {isNamed && list !== undefined && (
                <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {t('planner.deleteListTitle', {
                                    name: list.name,
                                })}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {t('planner.deleteListDescription')}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>
                                {t('common.cancel')}
                            </AlertDialogCancel>
                            <AlertDialogAction onClick={handleDelete}>
                                {t('common.delete')}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </Dialog>
    );
}

type TaskListProps = {
    placement: TaskPlacement;
    name?: string;
    tasks: PlannerTask[] | undefined;
    newTaskLabel: string;
    onOpenTask: (taskId: string) => void;
};

/**
 * The list card's task list: the same rows, order and writes as the page's
 * `TaskList` (open tasks, the empty row, the "Completed (n)" label and the
 * done rows), but in the card's own DnD context and out of the grid's
 * keyboard-cursor model — no `registerList`, no cursor, no filler. The rows
 * are plain focusable buttons; reordering writes through `moveTask` via the
 * card's `ListCardDnd`.
 */
function ListCardTaskList({
    placement,
    name,
    tasks,
    newTaskLabel,
    onOpenTask,
}: TaskListProps) {
    const newTaskInput = useRef<HTMLInputElement>(null);
    // Done tasks are shown below the open ones (and below the empty row),
    // under "Completed"; each group keeps its stored order.
    const listTasks = useMemo(() => {
        const all = tasks ?? [];

        return [
            ...all.filter((task) => !task.done),
            ...all.filter((task) => task.done),
        ];
    }, [tasks]);
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

    // Keep the empty row in view while typing in it (the card scrolls in its
    // DialogContent, not in the list).
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

    const handleToggleDone = (taskId: string) => {
        toggleDone(taskId).catch(() =>
            toast.error(t('planner.updateTaskFailed')),
        );
    };

    return (
        <div
            ref={setNodeRef}
            data-list={listKey}
            className="flex flex-col *:shrink-0"
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
                                    onSubmit={handleSubmit}
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
                            isCursor={false}
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
                        onSubmit={handleSubmit}
                    />
                </>
            )}
        </div>
    );
}
