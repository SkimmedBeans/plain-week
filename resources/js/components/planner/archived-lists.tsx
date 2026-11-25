import { ArchiveRestore } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog } from '@/components/back-closable-dialog';
import { ListDialog } from '@/components/planner/list-dialog';
import { Button } from '@/components/ui/button';
import {
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useSomedayLists, useSomedayTasks } from '@/hooks/use-tasks';
import { setListArchived } from '@/lib/db/lists';
import type { SomedayList } from '@/lib/db/types';
import { t } from '@/lib/i18n';
import { TASK_COLOR_STYLES } from '@/lib/planner/task-colors';
import { cn } from '@/lib/utils';

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    weekStart: Date;
    today: string;
    onOpenTask: (taskId: string) => void;
};

/**
 * The archived named lists (F31), from Someday's header: each with its open
 * count, opening its list card, and Restore, which puts it back in the
 * planner where it was.
 */
export function ArchivedListsDialog({
    open,
    onOpenChange,
    weekStart,
    today,
    onOpenTask,
}: Props) {
    const lists = useSomedayLists()?.filter((list) => list.archived) ?? [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('planner.archivedLists')}</DialogTitle>
                    <DialogDescription>
                        {t('planner.archivedListsDescription')}
                    </DialogDescription>
                </DialogHeader>
                <ul className="flex flex-col" data-archived-lists>
                    {lists.map((list) => (
                        <ArchivedListRow
                            key={list.id}
                            list={list}
                            weekStart={weekStart}
                            today={today}
                            onOpenTask={(id) => {
                                onOpenChange(false);
                                onOpenTask(id);
                            }}
                        />
                    ))}
                </ul>
            </DialogContent>
        </Dialog>
    );
}

function ArchivedListRow({
    list,
    weekStart,
    today,
    onOpenTask,
}: {
    list: SomedayList;
    weekStart: Date;
    today: string;
    onOpenTask: (taskId: string) => void;
}) {
    const tasks = useSomedayTasks(weekStart, today, list.column);
    const open = tasks?.filter((task) => !task.done).length ?? 0;
    const [cardOpen, setCardOpen] = useState(false);
    const color = list.color ?? 'none';

    const restore = () =>
        void setListArchived(list.id, false).then(
            (updated) =>
                updated === null
                    ? toast.error(t('planner.listArchiveFailed'))
                    : toast(t('planner.listRestored', { name: list.name })),
            () => toast.error(t('planner.listArchiveFailed')),
        );

    return (
        <li className="flex items-center justify-between gap-2 border-b border-border py-1">
            <Button
                type="button"
                variant="ghost"
                data-list-card-target={`named:${list.id}`}
                aria-label={t('planner.openListLabel', { name: list.name })}
                onClick={() => setCardOpen(true)}
                className="h-auto min-w-0 justify-start gap-2 px-1 py-1.5 font-semibold"
            >
                <span
                    className={cn(
                        'min-w-0 truncate',
                        color !== 'none' && 'rounded-full px-2.5',
                        TASK_COLOR_STYLES[color].pill,
                    )}
                >
                    {list.name}
                </span>
                <span className="font-normal text-muted-foreground tabular-nums">
                    {open}
                </span>
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t('planner.restoreListLabel', { name: list.name })}
                onClick={restore}
            >
                <ArchiveRestore />
                {t('planner.restoreList')}
            </Button>
            <ListDialog
                identity={cardOpen ? { kind: 'named', id: list.id } : null}
                weekStart={weekStart}
                placement={{ date: null, list: list.column }}
                tasks={tasks}
                newTaskLabel={`New ${list.name} task`}
                onOpenTask={onOpenTask}
                onClose={() => setCardOpen(false)}
            />
        </li>
    );
}
