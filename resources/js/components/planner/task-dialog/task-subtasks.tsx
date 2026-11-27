import { CalendarDays, Plus, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { parseDateKey, toDateKey } from '@/lib/db/dates';
import {
    changeSubtasksWithUndo,
    scheduleWithUndo,
} from '@/lib/planner/task-actions';
import { formatLongDate } from '@/lib/planner/format';
import { Input } from '@/components/ui/input';
import { updateSubtasks } from '@/lib/db/tasks';
import type { Subtask } from '@/lib/db/types';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';
import { useTaskEditor } from './task-editor';

const FIELD_CLASS =
    'h-8 flex-1 rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent';

/**
 * Subtasks: the open ones, each with a checkbox, editable text and a delete
 * button, then an "Add subtask..." field that adds on Enter (and stays focused
 * for the next), when it loses focus, or when the dialog closes with text
 * still in it. Done subtasks sit below in a "Completed" section; ticking moves
 * a subtask there and unticking moves it back. Only the view splits them: the
 * stored order stays as it was, so an unticked subtask returns to its place.
 */
export function TaskSubtasks() {
    const { task, write, edit: editTask } = useTaskEditor();
    const addInputRef = useRef<HTMLInputElement>(null);
    const completedId = useId();
    const [scheduling, setScheduling] = useState<string | null>(null);
    const change = (
        update: (subtasks: Subtask[]) => Subtask[],
        onCancel?: () => void,
        record = true,
    ) =>
        editTask(
            (id, scope) =>
                record
                    ? changeSubtasksWithUndo(id, update, scope)
                    : updateSubtasks(id, update, { scope }),
            {
                onCancel,
            },
        );

    const edit = (
        id: string,
        patch: Partial<Omit<Subtask, 'id'>>,
        onCancel?: () => void,
    ) =>
        change(
            (subtasks) =>
                subtasks.map((subtask) =>
                    subtask.id === id ? { ...subtask, ...patch } : subtask,
                ),
            onCancel,
            patch.done !== undefined,
        );

    const remove = (id: string) =>
        change((subtasks) => subtasks.filter((subtask) => subtask.id !== id));

    const add = (input: HTMLInputElement) => {
        const text = input.value.trim();

        if (text === '') {
            return;
        }

        input.value = '';
        change(
            (subtasks) => [...subtasks, { id: uuidv7(), text, done: false }],
            // Not added: give the text back.
            () => {
                input.value = text;
            },
        );
    };

    // Closing the dialog unmounts the field without a blur event.
    useEffect(() => {
        const input = addInputRef.current;

        return () => {
            if (input) {
                add(input);
            }
        };
        // `add` writes through the dialog's editor, which follows the task.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const renderSubtask = (subtask: Subtask) => (
        <li key={subtask.id} className="group/subtask flex items-center gap-2">
            <Checkbox
                checked={subtask.done}
                aria-label={t('task.completeSubtask', { text: subtask.text })}
                onCheckedChange={(checked) =>
                    edit(subtask.id, { done: checked === true })
                }
                className="rounded-full"
            />
            <Input
                aria-label={t('task.subtask')}
                defaultValue={subtask.text}
                onChange={(event) => {
                    const field = event.target;
                    const text = field.value;

                    if (text.trim() !== '') {
                        edit(subtask.id, { text }, () => {
                            field.value = subtask.text;
                        });
                    }
                }}
                onKeyDown={(event) => {
                    if (
                        event.key === 'Enter' &&
                        !event.nativeEvent.isComposing
                    ) {
                        event.preventDefault();
                        addInputRef.current?.focus();
                    }
                }}
                onBlur={(event) => {
                    // Emptied: put the saved text back.
                    if (event.target.value.trim() === '') {
                        event.target.value = subtask.text;
                    }
                }}
                className={cn(
                    FIELD_CLASS,
                    subtask.done && 'text-muted-foreground line-through',
                )}
            />
            {task.kind === 'task' && task.date === null && (
                <Popover
                    open={scheduling === subtask.id}
                    onOpenChange={(open) =>
                        setScheduling(open ? subtask.id : null)
                    }
                >
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={t('planner.addToDay')}
                            title={
                                subtask.week_slot
                                    ? formatLongDate(subtask.week_slot.date)
                                    : t('planner.addToDay')
                            }
                        >
                            <CalendarDays />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                            mode="single"
                            weekStartsOn={1}
                            defaultMonth={
                                subtask.week_slot
                                    ? parseDateKey(subtask.week_slot.date)
                                    : undefined
                            }
                            selected={
                                subtask.week_slot
                                    ? parseDateKey(subtask.week_slot.date)
                                    : undefined
                            }
                            onSelect={(date) => {
                                if (date) {
                                    setScheduling(null);
                                    write((id) =>
                                        scheduleWithUndo(
                                            id,
                                            toDateKey(date),
                                            subtask.id,
                                        ),
                                    );
                                }
                            }}
                        />
                    </PopoverContent>
                </Popover>
            )}
            <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t('task.deleteSubtask', { text: subtask.text })}
                onClick={() => remove(subtask.id)}
                className="rounded-full text-muted-foreground pointer-fine:opacity-0 pointer-fine:group-focus-within/subtask:opacity-100 pointer-fine:group-hover/subtask:opacity-100"
            >
                <X />
            </Button>
        </li>
    );

    const open = task.subtasks.filter((subtask) => !subtask.done);
    const done = task.subtasks.filter((subtask) => subtask.done);

    return (
        // Its checkboxes and buttons keep their keys (`data-own-keys`):
        // Delete there must not delete the task.
        <div data-own-keys className="flex flex-col">
            <ul className="flex flex-col">
                {open.map(renderSubtask)}
                <li className="flex items-center gap-2 text-muted-foreground">
                    <Plus className="size-4 shrink-0" />
                    <Input
                        ref={addInputRef}
                        data-add-subtask
                        aria-label={t('task.addSubtask')}
                        onBlur={(event) => add(event.currentTarget)}
                        placeholder={t('task.addSubtaskPlaceholder')}
                        enterKeyHint="enter"
                        onKeyDown={(event) => {
                            if (
                                event.key === 'Enter' &&
                                !event.nativeEvent.isComposing
                            ) {
                                event.preventDefault();
                                add(event.currentTarget);
                            }
                        }}
                        className={FIELD_CLASS}
                    />
                </li>
            </ul>
            {done.length > 0 && (
                <section aria-labelledby={completedId} className="mt-3">
                    <h3
                        id={completedId}
                        className="text-xs font-medium text-muted-foreground"
                    >
                        Completed ({done.length})
                    </h3>
                    <ul className="flex flex-col">{done.map(renderSubtask)}</ul>
                </section>
            )}
        </div>
    );
}
