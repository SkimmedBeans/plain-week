import { describe, expect, it } from 'vite-plus/test';
import { listToPlainText, parsePlainTextList } from './list-text';

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

describe('parsePlainTextList', () => {
    it('reads back what listToPlainText writes', () => {
        const tasks = [
            task('Paint shed', false, [
                { id: 'a', text: 'Buy paint', done: true },
                { id: 'b', text: 'Brushes', done: false },
            ]),
            task('Fix gate'),
            task('Mow lawn', true),
        ];

        expect(parsePlainTextList(listToPlainText(tasks))).toEqual([
            {
                text: 'Paint shed',
                done: false,
                subtasks: [
                    { text: 'Buy paint', done: true },
                    { text: 'Brushes', done: false },
                ],
            },
            { text: 'Fix gate', done: false, subtasks: [] },
            { text: 'Mow lawn', done: true, subtasks: [] },
        ]);
    });

    it('takes free text: one task per line, list markers and boxes dropped', () => {
        expect(
            parsePlainTextList(
                '- [ ] Call Ana\n\n* [x] Book ferry\nJust a line',
            ),
        ).toEqual([
            { text: 'Call Ana', done: false, subtasks: [] },
            { text: 'Book ferry', done: true, subtasks: [] },
            { text: 'Just a line', done: false, subtasks: [] },
        ]);
    });
});
