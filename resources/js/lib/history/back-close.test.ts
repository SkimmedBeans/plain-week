// @vitest-environment happy-dom
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import { openBackClosable, resetBackClose } from './back-close';

/** A Back press: the browser pops the top entry and sends `popstate`. */
function pressBack() {
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
}

let push: ReturnType<typeof vi.spyOn>;
let back: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    resetBackClose();
    push = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('back-close', () => {
    it('adds one entry while a card is open, and Back closes it', () => {
        const close = vi.fn();
        openBackClosable(close);

        expect(push).toHaveBeenCalledTimes(1);
        pressBack();

        expect(close).toHaveBeenCalledTimes(1);
        expect(back).not.toHaveBeenCalled();
    });

    it('takes the entry off when the card closes another way', () => {
        const done = openBackClosable(() => {});
        done();

        expect(back).toHaveBeenCalledTimes(1);

        // The pop of that back() is ours: nothing else closes.
        const later = vi.fn();
        const inertia = vi.fn();
        window.addEventListener('popstate', inertia);
        pressBack();
        expect(inertia).not.toHaveBeenCalled();
        window.removeEventListener('popstate', inertia);
        expect(later).not.toHaveBeenCalled();
    });

    it('closes stacked cards one Back at a time', () => {
        const list = vi.fn();
        const alert = vi.fn();
        openBackClosable(list);
        openBackClosable(alert);
        expect(push).toHaveBeenCalledTimes(1);

        pressBack();
        expect(alert).toHaveBeenCalledTimes(1);
        expect(list).not.toHaveBeenCalled();
        expect(push).toHaveBeenCalledTimes(2);

        pressBack();
        expect(list).toHaveBeenCalledTimes(1);
    });

    it('waits for its own back() before adding the next card entry', () => {
        const closeList = openBackClosable(() => {});
        closeList();
        const task = vi.fn();
        openBackClosable(task);
        // Not yet: the pending back() would pop it.
        expect(push).toHaveBeenCalledTimes(1);

        pressBack(); // the pop of our back()
        expect(push).toHaveBeenCalledTimes(2);
        expect(task).not.toHaveBeenCalled();

        pressBack();
        expect(task).toHaveBeenCalledTimes(1);
    });

    it('leaves the page its own Back when no card is open', () => {
        const inertia = vi.fn();
        window.addEventListener('popstate', inertia);
        pressBack();
        expect(inertia).toHaveBeenCalledTimes(1);
        window.removeEventListener('popstate', inertia);
    });
});
