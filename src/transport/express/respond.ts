import type { Response } from 'express';
import { stringifyStream } from '../../stream/stringify-stream';
import type { RPCResponse, RPCStreamChunk, RPCStreamSuccess } from '../../types';

function isStreamSuccess(payload: unknown): payload is RPCStreamSuccess {
  return (
    !!payload &&
    typeof payload === 'object' &&
    typeof (payload as RPCStreamSuccess).chunks === 'object' &&
    (payload as RPCStreamSuccess).chunks !== null &&
    typeof (payload as RPCStreamSuccess).chunks[Symbol.asyncIterator] === 'function'
  );
}

export async function respond(
  res: Response,
  payload: RPCResponse | undefined,
): Promise<void> {
  if (payload === undefined) {
    res.status(200).end();
    return;
  }
  if (isStreamSuccess(payload)) {
    await respondStream(payload, res);
    return;
  }
  await respondNonStream(payload, res);
}

type NonStreamResponse = Exclude<RPCResponse, RPCStreamSuccess>;

/**
 * 写一段文本；处理背压，并在客户端断开时立即 resolve（避免挂死）。
 */
function writeChunk(res: Response, s: string): Promise<void> {
  if (res.writableEnded || res.destroyed) return Promise.resolve();
  if (res.write(s)) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      res.off('drain', done);
      res.off('close', done);
      res.off('error', done);
      resolve();
    };
    res.once('drain', done);
    res.once('close', done);
    res.once('error', done);
  });
}

async function respondStream(
  rpcRes: RPCStreamSuccess,
  res: Response,
): Promise<void> {
  res.status(200);
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.flushHeaders?.();

  let closed = false;
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    void Promise.resolve(rpcRes.chunks.return?.(undefined)).catch(() => { /* ignore */ });
  };
  const onClose = () => {
    closed = true;
    cleanup();
  };
  res.on('close', onClose);

  const writeFrame = async (chunk: RPCStreamChunk): Promise<void> => {
    if (closed || res.writableEnded) return;
    for await (const s of stringifyStream(chunk)) {
      if (closed || res.writableEnded) break;
      await writeChunk(res, s);
    }
    if (!(closed || res.writableEnded)) await writeChunk(res, '\n');
  };

  try {
    for await (const chunk of rpcRes.chunks) {
      if (closed || res.writableEnded) break;
      await writeFrame(chunk);
    }
  } catch (error) {
    if (process.env['NODE_ENV'] !== 'production') {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to stream JSON-RPC response', message, error);
    }
    // 已经无法继续写；销毁连接而不是干净 end（避免客户端把截断当成功）。
    res.off('close', onClose);
    cleanup();
    if (!res.destroyed) res.destroy();
    return;
  }

  res.off('close', onClose);
  cleanup();
  if (!res.writableEnded && !res.destroyed) res.end();
}

async function respondNonStream(
  rpcRes: NonStreamResponse,
  res: Response,
): Promise<void> {
  res.status(200);
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Content-Type', 'application/json');
  res.flushHeaders?.();

  let closed = false;
  const onClose = () => { closed = true; };
  res.on('close', onClose);

  let wroteAny = false;
  try {
    for await (const s of stringifyStream(rpcRes)) {
      if (closed || res.writableEnded) break;
      wroteAny = true;
      await writeChunk(res, s);
    }
  } catch (error) {
    if (process.env['NODE_ENV'] !== 'production') {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to stringify RPC response', message, error);
    }
    res.off('close', onClose);
    if (!res.destroyed) res.destroy();
    return;
  }

  res.off('close', onClose);
  if (!res.writableEnded && !res.destroyed) res.end();
}