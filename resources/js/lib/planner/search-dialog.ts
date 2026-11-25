/**
 * Whether the search dialog (F33) is open: an external store, so `/` and the
 * header's search button can open it.
 */

const listeners = new Set<() => void>();
let open = false;

function setOpen(value: boolean) {
    open = value;
    listeners.forEach((listener) => listener());
}

export const searchDialogStore = {
    subscribe: (listener: () => void) => {
        listeners.add(listener);

        return () => {
            listeners.delete(listener);
        };
    },
    isOpen: () => open,
    open: () => setOpen(true),
    close: () => setOpen(false),
};
