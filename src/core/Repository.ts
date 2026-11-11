import { RPCError } from '../errors/RPCError';
import { INTERNAL_ERROR, INVALID_REQUEST } from '../errors/codes';
import { buildDescriptor, lookup, signatureOf } from './descriptor';
import type { MethodDescriptor } from './descriptor';
import { convertParams } from './convert';
import { checkPermission } from './permission';
import { validateRequest } from './spec-check';
import { registerSystemMethods } from './system-methods';
import { listLlmTools, invokeLlmTool } from './llm-tools';
import { registerSchema } from '../schema/z/register';
import { RPCVersion } from '../schema/z/protocol';
import type { z } from 'zod';
import type {
  RPCDescriptor,
  RPCFailure,
  RPCHandler,
  RPCRequestInput, RPCResId,
  RPCResponse, RPCReqId,
  RPCStreamChunk,
  RPCStreamSuccess,
  InvokeOptions,
  RepositoryOptions,
  RPCMetrics,
  LlmToolCall, LlmTools, Injections
} from '../types';
import { createMemoryMetrics } from '../metrics/memory';

function formatRegisterIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

function isAsyncIterable(v: unknown): v is AsyncGenerator<unknown> {
  return v != null && typeof (v as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function';
}

function safeMetrics(fn: (() => void) | undefined): void {
  if (!fn) return;
  try {
    fn();
  } catch (error) {
    if (process.env['NODE_ENV'] !== 'production') {
      console.error('RPCMetrics hook threw', error);
    }
  }
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** JSON-RPC: echo id only when the request object actually carries a string or number. */
function detectedRequestId(input: unknown): RPCResId {
  if (!isPlainObject(input)) return null;
  const id = input['id'];
  if (typeof id === 'string' || typeof id === 'number') return id;
  return null;
}

export class Repository {
  private readonly methods = new Map<string, MethodDescriptor>();
  private readonly metrics: RPCMetrics;

  constructor(options: RepositoryOptions = {}) {
    this.metrics = options.metrics || createMemoryMetrics();

    if (options.withSystemMethods !== false) {
      registerSystemMethods(this);
    }
  }

  getMetrics(): RPCMetrics {
    return this.metrics;
  }

  register(descriptor: RPCDescriptor, fn: RPCHandler): void {
    const result = registerSchema.safeParse([descriptor, fn]);
    if (!result.success) {
      throw new TypeError(`Invalid RPC descriptor: ${formatRegisterIssues(result.error)}`);
    }
    const built = buildDescriptor(descriptor, fn);
    this.methods.set(built.namespace, built);
  }

  has(namespace: string): boolean {
    return this.methods.has(namespace);
  }

  list(): string[] {
    return [...this.methods.keys()];
  }

  get(namespace: string): MethodDescriptor | undefined {
    return this.methods.get(namespace);
  }

  signatureOf(descriptor: MethodDescriptor): unknown[] {
    return signatureOf(descriptor);
  }

  async invoke(input: unknown, options: InvokeOptions = {}): Promise<RPCResponse> {
    const { injections = {}, errorTransform } = options;
    const metrics = this.metrics;
    const startedAt = metrics ? now() : 0;
    let methodForMetrics = '<invalid>';
    let callStartEmitted = false;

    try {
      const request = validateRequest(input) as RPCRequestInput;
      methodForMetrics = request.method;

      if (metrics) {
        callStartEmitted = true;
        safeMetrics(() => metrics.onCallStart({ method: methodForMetrics }));
      }

      const id: RPCResId = request.id;
      try {
        const descriptor = lookup(this.methods, request.method);
        await checkPermission(descriptor, injections);
        const converted = await convertParams(descriptor, request.params, injections);
        try { // errorTransform only apply when error occurs of actual call
          const result = await descriptor.fn.apply(descriptor, converted);
          const isStreamReturn = descriptor.shouldStreamReturn && isAsyncIterable(result);
          if (isStreamReturn) {
            if (metrics) {
              const durationSeconds = (now() - startedAt) / 1000;
              safeMetrics(() => metrics.onCallEnd({
                method: methodForMetrics,
                status: 'stream_opened',
                durationSeconds,
              }));
              safeMetrics(() => metrics.onStreamEvent?.({
                method: methodForMetrics,
                event: 'opened',
                chunks: 0,
                durationSeconds,
              }));
            }
            return this.streamSuccess(id, result, methodForMetrics, startedAt);
          }
          if (metrics) {
            const durationSeconds = (now() - startedAt) / 1000;
            safeMetrics(() => metrics.onCallEnd({
              method: methodForMetrics,
              status: 'success',
              durationSeconds,
            }));
          }
          return { jsonrpc: RPCVersion, id, result };
        } catch (e0) {
          if (errorTransform) {
            const transformed = errorTransform(e0);
            if (transformed) {
              if (metrics) {
                const durationSeconds = (now() - startedAt) / 1000;
                safeMetrics(() => metrics.onCallEnd({
                  method: methodForMetrics,
                  status: 'error',
                  code: transformed.code,
                  durationSeconds,
                }));
              }
              return this.failure(id, transformed);
            }
          }
          throw e0;
        }
      } catch (error) {
        if (error instanceof RPCError) {
          if (metrics) {
            const durationSeconds = (now() - startedAt) / 1000;
            safeMetrics(() => metrics.onCallEnd({
              method: methodForMetrics,
              status: 'error',
              code: error.code,
              durationSeconds,
            }));
          }
          return this.failure(id, error);
        }
        const message = error instanceof Error ? error.message : String(error);
        if (process.env['NODE_ENV'] !== 'production') {
          console.error('Internal JSON-RPC error when invoke method', message, error);
        }
        if (metrics) {
          const durationSeconds = (now() - startedAt) / 1000;
          safeMetrics(() => metrics.onCallEnd({
            method: methodForMetrics,
            status: 'error',
            code: INTERNAL_ERROR,
            durationSeconds,
          }));
        }
        return this.failure(id, new RPCError(INTERNAL_ERROR, 'Internal error', message));
      }
    } catch (e1) {
      if (metrics) {
        if (!callStartEmitted) {
          callStartEmitted = true;
          safeMetrics(() => metrics.onCallStart({ method: '<invalid>' }));
        }
        const durationSeconds = (now() - startedAt) / 1000;
        const code = e1 instanceof RPCError ? e1.code : INTERNAL_ERROR;
        safeMetrics(() => metrics.onCallEnd({
          method: methodForMetrics,
          status: 'error',
          code,
          durationSeconds,
        }));
      }
      if (e1 instanceof RPCError) {
        return this.failure(
          detectedRequestId(input),
          new RPCError(INVALID_REQUEST, 'Invalid Request', e1.data),
        );
      }
      const message = e1 instanceof Error ? e1.message : String(e1);
      if (process.env['NODE_ENV'] !== 'production') {
        console.error('Internal JSON-RPC error when invoke method', message, e1);
      }
      return this.failure(null, new RPCError(INTERNAL_ERROR, 'Internal error', message));
    }
  }

  async invokeLlmTool(call: LlmToolCall, injections: Injections): Promise<unknown> {
    return invokeLlmTool(this, call, injections);
  }

  async listLlmTools(injections: Injections, rawOptions?: unknown): Promise<LlmTools> {
    return listLlmTools(this, injections, rawOptions);
  }

  private async *streamChunks(
    id: RPCReqId,
    source: AsyncGenerator<unknown, unknown, unknown>,
    method: string,
    startedAt: number,
  ): AsyncGenerator<RPCStreamChunk, void, unknown> {
    const metrics = this.metrics;
    const streamStart = metrics ? now() : 0;
    let timeToFirstChunk: number | undefined;
    let chunks = 0;
    let completed = false;
    let failure: RPCError | Error | undefined;

    try {
      while (true) {
        const step = await source.next();
        if (step.done) {
          yield { jsonrpc: RPCVersion, id, done: true, index: chunks };
          completed = true;
          return;
        }
        if (chunks === 0 && metrics) {
          timeToFirstChunk = (now() - streamStart) / 1000;
        }
        yield { jsonrpc: RPCVersion, id, done: false, index: chunks++, value: step.value };
      }
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
      const message = failure.message;
      const code = error instanceof RPCError ? error.code : INTERNAL_ERROR;
      if (process.env['NODE_ENV'] !== 'production' && !(error instanceof RPCError)) {
        console.error('Internal JSON-RPC stream error', message, error);
      }
      yield { jsonrpc: RPCVersion, id, done: true, index: chunks, error: { code, message } };
      if (metrics) {
        const phase = chunks === 0 ? 'before_first_chunk' : 'mid_stream';
        const durationSeconds = (now() - streamStart) / 1000;
        safeMetrics(() => metrics.onStreamEvent?.({
          method,
          event: 'failed',
          phase,
          chunks,
          durationSeconds,
          ...(timeToFirstChunk !== undefined ? { timeToFirstChunkSeconds: timeToFirstChunk } : {}),
        }));
        if (phase === 'before_first_chunk') {
          // 首帧即失败：onCallEnd 已由 stream_opened 发过，这里补一次 stream_error
          // 让调用方按 status 区分（stream_opened 只减 inflight，stream_error 记 errors）
          safeMetrics(() => metrics.onCallEnd({
            method,
            status: 'stream_error',
            code,
            durationSeconds: (now() - startedAt) / 1000,
          }));
        }
      }
      return;
    } finally {
      try {
        await source.return?.(undefined);
      } catch {
        /* ignore cleanup errors */
      }
      if (metrics) {
        const durationSeconds = (now() - streamStart) / 1000;
        if (completed) {
          safeMetrics(() => metrics.onStreamEvent?.({
            method,
            event: 'completed',
            chunks,
            durationSeconds,
            ...(timeToFirstChunk !== undefined ? { timeToFirstChunkSeconds: timeToFirstChunk } : {}),
          }));
        } else if (!failure) {
          safeMetrics(() => metrics.onStreamEvent?.({
            method,
            event: 'aborted',
            chunks,
            durationSeconds,
            ...(timeToFirstChunk !== undefined ? { timeToFirstChunkSeconds: timeToFirstChunk } : {}),
          }));
        }
      }
    }
  }

  private streamSuccess(
    id: RPCReqId,
    source: AsyncGenerator<unknown, unknown, unknown>,
    method: string,
    startedAt: number,
  ): RPCStreamSuccess {
    return {
      jsonrpc: RPCVersion,
      id,
      chunks: this.streamChunks(id, source, method, startedAt),
    };
  }

  private failure(id: RPCResId, error: RPCError): RPCFailure {
    const data = process.env['NODE_ENV'] !== 'production' ? error.data : undefined;
    const payload = error.toPayload();
    if (data === undefined) delete payload.data;
    else payload.data = data;
    return { jsonrpc: RPCVersion, id, error: payload };
  }
}

export function createRepository(options: RepositoryOptions = {}): Repository {
  return new Repository(options);
}

export type { MethodDescriptor };