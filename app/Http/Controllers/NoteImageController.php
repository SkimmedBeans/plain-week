<?php

namespace App\Http\Controllers;

use App\Models\NoteImage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Pictures in notes (F25). The client downscales a picture, keeps it in
 * IndexedDB, and uploads it here under the id it chose; other devices fetch
 * it by that id when a synced note lists it.
 */
class NoteImageController extends Controller
{
    /** The largest upload, in kilobytes (pictures are downscaled first). */
    public const MAX_KILOBYTES = 4096;

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'id' => ['required', 'string', 'uuid', 'lowercase'],
            'image' => ['required', 'file', 'mimetypes:image/jpeg,image/png,image/webp', 'max:'.self::MAX_KILOBYTES],
        ]);

        /** @var UploadedFile $file */
        $file = $validated['image'];
        $userId = $request->user()->id;
        $existing = NoteImage::query()->whereKey($validated['id'])->first();

        if ($existing !== null) {
            // An upload retried after its answer was lost: already stored.
            abort_unless($existing->user_id === $userId, 403);

            return response()->json(['id' => $existing->id]);
        }

        $image = new NoteImage([
            'id' => $validated['id'],
            'mime' => (string) $file->getMimeType(),
            'size' => (int) $file->getSize(),
        ]);
        $image->user_id = $userId;

        Storage::disk('local')->putFileAs(NoteImage::directoryFor($userId), $file, $image->id);
        $image->save();

        return response()->json(['id' => $image->id], 201);
    }

    public function show(Request $request, string $image): StreamedResponse
    {
        $found = NoteImage::query()
            ->whereKey($image)
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        abort_unless(Storage::disk('local')->exists($found->path()), 404);

        return Storage::disk('local')->response($found->path(), null, [
            'Content-Type' => $found->mime,
            // The id never changes what it points to.
            'Cache-Control' => 'private, max-age=31536000, immutable',
        ]);
    }
}
