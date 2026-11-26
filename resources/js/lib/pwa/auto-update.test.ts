// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vite-plus/test';
import { applyUpdateWhenSafe } from './auto-update';

function fakeDoc(state: 'visible' | 'hidden') {
    const doc = document.implementation.createHTMLDocument('x');
    Object.defineProperty(doc, 'visibilityState', {
        get: () => state,
        configurable: true,
    });

    return {
        doc,
        hide: () => {
            state = 'hidden';
            doc.dispatchEvent(new Event('visibilitychange'));
        },
    };
}

describe('applyUpdateWhenSafe', () => {
    it('applies at once right after the page opened', () => {
        const update = vi.fn().mockResolvedValue(undefined);
        const { doc } = fakeDoc('visible');

        applyUpdateWhenSafe(update, { now: () => 2000, doc });

        expect(update).toHaveBeenCalledTimes(1);
    });

    it('waits until the page is hidden once the user may be typing', () => {
        const update = vi.fn().mockResolvedValue(undefined);
        const { doc, hide } = fakeDoc('visible');

        applyUpdateWhenSafe(update, { now: () => 60_000, doc });
        expect(update).not.toHaveBeenCalled();

        hide();
        hide();
        expect(update).toHaveBeenCalledTimes(1);
    });

    it('applies at once when the page is already hidden', () => {
        const update = vi.fn().mockResolvedValue(undefined);
        const { doc } = fakeDoc('hidden');

        applyUpdateWhenSafe(update, { now: () => 60_000, doc });

        expect(update).toHaveBeenCalledTimes(1);
    });
});
