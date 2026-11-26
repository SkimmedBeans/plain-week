<?php

use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Vite;

test('the web group limits the preload Link header', function () {
    $web = app(Kernel::class)->getMiddlewareGroups()['web'];

    expect($web)->toContain(AddLinkHeadersForPreloadedAssets::using(8));
});

test('the limited Link header stays well under a proxy header buffer', function () {
    // As many chunks as the planner preloads, with realistic URLs.
    $assets = [];
    for ($i = 0; $i < 40; $i++) {
        $assets["https://plainweek.lan/build/assets/chunk-{$i}-AbCdEfGh.js"] = ['rel="modulepreload"', 'as="script"'];
    }
    $vite = Vite::getFacadeRoot();
    (fn () => $this->preloadedAssets = $assets)->call($vite);

    $response = (new AddLinkHeadersForPreloadedAssets)->handle(
        Request::create('/'),
        fn () => new Response('ok'),
        8,
    );

    $link = $response->headers->get('Link');
    expect(substr_count($link, 'modulepreload'))->toBe(8)
        ->and(strlen($link))->toBeLessThan(1024);
});
