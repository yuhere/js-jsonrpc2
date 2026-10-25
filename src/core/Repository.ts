import { RPCError } from '../errors/RPCError';
import { INTERNAL_ERROR, INVALID_REQUEST } from '../errors/codes';
import { buildDescriptor, lookup, signatureOf } from './descriptor';
import type { MethodDescriptor } from './descriptor';
import { convertParams } from './convert';
import { checkPermission } from './permission';
import { validateRequest } from './spec-check';
import { registerSystemMethods } from './system-methods';
import { registerSchema } from '../schema/z/register';
import { RPCVersion } from "../schema/z/protocol";
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
  RepositoryOptions
} from '../types';

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

export class Repository {
  private readonly methods = new Map<string, MethodDescriptor>();

  constructor(options: RepositoryOptions = {}) {
    if (options.withSystemMethods !== false) {
      registerSystemMethods(this);
    }
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
    try {
      const request = validateRequest(input) as RPCRequestInput;
      const id: RPCResId = request.id;
      try {
        const descriptor = lookup(this.methods, request.method);
        await checkPermission(descriptor, injections);
        const converted = await convertParams(descriptor, request.params, injections);
        try { // errorTransform only apply when error occurs of actual call
          const result = await descriptor.fn.apply(descriptor, converted);
          const isStreamReturn = descriptor.shouldStreamReturn && isAsyncIterable(result);
          if (isStreamReturn) {
            return this.streamSuccess(id, result);
          }
          return { jsonrpc: RPCVersion, id, result };
        } catch (e0) {
          if (errorTransform) {
            const transformed = errorTransform(e0);
            if (transformed) return this.failure(id, transformed);
          }
          throw e0;
        }
      } catch (error) {
        if (error instanceof RPCError) {
          return this.failure(id, error);
        }
        const message = error instanceof Error ? error.message : String(error);
        if (process.env['NODE_ENV'] !== 'production') {
          console.error('Internal JSON-RPC error when invoke method', message, error);
        }
        return this.failure(id, new RPCError(INTERNAL_ERROR, 'Internal error', message));
      }
    } catch (e1) {
      if (e1 instanceof RPCError) {  // 
        return this.failure(null, new RPCError(INVALID_REQUEST, 'Invalid Request', e1.message));
      }
      // ##############
      const message = e1 instanceof Error ? e1.message : String(e1);
      if (process.env['NODE_ENV'] !== 'production') {
        console.error('Internal JSON-RPC error when invoke method', message, e1);
      }
      return this.failure(null, new RPCError(INTERNAL_ERROR, 'Internal error', message));
    }
  }

  /**
   * 把 handler 返回的 AsyncGenerator 包装成待消费的 chunk 流。
   * 每帧都是完整的 RPCStreamChunk（含 jsonrpc/id）。
   * 不做 chunk 的 schema 校验（按约定）。
   * 正常结束发 {done:true,index}；异常终止发 {done:true,index?,error}。
   */
  private async *streamChunks(
    id: RPCReqId,
    source: AsyncGenerator<unknown, unknown, unknown>,
  ): AsyncGenerator<RPCStreamChunk, void, unknown> {
    let index = 0;
    try {
      while (true) {
        const step = await source.next();
        if (step.done) {
          yield { jsonrpc: RPCVersion, id, done: true, index };
          return;
        }
        yield { jsonrpc: RPCVersion, id, done: false, index: index++, value: step.value };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = error instanceof RPCError ? error.code : INTERNAL_ERROR;
      if (process.env['NODE_ENV'] !== 'production' && !(error instanceof RPCError)) {
        console.error('Internal JSON-RPC stream error', message, error);
      }
      yield { jsonrpc: RPCVersion, id, done: true, index, error: { code, message } };
    } finally {
      // 客户端断开或异常时，尽量让 handler 侧能感知并清理。
      try {
        await source.return?.(undefined);
      } catch {
        /* ignore cleanup errors */
      }
    }
  }

  private streamSuccess(
    id: RPCReqId,
    source: AsyncGenerator<unknown, unknown, unknown>,
  ): RPCStreamSuccess {
    return {
      jsonrpc: RPCVersion,
      id,
      chunks: this.streamChunks(id, source),
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