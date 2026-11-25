import { toast } from 'sonner';
import type { Task } from '@/lib/db/types';
import { t } from '@/lib/i18n';
import { listToPlainText } from './list-text';

/**
 * Puts `text` on the clipboard. The async Clipboard API only exists in a
 * secure context, and a self-hosted planner is often opened over plain HTTP
 * on a home network, so a hidden textarea and `execCommand('copy')` are the
 * fallback. Resolves with whether the copy worked.
 */
export async function writeClipboard(text: string): Promise<boolean> {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);

            return true;
        } catch {
            // Denied or unavailable: try the fallback below.
        }
    }

    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.insetInlineStart = '-9999px';
    field.style.opacity = '0';
    const active =
        document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
    document.body.append(field);
    field.select();

    let copied = false;
    try {
        copied = document.execCommand('copy');
    } catch {
        copied = false;
    }

    field.remove();
    active?.focus({ preventScroll: true });

    return copied;
}

/** Copies `text` and confirms it (or the failure) with a short toast. */
export async function copyWithToast(
    text: string,
    success: string,
): Promise<boolean> {
    const copied = await writeClipboard(text);

    if (copied) {
        toast(success);
    } else {
        toast.error(t('planner.copyFailed'));
    }

    return copied;
}

/**
 * Copies a list's tasks as plain text (F23, format in `listToPlainText`), or
 * says there is nothing to copy.
 */
export function copyListTasks(
    tasks: Pick<Task, 'text' | 'done' | 'subtasks'>[],
): Promise<boolean> {
    if (tasks.length === 0) {
        toast(t('planner.listEmptyCopy'));

        return Promise.resolve(false);
    }

    return copyWithToast(
        listToPlainText(tasks, t('planner.completedSection')),
        t('planner.listCopied', { count: tasks.length }),
    );
}
