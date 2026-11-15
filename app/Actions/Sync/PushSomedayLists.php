<?php

namespace App\Actions\Sync;

use App\Models\SomedayList;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class PushSomedayLists
{
    /**
     * Upsert client records for the user with last-write-wins on `updated_at`.
     *
     * Records whose id belongs to another user are rejected. Records older than the stored row are skipped silently
     * (they are neither applied nor rejected).
     *
     * @param  list<array<string, mixed>>  $records  Validated wire records.
     * @return array{applied: list<string>, rejected: list<string>}
     */
    public function handle(User $user, array $records): array
    {
        $applied = [];
        $rejected = [];

        if ($records !== []) {
            DB::transaction(function () use ($user, $records, &$applied, &$rejected) {
                /** @var array<string, SomedayList> $stored */
                $stored = SomedayList::query()
                    ->whereIn('id', array_column($records, 'id'))
                    ->get()
                    ->keyBy('id')
                    ->all();

                foreach ($records as $record) {
                    $id = $record['id'];
                    $list = $stored[$id] ?? null;

                    if ($list !== null && $list->user_id !== $user->id) {
                        $rejected[] = $id;

                        continue;
                    }

                    if ($list !== null && CarbonImmutable::parse($record['updated_at'], 'UTC')->lt($list->updated_at)) {
                        continue;
                    }

                    $list ??= new SomedayList;
                    $list->fill($record);
                    $list->user_id = $user->id;
                    $list->save();

                    $stored[$id] = $list;
                    $applied[] = $id;
                }
            });
        }

        return [
            'applied' => array_values(array_unique($applied)),
            'rejected' => array_values(array_unique($rejected)),
        ];
    }
}
