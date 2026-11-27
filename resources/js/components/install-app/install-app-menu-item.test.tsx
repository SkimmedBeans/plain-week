// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import {
    DropdownMenu,
    DropdownMenuContent,
} from '@/components/ui/dropdown-menu';
import { installAppStore } from '@/lib/install-app';
import { InstallAppMenuItem } from './install-app-menu-item';

/** Moves the test page to `url` (happy-dom starts on localhost). */
function setUrl(url: string) {
    (
        window as unknown as { happyDOM: { setURL: (url: string) => void } }
    ).happyDOM.setURL(url);
}

function stubPointer(coarse: boolean) {
    vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({
            matches: query.includes('pointer: coarse') ? coarse : false,
        })),
    );
}

const renderMenu = () =>
    render(
        <DropdownMenu open>
            <DropdownMenuContent>
                <InstallAppMenuItem />
            </DropdownMenuContent>
        </DropdownMenu>,
    );

const item = () =>
    screen.queryByRole('menuitem', { name: 'Install mobile app' });

beforeEach(() => {
    setUrl('https://plainweek.example/');
    stubPointer(false);
    window.localStorage.clear();
    act(() => installAppStore.reset());
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    setUrl('http://localhost:3000/');
});

describe('InstallAppMenuItem', () => {
    it('opens the install card, even after it was seen', async () => {
        window.localStorage.setItem('plain-week.install-app-seen', '1');
        act(() => installAppStore.reset());
        renderMenu();

        expect(installAppStore.isOpen()).toBe(false);

        await userEvent.setup().click(item()!);

        expect(installAppStore.isOpen()).toBe(true);
    });

    it('is left out on a loopback host, which a phone cannot open', () => {
        setUrl('http://localhost:3000/');
        renderMenu();

        expect(item()).toBeNull();
    });

    it('offers installation in the phone browser', () => {
        stubPointer(true);
        renderMenu();

        expect(item()).toBeNull();
        expect(
            screen.getByRole('menuitem', { name: 'Install this app' }),
        ).toBeTruthy();
    });

    it('is left out in the installed app', () => {
        vi.stubGlobal(
            'matchMedia',
            vi.fn((query: string) => ({
                matches: query.includes('display-mode: standalone'),
            })),
        );
        renderMenu();

        expect(item()).toBeNull();
        expect(
            screen.queryByRole('menuitem', { name: 'Install this app' }),
        ).toBeNull();
    });
});
