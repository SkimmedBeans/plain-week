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
import { WeekGrid } from '@/components/planner/week-grid';
import { db, wipeLocalDatabase } from '@/lib/db/database';
import { convertListToNote, createList, setListArchived } from '@/lib/db/lists';
import { createTask } from '@/lib/db/tasks';

// In vitest's happy-dom environment `window.innerWidth = n` only shadows the
// global; the real window that `matchMedia` evaluates against stays put.
// Reach that window through the prototype `defaultView` getter and resize it.
function setViewportWidth(width: number): void {
    let proto = Object.getPrototypeOf(document) as object | null;
    while (proto && proto !== Object.prototype) {
        const desc = Object.getOwnPropertyDescriptor(proto, 'defaultView');
        if (desc?.get) {
            (
                desc.get.call(document) as unknown as { innerWidth: number }
            ).innerWidth = width;
            return;
        }
        proto = Object.getPrototypeOf(proto);
    }
    throw new Error('happy-dom defaultView getter not found');
}

describe('WeekGrid', () => {
    beforeEach(async () => {
        localStorage.clear();
        await wipeLocalDatabase();
        // Desktop by default; the F55 phone test sets its own width.
        setViewportWidth(1024);
    });
    afterEach(cleanup);

    it('lists the days in reading order, then Someday, on every window shape', async () => {
        render(
            <ScopePromptProvider>
                <WeekGrid
                    weekStart={new Date(2026, 9, 12)}
                    today="2026-10-15"
                    onOpenTask={() => {}}
                />
            </ScopePromptProvider>,
        );

        // Every desktop grid places its children in DOM order: five tracks
        // (wide windows), four tracks (near square) or two tracks (tall);
        // every column — the days, Someday and the named lists — is exactly
        // one track wide, so no section spans columns in any shape.
        const sections = await screen.findAllByRole('region');

        expect(
            sections.map(
                (section) =>
                    section.getAttribute('aria-label') ??
                    section.textContent?.slice(0, 7),
            ),
        ).toEqual([
            'Mon 12 Oct',
            'Tue 13 Oct',
            'Wed 14 Oct',
            'Thu 15 Oct',
            'Fri 16 Oct',
            'Sat 17 Oct',
            'Sun 18 Oct',
            'Someday',
        ]);
        const grid = sections[0].parentElement?.className;
        expect(grid).toContain('lg:week-wide:grid-cols-5');
        expect(grid).toContain('lg:week-square:grid-cols-4');
        expect(grid).toContain('lg:week-tall:grid-cols-2');
        for (const section of sections) {
            expect(section.className).not.toContain('col-span');
        }
    });

    it('shows the named lists in the Lists view, in column order, and the week in Week', async () => {
        await createList('Ideas');
        await createList('Health');
        const user = userEvent.setup();

        render(
            <ScopePromptProvider>
                <WeekGrid
                    weekStart={new Date(2026, 9, 12)}
                    today="2026-10-15"
                    onOpenTask={() => {}}
                />
            </ScopePromptProvider>,
        );

        // Week: the days and Someday only (F30).
        await waitFor(() =>
            expect(screen.getAllByRole('region')).toHaveLength(8),
        );

        await user.click(screen.getByRole('radio', { name: 'Lists' }));
        await waitFor(() =>
            expect(screen.getAllByRole('region')).toHaveLength(2),
        );
        expect(localStorage.getItem('plain-week.view')).toBe('lists');

        const tail = screen
            .getAllByRole('region')
            .map(
                (section) =>
                    within(section)
                        .getByRole('heading', { level: 2 })
                        .querySelector('[id]')?.textContent,
            );
        expect(tail).toEqual(['Ideas', 'Health']);
    });

    it('collapses a list into a chip with its open count, and expands it again', async () => {
        const list = await createList('Shed');
        await createTask({ text: 'Paint', date: null, list: list.column });
        await createTask({ text: 'Fix door', date: null, list: list.column });
        localStorage.setItem('plain-week.view', 'lists');
        const user = userEvent.setup();

        render(
            <ScopePromptProvider>
                <WeekGrid
                    weekStart={new Date(2026, 9, 12)}
                    today="2026-10-15"
                    onOpenTask={() => {}}
                />
            </ScopePromptProvider>,
        );

        await user.click(
            await screen.findByRole('button', {
                name: 'Collapse the Shed list',
            }),
        );

        // The column leaves the grid; a chip says what is inside.
        await waitFor(() =>
            expect(screen.queryAllByRole('region')).toHaveLength(0),
        );
        const chip = await screen.findByRole('button', {
            name: 'Shed, 2 open',
        });
        expect(chip.closest('[data-collapsed-lists]')).not.toBeNull();
        expect(localStorage.getItem('plain-week.collapsed-lists')).toBe(
            JSON.stringify([list.id]),
        );

        await user.click(
            screen.getByRole('button', { name: 'Expand the Shed list' }),
        );
        await waitFor(() =>
            expect(screen.getAllByRole('region')).toHaveLength(1),
        );
        expect(document.querySelector('[data-collapsed-lists]')).toBeNull();
    });

    it('marks the grid compact when the setting is on', async () => {
        localStorage.setItem('plain-week.compact', 'on');
        render(
            <ScopePromptProvider>
                <WeekGrid
                    weekStart={new Date(2026, 9, 12)}
                    today="2026-10-15"
                    onOpenTask={() => {}}
                />
            </ScopePromptProvider>,
        );

        const sections = await screen.findAllByRole('region');
        expect(sections[0].parentElement?.dataset.density).toBe('compact');
    });

    it('hides archived lists and lists them from Someday', async () => {
        const list = await createList('Old project');
        await setListArchived(list.id, true);
        const user = userEvent.setup();

        render(
            <ScopePromptProvider>
                <WeekGrid
                    weekStart={new Date(2026, 9, 12)}
                    today="2026-10-15"
                    onOpenTask={() => {}}
                />
            </ScopePromptProvider>,
        );

        await user.click(
            await screen.findByRole('button', { name: 'Archived lists (1)' }),
        );
        expect(screen.getAllByRole('region', { hidden: true })).toHaveLength(8);

        await user.click(
            await screen.findByRole('button', {
                name: 'Restore the Old project list',
            }),
        );
        await waitFor(async () =>
            expect((await db.someday_lists.get(list.id))!.archived).toBe(false),
        );
    });

    it('shows task lists on Lists and notes on Notes', async () => {
        await createList('Errands');
        const note = await createList('Ideas');
        await convertListToNote(note.id);
        const user = userEvent.setup();

        render(
            <ScopePromptProvider>
                <WeekGrid
                    weekStart={new Date(2026, 9, 12)}
                    today="2026-10-15"
                    onOpenTask={() => {}}
                />
            </ScopePromptProvider>,
        );

        await user.click(await screen.findByRole('radio', { name: 'Lists' }));
        await waitFor(() =>
            expect(
                screen.getAllByRole('region').map((r) => r.textContent),
            ).toEqual([expect.stringContaining('Errands')]),
        );

        await user.click(screen.getByRole('radio', { name: 'Notes' }));
        await waitFor(() =>
            expect(
                screen.getAllByRole('region').map((r) => r.textContent),
            ).toEqual([expect.stringContaining('Ideas')]),
        );
        expect(localStorage.getItem('plain-week.view')).toBe('notes');
    });

    it('collapses and expands every list of the view at once (F45)', async () => {
        await createList('Errands');
        await createList('Shed');
        localStorage.setItem('plain-week.view', 'lists');
        const user = userEvent.setup();

        render(
            <ScopePromptProvider>
                <WeekGrid
                    weekStart={new Date(2026, 9, 12)}
                    today="2026-10-15"
                    onOpenTask={() => {}}
                />
            </ScopePromptProvider>,
        );

        await waitFor(() =>
            expect(screen.getAllByRole('region')).toHaveLength(2),
        );
        await user.click(screen.getByRole('button', { name: 'Collapse all' }));
        await waitFor(() =>
            expect(screen.queryAllByRole('region')).toHaveLength(0),
        );
        expect(
            document.querySelectorAll('[data-collapsed-lists] li'),
        ).toHaveLength(2);

        await user.click(screen.getByRole('button', { name: 'Expand all' }));
        await waitFor(() =>
            expect(screen.getAllByRole('region')).toHaveLength(2),
        );
    });

    it('stacks collapsed lists as full-width rows under the Add bar on phones (F52)', async () => {
        await createList('Shed');
        await createList('Homelab');
        localStorage.setItem('plain-week.view', 'lists');
        const user = userEvent.setup();

        render(
            <ScopePromptProvider>
                <WeekGrid
                    weekStart={new Date(2026, 9, 12)}
                    today="2026-10-15"
                    onOpenTask={() => {}}
                />
            </ScopePromptProvider>,
        );

        await waitFor(() =>
            expect(screen.getAllByRole('region')).toHaveLength(2),
        );
        await user.click(screen.getByRole('button', { name: 'Collapse all' }));
        await waitFor(() =>
            expect(screen.queryAllByRole('region')).toHaveLength(0),
        );

        // Below `lg` one full-width row per list, stacked (the row switches
        // to a column), with no top margin: the Add / Expand all bar's own
        // margin is the only space above.
        const rows = document.querySelector('[data-collapsed-lists]');
        expect(rows).not.toBeNull();
        expect(rows!.className).toContain('max-lg:flex-col');
        expect(rows!.className).toContain('max-lg:order-1');
        expect(rows!.className).toContain('max-lg:mb-10');
        expect(rows!.className).not.toContain('mt-10');
        expect(rows!.querySelectorAll('li')).toHaveLength(2);
        for (const row of rows!.querySelectorAll('li')) {
            expect(row.className).toContain('max-lg:w-full');
        }
        // The (here empty) grid sits below the rows on phones; desktop keeps
        // the chip row after the grid.
        expect(
            document.querySelector('[data-lists-view]')!.className,
        ).toContain('max-lg:order-2');

        // The row still opens the list card by tap.
        await user.click(screen.getByRole('button', { name: 'Shed, 0 open' }));
        await screen.findByRole('dialog');
    });

    it('opens the note card from its title at lg, without note rows (F55)', async () => {
        const note = await createList('Ideas');
        await convertListToNote(note.id);
        localStorage.setItem('plain-week.view', 'notes');
        const user = userEvent.setup();

        render(
            <ScopePromptProvider>
                <WeekGrid
                    weekStart={new Date(2026, 9, 12)}
                    today="2026-10-15"
                    onOpenTask={() => {}}
                />
            </ScopePromptProvider>,
        );

        // At `lg` the note stays a grid cell: the title opens the list
        // card, and its text shows all the time.
        await screen.findByRole('textbox', { name: 'Note: Ideas' });
        await user.click(await screen.findByRole('button', { name: 'Ideas' }));
        await screen.findByRole('dialog');
    });

    it('opens a compact phone note in a card (F57)', async () => {
        const first = await createList('Ideas');
        await convertListToNote(first.id);
        const second = await createList('Travel');
        await convertListToNote(second.id);
        localStorage.setItem('plain-week.view', 'notes');
        setViewportWidth(412); // Below the planner's desktop breakpoint.
        const user = userEvent.setup();

        render(
            <ScopePromptProvider>
                <WeekGrid
                    weekStart={new Date(2026, 9, 12)}
                    today="2026-10-15"
                    onOpenTask={() => {}}
                />
            </ScopePromptProvider>,
        );

        // Both notes are rows, collapsed to their headings: no note text in
        // the DOM, no chips.
        await waitFor(() =>
            expect(screen.getAllByRole('region')).toHaveLength(2),
        );
        expect(screen.queryAllByRole('textbox')).toHaveLength(0);
        expect(document.querySelector('[data-collapsed-lists]')).toBeNull();

        expect(screen.queryByRole('button', { name: 'Expand all' })).toBeNull();
        const row = screen.getByRole('button', { name: 'Ideas' });
        await user.click(row);
        const card = await screen.findByRole('dialog');
        expect(card.querySelector('textarea')).not.toBeNull();
        expect(
            screen.getAllByRole('textbox', { name: 'Note: Ideas' }),
        ).toHaveLength(1);

        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(
            screen.queryByRole('textbox', { name: 'Note: Ideas' }),
        ).toBeNull();
        expect(document.activeElement).toBe(row);
        setViewportWidth(1024);
    });

    it('focuses the note editor after creating a note on a phone', async () => {
        localStorage.setItem('plain-week.view', 'notes');
        setViewportWidth(412);
        const user = userEvent.setup();
        render(
            <ScopePromptProvider>
                <WeekGrid
                    weekStart={new Date(2026, 9, 12)}
                    today="2026-10-15"
                    onOpenTask={() => {}}
                />
            </ScopePromptProvider>,
        );

        await user.click(screen.getByRole('button', { name: 'New note' }));
        await user.type(
            await screen.findByRole('textbox', { name: 'Note name' }),
            'Ideas',
        );
        await user.click(screen.getByRole('button', { name: 'Create' }));

        const note = await screen.findByRole('textbox', {
            name: 'Note: Ideas',
        });
        await waitFor(() => expect(document.activeElement).toBe(note));
        setViewportWidth(1024);
    });
});
