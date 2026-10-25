import { createServer, type Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { Repository } from '../../core/Repository';
import { attachWebSocket, type WSOptions } from './middleware';

export interface StandaloneWsOptions extends WSOptions {
  /** Existing HTTP server to attach to. If omitted, one is created. */
  server?: Server;
  /** Port for the auto-created server. */
  port?: number;
  /** Host for the auto-created server. */
  host?: string;
}

export interface StandaloneWsHandle {
  server: Server;
  wss: WebSocketServer;
  close(): Promise<void>;
}

/**
 * Create a standalone HTTP server (unless one is provided) and attach the
 * JSON-RPC WebSocket endpoint. Returns a handle for clean shutdown.
 */
export async function createWebSocketServer(
  options: StandaloneWsOptions = {},
): Promise<StandaloneWsHandle> {
  const server = options.server ?? createServer();
  const wss = attachWebSocket(server, new Repository(), options);

  if (!options.server) {
    const port = options.port ?? 8080;
    const host = options.host ?? '127.0.0.1';
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, host);
    });
  }

  return {
    server,
    wss,
    async close() {
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      if (!options.server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
  };
}