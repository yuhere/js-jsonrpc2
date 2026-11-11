import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { installDemoMethods } from '../../src/cli/demo-methods';
import { createRepository } from '../../src/core/Repository';
import { createExpressRouter } from '../../src/transport/express';

describe('demo perm_check', () => {
    it('calls a grantTo method when perm_check is a direct callback', async () => {
        const repository = createRepository({ withSystemMethods: false });
        installDemoMethods(repository);
        const app = express();
        app.use('/', createExpressRouter(repository, {
            useHtdoc: false,
            mkInjectable: () => ({
                perm_check: (grantTo, descriptor) => {
                    expect(descriptor.namespace).toBe('stream.misdeclared');
                    expect(grantTo).toEqual(['a']);
                    return true;
                },
            }),
        }));

        const res = await request(app)
            .post('/')
            .set('Content-Type', 'application/json')
            .send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'stream.misdeclared',
                params: [],
                id: 1,
            }));

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            jsonrpc: '2.0',
            id: 1,
            result: 'not a stream',
        });
    });
});
