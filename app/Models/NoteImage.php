<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A picture in a note (F25). The bytes are on the local disk at `path()`.
 *
 * @property string $id
 * @property int $user_id
 * @property string $mime
 * @property int $size
 * @property CarbonImmutable|null $created_at
 */
#[Fillable(['id', 'mime', 'size'])]
class NoteImage extends Model
{
    public const UPDATED_AT = null;

    public $incrementing = false;

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
            'size' => 'integer',
            'created_at' => 'immutable_datetime',
        ];
    }

    /** The folder on the local disk that holds a user's pictures. */
    public static function directoryFor(int $userId): string
    {
        return "note-images/{$userId}";
    }

    /** Where this picture's bytes are on the local disk. */
    public function path(): string
    {
        return self::directoryFor($this->user_id).'/'.$this->id;
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
