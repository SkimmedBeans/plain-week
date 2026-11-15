<?php

namespace Database\Factories;

use App\Models\SomedayList;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<SomedayList>
 */
class SomedayListFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $createdAt = now()->utc()->subMinutes(fake()->numberBetween(1, 10_000));

        return [
            'id' => (string) Str::uuid7(),
            'user_id' => User::factory(),
            'name' => fake()->sentence(2),
            'column' => 0,
            'position' => 'a0',
            'created_at' => $createdAt,
            'updated_at' => $createdAt,
            'deleted_at' => null,
        ];
    }

    /**
     * Indicate that the list has been deleted (tombstone).
     */
    public function deleted(): static
    {
        return $this->state(fn (array $attributes) => ['deleted_at' => $attributes['updated_at']]);
    }
}
