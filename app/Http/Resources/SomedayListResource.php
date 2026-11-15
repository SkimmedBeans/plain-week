<?php

namespace App\Http\Resources;

use App\Casts\UtcMillisDateTime;
use App\Models\SomedayList;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The sync wire shape of a Someday list (snake_case, ISO-8601 UTC timestamps with milliseconds).
 *
 * @mixin SomedayList
 */
class SomedayListResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'column' => $this->column,
            'position' => $this->position,
            'created_at' => $this->created_at->format(UtcMillisDateTime::WIRE_FORMAT),
            'updated_at' => $this->updated_at->format(UtcMillisDateTime::WIRE_FORMAT),
            'deleted_at' => $this->deleted_at?->format(UtcMillisDateTime::WIRE_FORMAT),
        ];
    }
}
