<?php

namespace App\Models;

use App\Casts\UtcMillisDateTime;
use Carbon\CarbonImmutable;
use Database\Factories\SomedayListFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A named list of the Someday area. The client owns every field except `user_id`; timestamps are client-supplied and
 * `deleted_at` is a sync tombstone, so neither Eloquent timestamps nor soft deletes are used.
 *
 * @property string $id
 * @property int $user_id
 * @property string $name
 * @property int $column
 * @property string $position
 * @property CarbonImmutable $created_at
 * @property CarbonImmutable $updated_at
 * @property CarbonImmutable|null $deleted_at
 */
#[Fillable(['id', 'name', 'column', 'position', 'created_at', 'updated_at', 'deleted_at'])]
class SomedayList extends Model
{
    /** @use HasFactory<SomedayListFactory> */
    use HasFactory;

    public $incrementing = false;

    public $timestamps = false;

    protected $keyType = 'string';

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'column' => 'integer',
            'created_at' => UtcMillisDateTime::class,
            'updated_at' => UtcMillisDateTime::class,
            'deleted_at' => UtcMillisDateTime::class,
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
