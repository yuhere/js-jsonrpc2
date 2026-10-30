import type { RPCResponse } from './types';
import {
    RPCError,
    type RPCClient,
} from './rpc';

export interface WsRPCOptions {
    /** 默认：根据当前页面 URL 推导（http->ws / https->wss，同路径） */
    endpoint?: string;
    connectTimeoutMs?: number;
    callTimeoutMs?: number;
}

interface Pending {
    resolve: (v: unknown) => void;
    reject: (e: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
}

interface StreamSub {
    push: (v: unknown) => void;
    finish: () => void;
    fail: (e: unknown) => void;
}

interface StreamFrame {
    jsonrpc: '2.0';
    id: number | string;
    done: boolean;
    index?: number;
    value?: unknown;
    error?: { code: number; message: string };
}

/** 首帧等待器：resolve 到原始消息对象，由 call 决定走哪条路。 */
type FirstWaiter = (msg: RPCResponse | StreamFrame) => void;

let idCounter = 0;

function deriveWsEndpoint(): string {
    const loc = window.location;
    const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${loc.host}${loc.pathname}`;
}

function isStreamFrame(v: unknown): v is StreamFrame {
    return !!v && typeof v === 'object' && typeof (v as StreamFrame).done === 'boolean';
}

export function createWsRPC(options: WsRPCOptions = {}): RPCClient {
    const {
        endpoint = deriveWsEndpoint(),
        connectTimeoutMs = 5000,
        callTimeoutMs = 15000,
    } = options;

    const pending = new Map<number | string, Pending>();
    const streams = new Map<number | string, StreamSub>();
    const firstWaiters = new Map<number | string, FirstWaiter>();
    let socket: WebSocket | null = null;
    let openPromise: Promise<void> | null = null;
    let closedByUser = false;

    function rejectAll(reason: string) {
        for (const [, p] of pending) {
            clearTimeout(p.timer);
            p.reject(new Error(reason));
        }
        pending.clear();
        for (const [, sub] of streams) {
            sub.fail(new Error(reason));
        }
        streams.clear();
        for (const [, w] of firstWaiters) {
            // 首帧没等到连接就关了：用一个假的 failure 消息唤醒，让它走普通失败分支
            w({
                jsonrpc: '2.0',
                id: 0,
                error: { code: -32603, message: reason },
            } as RPCResponse);
        }
        firstWaiters.clear();
    }

    function attach(ws: WebSocket) {
        ws.addEventListener('message', (ev) => {
            let data: RPCResponse | RPCResponse[] | StreamFrame | StreamFrame[] | null = null;
            try {
                data = JSON.parse(ev.data as string);
            } catch {
                return;
            }
            const list = Array.isArray(data) ? data : [data];
            for (const msg of list) {
                if (!msg || typeof msg !== 'object') continue;
                if (msg.id == null) continue;

                // 1) 首帧等待者
                const fw = firstWaiters.get(msg.id);
                if (fw) {
                    firstWaiters.delete(msg.id);
                    fw(msg as RPCResponse | StreamFrame);
                    continue;
                }

                // 2) 流帧
                if (isStreamFrame(msg)) {
                    const sub = streams.get(msg.id);
                    if (!sub) continue;
                    if (msg.error) {
                        streams.delete(msg.id);
                        sub.fail(new RPCError(msg.error));
                        continue;
                    }
                    if (msg.done) {
                        streams.delete(msg.id);
                        sub.finish();
                        continue;
                    }
                    if (msg.value !== undefined) sub.push(msg.value);
                    continue;
                }

                // 3) 普通响应
                const p = pending.get(msg.id);
                if (!p) continue;
                pending.delete(msg.id);
                clearTimeout(p.timer);
                const plain = msg as RPCResponse;
                if (plain.error) p.reject(new RPCError(plain.error));
                else p.resolve(plain.result);
            }
        });

        ws.addEventListener('close', () => {
            if (!closedByUser) rejectAll('WebSocket 已关闭');
            socket = null;
            openPromise = null;
        });
    }

    function ensureOpen(): Promise<void> {
        if (socket && socket.readyState === WebSocket.OPEN) return Promise.resolve();
        if (openPromise) return openPromise;

        openPromise = new Promise<void>((resolve, reject) => {
            let settled = false;
            const ws = new WebSocket(endpoint);
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                try { ws.close(); } catch { /* ignore */ }
                reject(new Error(`WebSocket 连接超时（${connectTimeoutMs}ms）`));
            }, connectTimeoutMs);

            attach(ws);

            ws.addEventListener('open', () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                socket = ws;
                resolve();
            }, { once: true });

            ws.addEventListener('close', () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                reject(new Error('WebSocket 连接被拒绝'));
            }, { once: true });

            ws.addEventListener('error', () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                reject(new Error('WebSocket 连接失败'));
            }, { once: true });
        }).finally(() => {
            if (!socket) openPromise = null;
        });

        return openPromise;
    }

    function call<T = unknown>(method: string, ...params: unknown[]): Promise<T>;
    function call<T = unknown>(method: string, ...params: unknown[]): Promise<AsyncGenerator<T, void, unknown>>;
    function call<T = unknown>(method: string, ...params: unknown[]): Promise<T | AsyncGenerator<T, void, unknown>> {
        return (async () => {
            await ensureOpen();
            const ws = socket;
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                throw new Error('WebSocket 未连接');
            }

            const id = ++idCounter;
            const payload = { jsonrpc: '2.0', method, params, id };

            // 等第一帧
            const first = new Promise<RPCResponse | StreamFrame>((resolve, reject) => {
                const timer = setTimeout(() => {
                    firstWaiters.delete(id);
                    reject(new Error(`调用 ${method} 超时（${callTimeoutMs}ms）`));
                }, callTimeoutMs);

                firstWaiters.set(id, (msg) => {
                    clearTimeout(timer);
                    resolve(msg);
                });
            });

            try {
                ws.send(JSON.stringify(payload));
            } catch (e) {
                firstWaiters.delete(id);
                throw e;
            }

            let firstMsg: RPCResponse | StreamFrame;
            try {
                firstMsg = await first;
            } catch (e) {
                firstWaiters.delete(id);
                throw e;
            }

            // 流式
            if (isStreamFrame(firstMsg)) {
                // 桥接到 AsyncGenerator
                const queue: T[] = [];
                let finished = false;
                let failure: unknown = null;
                let waiter: (() => void) | null = null;
                const wake = () => {
                    const w = waiter;
                    waiter = null;
                    w?.();
                };

                // 先处理首帧
                if (firstMsg.error) {
                    throw new RPCError(firstMsg.error);
                }
                if (firstMsg.done) {
                    // 空流：直接返回空 generator
                    return (async function* (): AsyncGenerator<T, void, unknown> {})();
                }
                if (firstMsg.value !== undefined) queue.push(firstMsg.value as T);

                const sub: StreamSub = {
                    push: (v) => {
                        queue.push(v as T);
                        wake();
                    },
                    finish: () => {
                        finished = true;
                        wake();
                    },
                    fail: (e) => {
                        failure = e;
                        finished = true;
                        wake();
                    },
                };
                streams.set(id, sub);

                return (async function* (): AsyncGenerator<T, void, unknown> {
                    try {
                        while (true) {
                            if (failure) throw failure;
                            if (queue.length > 0) {
                                yield queue.shift() as T;
                                continue;
                            }
                            if (finished) return;
                            await new Promise<void>((resolve) => {
                                waiter = resolve;
                            });
                        }
                    } finally {
                        streams.delete(id);
                    }
                })();
            }

            // 普通
            if (firstMsg.error) {
                throw new RPCError(firstMsg.error);
            }
            return (firstMsg as RPCResponse).result as T;
        })();
    }

    return {
        call,
        close() {
            closedByUser = true;
            rejectAll('客户端已关闭');
            if (socket) {
                try { socket.close(1000, 'client closed'); } catch { /* ignore */ }
            }
            socket = null;
            openPromise = null;
        },
    };
}