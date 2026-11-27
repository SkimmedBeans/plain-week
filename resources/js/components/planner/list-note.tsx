import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { NOTE_MAX, setListNote } from '@/lib/db/lists';
import type { SomedayList } from '@/lib/db/types';
import { t } from '@/lib/i18n';
import {
    NOTE_IMAGES_MAX,
    addNoteImage,
    loadNoteImage,
    removeNoteImage,
    uploadPendingImages,
    watchImageUploads,
} from '@/lib/notes/images';
import { onAddPictureRequest } from '@/lib/notes/picture-requests';
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
    measureWidth = false,
}: {
    list: SomedayList;
    className?: string;
    measureWidth?: boolean;
}) {
    const field = useRef<HTMLTextAreaElement>(null);
    const timer = useRef<number | undefined>(undefined);
    const draft = useRef<{ text: string } | null>(null);
    const writing = useRef<{ text: string } | null>(null);
    const [saveFailed, setSaveFailed] = useState(false);
    const note = list.note ?? '';

    const save = () => {
        window.clearTimeout(timer.current);
        timer.current = undefined;
        const pending = draft.current;
        if (pending === null || writing.current === pending) {
            return;
        }

        writing.current = pending;
        void setListNote(list.id, pending.text)
            .then((updated) => {
                if (updated === null) {
                    throw new Error('Note is unavailable');
                }
                if (draft.current === pending) {
                    draft.current = null;
                    setSaveFailed(false);
                }
            })
            .catch(() => {
                if (draft.current === pending) {
                    setSaveFailed(true);
                    toast.error(t('planner.noteSaveFailed'));
                }
            })
            .finally(() => {
                if (writing.current === pending) {
                    writing.current = null;
                }
            });
    };

    // Saves what is typed when the note goes away mid-pause.
    const saveRef = useRef(save);
    useEffect(() => {
        saveRef.current = save;
    });
    useEffect(() => {
        const saveWhenHidden = () => {
            if (document.visibilityState === 'hidden') {
                saveRef.current();
            }
        };
        document.addEventListener('visibilitychange', saveWhenHidden);
        return () => {
            document.removeEventListener('visibilitychange', saveWhenHidden);
            saveRef.current();
        };
    }, []);

    // A remote change, while not editing.
    useEffect(() => {
        const element = field.current;
        if (
            element &&
            document.activeElement !== element &&
            draft.current === null &&
            element.value !== note
        ) {
            element.value = note;
        }
    }, [note]);

    useEffect(() => {
        watchImageUploads();
        void uploadPendingImages();
    }, []);

    return (
        <div
            className={cn(
                'flex flex-col gap-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto',
                className,
            )}
        >
            <div className={measureWidth ? 'grid min-w-0' : 'contents'}>
                {measureWidth && (
                    // The hidden text shares the editor's grid cell, so the
                    // card's intrinsic width follows the note's longest line.
                    <span
                        data-note-width
                        aria-hidden="true"
                        className="invisible col-start-1 row-start-1 hidden h-0 overflow-hidden px-1.5 text-sm whitespace-pre"
                    >
                        {note}
                    </span>
                )}
                <Textarea
                    ref={field}
                    data-list-note
                    defaultValue={note}
                    maxLength={NOTE_MAX}
                    aria-label={t('planner.noteLabel', { name: list.name })}
                    placeholder={t('planner.notePlaceholder')}
                    onChange={(event) => {
                        draft.current = { text: event.target.value };
                        window.clearTimeout(timer.current);
                        timer.current = window.setTimeout(save, SAVE_DELAY_MS);
                    }}
                    onBlur={save}
                    className={cn(
                        'col-start-1 row-start-1 min-h-40 min-w-0 shrink-0 resize-none rounded-none border-0 bg-transparent px-1.5 py-2 leading-6 shadow-none focus-visible:ring-0 lg:text-sm dark:bg-transparent',
                        measureWidth && 'lg:min-h-12',
                        !measureWidth && 'lg:min-h-80',
                    )}
                />
            </div>
            {saveFailed && (
                <div className="flex items-center gap-2 text-sm">
                    <span role="status">{t('planner.noteSaveFailed')}</span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={save}
                    >
                        {t('planner.retryNoteSave')}
                    </Button>
                </div>
            )}
            <NotePictures list={list} />
        </div>
    );
}

/**
 * A note's pictures (F25), each from this device's copy (fetched from the
 * server the first time when it was added elsewhere), with a button that
 * adds one from the camera or files and one per picture that removes it.
 */
function NotePictures({ list }: { list: SomedayList }) {
    const input = useRef<HTMLInputElement>(null);
    const images = list.images ?? [];

    // "Add picture" in the note's ⋮ menu opens this note's picker (F34).
    useEffect(
        () => onAddPictureRequest(list.id, () => input.current?.click()),
        [list.id],
    );

    const add = async (file: File) => {
        if (images.length >= NOTE_IMAGES_MAX) {
            toast.error(t('planner.picturesFull'));

            return;
        }
        try {
            await addNoteImage(list, file);
        } catch {
            toast.error(
                images.length >= NOTE_IMAGES_MAX
                    ? t('planner.picturesFull')
                    : t('planner.pictureFailed'),
            );
        }
    };

    return (
        <div data-note-pictures className="flex flex-col gap-2 px-1.5">
            {images.map((id, index) => (
                <NotePicture
                    key={id}
                    id={id}
                    label={t('planner.notePicture', {
                        index: index + 1,
                        name: list.name,
                    })}
                    onRemove={() =>
                        void removeNoteImage(list, id).catch(() =>
                            toast.error(t('planner.noteSaveFailed')),
                        )
                    }
                />
            ))}
            <input
                ref={input}
                type="file"
                accept="image/*"
                hidden
                data-note-picture-input
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) {
                        void add(file);
                    }
                }}
            />
        </div>
    );
}

function NotePicture({
    id,
    label,
    onRemove,
}: {
    id: string;
    label: string;
    onRemove: () => void;
}) {
    const [url, setUrl] = useState<string | null | undefined>(undefined);

    useEffect(() => {
        let current = true;
        let objectUrl: string | null = null;

        void loadNoteImage(id).then((blob) => {
            if (!current) {
                return;
            }
            objectUrl = blob ? URL.createObjectURL(blob) : null;
            setUrl(objectUrl);
        });

        return () => {
            current = false;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [id]);

    return (
        <figure className="relative">
            {url ? (
                <img
                    src={url}
                    alt={label}
                    data-note-picture
                    className="w-full rounded-md object-contain"
                />
            ) : (
                <div className="flex min-h-24 items-center justify-center rounded-md bg-muted px-3 py-4 text-center text-xs text-muted-foreground">
                    {url === null ? t('planner.pictureUnavailable') : null}
                </div>
            )}
            <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                aria-label={`${t('planner.removePicture')}: ${label}`}
                onClick={onRemove}
                className="absolute end-1.5 top-1.5 rounded-full opacity-80"
            >
                <X />
            </Button>
        </figure>
    );
}
