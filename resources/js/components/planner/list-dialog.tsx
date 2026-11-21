import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
import { deleteList, renameList, LIST_NAME_MAX } from '@/lib/db/lists';
import { t } from '@/lib/i18n';
import { toast } from 'sonner';

type Props = {
    /** The named list to edit; null keeps the card closed. */
    listId: string | null;
    onClose: () => void;
};

/**
 * The list card, in the task card's style: a dialog for a named list whose
 * edits write to the local database as they happen (no save button, no
 * network); Esc or a click outside closes it and focus returns to the list
 * header. It holds the name (live-renamed through `renameList`) and the
 * delete (the same confirm as the list menu — deleting moves the list's
 * tasks to Someday, in one write). The base Someday column has no card.
 */
export function ListDialog({ listId, onClose }: Props) {
    return listId === null ? null : (
        <ListDialogSession key={listId} openedId={listId} onClose={onClose} />
    );
}

function ListDialogSession({
    openedId,
    onClose,
}: {
    openedId: string;
    onClose: () => void;
}) {
    const lists = useSomedayLists();
    const list = lists?.find((l) => l.id === openedId);
    // `lists` is undefined while the first read runs; only after that does
    // a missing row mean the list went away.
    const known = lists !== undefined;
    const contentRef = useRef<HTMLDivElement>(null);
    const [deleteOpen, setDeleteOpen] = useState(false);

    // Deleted here or on another device (through sync): nothing left to edit.
    useEffect(() => {
        if (known && list === undefined) {
            onClose();
        }
    }, [known, list, onClose]);

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

    return (
        <Dialog
            open={known && list !== undefined}
            onOpenChange={(open) => !open && onClose()}
        >
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
                // Back to the list's name button in its header.
                onCloseAutoFocus={(event) => {
                    const nameButton = document.querySelector<HTMLElement>(
                        `[data-list-id="${CSS.escape(openedId)}"] button`,
                    );

                    if (nameButton) {
                        event.preventDefault();
                        nameButton.focus();
                    }
                }}
                className="top-4 max-h-[calc(100dvh-2rem)] translate-y-0 gap-4 overflow-y-auto bg-secondary p-4 text-secondary-foreground sm:top-16 sm:max-h-[calc(100dvh-8rem)] sm:max-w-md sm:p-6"
            >
                <DialogTitle className="sr-only">
                    {t('planner.listCardTitle')}
                </DialogTitle>
                {/* Uncontrolled (the session remounts per list): typing never
                    waits on the database round trip, and a remote rename made
                    while the card is open shows next time it opens. */}
                <div className="flex items-start gap-2 border-b border-foreground/30 pb-1">
                    <Input
                        defaultValue={list?.name}
                        maxLength={LIST_NAME_MAX}
                        aria-label={t('planner.listName')}
                        onChange={(event) => {
                            const field = event.target;
                            const value = field.value;

                            // A list always has a name: only write real ones
                            // (an empty field reverts on blur, below).
                            if (value.trim() !== '') {
                                void renameList(openedId, value).catch(() =>
                                    toast.error(t('planner.renameFailed')),
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
                        className="min-h-0 min-w-0 flex-1 rounded-none border-0 bg-transparent p-0 text-2xl leading-snug font-medium shadow-none focus-visible:ring-0 dark:bg-transparent"
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
            </DialogContent>
            {list !== undefined && (
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
