/**
 * "Add picture" lives in a note's ⋮ menu (F34), away from the note's
 * pictures and their hidden file input. Each shown note registers how to
 * open its input; the menu asks the latest one for that list (the list card
 * when it is open over the column).
 */
const openers = new Map<string, (() => void)[]>();

/** Registers a note's picture picker; returns the function that removes it. */
export function onAddPictureRequest(
    listId: string,
    open: () => void,
): () => void {
    const list = [...(openers.get(listId) ?? []), open];
    openers.set(listId, list);

    return () => {
        const rest = (openers.get(listId) ?? []).filter(
            (item) => item !== open,
        );
        if (rest.length > 0) {
            openers.set(listId, rest);
        } else {
            openers.delete(listId);
        }
    };
}

/** Opens the picture picker of the note shown for `listId`, if any. */
export function requestAddPicture(listId: string): boolean {
    const open = openers.get(listId)?.at(-1);
    open?.();

    return open !== undefined;
}
