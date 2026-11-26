import { Search, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { usePlannerView } from '@/hooks/use-carry-over-setting';
import { t } from '@/lib/i18n';
import { isPlannerView, plannerView } from '@/lib/planner/device-settings';
import { searchDialogStore } from '@/lib/planner/search-dialog';
import { undoLastDelete, useDeleteHistory } from '@/lib/planner/undo';

/**
 * The view switch (F30, F38): Week (the days and Someday), Lists (the named
 * task lists) and Notes (the lists converted to notes), remembered per
 * device. On phones it is the second row of the sticky header, full width in
 * equal thirds, with Undo and Search beside it (they leave the first row,
 * which is too narrow for them, F40); on desktop it sits above the grid.
 */
export function ViewBar() {
    const view = usePlannerView();
    const deletes = useDeleteHistory();

    return (
        <div className="flex items-center gap-1.5 px-4 pb-3 lg:px-0 lg:pb-0">
            <ToggleGroup
                type="single"
                variant="outline"
                value={view}
                aria-label={t('planner.view')}
                onValueChange={(value) => {
                    if (isPlannerView(value)) {
                        plannerView.set(value);
                    }
                }}
                className="max-lg:min-w-0 max-lg:flex-1 max-lg:*:flex-1"
            >
                <ToggleGroupItem value="week" data-test="view-week">
                    {t('planner.viewWeek')}
                </ToggleGroupItem>
                <ToggleGroupItem value="lists" data-test="view-lists">
                    {t('planner.viewLists')}
                </ToggleGroupItem>
                <ToggleGroupItem value="notes" data-test="view-notes">
                    {t('planner.viewNotes')}
                </ToggleGroupItem>
            </ToggleGroup>
            <Button
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-full lg:hidden"
                onClick={() => void undoLastDelete()}
                disabled={deletes.count === 0}
                aria-label={
                    deletes.latestTitle
                        ? `Undo delete: ${deletes.latestTitle}`
                        : 'Undo delete'
                }
            >
                <Undo2 className="size-5 rtl:-scale-x-100" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-full lg:hidden"
                onClick={() => searchDialogStore.open()}
                aria-label={t('planner.search')}
            >
                <Search className="size-5" />
            </Button>
        </div>
    );
}
