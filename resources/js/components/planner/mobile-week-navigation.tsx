import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { Button } from '@/components/ui/button';
import type { WeekNavigation } from '@/hooks/use-week-navigation';
import { parseDateKey, weekDateKeys } from '@/lib/db/dates';
import { t } from '@/lib/i18n';
import { dateFormat } from '@/lib/planner/format';

export function MobileWeekNavigation({
    navigation,
    swipeHandlers,
}: {
    navigation: WeekNavigation;
    swipeHandlers: HTMLAttributes<HTMLDivElement>;
}) {
    const days = weekDateKeys(navigation.weekStart);
    const range = dateFormat({ day: 'numeric', month: 'short' }).formatRange(
        navigation.weekStart,
        parseDateKey(days[6]),
    );

    return (
        <nav
            aria-label={t('planner.weekNav')}
            className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden"
        >
            <div className="pointer-events-auto flex items-center rounded-full border border-border bg-background p-1 shadow-lg">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    className="touch-manipulation rounded-full"
                    aria-label={t('planner.previousWeek')}
                    onClick={navigation.previousWeek}
                >
                    <ChevronLeft className="rtl:rotate-180" />
                </Button>
                <div
                    {...swipeHandlers}
                    data-week-swipe-area
                    aria-live="polite"
                    className="flex h-11 min-w-40 touch-pan-y items-center justify-center px-3 text-sm font-semibold whitespace-nowrap select-none"
                >
                    {range}
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    className="touch-manipulation rounded-full"
                    aria-label={t('planner.nextWeek')}
                    onClick={navigation.nextWeek}
                >
                    <ChevronRight className="rtl:rotate-180" />
                </Button>
            </div>
        </nav>
    );
}
