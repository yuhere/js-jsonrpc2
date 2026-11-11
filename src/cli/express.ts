import { createServer } from 'node:http';
import express from 'express';
import { attachWebSocket, createRepository, createExpressRouter } from '..';
import { installDemoMethods } from './demo-methods';
import type { MethodDescriptor } from "../core/descriptor";
import type { PermCheck } from "../types";

const app = express();
const repository = createRepository({ withSystemMethods: true });
installDemoMethods(repository);

app.use('/', createExpressRouter(repository, {
    mkInjectable: ({ request, response }, repository) => {
        const injections = {
            request,
            response,
            repository: repository,
            perm_check: (() => {
                return (grantTo: string[], descriptor: MethodDescriptor): boolean => {
                    console.log("perm_check:", descriptor.namespace, grantTo);
                    return true;
                }
            }) as unknown as PermCheck,
            requestId: `ws-${Math.random().toString(36).slice(2, 8)}`,
        };
        return injections;
    },
    useHtdoc: true
}));

const server = createServer(app);

// websocket
attachWebSocket(server, repository, {
    path: '/',
    mkInjectable: ({ socket, request }, repo) => ({
        socket,
        request,
        repository: repo,
        // 给 stream.withInject 提供一个稳定 id
        requestId: `ws-${Math.random().toString(36).slice(2, 8)}`,
    }),
});

const port = Number(process.env['PORT'] ?? 5000);
server.listen(port, () => {
    console.log(`js-jsonrpc2 debug server listening on http://localhost:${port}`);
});