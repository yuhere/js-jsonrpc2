import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { Repository } from '../../../src/core/Repository';
import { INTERNAL_ERROR } from '../../../src/errors/codes';
import { s } from '../../../src/schema/json';
import { serveStdio } from '../../../src/transport/stdio/middleware';

function line(method: string, params: unknown[], id: number): string {
  return JSON.stringify({ jsonrpc: '2.0', method, params, id });
}

async function serve(repository: Repository, payload: string): Promise<string> {
  const input = new PassThrough();
  let out = '';
  const output = new PassThrough();
  output.on('data', (chunk: Buffer | string) => {
    out += chunk.toString();
  });
  const done = serveStdio({ repository, input, output, framing: 'lines' });
  input.end(payload);
  await done;
  return out;
}

function frames(out: string): Array<{ id: number; result?: unknown; error?: { code: number; message: string; data?: unknown } }> {
  return out
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => JSON.parse(item) as { id: number; result?: unknown; error?: { code: number; message: string; data?: unknown } });
}

describe('serveStdio', () => {
  it('rejects a complete line larger than maxFrameBytes', async () => {
    const repository = new Repository({ withSystemMethods: false });
    repository.register(
      { namespace: 'echo', signature: [s.string(), s.string()] },
      (value: string) => value,
    );
    const input = new PassThrough();
    const output = new PassThrough();
    const done = serveStdio({
      repository,
      input,
      output,
      framing: 'lines',
      maxFrameBytes: 40,
    });
    input.end(line('echo', ['x'.repeat(80)], 1) + '\n');
    await expect(done).rejects.toThrow(/exceeded 40 bytes/);
  });

  it('rejects an oversized JSON value in json framing', async () => {
    const repository = new Repository({ withSystemMethods: false });
    repository.register(
      { namespace: 'echo', signature: [s.string(), s.string()] },
      (value: string) => value,
    );
    const input = new PassThrough();
    const output = new PassThrough();
    const done = serveStdio({
      repository,
      input,
      output,
      framing: 'json',
      maxFrameBytes: 20,
    });
    input.end(line('echo', ['hello'], 1));
    await expect(done).rejects.toThrow(/exceeded 20 bytes/);
  });

  it('writes a slow handler response before resolving', async () => {
    const repository = new Repository({ withSystemMethods: false });
    repository.register(
      { namespace: 'slow', signature: [s.string()] },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return 'late';
      },
    );

    const out = await serve(repository, line('slow', [], 1) + '\n');

    expect(frames(out)).toEqual([
      { jsonrpc: '2.0', id: 1, result: 'late' },
    ]);
  });

  it('replies with INTERNAL_ERROR when the result cannot be serialized', async () => {
    const repository = new Repository({ withSystemMethods: false });
    repository.register(
      { namespace: 'big', signature: [s.unknown()] },
      () => ({ n: 1n }),
    );

    const unhandled: unknown[] = [];
    const onUnhandled = (error: unknown) => {
      unhandled.push(error);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const out = await serve(repository, line('big', [], 7) + '\n');
      expect(unhandled).toEqual([]);
      const [frame] = frames(out);
      expect(frame).toMatchObject({
        jsonrpc: '2.0',
        id: 7,
        error: { code: INTERNAL_ERROR, message: 'Internal error' },
      });
      if (process.env['NODE_ENV'] === 'production') {
        expect(frame?.error).not.toHaveProperty('data');
      } else {
        expect(typeof frame?.error?.data).toBe('string');
      }
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('writes a response for every concurrent request', async () => {
    const repository = new Repository({ withSystemMethods: false });
    repository.register(
      { namespace: 'delay', signature: [s.string(), s.number(), s.string()] },
      async (ms: number, value: string) => {
        await new Promise((resolve) => setTimeout(resolve, ms));
        return value;
      },
    );

    const payload = [
      line('delay', [30, 'a'], 1),
      line('delay', [10, 'b'], 2),
      line('delay', [20, 'c'], 3),
    ].join('\n') + '\n';
    const out = await serve(repository, payload);
    const byId = new Map(frames(out).map((frame) => [frame.id, frame.result]));

    expect(byId).toEqual(new Map<number, unknown>([
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
    ]));
  });
});
