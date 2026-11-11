import { describe, expect, it, vi, afterEach } from 'vitest';
import {
    HttpTimeoutError,
    createHttpRPC,
    httpCallOptions,
} from './httpTransport';
import { RPCError, createRPC, isStreamResult } from './rpc';

function jsonLine(payload: unknown): Response {
    return new Response(`${JSON.stringify(payload)}\n`, {
        status: 200,
        headers: { 'content-type': 'application/json' },
    });
}

function ok(result: unknown): Response {
    return jsonLine({ jsonrpc: '2.0', id: 1, result });
}

function hang(init: RequestInit | undefined): Promise<Response> {
    return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        const abort = () => {
            reject(signal.reason instanceof Error
                ? signal.reason
                : new DOMException('The operation was aborted.', 'AbortError'));
        };
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
    });
}

afterEach(() => {
    vi.useRealTimers();
});

describe('HTTP client timeout and abort', () => {
    it('waits without a timeout', async () => {
        vi.useFakeTimers();
        const client = createHttpRPC({
            fetchImpl: async () => {
                await new Promise((resolve) => setTimeout(resolve, 5_000));
                return ok(7);
            },
        });
        const pending = client.call<number>('add', 1, 2);
        await vi.advanceTimersByTimeAsync(5_000);
        await expect(pending).resolves.toBe(7);
    });

    it('uses the client timeout and can override it per call', async () => {
        vi.useFakeTimers();
        const client = createRPC({
            transport: 'http',
            timeout: 1_000,
            fetchImpl: (_input, init) => hang(init),
        });

        const timedOut = client.call('slow', httpCallOptions({ timeout: 250 }));
        await vi.advanceTimersByTimeAsync(249);
        let settled = false;
        void timedOut.then(() => { settled = true; }, () => { settled = true; });
        await vi.advanceTimersByTimeAsync(0);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        const error = await timedOut.then(
            () => { throw new Error('expected timeout'); },
            (err: unknown) => err,
        );
        expect(error).toBeInstanceOf(HttpTimeoutError);
        expect(error).toMatchObject({ name: 'HttpTimeoutError', timeout: 250 });
        expect((error as Error).name).not.toBe('AbortError');
    });

    it('lets a non-positive per-call timeout disable the client timeout', async () => {
        vi.useFakeTimers();
        const client = createHttpRPC({
            timeout: 100,
            fetchImpl: async () => {
                await new Promise((resolve) => setTimeout(resolve, 500));
                return ok('later');
            },
        });
        const pending = client.call('add', httpCallOptions({ timeout: 0 }));
        await vi.advanceTimersByTimeAsync(500);
        await expect(pending).resolves.toBe('later');
    });

    it('rejects with AbortError when the caller signal aborts', async () => {
        const client = createHttpRPC({
            timeout: 10_000,
            fetchImpl: (_input, init) => hang(init),
        });
        const controller = new AbortController();
        const pending = client.call('add', 1, httpCallOptions({
            timeout: 10_000,
            signal: controller.signal,
        }));
        controller.abort();
        const error = await pending.then(
            () => { throw new Error('expected abort'); },
            (err: unknown) => err,
        );
        expect(error).toBeInstanceOf(DOMException);
        expect((error as DOMException).name).toBe('AbortError');
        expect(error).not.toBeInstanceOf(HttpTimeoutError);
    });

    it('timeout wins when it fires before the caller signal', async () => {
        vi.useFakeTimers();
        const client = createHttpRPC({
            fetchImpl: (_input, init) => hang(init),
        });
        const controller = new AbortController();
        const pending = client.call('add', httpCallOptions({
            timeout: 100,
            signal: controller.signal,
        }));
        const assertion = expect(pending).rejects.toBeInstanceOf(HttpTimeoutError);
        await vi.advanceTimersByTimeAsync(100);
        await assertion;
        controller.abort();
    });

    it('does not abort a finished call when the timer would have fired', async () => {
        vi.useFakeTimers();
        let aborts = 0;
        const client = createHttpRPC({
            fetchImpl: async (_input, init) => {
                init?.signal?.addEventListener('abort', () => { aborts += 1; });
                return ok(1);
            },
        });
        await expect(client.call('add', 1, httpCallOptions({ timeout: 100 }))).resolves.toBe(1);
        await vi.advanceTimersByTimeAsync(500);
        expect(aborts).toBe(0);
    });

    it('leaves network and HTTP failures distinct from timeout and abort', async () => {
        const network = createHttpRPC({
            timeout: 5_000,
            fetchImpl: async () => { throw new TypeError('network down'); },
        });
        const networkError = await network.call('add', 1).then(
            () => { throw new Error('expected network error'); },
            (err: unknown) => err,
        );
        expect(networkError).toBeInstanceOf(TypeError);
        expect(networkError).not.toBeInstanceOf(HttpTimeoutError);

        const http = createHttpRPC({
            fetchImpl: async () => new Response('nope', { status: 503, statusText: 'Unavailable' }),
        });
        const httpError = await http.call('add', 1).then(
            () => { throw new Error('expected HTTP error'); },
            (err: unknown) => err,
        );
        expect(httpError).toBeInstanceOf(Error);
        expect((httpError as Error).message).toContain('HTTP 503');
        expect(httpError).not.toBeInstanceOf(HttpTimeoutError);
    });

    it('keeps a final plain object as a parameter', async () => {
        let params: unknown;
        const client = createHttpRPC({
            fetchImpl: async (_input, init) => {
                params = JSON.parse(String(init?.body)).params;
                return ok(true);
            },
        });
        await client.call('echo', { timeout: 5, signal: 'nope' });
        expect(params).toEqual([{ timeout: 5, signal: 'nope' }]);
    });

    it('aborts a streaming response on timeout or caller abort', async () => {
        vi.useFakeTimers();
        const streamOf = (init: RequestInit | undefined): Response => {
            const signal = init?.signal;
            const encoder = new TextEncoder();
            const body = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(encoder.encode(
                        `${JSON.stringify({ jsonrpc: '2.0', id: 1, done: false, index: 0, value: 'a' })}\n`,
                    ));
                },
                pull() {
                    return new Promise((_resolve, reject) => {
                        if (!signal) return;
                        const abort = () => reject(signal.reason);
                        if (signal.aborted) abort();
                        else signal.addEventListener('abort', abort, { once: true });
                    });
                },
            });
            return new Response(body, { status: 200 });
        };

        const timed = createHttpRPC({
            fetchImpl: (_input, init) => Promise.resolve(streamOf(init)),
        });
        const timedGen = await timed.call<string>('tail', httpCallOptions({ timeout: 100 }));
        expect(isStreamResult(timedGen)).toBe(true);
        await expect(timedGen.next()).resolves.toMatchObject({ value: 'a', done: false });
        const timedNext = timedGen.next();
        const timedAssertion = expect(timedNext).rejects.toBeInstanceOf(HttpTimeoutError);
        await vi.advanceTimersByTimeAsync(100);
        await timedAssertion;

        vi.useRealTimers();
        const controller = new AbortController();
        const aborted = createHttpRPC({
            fetchImpl: (_input, init) => Promise.resolve(streamOf(init)),
        });
        const abortedGen = await aborted.call<string>('tail', httpCallOptions({
            signal: controller.signal,
        }));
        if (!isStreamResult(abortedGen)) throw new Error('expected a stream');
        await expect(abortedGen.next()).resolves.toMatchObject({ value: 'a', done: false });
        const abortedNext = abortedGen.next();
        controller.abort();
        const abortedError = await abortedNext.then(
            () => { throw new Error('expected abort'); },
            (err: unknown) => err,
        );
        expect((abortedError as Error).name).toBe('AbortError');
        expect(abortedError).not.toBeInstanceOf(HttpTimeoutError);
    });

    it('still returns RPC errors from a timed client', async () => {
        const client = createHttpRPC({
            timeout: 1_000,
            fetchImpl: async () => jsonLine({
                jsonrpc: '2.0',
                id: 1,
                error: { code: -32601, message: 'Method not found' },
            }),
        });
        const error = await client.call('missing').then(
            () => { throw new Error('expected RPC error'); },
            (err: unknown) => err,
        );
        expect(error).toBeInstanceOf(RPCError);
        expect((error as RPCError).code).toBe(-32601);
    });
});
