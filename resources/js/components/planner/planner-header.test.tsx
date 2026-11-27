// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { PlannerHeader } from '@/components/planner/planner-header';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('@/components/planner/account-button', () => ({
    AccountButton: () => null,
}));

function renderHeader(isCurrentWeek: boolean) {
    const onToday = vi.fn();

    render(
        <TooltipProvider>
            <PlannerHeader
                weekStart={new Date(2026, 10, 9)}
                isCurrentWeek={isCurrentWeek}
                onPreviousWeek={() => {}}
                onNextWeek={() => {}}
                onToday={onToday}
                onGoToWeekOf={() => {}}
            />
        </TooltipProvider>,
    );

    return onToday;
}

describe('PlannerHeader', () => {
    afterEach(cleanup);

    it('keeps the desktop Today button disabled on the current week', () => {
        renderHeader(true);

        expect(
            screen.getByRole<HTMLButtonElement>('button', { name: 'Today' })
                .disabled,
        ).toBe(true);
    });

    it('returns to today from the desktop week controls', () => {
        const onToday = renderHeader(false);

        const desktopToday = document.querySelector<HTMLElement>(
            '[data-test=desktop-today-button]',
        );
        expect(desktopToday).not.toBeNull();
        fireEvent.click(desktopToday!);

        expect(onToday).toHaveBeenCalledOnce();
        // The week number gives the pill its room on phones.
        expect(screen.getByText('W46').parentElement?.className).toContain(
            'max-sm:hidden',
        );
    });
});
