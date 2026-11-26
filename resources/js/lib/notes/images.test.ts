// @vitest-environment happy-dom
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import { db, wipeLocalDatabase } from '@/lib/db/database';
import { createList } from '@/lib/db/lists';
import { loadNoteImage, removeNoteImage, uploadPendingImages } from './images';

beforeEach(async () => {
    await wipeLocalDatabase();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const blob = () => new Blob(['x'], { type: 'image/webp' });

describe('note pictures', () => {
    it('uploads pending pictures once and marks them uploaded', async () => {
        await db.note_images.put({ id: 'a', blob: blob(), uploaded: 0 });
        await db.note_images.put({ id: 'b', blob: blob(), uploaded: 1 });
        const fetch = vi
            .fn()
            .mockResolvedValue(new Response('{}', { status: 201 }));
        vi.stubGlobal('fetch', fetch);
        // happy-dom's FormData refuses the Blob that fake-indexeddb returns.
        vi.stubGlobal(
            'FormData',
            class {
                fields = new Map<string, unknown>();
                append(key: string, value: unknown) {
                    this.fields.set(key, value);
                }
                get(key: string) {
                    return this.fields.get(key);
                }
            },
        );

        await uploadPendingImages();

        expect(fetch).toHaveBeenCalledTimes(1);
        const body = fetch.mock.calls[0][1].body as {
            get(key: string): unknown;
        };
        expect(body.get('id')).toBe('a');
        expect((await db.note_images.get('a'))!.uploaded).toBe(1);
    });

    it('keeps a picture pending when the upload fails', async () => {
        await db.note_images.put({ id: 'a', blob: blob(), uploaded: 0 });
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response('', { status: 401 })),
        );

        await uploadPendingImages();

        expect((await db.note_images.get('a'))!.uploaded).toBe(0);
    });

    it('loads the local copy, or fetches and keeps the server one', async () => {
        await db.note_images.put({ id: 'local', blob: blob(), uploaded: 1 });
        const fetch = vi
            .fn()
            .mockResolvedValue(
                new Response(new Blob(['y'], { type: 'image/jpeg' })),
            );
        vi.stubGlobal('fetch', fetch);

        expect(await loadNoteImage('local')).not.toBeNull();
        expect(fetch).not.toHaveBeenCalled();

        expect(await loadNoteImage('remote')).not.toBeNull();
        expect(await db.note_images.get('remote')).toMatchObject({
            uploaded: 1,
        });
    });

    it('shows nothing for a picture it cannot get', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response('', { status: 404 })),
        );

        expect(await loadNoteImage('missing')).toBeNull();
    });

    it('takes a picture off its note', async () => {
        const list = await createList('Shed');
        const withImages = { ...list, images: ['a', 'b'] };

        await removeNoteImage(withImages, 'a');

        expect((await db.someday_lists.get(list.id))!.images).toEqual(['b']);
    });
});
