import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { Dialog } from '@/components/back-closable-dialog';
import { Button } from '@/components/ui/button';
import {
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { LIST_NAME_MAX, convertListToNote, createList } from '@/lib/db/lists';
import { t } from '@/lib/i18n';

type Kind = 'list' | 'note';

/**
 * "Add" on the Lists and Notes views (F35, F54): asks only for a name and
 * creates the view's kind, a task list on Lists, an empty note (F24) on
 * Notes.
 */
export function AddList({ kind }: { kind: Kind }) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const isNote = kind === 'note';

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (name.trim() === '') {
            return;
        }

        void createList(name)
            .then(async (list) => {
                if (isNote) {
                    await convertListToNote(list.id);
                }
                setName('');
                setOpen(false);
            })
            .catch(() => toast.error(t('planner.addListFailed')));
    };

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size="sm"
                data-test="add-list"
                onClick={() => setOpen(true)}
                className="shrink-0 self-start rounded-full"
            >
                <Plus />
                {t('planner.addList')}
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {isNote
                                ? t('planner.addNoteTitle')
                                : t('planner.addListOnlyTitle')}
                        </DialogTitle>
                        <DialogDescription>
                            {isNote
                                ? t('planner.addNoteDescription')
                                : t('planner.addListOnlyDescription')}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={submit} className="space-y-4">
                        <Input
                            autoFocus
                            value={name}
                            maxLength={LIST_NAME_MAX}
                            placeholder={
                                isNote
                                    ? t('planner.noteName')
                                    : t('planner.listName')
                            }
                            aria-label={
                                isNote
                                    ? t('planner.noteName')
                                    : t('planner.listName')
                            }
                            onChange={(event) => setName(event.target.value)}
                        />
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setOpen(false)}
                            >
                                {t('common.cancel')}
                            </Button>
                            <Button type="submit" disabled={name.trim() === ''}>
                                {t('planner.create')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
