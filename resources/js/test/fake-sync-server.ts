import { compareTimestamps } from '@/lib/db/dates';
import type { SomedayList, Task } from '@/lib/db/types';

type StoredTask = Task & { version: number };

/**
 * An in-memory implementation of the sync contract (POST /sync/push,
 * GET /sync/pull), exposed as a `fetch` replacement.
 */
export function createFakeSyncServer() {
    const rows = new Map<string, StoredTask>();
    const lists = new Map<string, SomedayList>();
    let version = 0;
    const server = {
        rows,
        /** Every list, including tombstones (the pull repeats all of them). */
        lists,
        requests: [] as Array<{ url: string; init?: RequestInit }>,
        /** Status to answer every request with instead of handling it. */
        failWith: null as number | null,
        /** Status to answer pushes only with (e.g. 419 for a lost session). */
        failPushWith: null as number | null,
        /** Push batches containing a matching task are refused with 422. */
        isInvalid: (() => false) as (task: Task) => boolean,
        /** Push batches containing a matching list are refused with 422. */
        isInvalidList: (() => false) as (list: SomedayList) => boolean,
        /** Awaited before answering a push (to simulate a slow network). */
        beforePushResponse: null as (() => Promise<void>) | null,
        /** Stores a record as if another device had pushed it. */
        seed(task: Task) {
            rows.set(task.id, { ...task, version: ++version });
        },
        /** Stores a list as if another device had pushed it. */
        seedList(list: SomedayList) {
            lists.set(list.id, { ...list });
        },
        fetch: async (input: string, init?: RequestInit) => {
            const url = input;

            server.requests.push({ url, init });

            if (server.failWith !== null) {
                return new Response('{}', { status: server.failWith });
            }

            if (url.startsWith('/sync/push') && server.failPushWith !== null) {
                return new Response('{}', { status: server.failPushWith });
            }

            if (url.startsWith('/sync/push')) {
                const body = JSON.parse(init?.body as string) as {
                    tasks: Task[];
                    lists?: SomedayList[];
                };
                const tasks = body.tasks;
                const sentLists = body.lists ?? [];
                const applied: string[] = [];
                const listsApplied: string[] = [];

                if (
                    tasks.some((task) => server.isInvalid(task)) ||
                    sentLists.some((list) => server.isInvalidList(list))
                ) {
                    return Response.json(
                        { message: 'Invalid.', errors: {} },
                        { status: 422 },
                    );
                }

                tasks.forEach((task) => {
                    const stored = rows.get(task.id);

                    if (
                        !stored ||
                        compareTimestamps(task.updated_at, stored.updated_at) >=
                            0
                    ) {
                        server.seed(task);
                        applied.push(task.id);
                    }
                });

                sentLists.forEach((list) => {
                    const stored = lists.get(list.id);

                    if (
                        !stored ||
                        compareTimestamps(list.updated_at, stored.updated_at) >=
                            0
                    ) {
                        server.seedList(list);
                        listsApplied.push(list.id);
                    }
                });

                await server.beforePushResponse?.();

                return Response.json({
                    applied,
                    rejected: [],
                    lists_applied: listsApplied,
                    lists_rejected: [],
                    cursor: version,
                });
            }

            if (url.startsWith('/sync/pull')) {
                const params = new URL(url, 'http://localhost').searchParams;
                const cursor = Number(params.get('cursor'));
                const limit = Number(params.get('limit'));
                const newer = [...rows.values()]
                    .filter((row) => row.version > cursor)
                    .sort((a, b) => a.version - b.version);
                const page = newer.slice(0, limit);

                return Response.json({
                    tasks: page,
                    // The contract repeats the whole list set (including
                    // tombstones) on every page; applying it is idempotent.
                    lists: [...lists.values()],
                    cursor: page.at(-1)?.version ?? cursor,
                    has_more: newer.length > page.length,
                });
            }

            if (url === '/logout') {
                return new Response('<html></html>', { status: 200 });
            }

            return new Response('Not found', { status: 404 });
        },
    };

    return server;
}
