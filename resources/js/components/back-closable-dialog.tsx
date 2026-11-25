import { useState } from 'react';
import type { ComponentProps } from 'react';
import { AlertDialog as UiAlertDialog } from '@/components/ui/alert-dialog';
import { Dialog as UiDialog } from '@/components/ui/dialog';
import { Sheet as UiSheet } from '@/components/ui/sheet';
import { useBackToClose } from '@/hooks/use-back-to-close';

type RootProps = {
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
};

/**
 * The open state of a dialog root, controlled or not, with the system Back
 * gesture closing it (F27).
 */
function useBackClosableRoot({ open, defaultOpen, onOpenChange }: RootProps) {
    const [inner, setInner] = useState(defaultOpen ?? false);
    const isOpen = open ?? inner;
    const change = (next: boolean) => {
        if (open === undefined) {
            setInner(next);
        }
        onOpenChange?.(next);
    };

    useBackToClose(isOpen, () => change(false));

    return { open: isOpen, onOpenChange: change };
}

/** shadcn's `Dialog` root; Back closes it. */
export function Dialog(props: ComponentProps<typeof UiDialog>) {
    return <UiDialog {...props} {...useBackClosableRoot(props)} />;
}

/** shadcn's `AlertDialog` root; Back closes it. */
export function AlertDialog(props: ComponentProps<typeof UiAlertDialog>) {
    return <UiAlertDialog {...props} {...useBackClosableRoot(props)} />;
}

/** shadcn's `Sheet` root; Back closes it. */
export function Sheet(props: ComponentProps<typeof UiSheet>) {
    return <UiSheet {...props} {...useBackClosableRoot(props)} />;
}
