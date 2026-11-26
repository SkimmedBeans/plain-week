<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('someday_lists', function (Blueprint $table) {
            // The ids of a note's pictures (F25), in order; see note_images.
            $table->json('images')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('someday_lists', function (Blueprint $table) {
            $table->dropColumn('images');
        });
    }
};
