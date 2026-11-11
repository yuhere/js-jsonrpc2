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
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ id: null, error: { code: -32700, message: 'Parse error' } });
    });

    it('returns 415 for a POST that is not JSON', async () => {
        const { app } = buildApp();
        const cases = await Promise.all([
            request(app).post('/').set('Content-Type', 'text/plain').send('hi'),
            request(app).post('/').unset('Content-Type').send('hi'),
            request(app).post('/').set('Content-Type', 'application/x-www-form-urlencoded').send('a=1'),
        ]);
        for (const res of cases) {
            expect(res.status).toBe(415);
            expect(res.headers['content-type']).toMatch(/application\/json/);
            expect(res.body).toEqual({
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: -32600,
                    message: 'Invalid Request',
                    data: 'Content-Type must be application/json',
                },
            });
        }
    });

    it('accepts application/json with a charset', async () => {
        const { app } = buildApp();
        const res = await request(app)
            .post('/')
            .set('Content-Type', 'application/json; charset=utf-8')
            .send(JSON.stringify({ jsonrpc: '2.0', method: 'subtract', params: [4, 1], id: 1 }));
        expect(res.status).toBe(200);
        expect(res.body.result).toBe(3);
    });

    it('does not turn GET into a JSON-RPC media-type error', async () => {
        const { app } = buildApp();
        const res = await request(app).get('/');
        expect(res.status).not.toBe(415);
    });

    it('omits media-type error data in production', async () => {
        const previous = process.env['NODE_ENV'];
        process.env['NODE_ENV'] = 'production';
        try {
            const { app } = buildApp();
            const res = await request(app).post('/').set('Content-Type', 'text/plain').send('hi');
            expect(res.status).toBe(415);
            expect(res.body.error).toEqual({ code: -32600, message: 'Invalid Request' });
            expect(res.body.error).not.toHaveProperty('data');
        } finally {
            if (previous === undefined) delete process.env['NODE_ENV'];
            else process.env['NODE_ENV'] = previous;
        }
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

    it('system.methodSignature reports nullable union without member nullability', async () => {
        const { app } = buildApp();
        const res = await rpc(app, JSON.stringify({
            jsonrpc: '2.0',
            method: 'system.methodSignature',
            params: ['union.nullable'],
            id: 1,
        }));
        const [ret] = res.body.result;
        expect(ret.kind).toBe('union');
        expect(ret.nullable).toBe(true);
        const options = ret.options;
        expect(options.every((o: any) => o.nullable === undefined)).toBe(true);
    });

});