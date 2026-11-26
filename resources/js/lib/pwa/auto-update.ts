/**
 * When a new version's service worker is waiting, apply it without waiting
 * for the "Update available" toast: an old worker left in control can serve
 * the old app's cached page, whose code cannot open the newer local database,
 * so lists and tasks look empty until the update is accepted.
 *
 * Right after the page opened (nothing typed yet) the update applies at
 * once; later it applies the next time the page is hidden (switching apps,
 * locking the phone), so it never reloads under the user's fingers. The toast
 * still offers it in the meantime.
 */

/** How long after the page opens an update may reload it straight away. */
export const APPLY_AT_ONCE_MS = 10_000;

export function applyUpdateWhenSafe(
    update: () => Promise<void>,
    {
        now = () => performance.now(),
        doc = document,
    }: { now?: () => number; doc?: Document } = {},
): void {
    let applied = false;
    const apply = () => {
        if (!applied) {
            applied = true;
            void update();
        }
    };

    if (doc.visibilityState === 'hidden' || now() < APPLY_AT_ONCE_MS) {
        apply();

        return;
    }

    const onHide = () => {
        if (doc.visibilityState === 'hidden') {
            doc.removeEventListener('visibilitychange', onHide);
            apply();
        }
    };
    doc.addEventListener('visibilitychange', onHide);
}
