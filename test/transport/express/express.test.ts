import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createExpressRouter } from '../../../src/transport/express/middleware';
import { Repository } from '../../../src/core/Repository';
import { RPCError } from '../../../src/errors/RPCError';
import { installDebugMethods } from './fixtures/test';
import { s } from '../../../src/schema/json';

function buildApp(withGrant = false) {
    const repository = new Repository({});
    installDebugMethods(repository);
    if (withGrant) {
        repository.register(
            {
                namespace: 'grant',
                grantTo: ['grant'],
                signature: [s.string(), s.string()],
            },
            (v: string) => v,
        );
    }
    const app = express();
    app.use('/', createExpressRouter(repository, {}));
    return { app, repository };
}

const rpc = (app: express.Express, payload: unknown) =>
    request(app).post('/').set('Content-Type', 'application/json').send(payload as string);

class XxxError extends Error {
    constructor(message = 'XxxError.') {
        super(message);
        this.name = 'XxxError';
    }
}

describe('express integration', () => {
    it('handles positional parameters', async () => {
        const { app } = buildApp();
        const res = await rpc(app, JSON.stringify({ jsonrpc: '2.0', method: 'subtract', params: [42, 23], id: 1 }));
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ jsonrpc: '2.0', id: 1, result: 19 });
    });

    it('rejects batch with INVALID_REQUEST', async () => {
        const { app } = buildApp();
        const res = await rpc(app, JSON.stringify([{ jsonrpc: '2.0', method: 'sum', params: [1, 2, 4], id: '1' }]));
        expect(res.body).toMatchObject({ id: null, error: { code: -32600, message: 'Invalid Request' } });
    });

    it('reports parse errors', async () => {
        const { app } = buildApp();
        const res = await rpc(app, '{"jsonrpc": "2.0", "method": "foobar, "params": "bar", "baz]');
        expect(res.body).toMatchObject({ id: null, error: { code: -32700, message: 'Parse error' } });
    });

    it('applies permission via perm_check', async () => {
        const repository = new Repository({});
        installDebugMethods(repository, { withGrant: true });
        const app = express();
        app.use(
            '/',
            createExpressRouter(repository, {
                mkInjectable: ({ request }) => ({
                    request,
                    perm_check: async () => Boolean((request as express.Request).headers['grant']),
                }),
            }),
        );
        const denied = await rpc(app, JSON.stringify({ jsonrpc: '2.0', method: 'grant', params: ['grant'], id: 1 }));
        expect(denied.body.error.code).toBe(-32604);
        const allowed = await request(app)
            .post('/')
            .set('Content-Type', 'application/json')
            .set('grant', 'true')
            .send(JSON.stringify({ jsonrpc: '2.0', method: 'grant', params: ['grant'], id: 1 }));
        expect(allowed.body.result).toBe('grant');
    });

    it('transforms errors via errorTransform', async () => {
        const repository = new Repository({});
        installDebugMethods(repository);
        repository.register({ namespace: 'trans_err', signature: [s.number()] }, () => {
            throw new XxxError();
        });
        const app = express();
        app.use(
            '/',
            createExpressRouter(repository, {
                errorTransform: (error) =>
                    error instanceof XxxError ? new RPCError(-99999, 'XxxError', error.message) : undefined,
            }),
        );
        const res = await rpc(app, JSON.stringify({ jsonrpc: '2.0', method: 'trans_err', params: [], id: 1 }));
        expect(res.body.error).toMatchObject({ code: -99999, message: 'XxxError' });
    });

    it('serves system.* methods', async () => {
        const { app } = buildApp();
        const list = await rpc(app, JSON.stringify({ jsonrpc: '2.0', method: 'system.listMethods', params: [], id: 1 }));
        expect(Array.isArray(list.body.result)).toBe(true);
        const sig = await rpc(app, JSON.stringify({ jsonrpc: '2.0', method: 'system.methodSignature', params: ['system.listMethods'], id: 1 }));
        expect(Array.isArray(sig.body.result)).toBe(true);
        const help = await rpc(app, JSON.stringify({ jsonrpc: '2.0', method: 'system.methodHelp', params: ['system.listMethods'], id: 1 }));
        expect(typeof help.body.result).toBe('string');
    });
});