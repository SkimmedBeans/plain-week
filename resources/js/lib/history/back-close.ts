/**
 * The system Back gesture closes the open card instead of leaving the page
 * (F27). While any card (dialog, alert, sheet) is open, the planner keeps one
 * extra history entry on top of the page's own. Back pops it: the top card
 * closes, and if another card is still open underneath, the entry comes back
 * for it. Closing the last card another way (X, Esc, a click outside) takes
 * the entry off again with `history.back()`, so Back never needs two presses
 * and entries never pile up.
 *
 * The pops this handles are kept from Inertia, which would otherwise reload
 * the page from history: its `popstate` listener is on `window` too, so this
 * one listens in the capture phase and stops the event.
 */

type Entry = { close: () => void };

const MARKER = 'plainWeekCard';

const stack: Entry[] = [];
/** Our entry is in the history, on top. */
let pushed = false;
/** `history.back()` calls whose `popstate` has not arrived yet. */
let expectedPops = 0;
let listening = false;

function isMarked(state: unknown): boolean {
    return (
        typeof state === 'object' &&
        state !== null &&
        (state as Record<string, unknown>)[MARKER] === true
    );
}

function sync(): void {
    // Wait for a pending back() first: a push now would be the entry it pops.
    if (expectedPops > 0) {
        return;
    }

    if (stack.length > 0 && !pushed) {
        const state =
            typeof window.history.state === 'object' &&
            window.history.state !== null
                ? window.history.state
                : {};
        window.history.pushState({ ...state, [MARKER]: true }, '');
        pushed = true;
    } else if (stack.length === 0 && pushed) {
        pushed = false;
        expectedPops += 1;
        window.history.back();
    }
}

function handlePopState(event: PopStateEvent): void {
    if (expectedPops > 0) {
        expectedPops -= 1;
        event.stopImmediatePropagation();
        sync();

        return;
    }

    if (!pushed) {
        // A navigation of the page's own (or forward onto a stale entry).
        return;
    }

    event.stopImmediatePropagation();
    pushed = false;
    stack.pop()?.close();
    sync();
}

function listen(): void {
    if (listening || typeof window === 'undefined') {
        return;
    }

    listening = true;
    window.addEventListener('popstate', handlePopState, { capture: true });

    // A reload while a card was open leaves our entry on top with no card:
    // take it off so the first Back does not seem to do nothing.
    if (isMarked(window.history.state)) {
        pushed = true;
        sync();
    }
}

/**
 * Registers an open card; `close` runs when Back is pressed while it is the
 * top one. Returns the function to call once the card has closed (any way).
 */
export function openBackClosable(close: () => void): () => void {
    listen();
    const entry: Entry = { close };
    stack.push(entry);
    sync();

    return () => {
        const index = stack.indexOf(entry);

        if (index !== -1) {
            stack.splice(index, 1);
            sync();
        }
    };
}

/** Test seam: forget every card and entry. */
export function resetBackClose(): void {
    stack.length = 0;
    pushed = false;
    expectedPops = 0;
}
