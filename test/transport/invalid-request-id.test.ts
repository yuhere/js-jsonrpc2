import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import express from 'express';
import request from 'supertest';
import { WebSocket } from 'ws';
import { describe, expect, it } from 'vitest';
import { Repository } from '../../src/core/Repository';
import { createExpressRouter } from '../../src/transport/express';
import { serveStdio } from '../../src/transport/stdio';
import { attachWebSocket } from '../../src/transport/ws';

const wrongVersion = { jsonrpc: '1.0', method: 'subtract', params: [1, 2], id: 7 };

describe('invalid request id across transports', () => {
  it('echoes the request id from Express', async () => {
    const app = express();
    app.use('/', createExpressRouter(new Repository({ withSystemMethods: false }), {}));
    const res = await request(app)
      .post('/')
      .set('Content-Type', 'application/json')
      .send(wrongVersion);
    expect(res.body).toMatchObject({
      id: 7,
      error: { code: -32600, message: 'Invalid Request' },
    });
    expect(res.body.error.data).toEqual(expect.stringContaining('2.0'));
  });

  it('echoes the request id from stdio', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let out = '';
    const frame = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('stdio produced no frame')), 1000);
      output.on('data', (chunk: Buffer | string) => {
        out += chunk.toString();
        if (out.includes('\n')) {
          clearTimeout(timer);
          resolve(out);
        }
      });
    });
    const done = serveStdio({
      repository: new Repository({ withSystemMethods: false }),
      input,
      output,
      framing: 'lines',
    });
    input.end(JSON.stringify(wrongVersion) + '\n');
    const text = await frame;
    await done;
    expect(JSON.parse(text)).toMatchObject({
      id: 7,
      error: { code: -32600, message: 'Invalid Request' },
    });
  });

  it('echoes the request id from WebSocket', async () => {
    const server = createServer();
    const wss = attachWebSocket(server, new Repository({ withSystemMethods: false }), { path: '/' });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/`);
    try {
      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve());
        ws.once('error', reject);
      });
      const message = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('websocket produced no frame')), 1000);
        ws.once('message', (data) => {
          clearTimeout(timer);
          resolve(String(data));
        });
      });
      ws.send(JSON.stringify(wrongVersion));
      expect(JSON.parse(await message)).toMatchObject({
        id: 7,
        error: { code: -32600, message: 'Invalid Request' },
      });
    } finally {
      ws.close();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
