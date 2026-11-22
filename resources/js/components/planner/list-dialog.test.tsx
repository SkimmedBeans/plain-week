// @vitest-environment happy-dom
import {
    cleanup,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { ScopePromptProvider } from '@/components/planner/scope-prompt';
import { ListDialog } from '@/components/planner/list-dialog';
import { Toaster } from '@/components/ui/sonner';
import { wipeLocalDatabase } from '@/lib/db/database';
import { createList, deleteList, queryLists } from '@/lib/db/lists';
import { createTask, listTasksIn } from '@/lib/db/tasks';

const Card = ({ list }: { list: { id: string; column: number } | null }) => (
    <ScopePromptProvider>
        <ListDialog
            identity={list ? { kind: 'named', id: list.id } : null}
            weekStart={new Date('2026-10-12')}
            placement={
                list ? { date: null, list: list.column } : { date: null, list: 0 }
            }
            tasks={undefined}
            newTaskLabel="New task"
            onOpenTask={() => {}}
            onClose={() => {}}
        />
        <Toaster />
    </ScopePromptProvider>
);

const cardDialog = () => screen.findByRole('dialog', { name: 'Edit list' });

beforeEach(async () => {
    await wipeLocalDatabase();
});

afterEach(() => {
    cleanup();
});

describe('ListDialog', () => {
    it('stays closed on a null id and for a list that no longer exists', async () => {
        const list = await createList('Ideas');
        await deleteList(list.id);

        render(<Card list={null} />);
        expect(screen.queryByRole('dialog')).toBeNull();

        cleanup();
        render(<Card list={list} />);
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('shows the list name and a delete button', async () => {
        const list = await createList('Ideas');
        render(<Card list={list} />);

        const dialog = await cardDialog();
        const input = within(dialog).getByLabelText(
            'List name',
        ) as HTMLInputElement;
        expect(input.value).toBe('Ideas');
        expect(
            within(dialog).getByRole('button', { name: 'Delete' }),
        ).toBeTruthy();
    });

    it('renames the list as you type', async () => {
        const list = await createList('Ideas');
        const user = userEvent.setup();
        render(<Card list={list} />);

        const dialog = await cardDialog();
        const input = within(dialog).getByLabelText(
            'List name',
        ) as HTMLInputElement;
        await user.clear(input);
        await user.type(input, 'Later');

        await waitFor(async () => {
            const [renamed] = await queryLists();
            expect(renamed?.name).toBe('Later');
        });
    });

    it('reverts an emptied name to the saved one on blur', async () => {
        const list = await createList('Ideas');
        const user = userEvent.setup();
        render(<Card list={list} />);

        const dialog = await cardDialog();
        const input = within(dialog).getByLabelText(
            'List name',
        ) as HTMLInputElement;
        await user.clear(input);
        await user.tab();

        expect(input.value).toBe('Ideas');
        const [kept] = await queryLists();
        expect(kept?.name).toBe('Ideas');
    });

    it('deletes the list through its confirm and moves its tasks to Someday', async () => {
        const list = await createList('Ideas');
        const task = await createTask({
            text: 'Write docs',
            date: null,
            list: list.column,
        });
        const user = userEvent.setup();
        render(<Card list={list} />);

        const dialog = await cardDialog();
        await user.click(
            within(dialog).getByRole('button', { name: 'Delete' }),
        );

        const confirm = await screen.findByRole('alertdialog', {
            name: 'Delete “Ideas”?',
        });
        await user.click(
            within(confirm).getByRole('button', { name: 'Delete' }),
        );

        await waitFor(async () => {
            expect(await queryLists()).toEqual([]);
        });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        await waitFor(() =>
            expect(screen.queryByRole('alertdialog')).toBeNull(),
        );

        const [moved] = await listTasksIn({ date: null, list: 0 });
        expect(moved?.id).toBe(task.id);
    });

    it('keeps the list when the delete is cancelled', async () => {
        const list = await createList('Ideas');
        const user = userEvent.setup();
        render(<Card list={list} />);

        const dialog = await cardDialog();
        await user.click(
            within(dialog).getByRole('button', { name: 'Delete' }),
        );
        const confirm = await screen.findByRole('alertdialog');
        await user.click(
            within(confirm).getByRole('button', { name: 'Cancel' }),
        );

        await waitFor(() =>
            expect(screen.queryByRole('alertdialog')).toBeNull(),
        );
        const [kept] = await queryLists();
        expect(kept?.id).toBe(list.id);
    });

    it('closes when the list is deleted elsewhere', async () => {
        const list = await createList('Ideas');
        render(<Card list={list} />);
        await cardDialog();

        await deleteList(list.id);

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
});
