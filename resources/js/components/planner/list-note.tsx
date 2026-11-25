import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { NOTE_MAX, setListNote } from '@/lib/db/lists';
import type { SomedayList } from '@/lib/db/types';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** How long typing pauses before the note is saved. */
const SAVE_DELAY_MS = 400;

/**
 * A named list converted to a note (F24): free text in place of tasks,
 * written to the local database as you type (after a short pause, and when
 * the field is left). A change synced from another device shows while the
 * field is not being edited.
 */
export function ListNote({
    list,
    className,
}: {
    list: SomedayList;
    className?: string;
}) {
    const field = useRef<HTMLTextAreaElement>(null);
    const timer = useRef<number | undefined>(undefined);
    const note = list.note ?? '';

    const save = () => {
        window.clearTimeout(timer.current);
        timer.current = undefined;
        const value = field.current?.value;

        if (value !== undefined && value !== note) {
            void setListNote(list.id, value).catch(() =>
                toast.error(t('planner.noteSaveFailed')),
            );
        }
    };

    // Saves what is typed when the note goes away mid-pause.
    const saveRef = useRef(save);
    useEffect(() => {
        saveRef.current = save;
    });
    useEffect(
        () => () => {
            if (timer.current !== undefined) {
                saveRef.current();
            }
        },
        [],
    );

    // A remote change, while not editing.
    useEffect(() => {
        const element = field.current;
        if (
            element &&
            document.activeElement !== element &&
            timer.current === undefined &&
            element.value !== note
        ) {
            element.value = note;
        }
    }, [note]);

    return (
        <Textarea
            ref={field}
            data-list-note
            defaultValue={note}
            maxLength={NOTE_MAX}
            aria-label={t('planner.noteLabel', { name: list.name })}
            placeholder={t('planner.notePlaceholder')}
            onChange={() => {
                window.clearTimeout(timer.current);
                timer.current = window.setTimeout(save, SAVE_DELAY_MS);
            }}
            onBlur={save}
            className={cn(
                'min-h-40 resize-none rounded-none border-0 bg-transparent px-1.5 py-2 leading-6 shadow-none focus-visible:ring-0 lg:min-h-0 lg:flex-1 lg:text-sm dark:bg-transparent',
                className,
            )}
        />
    );
}
