import type { RPCErrorPayload } from './types';
import { createHttpRpc, type HttpRpcOptions } from './httpTransport';
import { createWsRpc, type WsRpcOptions } from './wsTransport';

export type TransportKind = 'http' | 'ws';

export type CallResult<T> = Promise<T> | AsyncGenerator<T, void, unknown>;

export interface RpcClient {
  call<T = unknown>(method: string, ...params: unknown[]): CallResult<T>;
  close(): void;
}

export interface RpcOptions {
  transport: TransportKind;
  endpoint?: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  connectTimeoutMs?: number;
  callTimeoutMs?: number;
}

export class RPCError extends Error {
  constructor(public payload: RPCErrorPayload) {
    super(payload.message);
    this.name = 'RPCError';
  }

  get code(): number { return this.payload.code; }
  get data(): unknown { return this.payload.data; }
}

export function isStreamResult<T>(v: CallResult<T>): v is AsyncGenerator<T, void, unknown> {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as AsyncGenerator<T>)[Symbol.asyncIterator] === 'function'
  );
}

export function createRpc(options: RpcOptions): RpcClient {
  if (options.transport === 'ws') {
    const wsOpts: WsRpcOptions = {
      endpoint: options.endpoint,
      connectTimeoutMs: options.connectTimeoutMs,
      callTimeoutMs: options.callTimeoutMs,
    };
    return createWsRpc(wsOpts);
  }

  const httpOpts: HttpRpcOptions = {
    endpoint: options.endpoint,
    headers: options.headers,
    fetchImpl: options.fetchImpl,
  };
  return createHttpRpc(httpOpts);
}