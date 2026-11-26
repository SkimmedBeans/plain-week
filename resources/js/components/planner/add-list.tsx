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
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { LIST_NAME_MAX, convertListToNote, createList } from '@/lib/db/lists';
import { t } from '@/lib/i18n';

type Kind = 'list' | 'note';

/**
 * "Add" on the Lists and Notes views (F35): a name and whether it is a task
 * list or a note (a note starts empty, F24). Defaults to the view's kind.
 */
export function AddList({ defaultKind }: { defaultKind: Kind }) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [kind, setKind] = useState<Kind>(defaultKind);

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (name.trim() === '') {
            return;
        }

        void createList(name)
            .then(async (list) => {
                if (kind === 'note') {
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
                onClick={() => {
                    setKind(defaultKind);
                    setOpen(true);
                }}
                className="shrink-0 self-start rounded-full"
            >
                <Plus />
                {t('planner.addList')}
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('planner.addListTitle')}</DialogTitle>
                        <DialogDescription>
                            {t('planner.addListDescription')}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={submit} className="space-y-4">
                        <Input
                            autoFocus
                            value={name}
                            maxLength={LIST_NAME_MAX}
                            placeholder={t('planner.listName')}
                            aria-label={t('planner.listName')}
                            onChange={(event) => setName(event.target.value)}
                        />
                        <RadioGroup
                            value={kind}
                            onValueChange={(value) =>
                                setKind(value === 'note' ? 'note' : 'list')
                            }
                            aria-label={t('planner.addListKind')}
                            className="flex gap-6"
                        >
                            <div className="flex items-center gap-2">
                                <RadioGroupItem
                                    value="list"
                                    id="add-kind-list"
                                />
                                <Label htmlFor="add-kind-list">
                                    {t('planner.addKindList')}
                                </Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <RadioGroupItem
                                    value="note"
                                    id="add-kind-note"
                                />
                                <Label htmlFor="add-kind-note">
                                    {t('planner.addKindNote')}
                                </Label>
                            </div>
                        </RadioGroup>
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
