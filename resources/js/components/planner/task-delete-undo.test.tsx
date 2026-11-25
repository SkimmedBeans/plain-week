// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLiveQuery } from 'dexie-react-hooks';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import { toast } from 'sonner';
import { PlannerHeader } from '@/components/planner/planner-header';
import { ScopePromptProvider } from '@/components/planner/scope-prompt';
import { TaskList } from '@/components/planner/task-list';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { db, wipeLocalDatabase } from '@/lib/db/database';
import { createList } from '@/lib/db/lists';
import { createTask, listTasksIn, updateTask } from '@/lib/db/tasks';
import type { TaskPlacement } from '@/lib/db/tasks';
import { deleteWithUndo } from '@/lib/planner/task-actions';
import {
    DELETE_HISTORY_LIMIT,
    clearDeleteHistory,
    undoLastDelete,
} from '@/lib/planner/undo';

// The account button needs the Inertia page; it is not under test here.
vi.mock('@/components/planner/account-button', () => ({
    AccountButton: () => null,
}));

const DAY = '2026-10-12';

const DAY_PLACEMENT = { date: DAY };

function Day({ placement = DAY_PLACEMENT }: { placement?: TaskPlacement }) {
    const tasks = useLiveQuery(() => listTasksIn(placement), [placement]);

    return (
        <TooltipProvider>
            <ScopePromptProvider>
                <PlannerHeader
                    weekStart={new Date(2026, 9, 12)}
                    isCurrentWeek
                    onPreviousWeek={() => {}}
                    onNextWeek={() => {}}
                    onToday={() => {}}
                />
                <TaskList
                    placement={placement}
                    tasks={tasks}
                    newTaskLabel="New task"
                    onOpenTask={() => {}}
                />
                <Toaster />
            </ScopePromptProvider>
        </TooltipProvider>
    );
}

async function liveTexts() {
    return (await listTasksIn({ date: DAY })).map((task) => task.text);
}

// The test week is current: its days are not folded as past (F29).
beforeEach(async () => {
    vi.useFakeTimers({
        toFake: ['Date'],
        now: new Date('2026-10-12T08:00:00'),
    });
    await wipeLocalDatabase();
    clearDeleteHistory();
});

afterEach(() => {
    vi.useRealTimers();
    toast.dismiss();
    cleanup();
});

describe('delete button on a task row', () => {
    it.each(['day', 'Someday', 'named list'] as const)(
        'leaves only the completion toggle for a done task in a %s',
        async (kind) => {
            const placement: TaskPlacement =
                kind === 'day'
                    ? DAY_PLACEMENT
                    : {
                          date: null,
                          list:
                              kind === 'Someday'
                                  ? 0
                                  : (await createList('Errands')).column,
                      };
            const gym = await createTask({ text: 'Gym', ...placement });
            await updateTask(gym.id, { done: true });
            render(<Day placement={placement} />);

            await screen.findByRole('button', { name: 'Mark as not done' });
            expect(
                screen.queryByRole('button', { name: 'Delete Gym' }),
            ).toBeNull();
        },
    );
});

describe('header undo for deletes', () => {
    it('is disabled until something is deleted', async () => {
        render(<Day />);

        const button = screen.getByRole('button', { name: 'Undo delete' });

        expect((button as HTMLButtonElement).disabled).toBe(true);
    });

    it('restores the newest delete after the toast', async () => {
        const user = userEvent.setup();
        const gym = await createTask({ text: 'Gym', date: DAY });
        const swim = await createTask({ text: 'Swim', date: DAY });
        render(<Day />);

        await deleteWithUndo(gym.id);
        await deleteWithUndo(swim.id);

        const button = await screen.findByRole('button', {
            name: 'Undo delete: Swim',
        });
        await user.click(button);

        await waitFor(async () => expect(await liveTexts()).toEqual(['Swim']));
        expect(
            await screen.findByRole('button', { name: 'Undo delete: Gym' }),
        ).toBeTruthy();
    });

    it('forgets a delete once its toast has undone it', async () => {
        const user = userEvent.setup();
        const gym = await createTask({ text: 'Gym', date: DAY });
        render(<Day />);

        await deleteWithUndo(gym.id);
        const undoButtons = await screen.findAllByRole('button', {
            name: 'Undo',
        });
        await user.click(undoButtons.at(-1)!);

        await waitFor(async () => expect(await liveTexts()).toEqual(['Gym']));
        const button = await screen.findByRole('button', {
            name: 'Undo delete',
        });
        expect((button as HTMLButtonElement).disabled).toBe(true);
    });

    it('does not write when the task changed since the delete', async () => {
        const gym = await createTask({ text: 'Gym', date: DAY });

        await deleteWithUndo(gym.id);
        // Another route (here: a direct write) touches the deleted row.
        const row = await db.tasks.get(gym.id);
        await db.tasks.put({ ...row!, updated_at: '2099-01-01T00:00:00.000Z' });

        await undoLastDelete();

        expect((await db.tasks.get(gym.id))?.deleted_at).not.toBeNull();
    });

    it('keeps at most the newest deletes', async () => {
        const ids: string[] = [];

        for (let i = 0; i < DELETE_HISTORY_LIMIT + 2; i++) {
            ids.push((await createTask({ text: `T${i}`, date: DAY })).id);
        }

        for (const id of ids) {
            await deleteWithUndo(id);
        }

        for (let i = 0; i < DELETE_HISTORY_LIMIT + 2; i++) {
            await undoLastDelete();
        }

        await waitFor(async () =>
            expect((await liveTexts()).length).toBe(DELETE_HISTORY_LIMIT),
        );
    });
});
