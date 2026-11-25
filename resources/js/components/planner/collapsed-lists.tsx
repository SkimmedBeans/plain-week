import { ChevronDown, NotebookText } from 'lucide-react';
import { useState } from 'react';
import {
    ListDialog,
    type ListCardIdentity,
} from '@/components/planner/list-dialog';
import { Button } from '@/components/ui/button';
import { useSomedayTasks } from '@/hooks/use-tasks';
import type { TaskColor } from '@/lib/db/types';
import { t } from '@/lib/i18n';
import { collapseKey, setListCollapsed } from '@/lib/planner/device-settings';
import { TASK_COLOR_STYLES } from '@/lib/planner/task-colors';
import { cn } from '@/lib/utils';

export type CollapsibleList = {
    column: number;
    name: string;
    id?: string;
    color?: TaskColor;
    note?: string | null;
};

type Props = {
    lists: CollapsibleList[];
    weekStart: Date;
    today: string;
    onOpenTask: (taskId: string) => void;
};

/**
 * The collapsed Someday lists (F26), as a row of chips after the expanded
 * ones: they give their grid space back. A chip shows the list's name and
 * open-task count in its title color; pressing it opens the list card, and
 * its chevron expands the list again.
 */
export function CollapsedLists({ lists, weekStart, today, onOpenTask }: Props) {
    if (lists.length === 0) {
        return null;
    }

    return (
        <ul
            data-collapsed-lists
            aria-label={t('planner.collapsedLists')}
            className="mt-10 flex shrink-0 flex-wrap gap-2 lg:mt-6"
        >
            {lists.map((list) => (
                <CollapsedListChip
                    key={collapseKey(list)}
                    list={list}
                    weekStart={weekStart}
                    today={today}
                    onOpenTask={onOpenTask}
                />
            ))}
        </ul>
    );
}

function CollapsedListChip({
    list,
    weekStart,
    today,
    onOpenTask,
}: Omit<Props, 'lists'> & { list: CollapsibleList }) {
    const tasks = useSomedayTasks(weekStart, today, list.column);
    const open = tasks?.filter((task) => !task.done).length ?? 0;
    const color = list.color ?? 'none';
    const [card, setCard] = useState<ListCardIdentity | null>(null);
    const identity: ListCardIdentity =
        list.id === undefined
            ? { kind: 'someday' }
            : { kind: 'named', id: list.id };
    const placement = { date: null, list: list.column } as const;

    return (
        <li
            className={cn(
                'flex items-center rounded-full border border-border',
                TASK_COLOR_STYLES[color].pill,
                color !== 'none' && 'border-transparent',
            )}
        >
            <Button
                type="button"
                variant="ghost"
                size="sm"
                data-list-card-target={
                    list.id === undefined ? 'someday' : `named:${list.id}`
                }
                aria-label={
                    typeof list.note === 'string'
                        ? `${list.name}, ${t('planner.isNote')}`
                        : t('planner.collapsedListChip', {
                              name: list.name,
                              count: open,
                          })
                }
                onClick={() => setCard(identity)}
                className="rounded-full pe-1 font-semibold text-inherit hover:bg-transparent hover:text-inherit dark:hover:bg-transparent"
            >
                {list.name}
                {typeof list.note === 'string' ? (
                    <NotebookText className="opacity-70" />
                ) : (
                    <span className="font-normal tabular-nums opacity-70">
                        · {open}
                    </span>
                )}
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('planner.expandList', { name: list.name })}
                onClick={() => setListCollapsed(collapseKey(list), false)}
                className="rounded-full text-inherit opacity-70 hover:bg-transparent hover:text-inherit dark:hover:bg-transparent"
            >
                <ChevronDown />
            </Button>
            <ListDialog
                identity={card}
                weekStart={weekStart}
                placement={placement}
                tasks={tasks}
                newTaskLabel={`New ${list.name} task`}
                onOpenTask={onOpenTask}
                onClose={() => setCard(null)}
            />
        </li>
    );
}
