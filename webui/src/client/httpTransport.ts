import type { RPCResponse } from './types';
import {
    RPCError,
    type RPCClient,
} from './rpc';

export interface HttpRPCOptions {
    endpoint?: string;
    headers?: Record<string, string>;
    fetchImpl?: typeof fetch;
    /**
     * Default HTTP timeout in milliseconds.
     * Omitted, zero, or negative means no limit. A positive per-call `timeout`
     * overrides this value; a non-positive per-call `timeout` disables it.
     */
    timeout?: number;
}

/** Per-call HTTP settings. Pass them with `httpCallOptions`, not as a JSON-RPC param. */
export interface HttpCallOptions {
    timeout?: number;
    signal?: AbortSignal;
}

const HTTP_CALL_OPTIONS = Symbol.for('js-jsonrpc2.httpCallOptions');

export function httpCallOptions(options: HttpCallOptions = {}): HttpCallOptions {
    return Object.assign(Object.create(null), options, {
        [HTTP_CALL_OPTIONS]: true,
    }) as HttpCallOptions;
}

/** Raised when the HTTP call exceeds its timeout. Not used for caller aborts or network failures. */
export class HttpTimeoutError extends Error {
    readonly timeout: number;

    constructor(timeout: number) {
        super(`HTTP request timed out after ${timeout}ms`);
        this.name = 'HttpTimeoutError';
        this.timeout = timeout;
    }
}

let idCounter = 0;

interface StreamFrame {
    jsonrpc: '2.0';
    id: number | string;
    done: boolean;
    index?: number;
    value?: unknown;
    error?: { code: number; message: string };
}

function positiveTimeout(value: number | undefined): number | undefined {
    if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined;
    return value;
}

function toAbortError(reason: unknown): Error {
    if (reason instanceof Error) return reason;
    return new DOMException('The operation was aborted.', 'AbortError');
}

interface AbortLink {
    signal?: AbortSignal;
    cleanup: () => void;
    fail: (err: unknown) => never;
}

function createAbortLink(
    user: AbortSignal | undefined,
    timeoutMs: number | undefined,
): AbortLink {
    let cause: 'timeout' | 'abort' | undefined;
    const fail = (err: unknown): never => {
        if (cause === 'timeout' && timeoutMs !== undefined) {
            throw new HttpTimeoutError(timeoutMs);
        }
        if (cause === 'abort') throw toAbortError(user?.reason);
        throw err;
    };

    if (!user && timeoutMs === undefined) {
        return { cleanup() { /* nothing to release */ }, fail };
    }

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
        if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
        }
        user?.removeEventListener('abort', onUserAbort);
    };

    const onUserAbort = () => {
        if (cause) return;
        cause = 'abort';
        cleanup();
        if (!controller.signal.aborted) controller.abort(user?.reason);
    };

    if (user) {
        if (user.aborted) onUserAbort();
        else user.addEventListener('abort', onUserAbort);
    }

    if (timeoutMs !== undefined && !cause) {
        timer = setTimeout(() => {
            if (cause) return;
            cause = 'timeout';
            cleanup();
            if (!controller.signal.aborted) controller.abort(new HttpTimeoutError(timeoutMs));
        }, timeoutMs);
    }

    return { signal: controller.signal, cleanup, fail };
}

function isHttpCallOptions(value: unknown): value is HttpCallOptions {
    return typeof value === 'object'
        && value !== null
        && HTTP_CALL_OPTIONS in value;
}

async function raceAbort<T>(
    promise: Promise<T>,
    signal: AbortSignal | undefined,
    fail: (err: unknown) => never,
): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) fail(signal.reason);
    return new Promise((resolve, reject) => {
        let settled = false;
        const onAbort = () => {
            if (settled) return;
            settled = true;
            signal.removeEventListener('abort', onAbort);
            try {
                fail(signal.reason);
            } catch (err) {
                reject(err);
            }
        };
        signal.addEventListener('abort', onAbort);
        promise.then(
            (value) => {
                if (settled) return;
                settled = true;
                signal.removeEventListener('abort', onAbort);
                resolve(value);
            },
            (err) => {
                if (settled) return;
                settled = true;
                signal.removeEventListener('abort', onAbort);
                try {
                    fail(err);
                } catch (thrown) {
                    reject(thrown);
                }
            },
        );
    });
}

async function readLine(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    decoder: TextDecoder,
    state: { buf: string },
    signal: AbortSignal | undefined,
    fail: (err: unknown) => never,
): Promise<string | undefined> {
    while (true) {
        const nl = state.buf.indexOf('\n');
        if (nl >= 0) {
            const line = state.buf.slice(0, nl).trim();
            state.buf = state.buf.slice(nl + 1);
            if (line) return line;
            continue;
        }
        const { done, value } = await raceAbort(reader.read(), signal, fail);
        if (done) {
            const trailing = state.buf.trim();
            state.buf = '';
            return trailing.length > 0 ? trailing : undefined;
        }
        state.buf += decoder.decode(value, { stream: true });
    }
}

function isStreamFrame(v: unknown): v is StreamFrame {
    return !!v && typeof v === 'object' && typeof (v as StreamFrame).done === 'boolean';
}

export function createHttpRPC(options: HttpRPCOptions = {}): RPCClient {
    const {
        endpoint = '',
        headers = {},
        fetchImpl = fetch,
        timeout: defaultTimeout,
    } = options;

    function call<T = unknown>(method: string, ...params: unknown[]): Promise<T>;
    function call<T = unknown>(method: string, ...params: unknown[]): Promise<AsyncGenerator<T, void, unknown>>;
    function call<T = unknown>(method: string, ...params: unknown[]): Promise<T | AsyncGenerator<T, void, unknown>> {
        const id = ++idCounter;
        let callOptions: HttpCallOptions | undefined;
        if (isHttpCallOptions(params[params.length - 1])) {
            callOptions = params[params.length - 1] as HttpCallOptions;
            params = params.slice(0, -1);
        }
        const timeoutMs = positiveTimeout(
            callOptions && 'timeout' in callOptions ? callOptions.timeout : defaultTimeout,
        );
        const link = createAbortLink(callOptions?.signal, timeoutMs);
        const body = { jsonrpc: '2.0', method, params, id };

        return (async () => {
            let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
            let releaseOnReturn = true;
            const release = () => {
                if (!releaseOnReturn) return;
                releaseOnReturn = false;
                link.cleanup();
            };
            try {
                const init: RequestInit = {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json, application/x-ndjson',
                        ...headers,
                    },
                    body: JSON.stringify(body),
                };
                if (link.signal) init.signal = link.signal;
                const res = await raceAbort(
                    fetchImpl(endpoint, init),
                    link.signal,
                    link.fail,
                );

                if (!res.ok) {
                    throw new Error(`HTTP ${res.status} ${res.statusText}`);
                }

                if (!res.body) {
                    const payload = await raceAbort(
                        res.json() as Promise<RPCResponse<T>>,
                        link.signal,
                        link.fail,
                    );
                    if (payload.error) throw new RPCError(payload.error);
                    return payload.result as T;
                }

                reader = res.body.getReader();
                const ownedReader = reader;
                const decoder = new TextDecoder();
                const state = { buf: '' };

                const firstLine = await readLine(ownedReader, decoder, state, link.signal, link.fail);
                if (firstLine === undefined) {
                    await ownedReader.cancel().catch(() => { /* ignore */ });
                    throw new Error(`Empty response for ${method}`);
                }

                let first: StreamFrame | RPCResponse<T>;
                try {
                    first = JSON.parse(firstLine);
                } catch (e) {
                    await ownedReader.cancel().catch(() => { /* ignore */ });
                    throw new Error(
                        `Invalid JSON response for ${method}: ${e instanceof Error ? e.message : String(e)}`,
                    );
                }

                if (!isStreamFrame(first)) {
                    const payload = first as RPCResponse<T>;
                    await ownedReader.cancel().catch(() => { /* ignore */ });
                    if (payload.error) throw new RPCError(payload.error);
                    return payload.result as T;
                }

                releaseOnReturn = false;
                return (async function* (): AsyncGenerator<T, void, unknown> {
                    let drained = false;
                    try {
                        let chunk = first;
                        while (true) {
                            if (chunk.error) throw new RPCError(chunk.error);
                            if (chunk.done) { drained = true; return; }
                            if (chunk.value !== undefined) yield chunk.value as T;
                            const line = await readLine(ownedReader, decoder, state, link.signal, link.fail);
                            if (line === undefined) {
                                throw new Error('Stream ended without terminal frame');
                            }
                            chunk = JSON.parse(line);
                        }
                    } finally {
                        link.cleanup();
                        if (!drained) {
                            await ownedReader.cancel().catch(() => { /* ignore */ });
                        }
                    }
                })();
            } catch (err) {
                if (reader) await reader.cancel().catch(() => { /* ignore */ });
                return link.fail(err);
            } finally {
                release();
            }
        })();
    }

    return {
        call,
        close() {
        },
    };
}

export function absoluteEndpoint(endpoint?: string): string {
    const raw = endpoint && endpoint.trim().length > 0 ? endpoint : '/';
    try {
        return new URL(raw, window.location.href).toString();
    } catch {
        return raw;
    }
}