import { router, usePage } from '@inertiajs/react';
import { useCallback, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { InstallAppDialog } from '@/components/install-app/install-app-card';
import { KeyboardCursorProvider } from '@/components/planner/keyboard-cursor';
import { ListDialog } from '@/components/planner/list-dialog';
import { SearchDialog } from '@/components/planner/search-dialog';
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
import { clearTaskParam, useTaskLink } from '@/hooks/use-task-link';
import { useSomedayTasks } from '@/hooks/use-tasks';
import { useToday } from '@/hooks/use-today';
import { useWeekNavigation } from '@/hooks/use-week-navigation';
import { parseDateKey } from '@/lib/db/dates';
import type { NamedSearchResult } from '@/lib/planner/search';
import { searchDialogStore } from '@/lib/planner/search-dialog';
import { t } from '@/lib/i18n';
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
    const weekShown = usePlannerView() === 'week';
    const weekSwipe = useRef<{ id: number; x: number; y: number } | null>(null);
    const startWeekSwipe = (event: PointerEvent) => {
        weekSwipe.current = null;
        if (
            !belowLg ||
            !weekShown ||
            event.pointerType !== 'touch' ||
            !event.isPrimary
        ) {
            return;
        }
        const { clientX: x, clientY: y, target } = event;
        if (
            !(target instanceof Element) ||
            x < 24 ||
            x > window.innerWidth - 24 ||
            !target.closest(
                '[data-week-swipe-heading], [data-planner-content]',
            ) ||
            target.closest(
                'button, input, textarea, a, select, [contenteditable], [data-task-id], [role="dialog"], [role="menu"]',
            )
        ) {
            return;
        }
        weekSwipe.current = { id: event.pointerId, x, y };
    };
    const finishWeekSwipe = (event: PointerEvent) => {
        const start = weekSwipe.current;
        weekSwipe.current = null;
        if (start === null || event.pointerId !== start.id) {
            return;
        }
        const horizontal = event.clientX - start.x;
        const vertical = Math.abs(event.clientY - start.y);
        if (
            Math.abs(horizontal) < 64 ||
            Math.abs(horizontal) < vertical * 1.5
        ) {
            return;
        }
        const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
        if (horizontal < 0 !== rtl) {
            navigation.nextWeek();
        } else {
            navigation.previousWeek();
        }
    };
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
                    <div
                        className="flex min-h-screen flex-col bg-background text-foreground lg:h-dvh"
                        onPointerDownCapture={startWeekSwipe}
                        onPointerUpCapture={finishWeekSwipe}
                        onPointerCancelCapture={() => {
                            weekSwipe.current = null;
                        }}
                    >
                        <PlannerHeader
                            weekStart={navigation.weekStart}
                            isCurrentWeek={navigation.isCurrentWeek}
                            onPreviousWeek={navigation.previousWeek}
                            onNextWeek={navigation.nextWeek}
                            onToday={navigation.goToToday}
                        />
                        <main
                            tabIndex={-1}
                            data-planner-content
                            className="flex flex-col px-4 pt-6 pb-12 lg:min-h-0 lg:flex-1 lg:px-6 lg:pt-8 lg:pb-6"
                            style={
                                belowLg && weekShown
                                    ? { touchAction: 'pan-y pinch-zoom' }
                                    : undefined
                            }
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
                    </div>
                    <TaskDialog taskId={openTaskId} onClose={closeTask} />
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
