<?php

namespace App\Http\Requests\Sync;

use App\Casts\UtcMillisDateTime;
use App\Enums\TaskColor;
use App\Tasks\TaskRecordRules;
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
     * Get the validation rules that apply to the request. The record rules are shared with server-side writes
     * ({@see TaskRecordRules}).
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $timestamp = 'date_format:'.UtcMillisDateTime::WIRE_FORMAT;

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
            'lists.*.column' => ['required', 'integer', 'min:3'],
            'lists.*.position' => ['required', 'string', 'max:255'],
            'lists.*.created_at' => ['required', $timestamp],
            'lists.*.updated_at' => ['required', $timestamp],
            'lists.*.deleted_at' => ['present', 'nullable', $timestamp],
        ];
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
}
