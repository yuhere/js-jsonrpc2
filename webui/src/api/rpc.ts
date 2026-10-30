import type { RPCErrorPayload } from './types';
import { createHttpRPC, type HttpRPCOptions } from './httpTransport';
import { createWsRPC, type WsRPCOptions } from './wsTransport';

export type TransportKind = 'http' | 'ws';

// export type CallResult<T> = Promise<T> | AsyncGenerator<T, void, unknown>;
export type CallResult<T> = Promise<T> | AsyncGenerator<T, void, unknown>;

export interface RPCClient {
    call<T = unknown>(method: string, ...params: unknown[]): Promise<T> & AsyncGenerator<T, void, unknown>;
    close(): void;
}

export interface RPCOptions {
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

export function createRPC(options: RPCOptions): RPCClient {
  if (options.transport === 'ws') {
    const wsOpts: WsRPCOptions = {
      endpoint: options.endpoint,
      connectTimeoutMs: options.connectTimeoutMs,
      callTimeoutMs: options.callTimeoutMs,
    };
    return createWsRPC(wsOpts);
  }

  const httpOpts: HttpRPCOptions = {
    endpoint: options.endpoint,
    headers: options.headers,
    fetchImpl: options.fetchImpl,
  };
  return createHttpRPC(httpOpts);
}