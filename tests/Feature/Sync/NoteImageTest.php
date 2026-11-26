<?php

use App\Models\NoteImage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function () {
    Storage::fake('local');
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
});

function uploadImage(string $id, ?UploadedFile $file = null)
{
    return test()->post(route('sync.images.store'), [
        'id' => $id,
        'image' => $file ?? UploadedFile::fake()->image('photo.jpg', 40, 30),
    ], ['Accept' => 'application/json']);
}

test('a picture is stored under its id and served back to its owner', function () {
    $id = (string) Str::uuid7();

    uploadImage($id)->assertCreated()->assertJsonPath('id', $id);

    $image = NoteImage::findOrFail($id);
    expect($image->user_id)->toBe($this->user->id);
    Storage::disk('local')->assertExists("note-images/{$this->user->id}/{$id}");

    $this->get(route('sync.images.show', $id))
        ->assertOk()
        ->assertHeader('Content-Type', 'image/jpeg');
});

test('a retried upload is accepted without storing it twice', function () {
    $id = (string) Str::uuid7();
    uploadImage($id)->assertCreated();
    uploadImage($id)->assertOk();

    expect(NoteImage::count())->toBe(1);
});

test('another user can neither read nor overwrite a picture', function () {
    $id = (string) Str::uuid7();
    uploadImage($id)->assertCreated();

    $this->actingAs(User::factory()->create());
    $this->get(route('sync.images.show', $id))->assertNotFound();
    uploadImage($id)->assertForbidden();
});

test('only pictures within the size limit are accepted', function () {
    uploadImage((string) Str::uuid7(), UploadedFile::fake()->create('notes.pdf', 10, 'application/pdf'))
        ->assertUnprocessable();
    uploadImage((string) Str::uuid7(), UploadedFile::fake()->image('big.jpg')->size(5000))
        ->assertUnprocessable();
});

test('deleting the account deletes its pictures', function () {
    $id = (string) Str::uuid7();
    uploadImage($id)->assertCreated();

    $this->user->delete();

    Storage::disk('local')->assertMissing("note-images/{$this->user->id}/{$id}");
});

test('guests cannot upload', function () {
    auth()->logout();

    uploadImage((string) Str::uuid7())->assertUnauthorized();
});
