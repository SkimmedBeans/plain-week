import { Repeat, Search } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Dialog } from '@/components/back-closable-dialog';
import { focusCursorRow } from '@/components/planner/keyboard-cursor';
import {
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { searchTasks } from '@/lib/planner/search';
import type { SearchResult } from '@/lib/planner/search';
import { searchDialogStore } from '@/lib/planner/search-dialog';
import { TASK_COLOR_STYLES } from '@/lib/planner/task-colors';
import { cn } from '@/lib/utils';

/**
 * Search across all tasks (F33): `/` or the header's search button. It reads
 * only the local database, so it works offline; every keystroke searches the
 * days, Someday and every named list (collapsed or archived too), and a result
 * opens its task card.
 */
export function SearchDialog({
    onOpenTask,
}: {
    onOpenTask: (taskId: string) => void;
}) {
    const isOpen = useSyncExternalStore(
        searchDialogStore.subscribe,
        searchDialogStore.isOpen,
        () => false,
    );

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(value) => !value && searchDialogStore.close()}
        >
            {isOpen && (
                <SearchContent
                    onOpenTask={(id) => {
                        searchDialogStore.close();
                        onOpenTask(id);
                    }}
                />
            )}
        </Dialog>
    );
}

function SearchContent({
    onOpenTask,
}: {
    onOpenTask: (taskId: string) => void;
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);

    useEffect(() => {
        let current = true;

        void searchTasks(query).then((found) => {
            if (current) {
                setResults(found);
            }
        });

        return () => {
            current = false;
        };
    }, [query]);

    return (
        <DialogContent
            showCloseButton={false}
            onCloseAutoFocus={(event) => {
                if (focusCursorRow()) {
                    event.preventDefault();
                }
            }}
            className="top-4 max-h-[calc(100dvh-2rem)] translate-y-0 gap-3 overflow-y-auto p-4 sm:top-16 sm:max-w-lg"
        >
            <DialogTitle className="sr-only">{t('planner.search')}</DialogTitle>
            <DialogDescription className="sr-only">
                {t('planner.searchDescription')}
            </DialogDescription>
            <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    autoFocus
                    type="search"
                    value={query}
                    aria-label={t('planner.searchLabel')}
                    placeholder={t('planner.searchPlaceholder')}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && results.length > 0) {
                            event.preventDefault();
                            onOpenTask(results[0].openId);
                        }
                    }}
                    className="ps-9"
                />
            </div>
            {query.trim() !== '' && (
                <ul
                    aria-label={t('planner.searchResults')}
                    className="flex flex-col"
                >
                    {results.length === 0 ? (
                        <li className="px-2 py-3 text-sm text-muted-foreground">
                            {t('planner.searchEmpty')}
                        </li>
                    ) : (
                        results.map((result) => (
                            <li key={result.openId}>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    data-search-result
                                    onClick={() => onOpenTask(result.openId)}
                                    className={cn(
                                        'h-auto w-full justify-between gap-3 rounded-md px-2 py-2 text-start font-normal whitespace-normal',
                                        result.done &&
                                            'text-muted-foreground line-through',
                                    )}
                                >
                                    <span className="flex min-w-0 items-center gap-1.5">
                                        {result.repeats && (
                                            <Repeat className="size-3 shrink-0 opacity-70" />
                                        )}
                                        <span
                                            className={cn(
                                                'min-w-0 truncate',
                                                TASK_COLOR_STYLES[result.color]
                                                    .pill,
                                                TASK_COLOR_STYLES[result.color]
                                                    .pill && 'rounded-full px-2',
                                            )}
                                        >
                                            {result.text}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-xs text-muted-foreground no-underline">
                                        {result.where}
                                    </span>
                                </Button>
                            </li>
                        ))
                    )}
                </ul>
            )}
        </DialogContent>
    );
}
