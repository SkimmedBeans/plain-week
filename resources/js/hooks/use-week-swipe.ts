import { useRef } from 'react';
import type { MouseEvent, PointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { animateSwipe } from '@/lib/planner/swipe';

const AXIS_THRESHOLD = 10;
const COMMIT_DISTANCE = 48;
const EXIT_DURATION = 105;
const SNAP_DURATION = 145;

type Gesture = { id: number; x: number; y: number; horizontal: boolean };

export function useWeekSwipe(
    enabled: boolean,
    previousWeek: () => void,
    nextWeek: () => void,
) {
    const surface = useRef<HTMLElement>(null);
    const gesture = useRef<Gesture | null>(null);
    const settling = useRef(false);
    const suppressClick = useRef(false);

    const onPointerDownCapture = (event: PointerEvent) => {
        if (event.isPrimary) {
            suppressClick.current = false;
        }
        if (
            !enabled ||
            settling.current ||
            !event.isPrimary ||
            event.pointerType !== 'touch'
        ) {
            return;
        }

        gesture.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            horizontal: false,
        };
    };

    const onPointerMoveCapture = (event: PointerEvent) => {
        const start = gesture.current;
        const page = surface.current;
        if (!start || start.id !== event.pointerId || !page) {
            return;
        }

        const x = event.clientX - start.x;
        const y = Math.abs(event.clientY - start.y);
        if (!start.horizontal) {
            if (Math.hypot(x, y) < AXIS_THRESHOLD) {
                return;
            }
            if (Math.abs(x) <= y * 1.2) {
                gesture.current = null;
                return;
            }
            start.horizontal = true;
        }

        const distance = page.clientWidth;
        page.style.translate =
            Math.max(-distance, Math.min(distance, x)) + 'px';
    };

    const finish = async (event: PointerEvent, cancelled: boolean) => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) {
            return;
        }

        gesture.current = null;
        const page = surface.current;
        if (!start.horizontal || !page) {
            return;
        }

        suppressClick.current = true;
        const x = event.clientX - start.x;
        const commit = !cancelled && Math.abs(x) >= COMMIT_DISTANCE;
        settling.current = true;
        try {
            const width = page.clientWidth;
            const direction = x < 0 ? -1 : 1;
            const out = animateSwipe(
                page,
                commit ? direction * width : 0,
                commit ? EXIT_DURATION : SNAP_DURATION,
            );
            await out?.finished;
            if (commit && page.isConnected) {
                const rtl = getComputedStyle(page).direction === 'rtl';
                flushSync(direction < 0 !== rtl ? nextWeek : previousWeek);
                page.style.translate = -direction * width + 'px';
                await animateSwipe(page, 0, SNAP_DURATION)?.finished;
            }
        } finally {
            page.style.translate = '';
            settling.current = false;
        }
    };

    return {
        surface,
        handlers: {
            onPointerDownCapture,
            onPointerMoveCapture,
            onPointerUpCapture: (event: PointerEvent) =>
                void finish(event, false),
            onPointerCancelCapture: (event: PointerEvent) =>
                void finish(event, true),
            onClickCapture: (event: MouseEvent) => {
                if (suppressClick.current && event.detail > 0) {
                    suppressClick.current = false;
                    event.preventDefault();
                    event.stopPropagation();
                }
            },
        },
    };
}
