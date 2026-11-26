<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Pictures in notes (F25). The file lives on the local disk at
        // note-images/{user_id}/{id}; this row says whose it is and its type.
        Schema::create('note_images', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('mime', 32);
            $table->unsignedInteger('size');
            $table->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('note_images');
    }
};
