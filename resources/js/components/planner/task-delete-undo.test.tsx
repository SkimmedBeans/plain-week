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
import { createTask, listTasksIn, updateTask } from '@/lib/db/tasks';
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

function Day() {
    const tasks = useLiveQuery(() => listTasksIn({ date: DAY }), []);

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
                    placement={{ date: DAY }}
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

beforeEach(async () => {
    await wipeLocalDatabase();
    clearDeleteHistory();
});

afterEach(() => {
    toast.dismiss();
    cleanup();
});

describe('delete button on a task row', () => {
    it('is only shown once the task is done', async () => {
        const gym = await createTask({ text: 'Gym', date: DAY });
        render(<Day />);

        await screen.findByRole('button', { name: 'Gym' });
        expect(screen.queryByRole('button', { name: 'Delete Gym' })).toBeNull();

        await updateTask(gym.id, { done: true });

        expect(
            await screen.findByRole('button', { name: 'Delete Gym' }),
        ).toBeTruthy();
    });

    it('deletes a done task with an Undo toast, without opening it', async () => {
        const user = userEvent.setup();
        const gym = await createTask({ text: 'Gym', date: DAY });
        await updateTask(gym.id, { done: true });
        render(<Day />);

        await user.click(
            await screen.findByRole('button', { name: 'Delete Gym' }),
        );

        await waitFor(async () => expect(await liveTexts()).toEqual([]));
        expect(
            (await screen.findAllByText('Task deleted.')).length,
        ).toBeGreaterThan(0);
        expect(screen.queryByRole('dialog')).toBeNull();
    });
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
