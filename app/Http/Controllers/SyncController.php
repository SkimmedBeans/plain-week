<?php

namespace App\Http\Controllers;

use App\Actions\Sync\PullTasks;
use App\Actions\Sync\PushSomedayLists;
use App\Actions\Sync\PushTasks;
use App\Actions\Sync\SyncFormat;
use App\Http\Requests\Sync\PullRequest;
use App\Http\Requests\Sync\PushRequest;
use App\Http\Resources\SomedayListResource;
use App\Http\Resources\TaskResource;
use App\Jobs\SyncGoogleCalendar;
use Illuminate\Http\JsonResponse;

class SyncController extends Controller
{
    /**
     * Apply a batch of client records.
     */
    public function push(PushRequest $request, PushTasks $pushTasks, PushSomedayLists $pushSomedayLists): JsonResponse
    {
        $result = $pushTasks->handle($request->user(), $request->records(), SyncFormat::fromRequest($request));

        $lists = $pushSomedayLists->handle($request->user(), $request->lists() ?? []);
        $result['lists_applied'] = $lists['applied'];
        $result['lists_rejected'] = $lists['rejected'];

        if ($result['applied'] !== []) {
            SyncGoogleCalendar::dispatchFor($request->user(), SyncGoogleCalendar::DEBOUNCE_SECONDS);
        }

        return response()->json($result);
    }

    /**
     * Return the user's changes after the given cursor.
     */
    public function pull(PullRequest $request, PullTasks $pullTasks): JsonResponse
    {
        $result = $pullTasks->handle($request->user(), $request->cursor(), $request->limit(), SyncFormat::fromRequest($request));

        return response()->json([
            'tasks' => TaskResource::collection($result['tasks']),
            // Lists are few, so every pull returns all of the user's lists, tombstones included, with no cursor.
            'lists' => SomedayListResource::collection($request->user()->somedayLists()->get()),
            'cursor' => $result['cursor'],
            'has_more' => $result['has_more'],
        ]);
    }
}
