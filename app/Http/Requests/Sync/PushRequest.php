<?php

namespace App\Http\Requests\Sync;

use App\Casts\UtcMillisDateTime;
use App\Enums\TaskColor;
use App\Models\TaskLabel;
use App\Tasks\TaskRecordRules;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class PushRequest extends FormRequest
{
    /**
     * The maximum number of records accepted in one push.
     */
    public const int MAX_RECORDS = 500;

    /**
     * Get the validation rules that apply to the request. The task record rules are shared with server-side writes
     * ({@see TaskRecordRules}). `labels` is optional: clients before sync format 3 never send it.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $timestamp = 'date_format:'.UtcMillisDateTime::WIRE_FORMAT;
        $labelColors = array_values(array_filter(TaskColor::cases(), fn (TaskColor $color) => $color->isLabel()));

        return [
            'tasks' => ['present', 'list', 'max:'.self::MAX_RECORDS],
            'tasks.*' => ['required', 'array'],
            ...TaskRecordRules::rules('tasks.*.'),
            // The fork widens the Someday column range: 0-2 are Someday, 3 and up are named lists.
            'tasks.*.someday_column' => ['present', 'nullable', 'required_if:tasks.*.date,null', 'integer', 'between:0,10000'],
            // Lists are optional so clients from before the Someday lists change keep syncing tasks only.
            'lists' => ['sometimes', 'list', 'max:'.self::MAX_RECORDS],
            'lists.*' => ['required', 'array'],
            'lists.*.id' => ['required', 'string', 'uuid', 'lowercase'],
            'lists.*.name' => ['required', 'string', 'min:1', 'max:60'],
            'lists.*.color' => ['sometimes', 'required', Rule::enum(TaskColor::class)],
            'lists.*.archived' => ['sometimes', 'boolean'],
            'lists.*.note' => ['sometimes', 'nullable', 'string', 'max:20000'],
            'lists.*.images' => ['sometimes', 'array', 'max:20'],
            'lists.*.images.*' => ['string', 'uuid', 'lowercase'],
            'lists.*.column' => ['required', 'integer', 'min:3'],
            'lists.*.position' => ['required', 'string', 'max:255'],
            'lists.*.created_at' => ['required', $timestamp],
            'lists.*.updated_at' => ['required', $timestamp],
            'lists.*.deleted_at' => ['present', 'nullable', $timestamp],
            // Labels are optional so clients from before sync format 3 keep syncing tasks only.
            'labels' => ['sometimes', 'list', 'max:'.count($labelColors)],
            'labels.*' => ['required', 'array:color,name,updated_at'],
            'labels.*.color' => ['required', 'distinct', Rule::enum(TaskColor::class)->only($labelColors)],
            'labels.*.name' => ['present', 'string', $this->labelNameLength(...)],
            'labels.*.updated_at' => ['required', 'date_format:'.UtcMillisDateTime::WIRE_FORMAT],
        ];
    }

    /**
     * A label name is at most {@see TaskLabel::MAX_NAME_LENGTH} characters once trimmed.
     */
    private function labelNameLength(string $attribute, mixed $value, Closure $fail): void
    {
        if (is_string($value) && mb_strlen(trim($value)) > TaskLabel::MAX_NAME_LENGTH) {
            $fail("The {$attribute} field must not be greater than ".TaskLabel::MAX_NAME_LENGTH.' characters.');
        }
    }

    /**
     * Check the recurrence invariants that span several fields of a record ({@see TaskRecordRules::violations}).
     *
     * @return array<int, callable(Validator): void>
     */
    public function after(): array
    {
        return [
            fn (Validator $validator) => TaskRecordRules::checkInvariants($validator, 'tasks'),
        ];
    }

    /**
     * The validated wire records.
     *
     * @return list<array<string, mixed>>
     */
    public function records(): array
    {
        /** @var list<array<string, mixed>> */
        return $this->validated('tasks');
    }

    /**
     * The validated wire records of the Someday lists, or null when the client sent none.
     *
     * @return list<array<string, mixed>>|null
     */
    public function lists(): ?array
    {
        $lists = $this->validated('lists');

        return $lists === [] ? null : $lists;
    }

    /**
     * The validated label records (none from clients that do not sync labels).
     *
     * @return list<array{color: string, name: string, updated_at: string}>
     */
    public function labels(): array
    {
        /** @var list<array{color: string, name: string, updated_at: string}> */
        return $this->validated('labels', []);
    }
}
