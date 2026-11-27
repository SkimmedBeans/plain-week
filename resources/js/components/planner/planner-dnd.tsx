import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    MeasuringStrategy,
    MouseSensor,
    TouchSensor,
    closestCenter,
    pointerWithin,
    rectIntersection,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type {
    Announcements,
    Collision,
    CollisionDetection,
    DragEndEvent,
    DragMoveEvent,
    DragStartEvent,
    ScreenReaderInstructions,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { createContext, use, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { EdgeZone } from '@/components/planner/edge-zone';
import { TaskLabel } from '@/components/planner/task-row';
import { moveListTo } from '@/lib/db/lists';
import { moveWithUndo } from '@/lib/planner/task-actions';
import type { MoveTaskInput } from '@/lib/db/tasks';
import {
    placementKey,
    placementLabel,
    resolveDrop,
    resolveListReorder,
} from '@/lib/planner/drop';
import type {
    ColumnDropData,
    DropData,
    DropResult,
    DropTarget,
    ListDragData,
    TaskDragData,
    WeekDirection,
} from '@/lib/planner/drop';
import { t } from '@/lib/i18n';

/** A mouse drag starts after this much movement, so a click still opens. */
const MOUSE_DRAG_DISTANCE_PX = 5;

/**
 * Touch gestures on a task row (documented in docs/style.md):
 *
 * - Moving more than TOUCH_DRAG_TOLERANCE_PX within the first
 *   TOUCH_DRAG_DELAY_MS cancels drag activation and leaves scrolling or
 *   the completed task's horizontal swipe available.
 * - After TOUCH_DRAG_DELAY_MS the sensor activates and the task is picked up
 *   where it is (dragged pill, dimmed row, edge zones), however long the
 *   finger then stays still; the page no longer scrolls under it.
 * - Until the finger has moved more than TOUCH_HOLD_TOLERANCE_PX the task is
 *   "held": no insertion line, and releasing it moves nothing.
 *
 * A long press never opens the context menu (see `TaskRow`): the row's "more"
 * button does.
 */
export const TOUCH_DRAG_DELAY_MS = 250;
// Both about a finger's jitter: the first before the task is picked up, the
// second after.
export const TOUCH_DRAG_TOLERANCE_PX = 8;
const TOUCH_HOLD_TOLERANCE_PX = 8;

export function listDroppableId(listKey: string): string {
    return `list:${listKey}`;
}

/** The dnd-kit id of a named list's column droppable (F5). */
export function columnDroppableId(listId: string): string {
    return `column:${listId}`;
}

/** The dnd-kit id of a named list's draggable header (F5). */
export function listDraggableId(listId: string): string {
    return `list-drag:${listId}`;
}

/** A measured droppable rectangle (the values of `droppableRects`). */
type Rect = {
    top: number;
    left: number;
    bottom: number;
    right: number;
    width: number;
    height: number;
};

const PRIORITY: Record<DropData['type'], number> = {
    edge: 0,
    task: 1,
    list: 2,
};

function dropDataOf(collision: Collision): DropData | undefined {
    const data = collision.data?.droppableContainer?.data.current as
        | DropData
        | ColumnDropData
        | undefined;

    // A named list's column takes list drags only; for task drags it is not
    // a drop target.
    return data?.type === 'column' ? undefined : data;
}

/** A named list's column data on a collision, or `undefined`. */
function columnDataOf(data: unknown): ColumnDropData | undefined {
    const column = data as ColumnDropData | undefined;

    return column?.type === 'column' ? column : undefined;
}

/** Edge zones win over task rows, which win over the list they sit in. */
function byPriority(collisions: Collision[]): Collision[] {
    return collisions
        .filter((collision) => dropDataOf(collision) !== undefined)
        .sort(
            (a, b) =>
                PRIORITY[dropDataOf(a)!.type] - PRIORITY[dropDataOf(b)!.type],
        );
}

/**
 * Drops task rows hit outside their list's box (the pointer, or the dragged
 * overlay on a keyboard drag, is not over the list): on desktop a list scrolls
 * inside its cell, and the rows scrolled out of it still have their place on
 * the page, over the gap or the cell below.
 */
function withinOwnList(collisions: Collision[]): Collision[] {
    const hitIds = new Set(collisions.map(({ id }) => id));

    return collisions.filter((collision) => {
        const data = dropDataOf(collision);

        return (
            data?.type !== 'task' ||
            hitIds.has(listDroppableId(placementKey(data.placement)))
        );
    });
}

/** Whether the drop goes below the task row hit, carried on the collision. */
function isBelow(collision: Collision): boolean {
    return (collision.data as { below?: boolean }).below === true;
}

/**
 * Pointer drags hit-test the pointer itself, so the drop lands between the
 * rows the pointer is between. Keyboard drags (no pointer) move the overlay
 * onto a row: within the task's own list it lands below the row when that row
 * is further down than where the drag started (stepping swaps places like a
 * sortable list); in another list it lands above it.
 */
const collisionDetection: CollisionDetection = (args) => {
    const activeData = args.active.data.current as
        | TaskDragData
        | ListDragData
        | undefined;

    // A list drag only ever lands on a named list's column (F5).
    if (activeData?.type === 'listDrag') {
        return listCollision(args, activeData);
    }

    const pointer = args.pointerCoordinates;
    let collisions = byPriority(
        withinOwnList(pointer ? pointerWithin(args) : rectIntersection(args)),
    );

    if (collisions.length === 0 && !pointer) {
        collisions = byPriority(closestCenter(args));
    }

    const first = collisions[0];
    const data = first && dropDataOf(first);

    if (!first || !data) {
        return [];
    }

    const rect = args.droppableRects.get(first.id);
    let below = false;

    if (rect && data.type === 'task') {
        if (pointer) {
            below = pointer.y > rect.top + rect.height / 2;
        } else {
            // Empty once the source row has unmounted (week changed).
            const placement = (
                args.active.data.current as Partial<TaskDragData> | undefined
            )?.placement;
            const initial = args.active.rect.current.initial;
            below =
                placement !== undefined &&
                initial !== null &&
                placementKey(placement) === placementKey(data.placement) &&
                rect.top > initial.top;
        }
    }

    return [{ ...first, data: { ...first.data, below } }];
};

/** Which side of a hit column a list drag points at (F5). */
type ListEdge = 'start' | 'top' | 'end' | 'bottom';

/**
 * A list drop: the column it is over, the edge of it where the insertion
 * line is drawn, and the index for `moveListTo` (`null` where the drop
 * would leave the list where it is).
 */
type ListDrop = {
    hit: ColumnDropData;
    /** The line is drawn before (false: after) the hit column's list. */
    before: boolean;
    edge: ListEdge;
    toIndex: number | null;
};

/**
 * Which edge of a hit column a list drag points at: the pointer's half of
 * the column wins. When a neighbour column shares the hit's row the axis is
 * horizontal (desktop, columns side by side: the line runs vertically
 * between them); otherwise vertical (phones, lists stacked: between rows).
 * The keyboard sensor steps the cursor with no pointer: the drop lands in
 * the hit's slot, before it.
 */
function listDropEdge(
    columns: { data: ColumnDropData; rect: Rect }[],
    hitIndex: number,
    pointer: { x: number; y: number } | null,
): { before: boolean; edge: ListEdge } {
    const { rect } = columns[hitIndex];
    const prev = columns[hitIndex - 1];
    const next = columns[hitIndex + 1];
    const sameRow = (a: Rect, b: Rect) => Math.abs(a.top - b.top) < 4;
    const horizontal =
        (prev !== undefined && sameRow(rect, prev.rect)) ||
        (next !== undefined && sameRow(rect, next.rect));

    let before: boolean;

    if (!pointer) {
        before = true;
    } else if (horizontal) {
        const rtl =
            getComputedStyle(document.documentElement).direction === 'rtl';
        const x = rtl
            ? rect.left + rect.width - pointer.x
            : pointer.x - rect.left;
        before = x < rect.width / 2;
    } else {
        before = pointer.y - rect.top < (rect.bottom - rect.top) / 2;
    }

    return {
        before,
        edge: horizontal
            ? before
                ? 'start'
                : 'end'
            : before
              ? 'top'
              : 'bottom',
    };
}

/**
 * The named list's column a list drag is over (F5): a single collision
 * carrying `before`, `edge` and `toIndex`. Empty over no column — including
 * the dragged list's own column, where the insertion line hides.
 */
function listCollision(
    args: Parameters<CollisionDetection>[0],
    dragged: ListDragData,
): Collision[] {
    const columns: { data: ColumnDropData; rect: Rect }[] = [];

    for (const container of args.droppableContainers) {
        const data = columnDataOf(container.data.current);
        const rect = args.droppableRects.get(container.id);

        if (data !== undefined && rect !== undefined) {
            columns.push({ data, rect });
        }
    }

    if (columns.length === 0) {
        return [];
    }

    columns.sort((a, b) => a.data.index - b.data.index);

    const pointer = args.pointerCoordinates;
    const hit = (pointer ? pointerWithin(args) : rectIntersection(args)).find(
        (collision) =>
            columnDataOf(collision.data?.droppableContainer?.data.current) !==
            undefined,
    );

    if (!hit) {
        return [];
    }

    const hitData = columnDataOf(hit.data?.droppableContainer?.data.current)!;

    if (hitData.listId === dragged.listId) {
        return [];
    }

    const hitIndex = columns.findIndex(
        (column) => column.data.listId === hitData.listId,
    );
    const { before, edge } = listDropEdge(columns, hitIndex, pointer);
    const toIndex =
        resolveListReorder(
            columns.map((column) => column.data),
            dragged.listId,
            hitData.listId,
            before,
        )?.toIndex ?? null;

    return [{ ...hit, data: { ...hit.data, before, edge, toIndex } }];
}

/** The list drop carried on a collision, or `null` (over no column). */
function listDropOf(
    collision: Collision | undefined,
    dragged: ListDragData,
): ListDrop | null {
    if (!collision) {
        return null;
    }

    const hit = columnDataOf(collision.data?.droppableContainer?.data.current);
    const extra = collision.data as
        | { before?: boolean; edge?: ListEdge; toIndex?: number | null }
        | undefined;

    if (
        hit === undefined ||
        hit.listId === dragged.listId ||
        extra?.before === undefined ||
        extra.edge === undefined
    ) {
        return null;
    }

    return {
        hit,
        before: extra.before,
        edge: extra.edge,
        toIndex: extra.toIndex ?? null,
    };
}

function dropTargetOf(collision: Collision | undefined): DropTarget | null {
    const data = collision && dropDataOf(collision);

    if (!collision || !data) {
        return null;
    }

    switch (data.type) {
        case 'edge':
            return data;
        case 'list':
            return data;
        case 'task':
            return {
                type: 'task',
                placement: data.placement,
                tasks: data.tasks,
                name: data.name,
                taskId: data.task.id,
                below: isBelow(collision),
            };
    }
}

const screenReaderInstructions = (): ScreenReaderInstructions => ({
    draggable: t('planner.dragInstructions'),
});

function overLabel(data: unknown): string | null {
    const over = data as DropData | ListDragData | undefined;

    if (over === undefined) {
        return null;
    }

    if (over.type === 'listDrag') {
        return over.name;
    }

    if (over.type === 'edge') {
        return over.direction === -1
            ? t('planner.previousWeekLower')
            : t('planner.nextWeekLower');
    }

    return placementLabel(over.placement, over.name);
}

type PlannerDndState = {
    /** The task being dragged, or just dropped and still being written. */
    activeId: string | null;
    /** Where the insertion line is drawn, if anywhere. */
    indicator: DropResult['indicator'];
    /** The named list being dragged (F5), dimmed while it moves. */
    activeListId: string | null;
    /** Where the list insertion line is drawn, if anywhere (F5). */
    listIndicator: ListDrop | null;
};

const PlannerDndStateContext = createContext<PlannerDndState>({
    activeId: null,
    indicator: null,
    activeListId: null,
    listIndicator: null,
});

/** The drag state the task lists draw from (dimmed row, insertion line). */
export function usePlannerDnd(): PlannerDndState {
    return use(PlannerDndStateContext);
}

/** Whether a drag was started by a finger (not a mouse or the keyboard). */
function isTouchDrag(event: Event): boolean {
    return typeof TouchEvent !== 'undefined' && event instanceof TouchEvent;
}

/**
 * The click that follows a pointer drag (the release over the button it was
 * pressed on, also after Escape cancelled the drag) must not open the task.
 * If no click comes, the next press or key disarms it.
 */
function swallowNextClick(): void {
    const options = { capture: true };
    const swallow = (event: MouseEvent) => {
        event.stopPropagation();
        event.preventDefault();
        disarm();
    };
    const disarm = () => {
        window.removeEventListener('click', swallow, options);
        window.removeEventListener('pointerdown', disarm, options);
        window.removeEventListener('keydown', disarm, options);
    };

    window.addEventListener('click', swallow, options);
    window.addEventListener('pointerdown', disarm, options);
    window.addEventListener('keydown', disarm, options);
}

type Props = {
    /** Monday of the shown week. */
    weekStart: Date;
    onPreviousWeek: () => void;
    onNextWeek: () => void;
    children: ReactNode;
};

/**
 * Drag and drop for the planner: tasks move within a day, across days, to and
 * from Someday, and to the previous / next week through the screen-edge zones
 * (start = previous, end = next, so RTL mirrors). A mouse drag starts after
 * 5px of movement, a touch drag with a press that holds (it picks the task
 * up) then moves, and the move button of a row starts a keyboard drag. Drops
 * are written with `moveTask` (local only).
 *
 * Rows use `@dnd-kit/sortable` for its keyboard coordinates and item
 * registration, but are not shifted with its transforms: an insertion line
 * shows where the task will land instead, since a task can also leave the
 * list (or the week).
 */
export function PlannerDnd({
    weekStart,
    onPreviousWeek,
    onNextWeek,
    children,
}: Props) {
    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: { distance: MOUSE_DRAG_DISTANCE_PX },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: TOUCH_DRAG_DELAY_MS,
                tolerance: TOUCH_DRAG_TOLERANCE_PX,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );
    // The drag data is kept in state: the source row unmounts when hovering
    // an edge zone changes the shown week, and the drag goes on.
    const [dragged, setDragged] = useState<TaskDragData | ListDragData | null>(
        null,
    );
    const [result, setResult] = useState<DropResult | null>(null);
    // A dropped task stays dimmed until its write lands, so the row does not
    // flash back in its old place for a frame.
    const [settlingId, setSettlingId] = useState<string | null>(null);
    // The named list being dragged (F5), dimmed while it moves and while its
    // write lands.
    const [activeListId, setActiveListId] = useState<string | null>(null);
    // The line where a dragged list would land (F5), if anywhere.
    const [listIndicator, setListIndicator] = useState<ListDrop | null>(null);
    // A touch drag is "held" until the finger moves: picked up, but it
    // points nowhere yet and releasing it moves nothing.
    const [held, setHeld] = useState(false);
    const lastResult = useRef<DropResult | ListDrop | null>(null);
    const draggedText = useRef('');

    const resolve = (target: DropTarget | null) =>
        dragged?.type === 'task' && target
            ? resolveDrop(dragged.task, target, weekStart)
            : null;

    const handleDragStart = ({ active, activatorEvent }: DragStartEvent) => {
        const data = active.data.current as
            | TaskDragData
            | ListDragData
            | undefined;

        setDragged(data ?? null);
        setResult(null);
        lastResult.current = null;
        setHeld(isTouchDrag(activatorEvent));

        if (data?.type === 'listDrag') {
            setActiveListId(data.listId);
        }
    };

    const handleDragMove = ({ collisions, delta }: DragMoveEvent) => {
        if (held && Math.hypot(delta.x, delta.y) > TOUCH_HOLD_TOLERANCE_PX) {
            setHeld(false);
        }

        if (dragged?.type === 'listDrag') {
            const next = held ? null : listDropOf(collisions?.[0], dragged);
            lastResult.current = next;

            if (
                next?.hit.listId !== listIndicator?.hit.listId ||
                next?.edge !== listIndicator?.edge
            ) {
                setListIndicator(next);
            }

            return;
        }

        const next = resolve(dropTargetOf(collisions?.[0]));
        lastResult.current = next;

        if (
            next?.indicator?.listKey !== result?.indicator?.listKey ||
            next?.indicator?.beforeTaskId !== result?.indicator?.beforeTaskId
        ) {
            setResult(next);
        }
    };

    const finish = (activatorEvent: Event) => {
        setHeld(false);

        if (!(activatorEvent instanceof KeyboardEvent)) {
            swallowNextClick();
        }

        setDragged(null);
        setResult(null);
        setListIndicator(null);
    };

    const write = (
        id: string,
        move: MoveTaskInput,
        name?: string,
        announce = false,
    ) => {
        setSettlingId(id);

        return moveWithUndo(id, move, name, announce).finally(() =>
            requestAnimationFrame(() =>
                setSettlingId((current) => (current === id ? null : current)),
            ),
        );
    };

    const writeList = (listId: string, toIndex: number) => {
        setActiveListId(listId);

        return moveListTo(listId, toIndex)
            .catch((error: unknown) => {
                toast.error(t('planner.listMoveFailed'));
                throw error;
            })
            .finally(() =>
                requestAnimationFrame(() =>
                    setActiveListId((current) =>
                        current === listId ? null : current,
                    ),
                ),
            );
    };

    const handleDragEnd = ({ collisions, activatorEvent }: DragEndEvent) => {
        if (dragged?.type === 'listDrag') {
            // Released outside every column, or a touch released before it
            // moved: nothing moves.
            const drop = held ? null : listDropOf(collisions?.[0], dragged);
            lastResult.current = drop;

            if (drop && drop.toIndex !== null) {
                void writeList(dragged.listId, drop.toIndex);
            } else {
                setActiveListId(null);
            }
        } else {
            // Released outside every list and edge zone, or a touch released
            // before it moved: nothing moves.
            const drop = held ? null : resolve(dropTargetOf(collisions?.[0]));
            lastResult.current = drop;

            if (dragged && drop) {
                const { task } = dragged;
                void write(
                    task.id,
                    drop.move,
                    drop.name,
                    drop.indicator === null,
                );
            }
        }

        finish(activatorEvent);
    };

    const handleDragCancel = ({
        activatorEvent,
    }: {
        activatorEvent: Event;
    }) => {
        lastResult.current = null;
        finish(activatorEvent);
    };

    const handleEdgeHover = (direction: WeekDirection) =>
        direction === -1 ? onPreviousWeek() : onNextWeek();

    // Announcements read the drag data from the event, which loses it when the
    // source row unmounts mid-drag; keep the text from the start.
    const textOf = (data: unknown) => {
        const activeData = data as
            | Partial<TaskDragData>
            | Partial<ListDragData>
            | undefined;

        if (activeData?.type === 'listDrag') {
            return activeData.name ?? '';
        }

        const text = (activeData as Partial<TaskDragData> | undefined)?.task
            ?.text;

        if (text !== undefined) {
            draggedText.current = text;
        }

        return draggedText.current;
    };

    const isListDrag = (data: unknown) =>
        (data as Partial<ListDragData> | undefined)?.type === 'listDrag';

    const announcements: Announcements = {
        onDragStart: ({ active }) =>
            isListDrag(active.data.current)
                ? t('planner.listPickedUp', {
                      text: textOf(active.data.current),
                  })
                : t('planner.pickedUp', { text: textOf(active.data.current) }),
        onDragOver: ({ active, over }) => {
            if (isListDrag(active.data.current)) {
                const column = columnDataOf(over?.data.current);

                return column
                    ? t('planner.listOver', { place: column.name })
                    : t('planner.notOverList');
            }

            const label = overLabel(over?.data.current);

            return label
                ? t('planner.over', { place: label })
                : t('planner.notOverList');
        },
        onDragEnd: ({ active }) => {
            const drop = lastResult.current;
            const text = textOf(active.data.current);

            if (drop !== null && 'move' in drop) {
                return t('planner.droppedAt', {
                    text,
                    place: placementLabel(drop.move, drop.name),
                });
            }

            if (drop !== null && 'hit' in drop) {
                if (drop.toIndex === null) {
                    return t('planner.listNotMoved', { text });
                }

                return drop.before
                    ? t('planner.listMovedBefore', {
                          text,
                          place: drop.hit.name,
                      })
                    : t('planner.listMovedAfter', {
                          text,
                          place: drop.hit.name,
                      });
            }

            return isListDrag(active.data.current)
                ? t('planner.listNotMoved', { text })
                : t('planner.notMoved', { text });
        },
        onDragCancel: ({ active }) =>
            t('planner.dragCancelled', { text: textOf(active.data.current) }),
    };

    return (
        <DndContext
            sensors={sensors}
            // A held touch must not scroll the page under the finger.
            autoScroll={!held}
            collisionDetection={collisionDetection}
            measuring={{
                droppable: { strategy: MeasuringStrategy.Always },
            }}
            accessibility={{
                announcements,
                screenReaderInstructions: screenReaderInstructions(),
            }}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <PlannerDndStateContext
                value={{
                    activeId:
                        dragged?.type === 'task' ? dragged.task.id : settlingId,
                    indicator:
                        held || dragged?.type !== 'task'
                            ? null
                            : (result?.indicator ?? null),
                    activeListId,
                    listIndicator: held ? null : listIndicator,
                }}
            >
                {children}
            </PlannerDndStateContext>
            {dragged && (
                <>
                    <EdgeZone direction={-1} onHover={handleEdgeHover} />
                    <EdgeZone direction={1} onHover={handleEdgeHover} />
                </>
            )}
            {/*
              Layers: edge zones (5) < overlay (10) < insertion line (11) <
              sticky mobile header (20), so the line stays visible under the
              task being dragged.
            */}
            <DragOverlay dropAnimation={null} zIndex={10}>
                {dragged?.type === 'task' && (
                    <div
                        data-drag-overlay
                        className="flex h-full min-h-row cursor-grabbing items-start rounded-md bg-background py-2 text-sm shadow-lg ring-1 ring-border max-lg:text-base"
                    >
                        <TaskLabel task={dragged.task} />
                    </div>
                )}
                {dragged?.type === 'listDrag' && (
                    <div
                        data-list-drag-overlay
                        className="flex h-full min-h-row cursor-grabbing items-center gap-2 rounded-md bg-background px-3 text-sm shadow-lg ring-1 ring-border max-lg:text-base"
                    >
                        <GripVertical className="size-4 shrink-0 opacity-50" />
                        <span className="truncate font-medium">
                            {dragged.name}
                        </span>
                    </div>
                )}
            </DragOverlay>
        </DndContext>
    );
}

type ListCardDndProps = {
    /** Monday of the shown week (drop resolution uses it). */
    weekStart: Date;
    children: ReactNode;
};

/**
 * Drag and drop for the list card (F11): a nested `DndContext` that reorders a
 * single list's tasks in place. It is separate from the grid's context because
 * dnd-kit ids are unique per context — the grid already registers the same
 * `list:<placementKey>` droppable and the same sortable task ids, and a second
 * `TaskList` mounted in the grid's context would break it. The card's drag
 * state (dimmed row, insertion line) and `DragOverlay` come from this context,
 * so a drag in the card never dims or draws over the grid's rows.
 *
 * Drops are written with `moveTask` (local only) through the same pure
 * functions the grid uses (`resolveDrop`): days reorder untimed tasks
 * positionally and keep timed tasks in their time slot, Someday and named
 * lists are positional throughout. There are no edge zones (the card is one
 * list) and no list drag (F5 stays a page action).
 */
export function ListCardDnd({ weekStart, children }: ListCardDndProps) {
    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: { distance: MOUSE_DRAG_DISTANCE_PX },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: TOUCH_DRAG_DELAY_MS,
                tolerance: TOUCH_DRAG_TOLERANCE_PX,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );
    const [dragged, setDragged] = useState<TaskDragData | null>(null);
    const [result, setResult] = useState<DropResult | null>(null);
    const [settlingId, setSettlingId] = useState<string | null>(null);
    const [held, setHeld] = useState(false);
    const lastResult = useRef<DropResult | null>(null);
    const draggedText = useRef('');

    const resolve = (target: DropTarget | null) =>
        dragged !== null && target
            ? resolveDrop(dragged.task, target, weekStart)
            : null;

    const handleDragStart = ({ active, activatorEvent }: DragStartEvent) => {
        const data = active.data.current as TaskDragData | undefined;

        setDragged(data ?? null);
        setResult(null);
        lastResult.current = null;
        setHeld(isTouchDrag(activatorEvent));
    };

    const handleDragMove = ({ collisions, delta }: DragMoveEvent) => {
        if (held && Math.hypot(delta.x, delta.y) > TOUCH_HOLD_TOLERANCE_PX) {
            setHeld(false);
        }

        const next = resolve(dropTargetOf(collisions?.[0]));
        lastResult.current = next;

        if (
            next?.indicator?.listKey !== result?.indicator?.listKey ||
            next?.indicator?.beforeTaskId !== result?.indicator?.beforeTaskId
        ) {
            setResult(next);
        }
    };

    const finish = (activatorEvent: Event) => {
        setHeld(false);

        if (!(activatorEvent instanceof KeyboardEvent)) {
            swallowNextClick();
        }

        setDragged(null);
        setResult(null);
    };

    const write = (
        id: string,
        move: MoveTaskInput,
        name?: string,
        announce = false,
    ) => {
        setSettlingId(id);

        return moveWithUndo(id, move, name, announce).finally(() =>
            requestAnimationFrame(() =>
                setSettlingId((current) => (current === id ? null : current)),
            ),
        );
    };

    const handleDragEnd = ({ collisions, activatorEvent }: DragEndEvent) => {
        const drop = held ? null : resolve(dropTargetOf(collisions?.[0]));
        lastResult.current = drop;

        if (dragged !== null && drop !== null) {
            const { task } = dragged;

            write(task.id, drop.move).catch(() => {});
        }

        finish(activatorEvent);
    };

    const handleDragCancel = ({
        activatorEvent,
    }: {
        activatorEvent: Event;
    }) => {
        lastResult.current = null;
        finish(activatorEvent);
    };

    // Announcements read the drag data from the event, which loses it when the
    // source row unmounts mid-drag; keep the text from the start.
    const textOf = (data: unknown) => {
        const text = (data as Partial<TaskDragData> | undefined)?.task?.text;

        if (text !== undefined) {
            draggedText.current = text;
        }

        return draggedText.current;
    };

    const announcements: Announcements = {
        onDragStart: ({ active }) =>
            t('planner.pickedUp', { text: textOf(active.data.current) }),
        onDragOver: ({ over }) => {
            const label = overLabel(over?.data.current);

            return label
                ? t('planner.over', { place: label })
                : t('planner.notOverList');
        },
        onDragEnd: ({ active }) => {
            const drop = lastResult.current;
            const text = textOf(active.data.current);

            return drop !== null
                ? t('planner.droppedAt', {
                      text,
                      place: placementLabel(drop.move, drop.name),
                  })
                : t('planner.notMoved', { text });
        },
        onDragCancel: ({ active }) =>
            t('planner.dragCancelled', { text: textOf(active.data.current) }),
    };

    return (
        <DndContext
            sensors={sensors}
            // A held touch must not scroll the card under the finger.
            autoScroll={!held}
            collisionDetection={collisionDetection}
            measuring={{
                droppable: { strategy: MeasuringStrategy.Always },
            }}
            accessibility={{
                announcements,
                screenReaderInstructions: screenReaderInstructions(),
            }}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <PlannerDndStateContext
                value={{
                    activeId: dragged?.task.id ?? settlingId,
                    indicator:
                        held || dragged === null
                            ? null
                            : (result?.indicator ?? null),
                    activeListId: null,
                    listIndicator: null,
                }}
            >
                {children}
            </PlannerDndStateContext>
            <DragOverlay dropAnimation={null} zIndex={10}>
                {dragged !== null && (
                    <div
                        data-drag-overlay
                        className="flex h-full min-h-row cursor-grabbing items-start rounded-md bg-background py-2 text-sm shadow-lg ring-1 ring-border max-lg:text-base"
                    >
                        <TaskLabel task={dragged.task} />
                    </div>
                )}
            </DragOverlay>
        </DndContext>
    );
}
