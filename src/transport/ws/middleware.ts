import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import type { RawData } from 'ws';
import { Repository } from '../../core/Repository';
import { INTERNAL_ERROR, PARSE_ERROR } from '../../errors/codes';
import { stringify } from "../../stream/stringify-stream";
import type {
    InjectableFactory,
    Injections,
    RPCErrorTransform,
    RPCResponse,
    RPCStreamChunk,
    RPCStreamSuccess,
} from '../../types';
import { RPCVersion } from '../../schema/z/protocol';

export interface WSOptions {
    /** Build injectables for a WS connection. */
    mkInjectable?: InjectableFactory;
    /** Global error transform. */
    errorTransform?: RPCErrorTransform;
    /** WebSocket server path (default: `/`). Only used by `attachWebSocket`. */
    path?: string;
    /** Whether to skip connection upgrade for non-matching paths. */
    allowOrigin?: (origin: string | undefined, req: IncomingMessage) => boolean;
    /** Max payload size forwarded to `ws` (default 1mb). */
    maxPayload?: number;
    /** Called once a connection is established. */
    onConnection?: (socket: WebSocket, req: IncomingMessage) => void;
}

interface WsContext {
    repository: Repository;
    options: WSOptions;
    injectables: Injections;
    closed: boolean;
}

function isStreamSuccess(payload: unknown): payload is RPCStreamSuccess {
    return (
        !!payload &&
        typeof payload === 'object' &&
        typeof (payload as RPCStreamSuccess).chunks === 'object' &&
        (payload as RPCStreamSuccess).chunks !== null &&
        typeof (payload as RPCStreamSuccess).chunks[Symbol.asyncIterator] === 'function'
    );
}

/**
 * Attach a JSON-RPC 2.0 WebSocket endpoint to an existing `http.Server`.
 * Returns the underlying `WebSocketServer` so the caller can close it.
 * @example attachWebSocket(server, repository, { path: '/' })
 */
export function attachWebSocket(
    server: Server,
    repository: Repository,
    options: WSOptions,
): WebSocketServer {
    const wss = new WebSocketServer({
        noServer: true,
        maxPayload: options.maxPayload ?? 1024 * 1024,
    });

    const path = options.path ?? '/';

    const upgradeHandler = (
        req: IncomingMessage,
        socket: Duplex,
        head: Buffer,
    ): void => {
        const url = req.url ?? '/';
        // Strip query string before matching.
        const pathname = url.split('?', 1)[0] ?? '/';
        if (pathname !== path) {
            // 不匹配的升级留给同一 Server 上的其他监听器。
            return;
        }

        if (options.allowOrigin) {
            const origin = req.headers.origin;
            if (!options.allowOrigin(origin, req)) {
                socket.destroy();
                return;
            }
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    };

    server.on('upgrade', upgradeHandler);

    // Cleanup hook so callers can detach the upgrade handler.
    const originalClose = wss.close.bind(wss);
    wss.close = ((callback?: (err?: Error) => void) => {
        server.off('upgrade', upgradeHandler);
        return originalClose(callback);
    }) as typeof wss.close;

    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
        handleConnection(ws, req, repository, options);
    });

    return wss;
}

function handleConnection(
    ws: WebSocket,
    req: IncomingMessage,
    repository: Repository,
    options: WSOptions,
): void {
    const injectables = buildInjectables(options.mkInjectable, ws, req, repository);
    const ctx: WsContext = {
        repository,
        options,
        injectables,
        closed: false,
    };

    if (options.onConnection) {
        options.onConnection(ws, req);
    }

    ws.on('message', (data: RawData, isBinary: boolean) => {
        void onMessage(ctx, ws, data, isBinary);
    });

    ws.on('close', () => {
        ctx.closed = true;
    });

    ws.on('error', (error) => {
        if (process.env['NODE_ENV'] !== 'production') {
            console.error('JSON-RPC WebSocket error', error);
        }
    });
}

async function onMessage(
    ctx: WsContext,
    ws: WebSocket,
    data: RawData,
    isBinary: boolean,
): Promise<void> {
    if (ctx.closed || ws.readyState !== WebSocket.OPEN) return;

    let input: unknown;
    try {
        input = parseFrame(data, isBinary);
    } catch (error) {
        await send(ctx, ws, {
            jsonrpc: RPCVersion,
            id: null,
            error: {
                code: PARSE_ERROR,
                message: 'Parse error',
                ...(process.env['NODE_ENV'] !== 'production'
                    ? { data: error instanceof Error ? error.message : String(error) }
                    : {}),
            },
        });
        return;
    }

    let output: RPCResponse;
    try {
        output = await ctx.repository.invoke(input, {
            injections: ctx.injectables,
            errorTransform: ctx.options.errorTransform!,
        });
    } catch (error) {
        output = fallbackFailure(error);
    }

    if (isStreamSuccess(output)) {
        await sendStream(ctx, ws, output);
        return;
    }

    await send(ctx, ws, output);
}

async function sendStream(
    ctx: WsContext,
    ws: WebSocket,
    stream: RPCStreamSuccess,
): Promise<void> {
    const onClose = () => {
        void stream.chunks.return?.(undefined);
    };
    ws.once('close', onClose);
    try {
        for await (const chunk of stream.chunks) {
            if (ctx.closed || ws.readyState !== WebSocket.OPEN) break;
            await sendRaw(ctx, ws, chunk);
        }
    } catch (error) {
        if (process.env['NODE_ENV'] !== 'production') {
            const message = error instanceof Error ? error.message : String(error);
            console.error('Failed to stream JSON-RPC response over WebSocket', message, error);
        }
    } finally {
        ws.off('close', onClose);
    }
}

function parseFrame(data: RawData, isBinary: boolean): unknown {
    // Reject binary frames: protocol requires text JSON.
    if (isBinary) {
        throw new Error('Binary frames are not supported; send JSON text.');
    }

    let text: string;
    if (typeof data === 'string') {
        text = data;
    } else if (Buffer.isBuffer(data)) {
        text = data.toString('utf8');
    } else if (Array.isArray(data)) {
        text = Buffer.concat(data).toString('utf8');
    } else {
        text = Buffer.from(data as ArrayBuffer).toString('utf8');
    }

    return JSON.parse(text);
}

async function send(
    ctx: WsContext,
    ws: WebSocket,
    payload: RPCResponse,
): Promise<void> {
    if (ctx.closed || ws.readyState !== WebSocket.OPEN) return;
    try {
        const text = await stringify(payload);
        await new Promise<void>((resolve, reject) => {
            ws.send(text, (error) => (error ? reject(error) : resolve()));
        });
    } catch (error) {
        if (process.env['NODE_ENV'] !== 'production') {
            console.error('Failed to send JSON-RPC response over WebSocket', error);
        }
    }
}

/** 发送一个流帧（RPCStreamChunk 已是完整帧）。 */
async function sendRaw(
    ctx: WsContext,
    ws: WebSocket,
    chunk: RPCStreamChunk,
): Promise<void> {
    if (ctx.closed || ws.readyState !== WebSocket.OPEN) return;
    try {
        const text = await stringify(chunk);
        await new Promise<void>((resolve, reject) => {
            ws.send(text, (error) => (error ? reject(error) : resolve()));
        });
    } catch (error) {
        if (process.env['NODE_ENV'] !== 'production') {
            console.error('Failed to send JSON-RPC stream chunk over WebSocket', error);
        }
    }
}

function fallbackFailure(error: unknown): RPCResponse {
    const message = error instanceof Error ? error.message : String(error);
    return {
        jsonrpc: RPCVersion,
        id: null,
        error: {
            code: INTERNAL_ERROR,
            message: 'Internal error',
            ...(process.env['NODE_ENV'] !== 'production' ? { data: message } : {}),
        },
    };
}

function buildInjectables(
    factory: InjectableFactory | undefined,
    ws: WebSocket,
    req: IncomingMessage,
    repository: Repository,
): Injections {
    const injections = typeof factory === 'function'
        ? {
            ...factory({
                socket: ws,
                request: req,
            }, repository),
            repository
        }
        : {
            socket: ws,
            request: req,
            repository,
        }
    return { ...injections, injections: injections };
}