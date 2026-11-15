<?php

use App\Actions\Sync\SyncFormat;
use App\Models\SomedayList;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
});

/**
 * Build a full wire record.
 *
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function wireList(array $overrides = []): array
{
    return array_merge([
        'id' => (string) Str::uuid7(),
        'name' => 'Errands',
        'column' => 3,
        'position' => 'a0',
        'created_at' => '2026-11-15T08:35:00.123Z',
        'updated_at' => '2026-11-15T08:35:00.123Z',
        'deleted_at' => null,
    ], $overrides);
}

/**
 * Pushes like the current client, with lists.
 *
 * @param  list<array<string, mixed>>  $lists
 * @param  list<array<string, mixed>>  $tasks
 */
function pushLists(array $lists, array $tasks = []): TestResponse
{
    return test()->postJson(route('sync.push'), ['tasks' => $tasks, 'lists' => $lists], [SyncFormat::HEADER => (string) SyncFormat::DailyRules]);
}

test('push creates a list and pull returns it unchanged', function () {
    $list = wireList();

    pushLists([$list])
        ->assertOk()
        ->assertJsonPath('applied', [])
        ->assertJsonPath('lists_applied', [$list['id']])
        ->assertJsonPath('lists_rejected', []);

    $this->getJson(route('sync.pull'))
        ->assertOk()
        ->assertJsonPath('lists', [$list]);

    expect(SomedayList::find($list['id']))->user_id->toBe($this->user->id);
});

test('a newer update wins and an older one is silently ignored', function () {
    $list = wireList();
    pushLists([$list])->assertJsonPath('lists_applied', [$list['id']]);

    $newer = [...$list, 'name' => 'Groceries', 'updated_at' => '2026-11-15T09:00:00.000Z'];
    pushLists([$newer])->assertJsonPath('lists_applied', [$newer['id']]);

    // An older push is neither applied nor reported as rejected.
    pushLists([$list])
        ->assertJsonPath('lists_applied', [])
        ->assertJsonPath('lists_rejected', []);

    $this->getJson(route('sync.pull'))->assertOk()->assertJsonPath('lists.0.name', 'Groceries');
});

test('a push cannot touch another user\'s list', function () {
    $list = wireList();
    pushLists([$list])->assertJsonPath('lists_applied', [$list['id']]);

    $intruder = User::factory()->create();
    $other = [...$list, 'name' => 'Stolen', 'updated_at' => '2026-11-15T10:00:00.000Z'];

    $this->actingAs($intruder);
    $this->postJson(route('sync.push'), ['tasks' => [], 'lists' => [$other]], [SyncFormat::HEADER => (string) SyncFormat::DailyRules])
        ->assertOk()
        ->assertJsonPath('lists_applied', [])
        ->assertJsonPath('lists_rejected', [$other['id']]);

    $this->actingAs($this->user);
    $this->getJson(route('sync.pull'))->assertOk()->assertJsonPath('lists.0.name', 'Errands');
});

test('pull returns tombstoned lists with their deletion time', function () {
    $list = wireList();
    pushLists([$list])->assertJsonPath('lists_applied', [$list['id']]);

    $tombstone = [...$list, 'updated_at' => '2026-11-15T10:00:00.000Z', 'deleted_at' => '2026-11-15T10:00:00.000Z'];
    pushLists([$tombstone])->assertJsonPath('lists_applied', [$tombstone['id']]);

    $this->getJson(route('sync.pull'))->assertOk()->assertJsonPath('lists', [$tombstone]);
});

test('a someday task can live in a column beyond the original two', function () {
    $task = wireTask(['date' => null, 'someday_column' => 5]);

    push([$task])->assertOk()->assertJsonPath('applied', [$task['id']]);

    pull()->assertOk()->assertJsonPath('tasks.0.someday_column', 5);
});

test('pushes without lists keep syncing tasks', function () {
    $task = wireTask();

    push([$task])
        ->assertOk()
        ->assertJsonPath('applied', [$task['id']])
        ->assertJsonPath('lists_applied', [])
        ->assertJsonPath('lists_rejected', []);

    // An explicit empty lists array behaves like no lists at all.
    $this->postJson(route('sync.push'), ['tasks' => [], 'lists' => []], [SyncFormat::HEADER => (string) SyncFormat::DailyRules])
        ->assertOk()
        ->assertJsonPath('lists_applied', []);
});

test('invalid list records are rejected', function (array $list) {
    pushLists([$list], [wireTask()])->assertUnprocessable();
})->with([
    'missing id' => [wireList(['id' => null])],
    'invalid uuid' => [wireList(['id' => 'nope'])],
    'empty name' => [wireList(['name' => ''])],
    'name too long' => [wireList(['name' => str_repeat('a', 61)])],
    'column below the someday area' => [wireList(['column' => 2])],
]);
