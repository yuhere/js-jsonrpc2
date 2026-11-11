import { describe, expect, it } from 'vitest';
import { createRepository, s, RPCError } from '../../src/index';
import { METHOD_NOT_FOUND } from '../../src/errors/codes';
import { createMemoryMetrics } from '../../src/metrics/memory';

describe('metrics for unknown methods', () => {
    it('counts missing methods under a single <unknown> label', async () => {
        const metrics = createMemoryMetrics();
        const repo = createRepository({ withSystemMethods: false, metrics });
        repo.register(
            { namespace: 'add', signature: [s.number(), s.number(), s.number()] },
            (a: number, b: number) => a + b,
        );
        repo.register(
            { namespace: 'wrap', signature: [s.string()] },
            () => {
                throw new RPCError(METHOD_NOT_FOUND, 'Method not found');
            },
        );

        const added = await repo.invoke({ jsonrpc: '2.0', method: 'add', params: [1, 2], id: 1 });
        expect(added).toMatchObject({ result: 3 });

        for (let i = 0; i < 50; i++) {
            const method = `missing.${i}.${Math.random().toString(36).slice(2)}`;
            const res = await repo.invoke({ jsonrpc: '2.0', method, params: [], id: i });
            expect(res).toMatchObject({ error: { code: METHOD_NOT_FOUND } });
        }

        const wrapped = await repo.invoke({ jsonrpc: '2.0', method: 'wrap', params: [], id: 80 });
        expect(wrapped).toMatchObject({ error: { code: METHOD_NOT_FOUND } });

        const invalid = await repo.invoke({ jsonrpc: '1.0', method: 'nope', params: [], id: 81 });
        expect(invalid).toMatchObject({ error: { code: -32600 } });

        const snap = metrics.snapshot();
        expect(Object.keys(snap.methods).sort()).toEqual(['<unknown>', 'add', 'wrap']);
        expect(snap.methods['<unknown>']!.calls).toBe(50);
        expect(snap.methods['<unknown>']!.errorsByCode[String(METHOD_NOT_FOUND)]).toBe(50);
        expect(snap.methods['add']!.calls).toBe(1);
        expect(snap.methods['wrap']!.calls).toBe(1);
        expect(snap.invalidRequests).toBe(1);
    });
});
