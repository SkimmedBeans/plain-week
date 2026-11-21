import { MoreHorizontal, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { TaskList } from '@/components/planner/task-list';
import { Button } from '@/components/ui/button';
import {
    Dialog,
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
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Input } from '@/components/ui/input';
import { useSomedayTasks } from '@/hooks/use-tasks';
import {
    createList,
    deleteList,
    moveList,
    renameList,
    LIST_NAME_MAX,
} from '@/lib/db/lists';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Props = {
    /**
     * The list this column shows: Someday (column 0, no `id`) or a named
     * list (a row of the lists table).
     */
    list: { column: number; name: string; id?: string };
    /** Monday of the shown week (the Someday tasks shown depend on it). */
    weekStart: Date;
    /** 'YYYY-MM-DD' of today. */
    today: string;
    onOpenTask: (taskId: string) => void;
    /** The column span on the wide grid. */
    className?: string;
    /** A named list can move one place earlier / later among the lists. */
    canMoveEarlier?: boolean;
    canMoveLater?: boolean;
};

/**
 * One Someday column: the base list (column 0) or a named list, in the order
 * the week grid places them. Tasks move between Someday and any named list
 * like between days. The base header opens the dialog that creates a named
 * list; a named list's menu renames it or deletes it (deleting moves its
 * tasks to Someday, in one write).
 */
export function SomedaySection({
    list,
    weekStart,
    today,
    onOpenTask,
    className,
    canMoveEarlier = false,
    canMoveLater = false,
}: Props) {
    const titleId = useId();
    const tasks = useSomedayTasks(weekStart, today, list.column);
    const placement = { date: null, list: list.column } as const;
    const [createOpen, setCreateOpen] = useState(false);
    const [name, setName] = useState('');
    const [renameOpen, setRenameOpen] = useState(false);
    const [renameName, setRenameName] = useState('');
    const [deleteOpen, setDeleteOpen] = useState(false);

    const submitCreate = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (name.trim() === '') {
            return;
        }

        void createList(name).then(
            () => {
                setName('');
                setCreateOpen(false);
            },
            () => toast.error('Could not create the list.'),
        );
    };

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

    return (
        <section
            aria-labelledby={titleId}
            className={cn('flex min-h-0 min-w-0 flex-col', className)}
        >
            <h2 className="flex items-center justify-between gap-2 border-b-2 border-foreground pb-3 text-lg leading-7 font-bold tracking-tight lg:text-xl">
                <span id={titleId} className="truncate">
                    {list.name}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                    {list.column === 0 ? (
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground"
                            aria-label="New list"
                            onClick={() => setCreateOpen(true)}
                        >
                            <Plus />
                        </Button>
                    ) : (
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
                                {/* Lists run left to right on desktop and top
                                    to bottom on phones. */}
                                <DropdownMenuItem
                                    disabled={!canMoveEarlier}
                                    onClick={() =>
                                        void moveList(list.id!, -1).catch(() =>
                                            toast.error(
                                                'Could not move the list.',
                                            ),
                                        )
                                    }
                                >
                                    <span className="max-lg:hidden">
                                        Move left
                                    </span>
                                    <span className="lg:hidden">Move up</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    disabled={!canMoveLater}
                                    onClick={() =>
                                        void moveList(list.id!, 1).catch(() =>
                                            toast.error(
                                                'Could not move the list.',
                                            ),
                                        )
                                    }
                                >
                                    <span className="max-lg:hidden">
                                        Move right
                                    </span>
                                    <span className="lg:hidden">Move down</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => setDeleteOpen(true)}
                                >
                                    Delete list
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </span>
            </h2>
            <TaskList
                placement={placement}
                name={list.name}
                tasks={tasks}
                newTaskLabel={`New ${list.name} task`}
                onOpenTask={onOpenTask}
            />
            {list.column === 0 && (
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>New list</DialogTitle>
                            <DialogDescription>
                                Its tasks stay in Someday, in their own column
                                next to it.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={submitCreate} className="space-y-4">
                            <Input
                                autoFocus
                                value={name}
                                maxLength={LIST_NAME_MAX}
                                placeholder="List name"
                                aria-label="List name"
                                onChange={(event) =>
                                    setName(event.target.value)
                                }
                            />
                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => setCreateOpen(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={name.trim() === ''}
                                >
                                    Create
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
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
        </section>
    );
}
