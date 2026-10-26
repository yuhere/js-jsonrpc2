import { RPCError } from './errors/RPCError';
import * as s from "./schema/json";
import type { RPCVersion } from "./schema/z/protocol";
export type RPCReturnSlot = s.Schema<unknown> | s.VoidMarker | s.StreamMarker<unknown>;
export type RPCParamSlot = s.Schema<unknown> | s.InjectableMarker;
export type RPCSignature = [RPCReturnSlot, ...RPCParamSlot[]];
export type RPCDocument = string | ((descriptor: RPCDescriptor) => string | Promise<string> | void);
export type RPCDescriptor = {
  namespace: string;
  document?: RPCDocument;
  grantTo?: string[];
  signature: RPCSignature;
};
import { Repository } from "./core/Repository";

// ########################################
export type RPCHandler = (...args: any[]) => unknown;
export type RPCRegisterArgs = [RPCDescriptor, RPCHandler];

export type RPCReqId = string | number;
export type RPCResId = RPCReqId | null;

/**
 * 流式响应的单帧（完整帧，自带 jsonrpc/id）。
 * - 正常数据帧：{ jsonrpc, id, done: false, index, value }
 * - 正常结束帧：{ jsonrpc, id, done: true, index }
 * - 异常终止帧：{ jsonrpc, id, done: true, index?, error: { code, message } }
 */
export interface RPCStreamChunk {
  jsonrpc: RPCVersion;
  id: RPCReqId;
  done: boolean;
  index?: number;
  value?: unknown;
  error?: { code: number; message: string };
}

export interface RPCSuccess {
  jsonrpc: RPCVersion;
  id: RPCReqId;
  result: unknown;
}

export interface RPCStreamSuccess {
  jsonrpc: RPCVersion;
  id: RPCReqId;
  chunks: AsyncGenerator<RPCStreamChunk, void, unknown>;
}

export interface RPCErrorPayload {
  code: number;
  message: string;
  data?: unknown;
}

export interface RPCFailure {
  jsonrpc: RPCVersion;
  id: RPCResId;
  error: RPCErrorPayload;
}

export type RPCResponse = RPCSuccess | RPCStreamSuccess | RPCFailure;

// ########################################

export type Injections = Record<string, unknown | (() => unknown | Promise<unknown>)>;

export interface InjectableFactory {
  (options: Record<string, unknown>, repository: Repository): Injections;
}

export interface RPCRequestInput {
  jsonrpc: RPCVersion;
  method: string;
  params: unknown[];
  id: RPCReqId;
}

export interface InvokeOptions {
  injections?: Injections;
  errorTransform?: RPCErrorTransform | undefined;
}

export interface RepositoryOptions {
  withSystemMethods?: boolean;
}

export type RPCErrorTransform = (error: unknown) => RPCError | undefined;

// ##############
export interface LlmToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export type LlmTools = Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>
  };
}>;
