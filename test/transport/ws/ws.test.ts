import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { Repository } from '../../../src/core/Repository';
import { s } from '../../../src/schema/json';
import { attachWebSocket } from '../../../src/transport/ws';
import { installDebugMethods } from '../express/fixtures/test';

function buildRepository() {
    const repository = new Repository({});
    installDebugMethods(repository);
    return repository;
}

describe('ws transport (protocol layer)', () => {
    it('invokes methods through Repository', async () => {
        const repository = buildRepository();
        const res = await repository.invoke({ jsonrpc: '2.0', method: 'subtract', params: [42, 23], id: 1 });
        expect(res).toEqual({ jsonrpc: '2.0', id: 1, result: 19 });
    });

    it('rejects batch through Repository', async () => {
        const repository = buildRepository();
        const res = await repository.invoke([{ jsonrpc: '2.0', method: 'sum', params: [1, 2, 4], id: '1' }]);
        expect(res).toMatchObject({ id: null, error: { code: -32600 } });
    });
});

describe('ws transport (two paths on one server)', () => {
    it('lets both upgrade listeners accept their own path', async () => {
        const server = createServer();
        const makeRepo = (label: string) => {
            const repository = new Repository({ withSystemMethods: false });
            repository.register(
                { namespace: 'who', signature: [s.string()] },
                () => label,
            );
            return repository;
        };
        const wssA = attachWebSocket(server, makeRepo('a'), { path: '/a' });
        const wssB = attachWebSocket(server, makeRepo('b'), { path: '/b' });
        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', () => resolve());
        });
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;

        const call = async (path: string) => {
            const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
            try {
                await new Promise<void>((resolve, reject) => {
                    ws.once('open', () => resolve());
                    ws.once('error', reject);
                });
                const message = new Promise<string>((resolve, reject) => {
                    const timer = setTimeout(() => reject(new Error(`no frame on ${path}`)), 1000);
                    ws.once('message', (data) => {
                        clearTimeout(timer);
                        resolve(String(data));
                    });
                });
                ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'who', params: [], id: 1 }));
                return JSON.parse(await message) as { result?: string };
            } finally {
                ws.close();
            }
        };

        try {
            expect((await call('/b')).result).toBe('b');
            expect((await call('/a')).result).toBe('a');
        } finally {
            await new Promise<void>((resolve) => wssA.close(() => resolve()));
            await new Promise<void>((resolve) => wssB.close(() => resolve()));
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });
});

describe.skip('ws transport (wire level)', () => {
    it('placeholder: requires src/transport/ws implementation', () => {
        expect(true).toBe(true);
    });
});