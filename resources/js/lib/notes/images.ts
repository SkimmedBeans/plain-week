import { v7 as uuidv7 } from 'uuid';
import { db } from '@/lib/db/database';
import { setListImages } from '@/lib/db/lists';
import type { SomedayList } from '@/lib/db/types';
import { send } from '@/lib/sync/transport';
import { show, store } from '@/routes/sync/images';

/** The longest side of a picture once added (F25). */
export const IMAGE_MAX_SIDE = 1600;

/** The most pictures a note holds (the server enforces the same). */
export const NOTE_IMAGES_MAX = 20;

/**
 * A picture scaled down so its longest side is at most `IMAGE_MAX_SIDE`, as
 * WebP (JPEG where the browser cannot encode WebP). Keeps phone photos to a
 * few hundred kilobytes, well under the server's 4 MB limit.
 */
export async function downscaleImage(file: Blob): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
        1,
        IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
        .getContext('2d')
        ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const encode = (type: string) =>
        new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, type, 0.85),
        );
    const webp = await encode('image/webp');

    if (webp && webp.type === 'image/webp') {
        return webp;
    }

    const jpeg = await encode('image/jpeg');
    if (!jpeg) {
        throw new Error('The picture could not be encoded.');
    }

    return jpeg;
}

/**
 * Adds a picture to a note: downscaled, kept in IndexedDB (so the note shows
 * it at once, offline too), listed on the note (which syncs), and uploaded in
 * the background for the other devices.
 */
export async function addNoteImage(
    list: SomedayList,
    file: Blob,
): Promise<string> {
    const images = list.images ?? [];
    if (images.length >= NOTE_IMAGES_MAX) {
        throw new Error('The note has the most pictures it can hold.');
    }

    const blob = await downscaleImage(file);
    const id = uuidv7();
    await db.note_images.put({ id, blob, uploaded: 0 });
    await setListImages(list.id, [...images, id]);
    void uploadPendingImages();

    return id;
}

/** Takes a picture off a note (its local copy stays until the data is wiped). */
export function removeNoteImage(list: SomedayList, id: string) {
    return setListImages(
        list.id,
        (list.images ?? []).filter((item) => item !== id),
    );
}

let uploading: Promise<void> | null = null;

/**
 * Uploads the pictures added on this device that the server does not have
 * yet. A guest (401) or a failure stops the run; the next one (a new picture,
 * coming back online, a note shown) tries again.
 */
export function uploadPendingImages(): Promise<void> {
    uploading ??= (async () => {
        try {
            const pending = await db.note_images
                .where('uploaded')
                .equals(0)
                .toArray();

            for (const image of pending) {
                const body = new FormData();
                body.append('id', image.id);
                body.append(
                    'image',
                    image.blob,
                    `${image.id}.${image.blob.type === 'image/webp' ? 'webp' : 'jpg'}`,
                );
                await send(store.url(), { method: 'POST', body });
                await db.note_images.update(image.id, { uploaded: 1 });
            }
        } catch {
            // Offline, signed out or refused: retried later.
        } finally {
            uploading = null;
        }
    })();

    return uploading;
}

let listening = false;

/** Retries pending uploads whenever the browser comes back online. */
export function watchImageUploads(): void {
    if (listening || typeof window === 'undefined') {
        return;
    }
    listening = true;
    window.addEventListener('online', () => void uploadPendingImages());
}

/**
 * A note picture's bytes: the local copy, or else the server's (kept locally
 * from then on). Null when it cannot be had now (offline, not uploaded yet
 * by the device that added it, or a guest).
 */
export async function loadNoteImage(id: string): Promise<Blob | null> {
    const local = await db.note_images.get(id);
    if (local) {
        return local.blob;
    }

    try {
        const response = await send(show.url(id), {
            headers: { Accept: 'image/*' },
        });
        const blob = await response.blob();
        await db.note_images.put({ id, blob, uploaded: 1 });

        return blob;
    } catch {
        return null;
    }
}
