import { AlertDialog, Dialog } from '@/components/back-closable-dialog';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
    Archive,
    ChevronDown,
    ChevronUp,
    GripVertical,
    NotebookText,
    MoreHorizontal,
} from 'lucide-react';
import { ArchivedListsDialog } from '@/components/planner/archived-lists';
import { ListNote } from '@/components/planner/list-note';
import { requestAddPicture } from '@/lib/notes/picture-requests';
import { listToNoteWithUndo, noteToTasks } from '@/lib/planner/note-actions';
import { useId, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { TaskColorSwatch } from '@/components/planner/task-color-swatch';
import { TaskList } from '@/components/planner/task-list';
import {
    ListDialog,
    type ListCardIdentity,
} from '@/components/planner/list-dialog';
import {
    columnDroppableId,
    listDraggableId,
    usePlannerDnd,
} from '@/components/planner/planner-dnd';
import { Button } from '@/components/ui/button';
import {
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuPortal,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { useSomedayLists, useSomedayTasks } from '@/hooks/use-tasks';
import {
    deleteList,
    moveList,
    renameList,
    setListArchived,
    setListColor,
    LIST_NAME_MAX,
} from '@/lib/db/lists';
import { toastWithUndo } from '@/lib/planner/undo';
import { TASK_COLORS, type TaskColor } from '@/lib/db/types';
import { t } from '@/lib/i18n';
import { copyListTasks, copyWithToast } from '@/lib/planner/clipboard';
import {
    collapseKey,
    setListCollapsed,
    stripeColor,
} from '@/lib/planner/device-settings';
import { isTaskColor, TASK_COLOR_STYLES } from '@/lib/planner/task-colors';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Props = {
    paper?: boolean;
    /**
     * The list this column shows: Someday (column 0, no `id`) or a named
     * list (a row of the lists table).
     */
    list: { column: number; name: string; id?: string; color?: TaskColor };
    /** Monday of the shown week (the Someday tasks shown depend on it). */
    weekStart: Date;
    /** 'YYYY-MM-DD' of today. */
    today: string;
    onOpenTask: (taskId: string) => void;
    /**
     * The named list's index in the live order (every list, archived
     * included) — the index `moveListTo` writes against (drag reorder, F5).
     */
    index?: number;
    /** A named list can move one place earlier / later among the lists. */
    canMoveEarlier?: boolean;
    canMoveLater?: boolean;
    /**
     * The Notes view below `lg` (F55): the note is one row of a list,
     * collapsed to its heading unless expanded. `undefined` when the
     * note's content always shows (desktop, the task lists).
     */
    noteCollapsed?: boolean;
    /** Toggles the note's row (F55). */
    onToggleNote?: () => void;
};

/** The insertion bar shown while a dragged list is over this column edge. */
function ListDropIndicator({
    edge,
}: {
    edge: 'start' | 'top' | 'end' | 'bottom';
}) {
    const before = edge === 'start' || edge === 'top';

    return (
        <div
            data-list-drop-indicator
            data-edge={edge}
            aria-hidden
            className={cn(
                'pointer-events-none absolute z-[11] rounded-full bg-primary',
                // Vertical bar in the horizontal (desktop) layout.
                'inset-y-0 w-0.5',
                before ? 'start-0' : 'end-0',
                // Horizontal bar in the stacked (phone) layout.
                'max-lg:inset-x-0 max-lg:inset-y-auto max-lg:h-0.5 max-lg:w-auto',
                before ? 'max-lg:top-0' : 'max-lg:bottom-0',
            )}
        />
    );
}

/**
 * One Someday column: the base list (column 0) or a named list, in the order
 * the week grid places them. Tasks move between Someday and any named list
 * like between days. The base header opens the dialog that creates a named
 * list; a named list's menu renames it or deletes it (deleting moves its
 * tasks to Someday, in one write). A named list's header is also its drag
 * handle: drag it over another column's edge to reorder the lists (F5).
 */
export function SomedaySection({
    paper = false,
    list,
    weekStart,
    today,
    onOpenTask,
    index = 0,
    canMoveEarlier = false,
    canMoveLater = false,
    noteCollapsed,
    onToggleNote,
}: Props) {
    const titleId = useId();
    const instructionsId = useId();
    const tasks = useSomedayTasks(weekStart, today, list.column);
    const placement = { date: null, list: list.column } as const;
    const { activeListId, listIndicator } = usePlannerDnd();
    const isNamed = list.id !== undefined;
    // Narrowed once: property narrowing does not survive into closures.
    const namedListId = list.id;
    const color = list.color ?? 'none';
    const allLists = useSomedayLists();
    const fullList =
        list.id === undefined
            ? undefined
            : allLists?.find((item) => item.id === list.id);
    const isNote = typeof fullList?.note === 'string';
    // The Notes view below `lg` (F55): the note is one row of a list, its
    // content hidden until the heading is pressed. `undefined` elsewhere:
    // the content always shows (desktop grid, task lists).
    const noteRow = noteCollapsed !== undefined;
    // A note's header shows a notebook icon after its name. Task lists show
    // no count there (F44); collapsed chips keep theirs.
    const countBadge = isNote ? (
        <NotebookText
            aria-label={t('planner.isNote')}
            className="ms-2 size-4 shrink-0 text-muted-foreground"
        />
    ) : null;

    // A named list's header is the drag handle and its whole column the drop
    // target while a list is dragged; the base list never moves.
    const {
        attributes,
        listeners,
        setActivatorNodeRef,
        setNodeRef: setHandleRef,
    } = useDraggable({
        id: listDraggableId(list.id ?? ''),
        disabled: !isNamed,
        data: {
            type: 'listDrag',
            listId: list.id ?? '',
            name: list.name,
            index,
        },
    });
    const { setNodeRef: setColumnRef } = useDroppable({
        id: columnDroppableId(list.id ?? ''),
        disabled: !isNamed,
        data: {
            type: 'column',
            listId: list.id ?? '',
            name: list.name,
            index,
        },
    });
    const [renameOpen, setRenameOpen] = useState(false);
    const [renameName, setRenameName] = useState('');
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [archivedOpen, setArchivedOpen] = useState(false);
    const archivedCount =
        list.column === 0
            ? (allLists?.filter((item) => item.archived).length ?? 0)
            : 0;

    const archive = () => {
        if (list.id === undefined) {
            return;
        }
        const id = list.id;

        void setListArchived(id, true).then(
            (updated) => {
                if (updated === null) {
                    toast.error(t('planner.listArchiveFailed'));

                    return;
                }
                toastWithUndo(
                    t('planner.listArchived', { name: list.name }),
                    () => void setListArchived(id, false),
                );
            },
            () => toast.error(t('planner.listArchiveFailed')),
        );
    };
    // The list card (F11): which list it is open on, null when closed.
    const [cardIdentity, setCardIdentity] = useState<ListCardIdentity | null>(
        null,
    );

    const submitRename = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (list.id === undefined || renameName.trim() === '') {
            return;
        }

        void renameList(list.id, renameName).then((updated) => {
            if (updated !== null) {
                setRenameOpen(false);
            } else {
                toast.error('Could not rename the list.');
            }
        });
    };

    const confirmDelete = () => {
        if (list.id === undefined) {
            return;
        }

        void deleteList(list.id).then((deleted) => {
            if (deleted === null) {
                toast.error('Could not delete the list.');
            }
        });
    };

    const listIndicatorEdge =
        listIndicator !== null && listIndicator.hit.listId === list.id
            ? listIndicator.edge
            : null;

    return (
        <section
            ref={isNamed ? setColumnRef : undefined}
            aria-labelledby={titleId}
            data-someday-list
            style={{ '--stripe': stripeColor(color) } as CSSProperties}
            className={cn(
                'relative flex min-h-0 min-w-0 flex-col',
                paper &&
                    'rounded-lg border border-border bg-[color-mix(in_oklab,var(--stripe)_40%,var(--background))] p-3 lg:p-4',
                activeListId === list.id && 'opacity-60',
            )}
        >
            <h2
                ref={isNamed ? setHandleRef : undefined}
                {...listeners}
                className="flex cursor-grab items-center justify-between gap-2 border-b-2 border-foreground pb-3 text-lg leading-7 font-bold tracking-tight active:cursor-grabbing lg:text-xl"
            >
                {isNamed && namedListId !== undefined ? (
                    // The name opens the list card (F6); it is not a
                    // drag-stop: a click opens, a 5px move starts the drag.
                    // In a phone note row (F55) it expands and collapses
                    // the row instead.
                    <Button
                        type="button"
                        variant="ghost"
                        data-list-card-target={`named:${namedListId}`}
                        aria-label={list.name}
                        onClick={() =>
                            noteRow
                                ? onToggleNote?.()
                                : setCardIdentity({
                                      kind: 'named',
                                      id: namedListId,
                                  })
                        }
                        className="h-auto min-w-0 flex-1 justify-start gap-0 self-stretch rounded-none border-0 px-0 py-0 text-lg leading-7 font-bold tracking-tight text-inherit hover:bg-transparent hover:text-inherit active:not-aria-[haspopup]:translate-y-0 lg:text-xl dark:hover:bg-transparent"
                    >
                        <span
                            id={titleId}
                            className={cn(
                                'min-w-0 truncate',
                                color !== 'none' && 'rounded-full px-2.5',
                                TASK_COLOR_STYLES[color].pill,
                            )}
                        >
                            {list.name}
                        </span>
                        {countBadge}
                    </Button>
                ) : (
                    // The base Someday name opens its list card (F11); the
                    // "+" new-list button stays on the header only.
                    <Button
                        type="button"
                        variant="ghost"
                        data-list-card-target="someday"
                        aria-label={list.name}
                        onClick={() => setCardIdentity({ kind: 'someday' })}
                        className="h-auto min-w-0 flex-1 justify-start gap-0 self-stretch rounded-none border-0 px-0 py-0 text-lg leading-7 font-bold tracking-tight text-inherit hover:bg-transparent hover:text-inherit active:not-aria-[haspopup]:translate-y-0 lg:text-xl dark:hover:bg-transparent"
                    >
                        <span id={titleId} className="truncate">
                            {list.name}
                        </span>
                        {countBadge}
                    </Button>
                )}
                <span className="flex shrink-0 items-center gap-1">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground"
                        aria-label={
                            noteRow
                                ? t(
                                      noteCollapsed
                                          ? 'planner.expandNote'
                                          : 'planner.collapseNote',
                                      { name: list.name },
                                  )
                                : t('planner.collapseList', {
                                      name: list.name,
                                  })
                        }
                        onClick={() =>
                            noteRow
                                ? onToggleNote?.()
                                : setListCollapsed(collapseKey(list), true)
                        }
                    >
                        {noteRow && noteCollapsed ? (
                            <ChevronDown />
                        ) : (
                            <ChevronUp />
                        )}
                    </Button>
                    {list.column === 0 && archivedCount > 0 && (
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground"
                            aria-label={t('planner.archivedListsCount', {
                                count: archivedCount,
                            })}
                            onClick={() => setArchivedOpen(true)}
                        >
                            <Archive />
                        </Button>
                    )}
                    {list.column === 0 ? null : (
                        <>
                            <Button
                                ref={setActivatorNodeRef}
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                {...attributes}
                                aria-label={t('planner.moveList', {
                                    text: list.name,
                                })}
                                aria-describedby={instructionsId}
                                className="sr-only shrink-0 rounded-full hover:bg-transparent focus-visible:not-sr-only"
                            >
                                <GripVertical className="size-5" />
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        className="text-muted-foreground"
                                        aria-label={`More options for the ${list.name} list`}
                                    >
                                        <MoreHorizontal />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                        onClick={() => {
                                            setRenameName(list.name);
                                            setRenameOpen(true);
                                        }}
                                    >
                                        Rename
                                    </DropdownMenuItem>
                                    {namedListId !== undefined && (
                                        <DropdownMenuSub>
                                            <DropdownMenuSubTrigger>
                                                {t('planner.listTitleColor')}
                                            </DropdownMenuSubTrigger>
                                            <DropdownMenuPortal>
                                                <DropdownMenuSubContent>
                                                    <DropdownMenuRadioGroup
                                                        aria-label={t(
                                                            'planner.listTitleColor',
                                                        )}
                                                        value={color}
                                                        onValueChange={(
                                                            value,
                                                        ) => {
                                                            if (
                                                                isTaskColor(
                                                                    value,
                                                                ) &&
                                                                value !== color
                                                            ) {
                                                                void setListColor(
                                                                    namedListId,
                                                                    value,
                                                                ).catch(() =>
                                                                    toast.error(
                                                                        t(
                                                                            'planner.listColorFailed',
                                                                        ),
                                                                    ),
                                                                );
                                                            }
                                                        }}
                                                    >
                                                        {TASK_COLORS.map(
                                                            (option) => (
                                                                <DropdownMenuRadioItem
                                                                    key={option}
                                                                    value={
                                                                        option
                                                                    }
                                                                >
                                                                    <TaskColorSwatch
                                                                        color={
                                                                            option
                                                                        }
                                                                        checked={
                                                                            false
                                                                        }
                                                                    />
                                                                    {
                                                                        TASK_COLOR_STYLES[
                                                                            option
                                                                        ].label
                                                                    }
                                                                </DropdownMenuRadioItem>
                                                            ),
                                                        )}
                                                    </DropdownMenuRadioGroup>
                                                </DropdownMenuSubContent>
                                            </DropdownMenuPortal>
                                        </DropdownMenuSub>
                                    )}
                                    {isNote && fullList !== undefined && (
                                        <DropdownMenuItem
                                            onClick={() =>
                                                requestAddPicture(fullList.id)
                                            }
                                        >
                                            {t('planner.addPicture')}
                                        </DropdownMenuItem>
                                    )}
                                    {fullList !== undefined && (
                                        <DropdownMenuItem
                                            onClick={() =>
                                                void (isNote
                                                    ? noteToTasks(fullList)
                                                    : listToNoteWithUndo(
                                                          fullList,
                                                      ))
                                            }
                                        >
                                            {isNote
                                                ? t('planner.convertToTasks')
                                                : t('planner.convertToNote')}
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                        onClick={() =>
                                            void (isNote && fullList
                                                ? copyWithToast(
                                                      fullList.note ?? '',
                                                      t('planner.noteCopied'),
                                                  )
                                                : copyListTasks(tasks ?? []))
                                        }
                                    >
                                        {t('planner.copyAllTasks')}
                                    </DropdownMenuItem>
                                    {/* Lists run left to right on desktop and top
                                    to bottom on phones. */}
                                    <DropdownMenuItem
                                        disabled={!canMoveEarlier}
                                        onClick={() =>
                                            void moveList(list.id!, -1).catch(
                                                () =>
                                                    toast.error(
                                                        'Could not move the list.',
                                                    ),
                                            )
                                        }
                                    >
                                        <span className="max-lg:hidden">
                                            Move left
                                        </span>
                                        <span className="lg:hidden">
                                            Move up
                                        </span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        disabled={!canMoveLater}
                                        onClick={() =>
                                            void moveList(list.id!, 1).catch(
                                                () =>
                                                    toast.error(
                                                        'Could not move the list.',
                                                    ),
                                            )
                                        }
                                    >
                                        <span className="max-lg:hidden">
                                            Move right
                                        </span>
                                        <span className="lg:hidden">
                                            Move down
                                        </span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={archive}>
                                        {t('planner.archiveList')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        variant="destructive"
                                        onClick={() => setDeleteOpen(true)}
                                    >
                                        Delete list
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </>
                    )}
                </span>
            </h2>
            {isNamed && (
                <span id={instructionsId} className="sr-only">
                    {t('planner.listDragInstructions')}
                </span>
            )}
            {isNote && fullList !== undefined ? (
                // A note's row collapses to its heading below `lg` (F55);
                // the note (and its keyboard-stop task list) is gone while
                // it is collapsed.
                noteRow && noteCollapsed ? null : (
                    <ListNote list={fullList} />
                )
            ) : (
                <TaskList
                    placement={placement}
                    name={list.name}
                    tasks={tasks}
                    newTaskLabel={`New ${list.name} task`}
                    paper={paper}
                    onOpenTask={onOpenTask}
                />
            )}
            {listIndicatorEdge !== null && (
                <ListDropIndicator edge={listIndicatorEdge} />
            )}
            {list.column === 0 && (
                <ArchivedListsDialog
                    open={archivedOpen}
                    onOpenChange={setArchivedOpen}
                    weekStart={weekStart}
                    today={today}
                    onOpenTask={onOpenTask}
                />
            )}
            {list.column !== 0 && (
                <>
                    <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Rename list</DialogTitle>
                                <DialogDescription>
                                    The column keeps its tasks.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={submitRename} className="space-y-4">
                                <Input
                                    autoFocus
                                    value={renameName}
                                    maxLength={LIST_NAME_MAX}
                                    aria-label="New list name"
                                    onChange={(event) =>
                                        setRenameName(event.target.value)
                                    }
                                />
                                <DialogFooter>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => setRenameOpen(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={renameName.trim() === ''}
                                    >
                                        Rename
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    Delete “{list.name}”?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    Its tasks will move to Someday.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={confirmDelete}>
                                    Delete
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </>
            )}
            <ListDialog
                identity={cardIdentity}
                weekStart={weekStart}
                placement={placement}
                tasks={tasks}
                newTaskLabel={`New ${list.name} task`}
                onOpenTask={onOpenTask}
                onClose={() => setCardIdentity(null)}
            />
        </section>
    );
}
