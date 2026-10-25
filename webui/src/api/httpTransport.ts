import type { RpcResponse } from './types';
import {
    RPCError,
    type CallResult,
    type RpcClient,
} from './rpc';

export interface HttpRpcOptions {
    endpoint?: string;
    headers?: Record<string, string>;
    fetchImpl?: typeof fetch;
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

async function readLine(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    decoder: TextDecoder,
    state: { buf: string },
): Promise<string | undefined> {
    while (true) {
        const nl = state.buf.indexOf('\n');
        if (nl >= 0) {
            const line = state.buf.slice(0, nl).trim();
            state.buf = state.buf.slice(nl + 1);
            if (line) return line;
            continue;
        }
        const { done, value } = await reader.read();
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

export function createHttpRpc(options: HttpRpcOptions = {}): RpcClient {
    const {
        endpoint = '',
        headers = {},
        fetchImpl = fetch,
    } = options;

    function call<T = unknown>(method: string, ...params: unknown[]): CallResult<T> {
        const id = ++idCounter;
        const body = { jsonrpc: '2.0', method, params, id };

        return (async () => {
            const res = await fetchImpl(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/x-ndjson',
                    ...headers,
                },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status} ${res.statusText}`);
            }

            if (!res.body) {
                const payload = (await res.json()) as RpcResponse<T>;
                if (payload.error) throw new RPCError(payload.error);
                return payload.result as T;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            const state = { buf: '' };

            const firstLine = await readLine(reader, decoder, state);
            if (firstLine === undefined) {
                await reader.cancel().catch(() => { /* ignore */ });
                throw new Error(`Empty response for ${method}`);
            }

            let first: StreamFrame | RpcResponse<T>;
            try {
                first = JSON.parse(firstLine);
            } catch (e) {
                await reader.cancel().catch(() => { /* ignore */ });
                throw new Error(
                    `Invalid JSON response for ${method}: ${e instanceof Error ? e.message : String(e)}`,
                );
            }

            if (!isStreamFrame(first)) {
                const payload = first as RpcResponse<T>;
                await reader.cancel().catch(() => { /* ignore */ });
                if (payload.error) throw new RPCError(payload.error);
                return payload.result as T;
            }

            return (async function* (): AsyncGenerator<T, void, unknown> {
                let drained = false;
                try {
                    let chunk = first;
                    while (true) {
                        if (chunk.error) throw new RPCError(chunk.error);
                        if (chunk.done) { drained = true; return; }
                        if (chunk.value !== undefined) yield chunk.value as T;
                        const line = await readLine(reader, decoder, state);
                        if (line === undefined) {
                            throw new Error('Stream ended without terminal frame');
                        }
                        chunk = JSON.parse(line);
                    }
                } finally {
                    if (!drained) {
                        await reader.cancel().catch(() => { /* ignore */ });
                    }
                }
            })();
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