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
import { SomedaySection } from '@/components/planner/someday-section';
import { Toaster } from '@/components/ui/sonner';
import { wipeLocalDatabase } from '@/lib/db/database';
import { createList, queryLists } from '@/lib/db/lists';
import { createTask, listTasksIn } from '@/lib/db/tasks';
import type { SomedayList } from '@/lib/db/types';

const WEEK_START = new Date(2026, 9, 12); // Monday 12 October 2026
const TODAY = '2026-10-14';

type SectionList = { column: number; name: string; id?: string };

const BASE: SectionList = { column: 0, name: 'Someday' };

function Section({ list }: { list: SectionList }) {
    return (
        <ScopePromptProvider>
            <SomedaySection
                list={list}
                weekStart={WEEK_START}
                today={TODAY}
                onOpenTask={() => {}}
            />
            <Toaster />
        </ScopePromptProvider>
    );
}

function sectionProps(list: SomedayList): SectionList {
    return { column: list.column, name: list.name, id: list.id };
}

const menuButton = (name: string) =>
    screen.getByRole('button', { name: `More options for the ${name} list` });

beforeEach(async () => {
    await wipeLocalDatabase();
});

afterEach(() => {
    cleanup();
});

describe('SomedaySection', () => {
    it('heads the base column with Someday and offers New list', () => {
        render(<Section list={BASE} />);

        expect(screen.getByText('Someday')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'New list' })).toBeTruthy();
        expect(
            screen.queryByRole('button', { name: /More options/ }),
        ).toBeNull();
    });

    it('heads a named column with the list name and a menu', () => {
        render(<Section list={{ column: 3, name: 'Ideas' }} />);

        expect(screen.getByText('Ideas')).toBeTruthy();
        expect(menuButton('Ideas')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'New list' })).toBeNull();
    });

    it('shows the named list’s tasks in its own column', async () => {
        const list = await createList('Ideas');
        await createTask({ text: 'Write docs', date: null, list: list.column });

        render(<Section list={sectionProps(list)} />);

        expect(
            await screen.findByRole('button', { name: 'Write docs' }),
        ).toBeTruthy();
    });

    it('creates a list from the base header with its name', async () => {
        const user = userEvent.setup();
        render(<Section list={BASE} />);

        await user.click(screen.getByRole('button', { name: 'New list' }));
        const dialog = await screen.findByRole('dialog', { name: 'New list' });

        const submit = within(dialog).getByRole('button', {
            name: 'Create',
        }) as HTMLButtonElement;
        expect(submit.disabled).toBe(true);

        await user.type(within(dialog).getByLabelText('List name'), 'Ideas');
        await user.click(submit);

        await waitFor(async () => {
            expect(await queryLists()).toHaveLength(1);
        });
        const [list] = await queryLists();
        expect(list?.name).toBe('Ideas');
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('cancels without creating a list', async () => {
        const user = userEvent.setup();
        render(<Section list={BASE} />);

        await user.click(screen.getByRole('button', { name: 'New list' }));
        const dialog = await screen.findByRole('dialog', { name: 'New list' });
        await user.type(within(dialog).getByLabelText('List name'), 'Ideas');
        await user.click(
            within(dialog).getByRole('button', { name: 'Cancel' }),
        );

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(await queryLists()).toEqual([]);
    });

    it('renames a list from its menu and keeps its tasks', async () => {
        const list = await createList('Ideas');
        await createTask({ text: 'Write docs', date: null, list: list.column });
        const user = userEvent.setup();
        render(<Section list={sectionProps(list)} />);

        await user.click(menuButton(list.name));
        const menu = await screen.findByRole('menu');
        await user.click(
            within(menu).getByRole('menuitem', { name: 'Rename' }),
        );

        const dialog = await screen.findByRole('dialog', {
            name: 'Rename list',
        });
        const input = within(dialog).getByLabelText(
            'New list name',
        ) as HTMLInputElement;
        await user.clear(input);
        await user.type(input, 'Later');
        await user.click(
            within(dialog).getByRole('button', { name: 'Rename' }),
        );

        await waitFor(async () => {
            const [renamed] = await queryLists();
            expect(renamed?.name).toBe('Later');
        });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

        // The column keeps its tasks under the new name.
        expect(
            (await listTasksIn({ date: null, list: list.column })).map(
                (t) => t.text,
            ),
        ).toEqual(['Write docs']);
    });

    it('deletes a list from its menu and moves its tasks to Someday', async () => {
        const list = await createList('Ideas');
        const task = await createTask({
            text: 'Write docs',
            date: null,
            list: list.column,
        });
        const user = userEvent.setup();
        render(<Section list={sectionProps(list)} />);
        await screen.findByRole('button', { name: 'Write docs' });

        await user.click(menuButton(list.name));
        const menu = await screen.findByRole('menu');
        await user.click(
            within(menu).getByRole('menuitem', { name: 'Delete list' }),
        );

        const confirm = await screen.findByRole('alertdialog', {
            name: `Delete “${list.name}”?`,
        });
        expect(
            within(confirm).getByText('Its tasks will move to Someday.'),
        ).toBeTruthy();
        await user.click(
            within(confirm).getByRole('button', { name: 'Delete' }),
        );

        await waitFor(async () => {
            expect(await queryLists()).toEqual([]);
        });
        await waitFor(() =>
            expect(screen.queryByRole('alertdialog')).toBeNull(),
        );

        const [moved] = await listTasksIn({ date: null, list: 0 });
        expect(moved?.id).toBe(task.id);
    });

    it('keeps the list when the delete is cancelled', async () => {
        const list = await createList('Ideas');
        const user = userEvent.setup();
        render(<Section list={sectionProps(list)} />);

        await user.click(menuButton(list.name));
        const menu = await screen.findByRole('menu');
        await user.click(
            within(menu).getByRole('menuitem', { name: 'Delete list' }),
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
});
