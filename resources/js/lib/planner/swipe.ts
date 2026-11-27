/** Sets the final position before animating so cancellation leaves a stable surface. */
export function animateSwipe(
    surface: HTMLElement,
    offset: number,
    duration: number,
): Animation | undefined {
    const from = surface.style.translate || '0px';
    const to = offset + 'px';
    surface.style.translate = to;

    if (from !== to && typeof surface.animate === 'function') {
        const animation = surface.animate(
            [{ translate: from }, { translate: to }],
            {
                duration: window.matchMedia('(prefers-reduced-motion: reduce)')
                    .matches
                    ? Math.min(duration, 85)
                    : duration,
                easing: 'ease-out',
            },
        );
        void animation.finished.catch(() => {});
        return animation;
    }
}
