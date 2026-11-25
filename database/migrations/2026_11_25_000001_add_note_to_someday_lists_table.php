<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('someday_lists', function (Blueprint $table) {
            // A named list converted to a note (F24) keeps its free text here;
            // null is an ordinary task list.
            $table->text('note')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('someday_lists', function (Blueprint $table) {
            $table->dropColumn('note');
        });
    }
};
