import { describe, expect, it } from 'vite-plus/test';
import { listToPlainText } from './list-text';

const task = (
    text: string,
    done = false,
    subtasks: { id: string; text: string; done: boolean }[] = [],
) => ({ text, done, subtasks });

describe('listToPlainText', () => {
    it('puts one task per line, open tasks first, then Completed', () => {
        expect(
            listToPlainText([
                task('Paint shed', false, [
                    { id: 'a', text: 'Buy paint', done: true },
                    { id: 'b', text: 'Brushes', done: false },
                ]),
                task('Mow lawn', true),
                task('Fix gate'),
            ]),
        ).toBe(
            [
                'Paint shed',
                '  - Buy paint ✓',
                '  - Brushes',
                'Fix gate',
                '',
                'Completed',
                'Mow lawn',
            ].join('\n'),
        );
    });

    it('has no Completed section without done tasks', () => {
        expect(listToPlainText([task('One'), task('Two')])).toBe('One\nTwo');
    });

    it('starts with Completed when every task is done', () => {
        expect(listToPlainText([task('Done', true)])).toBe('Completed\nDone');
    });

    it('is empty for an empty list', () => {
        expect(listToPlainText([])).toBe('');
    });
});
