import { router, usePage } from '@inertiajs/react';
import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { InstallAppDialog } from '@/components/install-app/install-app-card';
import { KeyboardCursorProvider } from '@/components/planner/keyboard-cursor';
import { ListDialog } from '@/components/planner/list-dialog';
import { SearchDialog } from '@/components/planner/search-dialog';
import { MobileWeekNavigation } from '@/components/planner/mobile-week-navigation';
import { PlannerDnd } from '@/components/planner/planner-dnd';
import { PlannerHeader } from '@/components/planner/planner-header';
import { ScopePromptProvider } from '@/components/planner/scope-prompt';
import { ShortcutsDialog } from '@/components/planner/shortcuts-dialog';
import { TaskDialog } from '@/components/planner/task-dialog/task-dialog';
import { WeekGrid } from '@/components/planner/week-grid';
import { SyncProvider } from '@/components/sync-provider';
import { useCarryOver } from '@/hooks/use-carry-over';
import { usePlannerView } from '@/hooks/use-carry-over-setting';
import { useGuestOnboarding } from '@/hooks/use-guest-onboarding';
import { useIsBelowLg } from '@/hooks/use-mobile';
import { MobileTaskMoveContext } from '@/hooks/use-mobile-task-move';
import { clearTaskParam, useTaskLink } from '@/hooks/use-task-link';
import { useSomedayTasks } from '@/hooks/use-tasks';
import { useToday } from '@/hooks/use-today';
import { useWeekNavigation } from '@/hooks/use-week-navigation';
import { useWeekSwipe } from '@/hooks/use-week-swipe';
import { weekEntrySource } from '@/lib/db/week-slots';
import { parseDateKey } from '@/lib/db/dates';
import type { NamedSearchResult } from '@/lib/planner/search';
import { searchDialogStore } from '@/lib/planner/search-dialog';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { edit as settings } from '@/routes/profile';

/**
 * The weekly planner, as a persistent layout: the planner page renders
 * nothing on top of it, the sign-in, sign-up and plan pages render their
 * floating card over it. Moving between those pages keeps the planner
 * mounted (same week, no reload). It reads and writes only the local
 * database; sync runs in the background for signed-in users.
 */
export default function PlannerLayout({ children }: { children: ReactNode }) {
    const today = useToday();
    const navigation = useWeekNavigation(today);
    const [openTaskId, setOpenTaskId] = useState<string | null>(null);
    const [openList, setOpenList] = useState<NamedSearchResult | null>(null);
    const returnToSearch = useRef(false);
    const belowLg = useIsBelowLg();
    const [movingTasks, setMovingTasks] = useState(false);
    const weekShown = usePlannerView() === 'week';
    const weekSwipe = useWeekSwipe(
        belowLg && weekShown && !movingTasks,
        navigation.previousWeek,
        navigation.nextWeek,
    );
    const closeTask = useCallback(() => {
        setOpenTaskId(null);
        clearTaskParam();
        if (returnToSearch.current) {
            returnToSearch.current = false;
            searchDialogStore.open();
        }
    }, []);

    const signedIn = Boolean(usePage().props.auth.user);
    const openSettings = useCallback(() => router.visit(settings()), []);

    useGuestOnboarding(today, navigation.isCurrentWeek);
    useCarryOver(today);
    // `/?task=<id>` (notifications, calendar events): show the task's week
    // (Someday: the current one) and open it, unless a task is already open.
    useTaskLink((task) => {
        if (openTaskId !== null) {
            clearTaskParam();

            return;
        }

        if (task.date === null) {
            navigation.goToToday();
        } else {
            navigation.goToWeekOf(parseDateKey(task.date));
        }

        setOpenTaskId(task.id);
    });

    return (
        <MobileTaskMoveContext
            value={{
                movingTasks,
                toggleMovingTasks: () => setMovingTasks((moving) => !moving),
            }}
        >
            <SyncProvider>
                <ScopePromptProvider>
                    <KeyboardCursorProvider
                        today={today}
                        navigation={navigation}
                        onOpenTask={setOpenTaskId}
                        onOpenSettings={signedIn ? openSettings : undefined}
                    >
                        {/* On desktop the page is exactly the window: the header, then the
                        week filling the rest. */}
                        <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-foreground lg:h-dvh">
                            <PlannerHeader
                                weekStart={navigation.weekStart}
                                isCurrentWeek={navigation.isCurrentWeek}
                                onPreviousWeek={navigation.previousWeek}
                                onNextWeek={navigation.nextWeek}
                                onToday={navigation.goToToday}
                                onGoToWeekOf={navigation.goToWeekOf}
                            />
                            <main
                                ref={weekSwipe.surface}
                                tabIndex={-1}
                                data-planner-content
                                className={cn(
                                    'flex flex-col px-4 pt-6 pb-12 lg:min-h-0 lg:flex-1 lg:px-6 lg:pt-8 lg:pb-6',
                                    weekShown &&
                                        'max-lg:pb-[calc(6rem+env(safe-area-inset-bottom))]',
                                )}
                            >
                                <PlannerDnd
                                    weekStart={navigation.weekStart}
                                    onPreviousWeek={navigation.previousWeek}
                                    onNextWeek={navigation.nextWeek}
                                >
                                    <WeekGrid
                                        weekStart={navigation.weekStart}
                                        today={today}
                                        onOpenTask={setOpenTaskId}
                                    />
                                </PlannerDnd>
                            </main>
                            {weekShown && (
                                <MobileWeekNavigation
                                    navigation={navigation}
                                    swipeHandlers={weekSwipe.handlers}
                                />
                            )}
                        </div>
                        <TaskDialog
                            taskId={
                                openTaskId &&
                                (weekEntrySource(openTaskId)?.taskId ??
                                    openTaskId)
                            }
                            onClose={closeTask}
                        />
                        <ShortcutsDialog canOpenSettings={signedIn} />
                        <SearchDialog
                            onOpenResult={(result) => {
                                if (result.kind === 'task') {
                                    returnToSearch.current = belowLg;
                                    setOpenTaskId(result.openId);
                                } else {
                                    setOpenList(result);
                                }
                            }}
                        />
                        {openList !== null && (
                            <SearchListCard
                                result={openList}
                                weekStart={navigation.weekStart}
                                today={today}
                                phone={belowLg}
                                onOpenTask={(id) => {
                                    searchDialogStore.close();
                                    returnToSearch.current = belowLg;
                                    setOpenTaskId(id);
                                }}
                                onClose={() => {
                                    setOpenList(null);
                                    if (belowLg) {
                                        searchDialogStore.open();
                                    }
                                }}
                            />
                        )}
                        <InstallAppDialog />
                        {children}
                    </KeyboardCursorProvider>
                </ScopePromptProvider>
            </SyncProvider>
        </MobileTaskMoveContext>
    );
}

function SearchListCard({
    result,
    weekStart,
    today,
    phone,
    onOpenTask,
    onClose,
}: {
    result: NamedSearchResult;
    weekStart: Date;
    today: string;
    phone: boolean;
    onOpenTask: (id: string) => void;
    onClose: () => void;
}) {
    const tasks = useSomedayTasks(weekStart, today, result.column);

    return (
        <ListDialog
            identity={{ kind: 'named', id: result.openId }}
            weekStart={weekStart}
            placement={{ date: null, list: result.column }}
            tasks={tasks}
            newTaskLabel={t('planner.newTaskInList', { name: result.text })}
            showNoteMenu={phone}
            onOpenTask={onOpenTask}
            onClose={onClose}
        />
    );
}
