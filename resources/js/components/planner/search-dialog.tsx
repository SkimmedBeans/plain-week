import { Repeat, Search } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Dialog } from '@/components/back-closable-dialog';
import { focusCursorRow } from '@/components/planner/keyboard-cursor';
import {
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useIsBelowLg } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { searchPlanner } from '@/lib/planner/search';
import type { PlannerSearchResult } from '@/lib/planner/search';
import { searchDialogStore } from '@/lib/planner/search-dialog';
import { TASK_COLOR_STYLES } from '@/lib/planner/task-colors';
import { cn } from '@/lib/utils';

/**
 * Local search across tasks, lists and notes, including archived items.
 */
export function SearchDialog({
    onOpenResult,
}: {
    onOpenResult: (result: PlannerSearchResult) => void;
}) {
    const belowLg = useIsBelowLg();
    const lastSearch = useRef<{ query: string; scrollTop: number } | null>(
        null,
    );
    const isOpen = useSyncExternalStore(
        searchDialogStore.subscribe,
        searchDialogStore.isOpen,
        () => false,
    );

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(value) => {
                if (!value) {
                    lastSearch.current = null;
                    searchDialogStore.close();
                }
            }}
        >
            {isOpen && (
                <SearchContent
                    initialSearch={lastSearch.current}
                    onOpenResult={(result, query, scrollTop) => {
                        lastSearch.current = belowLg
                            ? { query, scrollTop }
                            : null;
                        searchDialogStore.close();
                        onOpenResult(result);
                    }}
                />
            )}
        </Dialog>
    );
}

function SearchContent({
    initialSearch,
    onOpenResult,
}: {
    initialSearch: { query: string; scrollTop: number } | null;
    onOpenResult: (
        result: PlannerSearchResult,
        query: string,
        scrollTop: number,
    ) => void;
}) {
    const [query, setQuery] = useState(initialSearch?.query ?? '');
    const [results, setResults] = useState<PlannerSearchResult[]>([]);
    const resultList = useRef<HTMLUListElement>(null);
    const restoreScroll = useRef(initialSearch?.scrollTop ?? 0);

    useEffect(() => {
        if (results.length > 0 && resultList.current) {
            resultList.current.scrollTop = restoreScroll.current;
            restoreScroll.current = 0;
        }
    }, [results]);

    const openResult = (result: PlannerSearchResult) =>
        onOpenResult(result, query, resultList.current?.scrollTop ?? 0);

    useEffect(() => {
        let current = true;

        void searchPlanner(query).then((found) => {
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
            className="top-4 flex max-h-[calc(100dvh-2rem)] translate-y-0 flex-col gap-3 p-4 sm:top-16 sm:max-w-lg"
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
                            openResult(results[0]);
                        }
                    }}
                    className="ps-9"
                />
            </div>
            {query.trim() !== '' && (
                <ul
                    ref={resultList}
                    aria-label={t('planner.searchResults')}
                    className="min-h-0 overflow-y-auto"
                >
                    {results.length === 0 ? (
                        <li className="px-2 py-3 text-sm text-muted-foreground">
                            {t('planner.searchEmpty')}
                        </li>
                    ) : (
                        results.map((result) => (
                            <li key={`${result.kind}:${result.openId}`}>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    data-search-result
                                    onClick={() => openResult(result)}
                                    className={cn(
                                        'h-auto w-full justify-between gap-3 rounded-md px-2 py-2 text-start font-normal whitespace-normal',
                                        result.kind === 'task' &&
                                            result.done &&
                                            'text-muted-foreground line-through',
                                    )}
                                >
                                    <span className="flex min-w-0 flex-col">
                                        <span className="flex min-w-0 items-center gap-1.5">
                                            {result.kind === 'task' &&
                                                result.repeats && (
                                                    <Repeat className="size-3 shrink-0 opacity-70" />
                                                )}
                                            <span
                                                className={cn(
                                                    'min-w-0 truncate',
                                                    TASK_COLOR_STYLES[
                                                        result.color
                                                    ].pill,
                                                    TASK_COLOR_STYLES[
                                                        result.color
                                                    ].pill &&
                                                        'rounded-full px-2',
                                                )}
                                            >
                                                {result.text}
                                            </span>
                                        </span>
                                        {result.kind !== 'task' &&
                                            result.snippet && (
                                                <span className="truncate text-xs text-muted-foreground">
                                                    {result.snippet}
                                                </span>
                                            )}
                                    </span>
                                    <span className="max-w-[40%] shrink-0 truncate text-end text-xs text-muted-foreground no-underline">
                                        {t(
                                            result.kind === 'task'
                                                ? 'planner.searchTypeTask'
                                                : result.kind === 'note'
                                                  ? 'planner.searchTypeNote'
                                                  : 'planner.searchTypeList',
                                        )}
                                        {' · '}
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
