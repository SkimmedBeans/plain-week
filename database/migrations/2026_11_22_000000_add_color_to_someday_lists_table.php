<?php

use App\Enums\TaskColor;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('someday_lists', function (Blueprint $table) {
            $table->string('color')->default(TaskColor::None->value);
        });
    }

    public function down(): void
    {
        Schema::table('someday_lists', function (Blueprint $table) {
            $table->dropColumn('color');
        });
    }
};
