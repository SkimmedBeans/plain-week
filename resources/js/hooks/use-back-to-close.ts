import { useEffect, useRef } from 'react';
import { openBackClosable } from '@/lib/history/back-close';

/**
 * While `open`, the system Back gesture (Android back, the browser's Back)
 * runs `close` instead of leaving the page (F27). See `lib/history/back-close`.
 */
export function useBackToClose(open: boolean, close: () => void): void {
    const latest = useRef(close);

    useEffect(() => {
        latest.current = close;
    });

    useEffect(() => {
        if (!open) {
            return;
        }

        return openBackClosable(() => latest.current());
    }, [open]);
}
