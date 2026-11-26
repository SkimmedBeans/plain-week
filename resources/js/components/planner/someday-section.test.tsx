// @vitest-environment happy-dom
import {
    cleanup,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLiveQuery } from 'dexie-react-hooks';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { AddList } from '@/components/planner/add-list';
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

function Section({
    list,
    canMoveEarlier,
    canMoveLater,
}: {
    list: SectionList;
    canMoveEarlier?: boolean;
    canMoveLater?: boolean;
}) {
    return (
        <ScopePromptProvider>
            <SomedaySection
                list={list}
                canMoveEarlier={canMoveEarlier}
                canMoveLater={canMoveLater}
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
    it('sets and clears the named list title color from its menu', async () => {
        const list = await createList('Ideas');
        const user = userEvent.setup();
        function LiveSection() {
            const lists = useLiveQuery(queryLists);
            return <Section list={lists?.[0] ?? list} />;
        }
        render(<LiveSection />);

        const chooseColor = async (label: string) => {
            await user.click(menuButton('Ideas'));
            const trigger = await screen.findByRole('menuitem', {
                name: 'Title color',
            });
            trigger.focus();
            await user.keyboard('{ArrowRight}');
            await user.click(
                await screen.findByRole('menuitemradio', { name: label }),
            );
        };
        await chooseColor('Pink');
        await waitFor(() =>
            expect(
                screen.getByText('Ideas').classList.contains('bg-task-pink'),
            ).toBe(true),
        );

        await user.click(screen.getByRole('button', { name: 'Ideas' }));
        const field = await screen.findByRole('textbox', { name: 'List name' });
        expect(field.classList.contains('bg-task-pink')).toBe(true);
        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

        await chooseColor('No color');
        await waitFor(() =>
            expect(
                screen.getByText('Ideas').classList.contains('bg-task-pink'),
            ).toBe(false),
        );
        expect((await queryLists())[0].color).toBe('none');
    });

    it('heads the base column with Someday, without New list (F35)', () => {
        render(<Section list={BASE} />);

        expect(screen.getByText('Someday')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'New list' })).toBeNull();
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

    it('adds a list from Add with its name', async () => {
        const user = userEvent.setup();
        render(<AddList defaultKind="list" />);

        await user.click(screen.getByRole('button', { name: 'Add' }));
        const dialog = await screen.findByRole('dialog', {
            name: 'Add a list or note',
        });

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
        expect(list?.note ?? null).toBeNull();
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('adds an empty note when Note is picked', async () => {
        const user = userEvent.setup();
        render(<AddList defaultKind="list" />);

        await user.click(screen.getByRole('button', { name: 'Add' }));
        const dialog = await screen.findByRole('dialog', {
            name: 'Add a list or note',
        });
        await user.type(within(dialog).getByLabelText('List name'), 'Ideas');
        await user.click(within(dialog).getByRole('radio', { name: 'Note' }));
        await user.click(
            within(dialog).getByRole('button', { name: 'Create' }),
        );

        await waitFor(async () =>
            expect((await queryLists())[0]?.note).toBe(''),
        );
    });

    it('cancels without creating a list', async () => {
        const user = userEvent.setup();
        render(<AddList defaultKind="list" />);

        await user.click(screen.getByRole('button', { name: 'Add' }));
        const dialog = await screen.findByRole('dialog', {
            name: 'Add a list or note',
        });
        await user.type(within(dialog).getByLabelText('List name'), 'Ideas');
        await user.click(
            within(dialog).getByRole('button', { name: 'Cancel' }),
        );

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(await queryLists()).toEqual([]);
    });

    it('offers a keyboard move handle on named lists, and none on the base list', async () => {
        const list = await createList('Ideas');
        render(<Section list={sectionProps(list)} />);

        const handle = screen.getByRole('button', {
            name: 'Move the Ideas list',
        });
        expect(handle.className).toContain('sr-only');
        const described = handle.getAttribute('aria-describedby');
        expect(described).toBeTruthy();
        expect(document.getElementById(described!)?.textContent).toContain(
            'press Space or Enter on its move button',
        );

        cleanup();
        render(<Section list={BASE} />);
        expect(
            screen.queryByRole('button', { name: /Move the .* list/ }),
        ).toBeNull();
    });

    it('moves a list right from its menu, and not left from the first place', async () => {
        const first = await createList('Shed');
        await createList('Homelab');
        const user = userEvent.setup();
        render(<Section list={sectionProps(first)} canMoveLater />);

        await user.click(menuButton(first.name));
        const menu = await screen.findByRole('menu');
        const left = within(menu).getByRole('menuitem', { name: /Move left/ });
        expect(left.getAttribute('aria-disabled')).toBe('true');

        await user.click(
            within(menu).getByRole('menuitem', { name: /Move right/ }),
        );

        await waitFor(async () =>
            expect((await queryLists()).map((list) => list.name)).toEqual([
                'Homelab',
                'Shed',
            ]),
        );
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

    it('opens the list card from the named list’s name, by click and keyboard', async () => {
        const list = await createList('Ideas');
        const user = userEvent.setup();
        render(<Section list={sectionProps(list)} />);

        await user.click(screen.getByRole('button', { name: 'Ideas' }));
        const card = await screen.findByRole('dialog', { name: 'Edit list' });
        expect(
            (within(card).getByLabelText('List name') as HTMLInputElement)
                .value,
        ).toBe('Ideas');

        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

        // Keyboard: the name is a button, so Enter opens the card too.
        screen.getByRole('button', { name: 'Ideas' }).focus();
        await user.keyboard('{Enter}');
        await screen.findByRole('dialog', { name: 'Edit list' });
    });

    it('opens the base Someday card from its name, by click and keyboard', async () => {
        const user = userEvent.setup();
        render(<Section list={BASE} />);

        // F11: the base Someday name is a button that opens the card.
        const somedayButton = screen.getByRole('button', { name: 'Someday' });
        expect(somedayButton).toBeTruthy();

        await user.click(somedayButton);
        // The card opens (a dialog appears).
        await screen.findByRole('dialog');

        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

        // Keyboard: Enter opens the card too.
        somedayButton.focus();
        await user.keyboard('{Enter}');
        await screen.findByRole('dialog');
    });
});
