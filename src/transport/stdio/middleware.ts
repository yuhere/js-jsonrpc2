import { StringDecoder } from 'node:string_decoder';
import type { Readable, Writable } from 'node:stream';
import { Repository } from '../../core/Repository';
import { INTERNAL_ERROR, PARSE_ERROR } from '../../errors/codes';
import type {
  InjectableFactory,
  Injections,
  RPCErrorTransform,
  RPCFailure,
  RPCResId,
  RPCResponse,
  RPCStreamChunk,
  RPCStreamSuccess,
} from '../../types';
import { RPCVersion } from '../../schema/z/protocol';
import { stringify } from '../../stream/stringify-stream';

export interface StdioOptions {
  repository?: Repository;
  /** Input stream (default: `process.stdin`). */
  input?: Readable;
  /** Output stream (default: `process.stdout`). */
  output?: Writable;
  /**
   * Frame mode.
   * - `lines` (default): one JSON value per line (`\n`-terminated).
   * - `json`: concatenated JSON values (whitespace-tolerant).
   */
  framing?: 'lines' | 'json';
  /** Build injectables per message. */
  mkInjectable?: InjectableFactory;
  /** Global error transform. */
  errorTransform?: RPCErrorTransform;
  /** Maximum frame size in bytes (default 1mb). */
  maxFrameBytes?: number;
  /** Called after each response is flushed. */
  onResponse?: (response: RPCResponse) => void;
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
 * Serve JSON-RPC 2.0 over newline-delimited JSON (NDJSON) streams.
 * Resolves when the input ends and every response has been written.
 * @example await serveStdio({ repository, framing: 'lines' })
 */
export async function serveStdio(
  options: StdioOptions = {},
): Promise<void> {
  const repository = options.repository ?? new Repository();
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const framing = options.framing ?? 'lines';
  const maxFrameBytes = options.maxFrameBytes ?? 1024 * 1024;

  const decoder = new StringDecoder('utf8');
  let buffer = '';

  // Serialize writes so responses don't interleave.
  let writeChain: Promise<void> = Promise.resolve();
  // Handlers can still be running when input ends. This set is what keeps
  // serveStdio from resolving before their responses are queued.
  const inflight = new Set<Promise<void>>();

  const ctx: StdioContext = {
    repository,
    options,
    injectables: buildInjectables(options.mkInjectable, repository),
    writeChain: () => writeChain,
    setWriteChain: (p) => {
      writeChain = p;
    },
    output,
  };

  const beginDispatch = (text: string): void => {
    const task = dispatch(ctx, text);
    inflight.add(task);
    // Handle the rejection here so a dispatch that fails after `end` is not
    // an unhandled rejection. Promise.all below still observes `task`.
    void task.then(
      () => {
        inflight.delete(task);
      },
      () => {
        inflight.delete(task);
      },
    );
  };

  await new Promise<void>((resolve, reject) => {
    const onData = (chunk: Buffer | string) => {
      try {
        buffer += typeof chunk === 'string' ? chunk : decoder.write(chunk);

        const assertFrameSize = (frame: string): void => {
          if (frame.length > maxFrameBytes) {
            throw new Error(
              `JSON-RPC frame exceeded ${maxFrameBytes} bytes without terminator.`,
            );
          }
        };

        if (framing === 'lines') {
          const parts = buffer.split('\n');
          buffer = parts.pop() ?? '';
          for (const line of parts) {
            assertFrameSize(line);
            const trimmed = line.trim();
            if (trimmed.length > 0) {
              beginDispatch(trimmed);
            }
          }
        } else {
          // JSON framing: extract balanced JSON values.
          let consumed = 0;
          let rest = buffer;
          while (rest.length > 0) {
            const slice = extractJsonValue(rest);
            if (slice === undefined) break;
            consumed += slice.length;
            rest = rest.slice(slice.length);
            assertFrameSize(slice);
            if (slice.trim().length > 0) {
              beginDispatch(slice);
            }
          }
          buffer = rest;
        }

        assertFrameSize(buffer);
      } catch (error) {
        reject(error);
      }
    };

    const onEnd = () => {
      // Flush any trailing frame (no trailing newline).
      const trailing = framing === 'lines' ? buffer.trim() : buffer.trim();
      buffer = '';
      if (trailing.length > 0) {
        beginDispatch(trailing);
      }
      input.off('data', onData);
      input.off('end', onEnd);
      input.off('error', onError);
      void (async () => {
        try {
          // A finishing dispatch cannot start another one, but deletion from
          // `inflight` races the Promise.all callback, so repeat until quiet.
          while (inflight.size > 0) {
            await Promise.all([...inflight]);
          }
          await writeChain;
          resolve();
        } catch (error) {
          reject(error);
        }
      })();
    };

    const onError = (error: Error) => {
      input.off('data', onData);
      input.off('end', onEnd);
      input.off('error', onError);
      reject(error);
    };

    input.on('data', onData);
    input.on('end', onEnd);
    input.on('error', onError);
  });
}

interface StdioContext {
  repository: Repository;
  options: StdioOptions;
  injectables: Injections;
  writeChain: () => Promise<void>;
  setWriteChain: (p: Promise<void>) => void;
  output: Writable;
}

async function dispatch(ctx: StdioContext, text: string): Promise<void> {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch (error) {
    await writeResponse(ctx, {
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
    await writeStream(ctx, output);
    return;
  }

  await writeResponse(ctx, output);
}

async function writeStream(
  ctx: StdioContext,
  stream: RPCStreamSuccess,
): Promise<void> {
  try {
    for await (const chunk of stream.chunks) {
      await writeFrame(ctx, chunk);
    }
  } catch (error) {
    if (process.env['NODE_ENV'] !== 'production') {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to stream JSON-RPC response over stdio', message, error);
    }
  }
}

async function writeResponse(
  ctx: StdioContext,
  payload: RPCResponse,
): Promise<void> {
  await enqueueWrite(ctx, payload);
}

async function writeFrame(
  ctx: StdioContext,
  chunk: RPCStreamChunk,
): Promise<void> {
  await enqueueWrite(ctx, chunk);
}

async function enqueueWrite(
  ctx: StdioContext,
  payload: RPCResponse | RPCStreamChunk,
): Promise<void> {
  const run = async (): Promise<void> => {
    let text: string;
    let reported: RPCResponse | undefined;
    try {
      text = (await stringify(payload)) + '\n';
      if (!('chunks' in payload)) reported = payload as RPCResponse;
    } catch (error) {
      reported = serializationFailure(frameId(payload), error);
      text = JSON.stringify(reported) + '\n';
    }
    await writeLine(ctx, text);
    if (reported && ctx.options.onResponse) {
      try {
        ctx.options.onResponse(reported);
      } catch {
        /* ignore listener errors */
      }
    }
  };

  // Run after the previous write whether that write succeeded or failed,
  // so one bad payload cannot stall the rest of the chain.
  const next = ctx.writeChain().then(run, run);
  ctx.setWriteChain(next);
  await next;
}

function writeLine(ctx: StdioContext, text: string): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    try {
      const flushed = ctx.output.write(text, 'utf8', finish);
      if (flushed) {
        // Node may not call the callback if the buffer was already flushed
        // for some streams; still resolve on next tick to be safe.
        queueMicrotask(finish);
      }
    } catch (error) {
      if (process.env['NODE_ENV'] !== 'production') {
        console.error('Failed to write JSON-RPC response to stdio', error);
      }
      finish();
    }
  });
}

function frameId(payload: RPCResponse | RPCStreamChunk): RPCResId {
  const id = payload.id;
  if (typeof id === 'string' || typeof id === 'number') return id;
  return null;
}

function serializationFailure(id: RPCResId, error: unknown): RPCFailure {
  const message = error instanceof Error ? error.message : String(error);
  const failure: RPCFailure = {
    jsonrpc: RPCVersion,
    id,
    error: {
      code: INTERNAL_ERROR,
      message: 'Internal error',
    },
  };
  if (process.env['NODE_ENV'] !== 'production') {
    failure.error.data = message;
  }
  return failure;
}

function buildInjectables(
  factory: InjectableFactory | undefined,
  repository: Repository,
): Injections {
  const injections = typeof factory === 'function'
    ? {
      ...factory({
        input: process.stdin,
        output: process.stdout
      }, repository),
      repository
    }
    : {
      repository,
      input: process.stdin,
      output: process.stdout,
    }
  return { ...injections, injections: injections };
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

/**
 * Scan `text` for the first complete JSON value and return it.
 * Returns `undefined` if `text` does not yet contain a complete value.
 */
function extractJsonValue(text: string): string | undefined {
  let i = 0;
  // Skip leading whitespace.
  while (i < text.length && isWs(text.charCodeAt(i))) i++;
  if (i >= text.length) return undefined;

  const start = i;
  const first = text.charCodeAt(i);
  if (first !== 0x7b /* { */ && first !== 0x5b /* [ */) {
    // Primitive top-level values (unusual for RPC, but JSON-valid).
    // Consume until whitespace or end.
    while (i < text.length && !isWs(text.charCodeAt(i))) i++;
    if (i >= text.length) return undefined;
    return text.slice(start, i);
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === 0x5c /* \ */) {
        escaped = true;
      } else if (ch === 0x22 /* " */) {
        inString = false;
      }
      continue;
    }
    if (ch === 0x22) {
      inString = true;
    } else if (ch === 0x7b || ch === 0x5b) {
      depth++;
    } else if (ch === 0x7d || ch === 0x5d) {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return undefined;
}

function isWs(code: number): boolean {
  // space, \t, \n, \r
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}