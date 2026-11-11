import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import express from 'express';
import request from 'supertest';
import { WebSocket } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import { Repository } from '../../src/core/Repository';
import { s } from '../../src/schema/json';
import { createExpressRouter } from '../../src/transport/express';
import { serveStdio } from '../../src/transport/stdio';
import { attachWebSocket } from '../../src/transport/ws';

const previousEnv = process.env['NODE_ENV'];

afterEach(() => {
    if (previousEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = previousEnv;
});

function production(): void {
    process.env['NODE_ENV'] = 'production';
}

function expectNoData(error: { code?: number; data?: unknown } | undefined): void {
    expect(error).toBeDefined();
    expect(error).not.toHaveProperty('data');
}

describe('production error responses omit data', () => {
    it('omits data for Express parse, invalid request, and internal errors', async () => {
        production();
        const repository = new Repository({ withSystemMethods: false });
        repository.register(
            { namespace: 'boom', signature: [s.string()] },
            () => {
                throw new Error('db password=secret');
            },
        );
        const app = express();
        app.use('/', createExpressRouter(repository, {}));

        const parse = await request(app)
            .post('/')
            .set('Content-Type', 'application/json')
            .send('{');
        expect(parse.body.error.code).toBe(-32700);
        expectNoData(parse.body.error);

        const invalid = await request(app)
            .post('/')
            .set('Content-Type', 'application/json')
            .send({ jsonrpc: '1.0', method: 'boom', params: [], id: 1 });
        expect(invalid.body.error.code).toBe(-32600);
        expectNoData(invalid.body.error);

        const internal = await request(app)
            .post('/')
            .set('Content-Type', 'application/json')
            .send({ jsonrpc: '2.0', method: 'boom', params: [], id: 2 });
        expect(internal.body.error.code).toBe(-32603);
        expectNoData(internal.body.error);
    });

    it('omits data for stdio parse and invalid request errors', async () => {
        production();
        const input = new PassThrough();
        const output = new PassThrough();
        let out = '';
        output.on('data', (chunk: Buffer | string) => {
            out += chunk.toString();
        });
        const done = serveStdio({
            repository: new Repository({ withSystemMethods: false }),
            input,
            output,
            framing: 'lines',
        });
        input.end('{not json\n{"jsonrpc":"1.0","method":"x","params":[],"id":3}\n');
        await done;
        const frames = out.trim().split('\n').map((line) => JSON.parse(line) as { error: { code: number } });
        expect(frames.map((frame) => frame.error.code)).toEqual([-32700, -32600]);
        for (const frame of frames) expectNoData(frame.error);
    });

    it('omits data for WebSocket parse and invalid request errors', async () => {
        production();
        const server = createServer();
        const wss = attachWebSocket(server, new Repository({ withSystemMethods: false }), { path: '/' });
        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', () => resolve());
        });
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        const ws = new WebSocket(`ws://127.0.0.1:${port}/`);
        const messages: Array<{ error: { code: number } }> = [];
        try {
            await new Promise<void>((resolve, reject) => {
                ws.once('open', () => resolve());
                ws.once('error', reject);
            });
            const both = new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('websocket produced no frames')), 1000);
                ws.on('message', (data) => {
                    messages.push(JSON.parse(String(data)) as { error: { code: number } });
                    if (messages.length === 2) {
                        clearTimeout(timer);
                        resolve();
                    }
                });
            });
            ws.send('{');
            ws.send(JSON.stringify({ jsonrpc: '1.0', method: 'x', params: [], id: 4 }));
            await both;
            expect(messages.map((frame) => frame.error.code).sort((a, b) => a - b)).toEqual([-32700, -32600]);
            for (const frame of messages) expectNoData(frame.error);
        } finally {
            ws.close();
            await new Promise<void>((resolve) => wss.close(() => resolve()));
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });
});
