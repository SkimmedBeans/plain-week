// @vitest-environment happy-dom
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
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
import { ScopePromptProvider } from '@/components/planner/scope-prompt';
import { TaskList } from '@/components/planner/task-list';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { db, wipeLocalDatabase } from '@/lib/db/database';
import { queryTask } from '@/lib/db/queries';
import { createTask, listTasksIn, setRecurrence } from '@/lib/db/tasks';
import { occurrenceId } from '@/lib/recurrence/expand';
import { toastAction } from '@/test/toasts';

/** A Wednesday of a Monday / Wednesday / Friday series that starts Monday. */
const MONDAY = '2026-10-12';
const WEDNESDAY = '2026-10-14';
const ROW_NAME = 'Gym (repeats)';

function Day() {
    const tasks = useLiveQuery(() => listTasksIn({ date: WEDNESDAY }), []);

    return (
        <TooltipProvider>
            <ScopePromptProvider>
                <TaskList
                    placement={{ date: WEDNESDAY }}
                    tasks={tasks}
                    newTaskLabel="New task"
                    onOpenTask={() => {}}
                />
                <Toaster />
            </ScopePromptProvider>
        </TooltipProvider>
    );
}

async function setup() {
    const task = await createTask({ text: 'Gym', date: MONDAY });
    await setRecurrence(task.id, { type: 'weekly', weekdays: [1, 3, 5] });
    const user = userEvent.setup();

    render(<Day />);
    const button = await screen.findByRole('button', { name: ROW_NAME });

    return {
        seriesId: task.id,
        id: occurrenceId(task.id, WEDNESDAY),
        user,
        button,
    };
}

async function choose(name: string) {
    fireEvent.click(await screen.findByRole('menuitem', { name }));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
}

function openMenu(button: HTMLElement) {
    fireEvent.contextMenu(button, { clientX: 10, clientY: 10 });

    return screen.findByRole('menu', { name: 'Task: Gym' });
}

// The test week is current: its days are not folded as past (F29).
beforeEach(async () => {
    vi.useFakeTimers({
        toFake: ['Date'],
        now: new Date('2026-10-12T08:00:00'),
    });
    await wipeLocalDatabase();
});

afterEach(() => {
    vi.useRealTimers();
    cleanup();
});

describe('Recurring task rows', () => {
    it('completes an occurrence with a left swipe and deletes it with a right swipe', async () => {
        const { button, id, seriesId, user } = await setup();
        const touch = { pointerType: 'touch', pointerId: 1, isPrimary: true };
        const swipe = (target: HTMLElement, endX: number, endY: number) => {
            fireEvent.pointerDown(target, {
                ...touch,
                clientX: 160,
                clientY: 20,
            });
            fireEvent.pointerMove(target, {
                ...touch,
                clientX: endX,
                clientY: endY,
            });
            fireEvent.pointerUp(target, {
                ...touch,
                clientX: endX,
                clientY: endY,
            });
        };

        swipe(button, 60, 20);
        await waitFor(async () =>
            expect((await queryTask(id))?.done).toBe(true),
        );
        const done = await screen.findByRole('button', {
            name: 'Gym (repeats) (done)',
        });
        swipe(done, 155, 120);
        expect(await queryTask(id)).not.toBeNull();
        swipe(done, 110, 20);
        expect(await queryTask(id)).not.toBeNull();

        swipe(done, 260, 20);
        await waitFor(async () => expect(await queryTask(id)).toBeNull());
        expect(
            await queryTask(occurrenceId(seriesId, '2026-10-16')),
        ).not.toBeNull();
        expect(screen.queryByRole('alertdialog')).toBeNull();

        await user.click(await toastAction('Task deleted.'));
        await screen.findByRole('button', { name: 'Gym (repeats) (done)' });
    });

    it('show a repeat icon, keyed by the occurrence id', async () => {
        const { button, id } = await setup();

        expect(within(button).getByTestId('repeat-icon')).toBeTruthy();
        expect(
            button.closest('[data-task-id]')?.getAttribute('data-task-id'),
        ).toBe(id);
    });

    it('show no icon for a plain task', async () => {
        await createTask({ text: 'Call mom', date: WEDNESDAY });
        render(<Day />);

        const button = await screen.findByRole('button', { name: 'Call mom' });
        expect(within(button).queryByTestId('repeat-icon')).toBeNull();
    });

    it('move only this occurrence from the menu, with an Undo toast', async () => {
        const { user, button, id } = await setup();

        await openMenu(button);
        await choose('Pick a date');
        // The calendar opens on the occurrence's month (October 2026).
        await user.click(
            await screen.findByRole('button', { name: /October 15th, 2026/ }),
        );

        await waitFor(async () =>
            expect(await queryTask(id)).toMatchObject({
                kind: 'exception',
                date: '2026-10-15',
            }),
        );
        expect(screen.queryByRole('alertdialog')).toBeNull();

        await user.click(await toastAction('Moved to Thu 15 Oct.'));
        await waitFor(async () =>
            expect((await queryTask(id))?.date).toBe(WEDNESDAY),
        );
    });

    it('ask the scope before changing the color', async () => {
        const { button, id, seriesId } = await setup();

        await openMenu(button);
        fireEvent.click(
            await screen.findByRole('menuitemradio', { name: 'Pink' }),
        );
        const prompt = await screen.findByRole('alertdialog');
        fireEvent.click(
            within(prompt).getByRole('button', { name: 'Only this task' }),
        );

        await waitFor(async () =>
            expect(await queryTask(id)).toMatchObject({
                kind: 'exception',
                color: 'pink',
            }),
        );
        expect((await db.tasks.get(seriesId))?.color).toBe('none');
    });

    it('ask the scope before deleting, and do nothing when cancelled', async () => {
        const { button, id } = await setup();

        await openMenu(button);
        await choose('Delete');
        fireEvent.click(
            within(await screen.findByRole('alertdialog')).getByRole('button', {
                name: 'Cancel',
            }),
        );

        await waitFor(() =>
            expect(screen.queryByRole('alertdialog')).toBeNull(),
        );
        expect(await queryTask(id)).toMatchObject({ kind: 'occurrence' });
    });

    it('delete this and all future ones', async () => {
        const { button, seriesId } = await setup();

        await openMenu(button);
        await choose('Delete');
        fireEvent.click(
            within(await screen.findByRole('alertdialog')).getByRole('button', {
                name: 'This and all future',
            }),
        );

        await waitFor(async () =>
            expect((await db.tasks.get(seriesId))?.recurrence?.until).toBe(
                '2026-10-13',
            ),
        );
        await waitFor(() =>
            expect(screen.queryByRole('button', { name: ROW_NAME })).toBeNull(),
        );
    });

    it('duplicate as a plain task', async () => {
        const { button } = await setup();

        await openMenu(button);
        await choose('Duplicate');

        await screen.findByRole('button', { name: 'Gym' });
        expect(
            (await listTasksIn({ date: WEDNESDAY })).map((item) => item.kind),
        ).toEqual(['exception', 'task']);
    });
});
