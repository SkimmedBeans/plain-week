import { createOnceCardStore } from '@/lib/once-card';

/**
 * Whether the "Install the mobile app" card is open: "Install mobile app" in
 * the account menu opens it (`open`), the planner page's first-visit prompt
 * once (`openOnce`); closing it sets `plain-week.install-app-seen`.
 */
export const installAppStore = createOnceCardStore(
    'plain-week.install-app-seen',
);

type InstallPrompt = Event & { prompt: () => Promise<unknown> };
let installPrompt: InstallPrompt | null = null;
let installed = false;

if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        installPrompt = event as InstallPrompt;
    });
    window.addEventListener('appinstalled', () => {
        installPrompt = null;
        installed = true;
    });
}

export function isIos(): boolean {
    return (
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
}

export function isInstalledApp(): boolean {
    return (
        (navigator as Navigator & { standalone?: boolean }).standalone ===
            true ||
        (window.matchMedia?.('(display-mode: standalone)').matches ?? false)
    );
}

export function isTouchBrowser(): boolean {
    return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

export function offerInstall(): void {
    if (isTouchBrowser() && installPrompt !== null) {
        const prompt = installPrompt;
        installPrompt = null;
        void prompt.prompt().catch(() => installAppStore.open());
        return;
    }
    installAppStore.open();
}

/**
 * A desktop browser, where the card makes sense: a wide screen with a mouse,
 * not the installed app.
 */
export function isDesktopBrowser(): boolean {
    if (typeof window.matchMedia !== 'function') {
        return false;
    }

    return (
        window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches &&
        !isInstalledApp()
    );
}

/**
 * Whether a phone can open this address: not a loopback host (`localhost`,
 * `127.0.0.1`, `::1`), which on the phone would point at the phone itself.
 */
export function isReachableFromPhone(): boolean {
    const host = window.location.hostname;

    return !(
        host === 'localhost' ||
        host.endsWith('.localhost') ||
        host === '[::1]' ||
        host.startsWith('127.')
    );
}

/**
 * Keep install help available in the browser until the app is installed.
 */
export function canOfferInstall(): boolean {
    return isReachableFromPhone() && !isInstalledApp() && !installed;
}
