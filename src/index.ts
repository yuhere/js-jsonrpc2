import { Repository, createRepository } from './core/Repository';
import { RPCError } from './errors/RPCError';
import * as codes from './errors/codes';
import { s } from './schema/json';

export { Repository, createRepository };
export { RPCError };
export { codes };
export { s };
export * from './types';

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
