import { afterEach, describe, expect, it, vi } from 'vitest';
import { RPCError, isStreamResult } from './rpc';
import { createWsRPC } from './wsTransport';

class MockWebSocket extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    static sockets: MockWebSocket[] = [];

    readyState = MockWebSocket.CONNECTING;
    sent: string[] = [];

    constructor(_url: string) {
        super();
        MockWebSocket.sockets.push(this);
        queueMicrotask(() => {
            if (this.readyState !== MockWebSocket.CONNECTING) return;
            this.readyState = MockWebSocket.OPEN;
            this.dispatchEvent(new Event('open'));
        });
    }

    send(data: string): void {
        this.sent.push(String(data));
    }

    close(): void {
        this.readyState = MockWebSocket.CLOSED;
        this.dispatchEvent(new Event('close'));
    }

    receive(payload: unknown): void {
        const event = new Event('message');
        Object.defineProperty(event, 'data', { value: JSON.stringify(payload) });
        this.dispatchEvent(event);
    }
}

const originalWebSocket = globalThis.WebSocket;

afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    MockWebSocket.sockets = [];
});

function installSocket(): void {
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
}

async function waitForSend(count: number): Promise<MockWebSocket> {
    await vi.waitUntil(() => {
        const socket = MockWebSocket.sockets[0];
        return Boolean(socket && socket.sent.length >= count);
    });
    return MockWebSocket.sockets[0]!;
}

function nullError(code: number, message: string) {
    return { jsonrpc: '2.0', id: null, error: { code, message } };
}

describe('WebSocket id:null errors', () => {
    it('rejects the only in-flight call with the server error code', async () => {
        installSocket();
        const client = createWsRPC({ endpoint: 'ws://example/rpc', callTimeoutMs: 200 });
        const seen: number[] = [];
        for (const code of [-32700, -32600]) {
            const pending = client.call('add', 1, 2);
            const socket = await waitForSend(seen.length + 1);
            seen.push(socket.sent.length);
            socket.receive(nullError(code, code === -32700 ? 'Parse error' : 'Invalid Request'));
            const error = await pending.then(
                () => { throw new Error('expected rejection'); },
                (err: unknown) => err,
            );
            expect(error).toBeInstanceOf(RPCError);
            expect((error as RPCError).code).toBe(code);
        }
    });

    it('rejects every in-flight call with the same RPCError', async () => {
        installSocket();
        const client = createWsRPC({ endpoint: 'ws://example/rpc', callTimeoutMs: 200 });
        const first = client.call('one');
        const second = client.call('two');
        const socket = await waitForSend(2);
        const calls = Promise.all([
            first.then(() => { throw new Error('expected rejection'); }, (err: unknown) => err),
            second.then(() => { throw new Error('expected rejection'); }, (err: unknown) => err),
        ]);
        socket.receive(nullError(-32600, 'Invalid Request'));
        const [left, right] = await calls;
        expect(left).toBeInstanceOf(RPCError);
        expect(left).toBe(right);
        expect((left as RPCError).code).toBe(-32600);
    });

    it('fails an in-flight stream and leaves a call without an error id alone', async () => {
        installSocket();
        const client = createWsRPC({ endpoint: 'ws://example/rpc', callTimeoutMs: 200 });
        const pending = client.call<string>('tail');
        const socket = await waitForSend(1);
        const requestId = JSON.parse(socket.sent[0]!) as { id: number };
        socket.receive({
            jsonrpc: '2.0',
            id: requestId.id,
            done: false,
            index: 0,
            value: 'a',
        });
        const stream = await pending;
        expect(isStreamResult(stream)).toBe(true);
        await expect(stream.next()).resolves.toMatchObject({ value: 'a', done: false });

        socket.receive({ jsonrpc: '2.0', id: null });
        const stillOpen = stream.next();
        socket.receive(nullError(-32700, 'Parse error'));
        const error = await stillOpen.then(
            () => { throw new Error('expected stream failure'); },
            (err: unknown) => err,
        );
        expect(error).toBeInstanceOf(RPCError);
        expect((error as RPCError).code).toBe(-32700);
    });

    it('ignores an id:null message that has no error', async () => {
        installSocket();
        const client = createWsRPC({ endpoint: 'ws://example/rpc', callTimeoutMs: 200 });
        const pending = client.call<number>('add', 1, 2);
        const socket = await waitForSend(1);
        const requestId = JSON.parse(socket.sent[0]!) as { id: number };
        socket.receive({ jsonrpc: '2.0', id: null });
        socket.receive({ jsonrpc: '2.0', id: requestId.id, result: 3 });
        await expect(pending).resolves.toBe(3);
    });
});
