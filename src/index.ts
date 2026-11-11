import { Repository, createRepository } from './core/Repository';
import { RPCError } from './errors/RPCError';
import * as codes from './errors/codes';
import { s } from './schema/json';

export { Repository, createRepository };
export { RPCError };
export { codes };
export { s };
export type {
  Infer,
  Schema,
  SchemaDescription,
  JSONValue,
  JSONPrimitive,
  ObjectOutput,
  BaseSchemaDescription,
} from './schema/json';
export * from './types';
export { toAnthropicTools, type AnthropicTool, type LlmToolFormat } from './core/llm-tools';

// ################
import { createExpressRouter } from './transport/express';
export { createExpressRouter };
// ################
import { attachWebSocket, createWebSocketServer } from './transport/ws';
import { serveStdio } from './transport/stdio';

export { attachWebSocket, createWebSocketServer, serveStdio };
export type { WSOptions, StandaloneWsOptions, StandaloneWsHandle } from './transport/ws';
export type { StdioOptions } from './transport/stdio';
export type { ExpressOptions } from './transport/express';
export type { MethodDescriptor } from './core/descriptor';
