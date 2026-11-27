import { useSortable } from '@dnd-kit/sortable';
import { CircleCheck, GripVertical, ListChecks, Repeat } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';
import {
    CURSOR_ROW_CLASS,
    useCursorFocus,
    useKeyboardCursor,
} from '@/components/planner/keyboard-cursor';
import {
    TOUCH_DRAG_DELAY_MS,
    TOUCH_DRAG_TOLERANCE_PX,
    usePlannerDnd,
} from '@/components/planner/planner-dnd';
import { useScopedAction } from '@/components/planner/scope-prompt';
import { ShortcutHint } from '@/components/planner/shortcut-hint';
import {
    TaskContextMenu,
    TaskMenuButton,
} from '@/components/planner/task-context-menu';
import type { TaskContextMenuActions } from '@/components/planner/task-context-menu';
import { focusCalendarDay } from '@/components/planner/task-dialog/calendar-focus';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { useSeries } from '@/hooks/use-tasks';
import { parseDateKey, toDateKey } from '@/lib/db/dates';
import { updateTask } from '@/lib/db/tasks';
import type { TaskPlacement } from '@/lib/db/tasks';
import type { TaskDragData } from '@/lib/planner/drop';
import { copyWithToast } from '@/lib/planner/clipboard';
import { summarizeRecurrence } from '@/lib/planner/repeat';
import {
    SOMEDAY_MOVE,
    deleteWithUndo,
    duplicateWithToast,
    moveWithUndo,
    scheduleWithUndo,
    setTaskColor,
    todayMove,
} from '@/lib/planner/task-actions';
import { TASK_COLOR_STYLES } from '@/lib/planner/task-colors';
import { t } from '@/lib/i18n';
import { isRecurring } from '@/lib/recurrence/expand';
import type { PlannerTask } from '@/lib/recurrence/expand';
import { cn } from '@/lib/utils';
import { LinkedText } from './linked-text';

type Props = {
    task: PlannerTask;
    /** The list the row is in, and its tasks in display order (for drops). */
    placement: TaskPlacement;
    tasks: PlannerTask[];
    /** The named list's name, when the row is in one. */
    name?: string;
    /** The keyboard cursor is on this task. */
    isCursor?: boolean;
    /** Every other row is striped (F36, F37). */
    stripe?: boolean;
    /**
     * Opens the task card: a double tap or double click on the text, Enter
     * or Space on it, or "Task details" in its menu. A single tap or click
     * edits the text in place instead (F19).
     */
    onOpen: (taskId: string) => void;
    onToggleDone: (taskId: string) => void;
    listCardSwipes?: boolean;
    className?: string;
};

type TaskRepeat = {
    /** Shown with the repeat icon: it belongs to a live series. */
    repeats: boolean;
    /** "Every Mon, Wed"; `null` until the series has loaded. */
    summary: string | null;
};

const DELETE_SWIPE_DISTANCE_PX = 72;
/** A second tap this soon after the first opens the card instead (F19). */
export const DOUBLE_TAP_MS = 350;
const SWIPE_SETTLE_MS = 170;

function slideTo(row: HTMLDivElement, offset: string): Animation | undefined {
    const from = row.style.translate || '0px';
    row.style.translate = offset;

    if (
        from !== offset &&
        typeof row.animate === 'function' &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
        const animation = row.animate(
            [{ translate: from }, { translate: offset }],
            {
                duration: SWIPE_SETTLE_MS,
                easing: 'ease-out',
            },
        );
        // Another press can interrupt the slide back to rest.
        void animation.finished.catch(() => {});
        return animation;
    }
}

type DeleteSwipe = {
    pointerId: number;
    x: number;
    y: number;
    startedAt: number;
    direction: -1 | 1;
    engaged: boolean;
};

/**
 * Whether a row belongs to a live series, and its rule in words. An exception
 * whose series is gone is a one-off task now.
 */
function useTaskRepeat(task: PlannerTask): TaskRepeat {
    const series = useSeries(isRecurring(task) ? task : null);

    return {
        repeats:
            task.kind === 'occurrence' ||
            (task.kind === 'exception' && Boolean(series)),
        summary: series ? summarizeRecurrence(series.recurrence) : null,
    };
}

/** The repeat icon, with the rule in a tooltip ("Every Mon, Wed"). */
function RepeatIcon({ summary }: { summary: string | null }) {
    // A span carries the tooltip: buttons turn off pointer events on icons.
    const icon = (
        <span
            data-testid="repeat-icon"
            className="ms-1.5 mt-1.5 flex shrink-0 opacity-70"
        >
            <Repeat aria-hidden className="size-3" />
        </span>
    );

    return summary ? (
        <Tooltip>
            <TooltipTrigger asChild>{icon}</TooltipTrigger>
            <TooltipContent>{summary}</TooltipContent>
        </Tooltip>
    ) : (
        icon
    );
}

/**
 * The character offset in `container`'s text at a viewport point, or null
 * when the point is not on its text. Used to put the caret where the text was
 * tapped when the row turns into its inline editor.
 */
function textOffsetAt(
    container: HTMLElement,
    x: number,
    y: number,
): number | null {
    let node: Node | null = null;
    let offset = 0;
    const doc = document as Document & {
        caretPositionFromPoint?: (
            x: number,
            y: number,
        ) => { offsetNode: Node; offset: number } | null;
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };

    if (typeof doc.caretPositionFromPoint === 'function') {
        const position = doc.caretPositionFromPoint(x, y);
        node = position?.offsetNode ?? null;
        offset = position?.offset ?? 0;
    } else if (typeof doc.caretRangeFromPoint === 'function') {
        const range = doc.caretRangeFromPoint(x, y);
        node = range?.startContainer ?? null;
        offset = range?.startOffset ?? 0;
    }

    if (node === null || !container.contains(node)) {
        return null;
    }

    const range = document.createRange();
    range.selectNodeContents(container);
    range.setEnd(node, offset);

    return range.toString().length;
}

/** Sub-tasks done and in total, beside the text (F21). */
function SubtaskBadge({ task }: { task: PlannerTask }) {
    const done = task.subtasks.filter((subtask) => subtask.done).length;

    return (
        <span
            data-testid="subtask-badge"
            aria-hidden
            className="ms-1.5 mt-0.5 flex shrink-0 items-center gap-0.5 text-xs leading-5 tabular-nums opacity-70"
        >
            <ListChecks className="size-3" />
            {done}/{task.subtasks.length}
        </span>
    );
}

type InlineEditorProps = {
    task: PlannerTask;
    /** Where the caret starts, as a character offset in the text. */
    caret: number;
    /** When the editor opened (`performance.now()`). */
    openedAt: number;
    /** Leaves the editor; `text` is the new text, or null to keep the old. */
    onDone: (text: string | null, how: 'enter' | 'blur' | 'escape') => void;
    /** A second tap right after the first one: open the card instead. */
    onDoubleTap: () => void;
};

/**
 * The task's text as an editable field in its row (F19): Enter or leaving
 * the field saves, Esc cancels, and an emptied text keeps the old one. It
 * keeps presses to itself, so selecting text never drags the task or opens
 * the task menu (the browser's own menu, with Paste, shows instead).
 */
function InlineTextEditor({
    task,
    caret,
    openedAt,
    onDone,
    onDoubleTap,
}: InlineEditorProps) {
    const field = useRef<HTMLTextAreaElement>(null);
    const finished = useRef(false);

    useLayoutEffect(() => {
        const element = field.current;
        if (element) {
            element.focus({ preventScroll: true });
            element.setSelectionRange(caret, caret);
        }
        // Only when the editor opens.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const finish = (text: string | null, how: 'enter' | 'blur' | 'escape') => {
        if (finished.current) {
            return;
        }
        finished.current = true;
        onDone(text, how);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        // Planner shortcuts and the row's drag and menu keys stay out.
        event.stopPropagation();

        if (event.nativeEvent.isComposing) {
            return;
        }

        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            finish(event.currentTarget.value, 'enter');
        } else if (event.key === 'Escape') {
            event.preventDefault();
            finish(null, 'escape');
        }
    };

    const stop = (event: { stopPropagation: () => void }) =>
        event.stopPropagation();

    return (
        <Textarea
            ref={field}
            data-task-editor
            defaultValue={task.text}
            aria-label={t('planner.editTaskText', { text: task.text })}
            enterKeyHint="done"
            rows={1}
            onKeyDown={handleKeyDown}
            onBlur={(event) => finish(event.currentTarget.value, 'blur')}
            onPointerDown={(event) => {
                stop(event);
                if (performance.now() - openedAt < DOUBLE_TAP_MS) {
                    event.preventDefault();
                    finished.current = true;
                    onDoubleTap();
                }
            }}
            onMouseDown={stop}
            onTouchStart={stop}
            onClick={stop}
            onContextMenu={stop}
            className={cn(
                'min-h-0 flex-1 rounded-none border-0 bg-transparent px-1.5 py-2 leading-6 shadow-none select-text [-webkit-touch-callout:default] focus-visible:border-0 focus-visible:ring-0 lg:text-sm dark:bg-transparent',
                task.done && 'line-through',
            )}
        />
    );
}

function TaskLabelView({
    task,
    repeat,
}: {
    task: PlannerTask;
    repeat: TaskRepeat;
}) {
    const color = TASK_COLOR_STYLES[task.color];
    // A colored pill keeps a gap from the time pill or repeat icon before it;
    // text without a pill already sits clear of them through its padding.
    const afterBadge =
        Boolean(color.pill) && (Boolean(task.time) || repeat.repeats);

    // The parent aligns items to the top, so the time pill and repeat icon
    // are nudged down to sit centered on the text's first (24px) line.
    return (
        <>
            {task.time && (
                <span className="ms-1.5 mt-px shrink-0 rounded-full border border-current px-1.5 text-xs leading-5 tabular-nums">
                    {task.time}
                </span>
            )}
            {repeat.repeats && <RepeatIcon summary={repeat.summary} />}
            {/* Wraps up to three lines. A colored pill gets 2px of vertical
                padding, cancelled by a negative margin so the row stays 42px,
                and a 14px radius: half its 28px height, so one line is a
                capsule, while the 10px side padding keeps a wrapped block's
                text clear of its corners. Plain text keeps its 6px inset. */}
            <span
                data-task-text
                className={cn(
                    'line-clamp-3 min-w-0 leading-6 wrap-anywhere whitespace-normal',
                    color.pill,
                    color.pill ? '-my-0.5 rounded-xl px-2.5 py-0.5' : 'px-1.5',
                    afterBadge && 'ms-1',
                    task.done && 'line-through',
                    task.done && color.pill && 'opacity-50',
                )}
            >
                <LinkedText text={task.text} inButton />
            </span>
            {task.subtasks.length > 0 && <SubtaskBadge task={task} />}
        </>
    );
}

/**
 * The task's time pill, repeat icon and text pill, as shown in a row (and the
 * drag overlay).
 */
export function TaskLabel({ task }: { task: PlannerTask }) {
    return <TaskLabelView task={task} repeat={useTaskRepeat(task)} />;
}

/**
 * One ruled row showing a task: a button with the text that opens it, and a
 * check button at the end that toggles completion (on hover or focus with a
 * mouse on desktop, always on mobile and touch screens).
 *
 * The whole row is draggable (mouse: after 5px of movement, so a click still
 * opens the task; touch: press, hold and move). For keyboard users a move
 * button, visible only while focused, picks the task up with Space or Enter.
 *
 * Right click or Shift+F10 / the context menu key open the task's context
 * menu. On a touch screen a long press only drags: the row's "more" button
 * (⋮) opens the same items instead.
 */
export function TaskRow({
    task,
    placement,
    tasks,
    name,
    isCursor = false,
    stripe = false,
    onOpen,
    onToggleDone,
    listCardSwipes = false,
    className,
}: Props) {
    const openRef = useCursorFocus<HTMLButtonElement>(isCursor);
    // While the keyboard cursor is shown, keys act on its row, not on the
    // hovered one: only the cursor's row shows the hint then.
    const cursorShown = useKeyboardCursor() !== null;
    const repeat = useTaskRepeat(task);
    const label = [
        task.time,
        task.text,
        repeat.repeats ? t('planner.taskRepeats') : null,
        task.subtasks.length > 0
            ? t('planner.hasSubtasks', {
                  done: task.subtasks.filter((subtask) => subtask.done).length,
                  total: task.subtasks.length,
              })
            : null,
        task.done ? t('planner.taskDone') : null,
    ]
        .filter(Boolean)
        .join(' ');
    const { setNodeRef, setActivatorNodeRef, listeners, attributes } =
        useSortable({
            id: task.id,
            data: {
                type: 'task',
                task,
                placement,
                tasks,
                name,
            } satisfies TaskDragData,
            attributes: { roleDescription: t('planner.movableTask') },
        });
    // Dimmed while dragged, and until the drop has been written.
    const isDragging = usePlannerDnd().activeId === task.id;
    const scoped = useScopedAction(task);
    // A finger is pressing the row: a long press must not open the
    // context menu (it is a drag), however the browser or Radix sends it.
    const touchPressed = useRef(false);
    const deleteSwipe = useRef<DeleteSwipe | null>(null);
    const swallowSwipeClick = useRef(false);
    const swipeSurface = useRef<HTMLDivElement>(null);
    const swipeAnimation = useRef<Animation | undefined>(undefined);
    const deletingBySwipe = useRef(false);
    // The inline editor (F19): where its caret starts and when it opened.
    const [editing, setEditing] = useState<{
        caret: number;
        openedAt: number;
    } | null>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const refocusRow = useRef(false);
    // The "Pick a date" popover: whether it is open, and the month the
    // calendar shows so paging is kept when it is reopened.
    const [pickDateOpen, setPickDateOpen] = useState(false);
    const [pickDateMonth, setPickDateMonth] = useState<Date | undefined>(
        undefined,
    );

    useLayoutEffect(() => {
        if (editing === null && refocusRow.current) {
            refocusRow.current = false;
            openRef.current?.focus({ preventScroll: true });
        }
    }, [editing, openRef]);

    const startEditing = (event: ReactMouseEvent<HTMLButtonElement>) => {
        const span =
            textRef.current?.querySelector<HTMLElement>('[data-task-text]') ??
            null;
        const offset =
            span === null
                ? null
                : textOffsetAt(span, event.clientX, event.clientY);
        // Rendered now, inside the tap, so a phone shows its keyboard.
        flushSync(() =>
            setEditing({
                caret: Math.min(offset ?? task.text.length, task.text.length),
                openedAt: performance.now(),
            }),
        );
    };

    const finishEditing = (
        value: string | null,
        how: 'enter' | 'blur' | 'escape',
    ) => {
        refocusRow.current = how !== 'blur';
        setEditing(null);
        const text = value?.replace(/\s*\n\s*/g, ' ').trim() ?? '';

        if (text !== '' && text !== task.text) {
            void scoped('edit', (scope) =>
                updateTask(task.id, { text }, { scope }),
            ).catch(() => toast.error(t('planner.updateTaskFailed')));
        }
    };

    const [addingToDay, setAddingToDay] = useState(false);
    const pickerDate = addingToDay ? task.week_slot?.date : task.date;
    const actions: TaskContextMenuActions = {
        onOpenCard: () => onOpen(task.id),
        onCopyText: () =>
            void copyWithToast(task.text, t('planner.textCopied')),
        onColorChange: (color) => {
            if (color !== task.color) {
                void scoped('edit', (scope) =>
                    setTaskColor(task.id, color, scope),
                );
            }
        },
        onMoveToToday: () => {
            const move = todayMove();
            if (move.date !== task.date) {
                void moveWithUndo(task.id, move);
            }
        },
        onAddToDay:
            task.kind === 'task' && task.date === null
                ? () => {
                      setAddingToDay(true);
                      window.setTimeout(() => setPickDateOpen(true), 0);
                  }
                : undefined,
        onPickDate: () => {
            setAddingToDay(false);
            // The context menu's dismissal click would otherwise be read as an
            // outside click by the popover's dismiss layer, closing it
            // instantly. Open on the next tick so that click has settled first.
            window.setTimeout(() => setPickDateOpen(true), 0);
        },
        onMoveToSomeday: () => moveWithUndo(task.id, SOMEDAY_MOVE),
        onMoveToList: (column, listName) =>
            moveWithUndo(
                task.id,
                { date: null, list: column },
                column === 0 ? undefined : listName,
            ),
        onDuplicate: () => duplicateWithToast(task.id),
        onDelete: () =>
            void scoped('delete', (scope) => deleteWithUndo(task.id, scope)),
    };

    const settleSwipe = async (swipe: DeleteSwipe, remove: boolean) => {
        const row = swipeSurface.current;
        if (!row) {
            return;
        }

        deletingBySwipe.current = remove;
        const animation = slideTo(
            row,
            remove ? `${swipe.direction * 100}%` : '0px',
        );
        swipeAnimation.current = animation;
        if (!remove) {
            return;
        }

        // Keep the row in IndexedDB until its exit finishes so the live query
        // cannot remove it halfway through the slide.
        await animation?.finished.catch(() => {});
        if (!(await deleteWithUndo(task.id, 'this'))) {
            swipeAnimation.current = slideTo(row, '0px');
            deletingBySwipe.current = false;
        }
    };

    return (
        <TaskContextMenu task={task} {...actions}>
            <div
                ref={setNodeRef}
                data-task-id={task.id}
                data-week-swipe-block={task.done || listCardSwipes || undefined}
                data-stripe={stripe || undefined}
                data-cursor={isCursor || undefined}
                {...listeners}
                onPointerDown={(event) => {
                    // Only presses on the row itself, not ones bubbling up
                    // the React tree from a portalled menu.
                    if (!event.currentTarget.contains(event.target as Node)) {
                        return;
                    }

                    if (deletingBySwipe.current) {
                        event.preventDefault();
                        return;
                    }
                    swipeAnimation.current?.cancel();
                    touchPressed.current = event.pointerType === 'touch';
                    swallowSwipeClick.current = false;
                    const target = event.target as Element;
                    deleteSwipe.current =
                        (task.done || listCardSwipes) &&
                        touchPressed.current &&
                        event.isPrimary &&
                        target.closest('[data-task-open]') &&
                        !target.closest('[data-task-editor]') &&
                        !target.closest('[data-link]')
                            ? {
                                  pointerId: event.pointerId,
                                  x: event.clientX,
                                  y: event.clientY,
                                  startedAt: event.timeStamp,
                                  direction: listCardSwipes
                                      ? 1
                                      : getComputedStyle(event.currentTarget)
                                              .direction === 'rtl'
                                        ? 1
                                        : -1,
                                  engaged: false,
                              }
                            : null;

                    // Skips Radix's own 700 ms touch long press, which would
                    // open the menu under a held drag. Click and focus are
                    // unaffected; only the emulated mouse events are dropped.
                    if (
                        touchPressed.current &&
                        !target.closest('[data-task-editor]')
                    ) {
                        event.preventDefault();
                    }
                }}
                onPointerMove={(event) => {
                    const swipe = deleteSwipe.current;
                    if (!swipe || swipe.pointerId !== event.pointerId) {
                        return;
                    }

                    const delta = event.clientX - swipe.x;
                    const x = listCardSwipes
                        ? Math.abs(delta)
                        : delta * swipe.direction;
                    const y = Math.abs(event.clientY - swipe.y);
                    if (!swipe.engaged) {
                        if (Math.hypot(x, y) <= TOUCH_DRAG_TOLERANCE_PX) {
                            return;
                        }
                        if (
                            event.timeStamp - swipe.startedAt >=
                                TOUCH_DRAG_DELAY_MS ||
                            x <= 2 * y
                        ) {
                            deleteSwipe.current = null;
                            return;
                        }
                        swipe.engaged = true;
                    }

                    const row = swipeSurface.current;
                    if (row) {
                        row.style.translate = `${listCardSwipes ? delta : Math.max(0, x) * swipe.direction}px`;
                    }
                }}
                onPointerUp={(event) => {
                    touchPressed.current = false;
                    const swipe = deleteSwipe.current;
                    deleteSwipe.current = null;
                    if (
                        !swipe?.engaged ||
                        swipe.pointerId !== event.pointerId
                    ) {
                        return;
                    }

                    const delta = event.clientX - swipe.x;
                    const x = listCardSwipes
                        ? Math.abs(delta)
                        : delta * swipe.direction;
                    const y = Math.abs(event.clientY - swipe.y);
                    swallowSwipeClick.current = true;
                    const triggered =
                        !isDragging &&
                        x >= DELETE_SWIPE_DISTANCE_PX &&
                        x > 2 * y;
                    if (listCardSwipes && triggered && delta < 0) {
                        void settleSwipe(swipe, false);
                        if (!task.done) {
                            onToggleDone(task.id);
                        }
                    } else {
                        void settleSwipe(swipe, triggered);
                    }
                }}
                onPointerCancel={() => {
                    touchPressed.current = false;
                    const swipe = deleteSwipe.current;
                    deleteSwipe.current = null;
                    if (swipe?.engaged) {
                        void settleSwipe(swipe, false);
                    }
                }}
                onClickCapture={(event) => {
                    if (swallowSwipeClick.current && event.detail > 0) {
                        swallowSwipeClick.current = false;
                        event.preventDefault();
                        event.stopPropagation();
                    }
                }}
                onContextMenu={(event) => {
                    // No menu from a long press (the browser sends one on
                    // Android) nor for the task being dragged.
                    if (touchPressed.current || isDragging) {
                        event.preventDefault();
                    }
                }}
                className={cn(
                    // At least one ruled row tall (42px), growing as the text
                    // wraps; controls sit on the first line.
                    'group/task relative flex min-h-row overflow-x-clip border-b border-border select-none [-webkit-touch-callout:none]',
                    task.done && 'text-muted-foreground',
                    isDragging && 'opacity-40',
                    // The keyboard cursor, or keyboard focus on the text
                    // button, scrolled clear of the sticky header on phones.
                    CURSOR_ROW_CLASS,
                    'max-lg:scroll-mt-32',
                    className,
                )}
            >
                <div
                    ref={swipeSurface}
                    data-task-swipe-surface
                    className="relative flex min-w-0 flex-1 items-start gap-1 after:pointer-events-none after:absolute after:inset-y-0 after:start-full after:w-full after:bg-destructive/15"
                >
                    {editing !== null ? (
                        <div className="flex min-w-0 flex-1 items-start self-stretch">
                            {task.time && (
                                <span className="ms-1.5 mt-2.5 shrink-0 rounded-full border border-current px-1.5 text-xs leading-5 tabular-nums">
                                    {task.time}
                                </span>
                            )}
                            <InlineTextEditor
                                task={task}
                                caret={editing.caret}
                                openedAt={editing.openedAt}
                                onDone={finishEditing}
                                onDoubleTap={() => {
                                    setEditing(null);
                                    onOpen(task.id);
                                }}
                            />
                        </div>
                    ) : (
                        <Button
                            ref={openRef}
                            type="button"
                            variant="ghost"
                            data-task-open
                            aria-label={label}
                            onClick={(event) => {
                                // Enter or Space (no pointer) open the card, as
                                // does a double click; a tap or click edits.
                                if (event.detail === 0 || event.detail > 1) {
                                    onOpen(task.id);
                                } else {
                                    startEditing(event);
                                }
                            }}
                            // Focus shows on the row as the cursor's look
                            // (`CURSOR_ROW_CLASS`), not as a ring on the button.
                            className={cn(
                                'h-auto min-w-0 flex-1 items-start justify-start gap-0 self-stretch rounded-none border-0 px-0 py-2 text-start text-base font-normal whitespace-normal text-inherit hover:bg-transparent hover:text-inherit focus-visible:border-transparent focus-visible:ring-0 active:not-aria-[haspopup]:translate-y-0 lg:text-sm dark:hover:bg-transparent',
                                'touch-pan-y touch-pinch-zoom',
                            )}
                        >
                            <span ref={textRef} className="contents">
                                <TaskLabelView task={task} repeat={repeat} />
                            </span>
                            {/* Grows in on hover: it takes no room until then, and
                        a long text gives way to it instead of being covered. */}
                            <ShortcutHint
                                action="task.open"
                                size="row"
                                className={cn(
                                    'ms-auto mt-0.5 max-w-0 overflow-hidden opacity-0 transition-[max-width,opacity] duration-200 group-data-cursor/task:max-w-8 group-data-cursor/task:opacity-100',
                                    !cursorShown &&
                                        'group-hover/task:max-w-8 group-hover/task:opacity-100',
                                )}
                            />
                        </Button>
                    )}
                    <Button
                        ref={setActivatorNodeRef}
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        {...attributes}
                        aria-label={t('planner.moveTask', { text: task.text })}
                        className="sr-only mt-1 shrink-0 rounded-full hover:bg-transparent focus-visible:not-sr-only"
                    >
                        <GripVertical className="size-5" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={
                            task.done
                                ? t('planner.markNotDone')
                                : t('planner.markDone')
                        }
                        aria-pressed={task.done}
                        onClick={() => onToggleDone(task.id)}
                        className={cn(
                            // Hidden until hover only for mouse users on desktop; touch
                            // screens of any size always show it.
                            'mt-1 shrink-0 rounded-full hover:bg-transparent lg:pointer-fine:opacity-0 lg:pointer-fine:group-hover/task:opacity-100 lg:pointer-fine:focus-visible:opacity-100',
                            task.done && 'lg:pointer-fine:opacity-100',
                        )}
                    >
                        <CircleCheck
                            className={cn(
                                'size-5',
                                task.done &&
                                    'fill-muted-foreground text-background',
                            )}
                        />
                    </Button>
                    <TaskMenuButton task={task} {...actions} />
                </div>
                <Popover
                    open={pickDateOpen}
                    onOpenChange={(open) => {
                        setPickDateOpen(open);
                        if (!open) {
                            setPickDateMonth(undefined);
                        }
                    }}
                >
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            tabIndex={-1}
                            aria-hidden
                            className="pointer-events-none absolute end-0 bottom-0 size-px"
                        />
                    </PopoverTrigger>
                    <PopoverContent
                        align="end"
                        className="w-auto p-0"
                        onOpenAutoFocus={focusCalendarDay}
                        onCloseAutoFocus={(event) => {
                            // The row may have moved to another day by now;
                            // hand focus to wherever the task's button sits.
                            event.preventDefault();
                            const row = document.querySelector<HTMLElement>(
                                `[data-task-id="${CSS.escape(task.id)}"] button`,
                            );
                            row?.focus();
                        }}
                    >
                        <Calendar
                            mode="single"
                            weekStartsOn={1}
                            selected={
                                pickerDate
                                    ? parseDateKey(pickerDate)
                                    : undefined
                            }
                            defaultMonth={
                                pickDateMonth ??
                                (pickerDate
                                    ? parseDateKey(pickerDate)
                                    : new Date())
                            }
                            onMonthChange={setPickDateMonth}
                            onSelect={(date) => {
                                setPickDateOpen(false);
                                if (date && addingToDay) {
                                    void scheduleWithUndo(
                                        task.id,
                                        toDateKey(date),
                                    );
                                } else if (
                                    date &&
                                    toDateKey(date) !== task.date
                                ) {
                                    void moveWithUndo(task.id, {
                                        date: toDateKey(date),
                                    });
                                }
                            }}
                        />
                    </PopoverContent>
                </Popover>
            </div>
        </TaskContextMenu>
    );
}
