import { describe, it, expect } from 'vitest';
import { Repository } from '../../src/core/Repository';
import { RPCError } from '../../src/errors/RPCError';
import { s } from '../../src/schema/json';

class Boom extends Error { }

describe('Repository.invoke options', () => {
    it('maps domain error to custom RPCError', async () => {
        const repo = new Repository({ withSystemMethods: false });
        repo.register({ namespace: 'boom', signature: [s.number()] }, () => {
            throw new Boom('kaboom');
        });
        const res = await repo.invoke(
            { jsonrpc: '2.0', method: 'boom', params: [], id: 1 },
            { errorTransform: (e) => (e instanceof Boom ? new RPCError(-99999, 'Boom', e.message) : undefined) },
        );
        expect(res).toMatchObject({ id: 1, error: { code: -99999, message: 'Boom' } });
    });

    it('falls back to INTERNAL_ERROR when transform misses', async () => {
        const repo = new Repository({ withSystemMethods: false });
        repo.register({ namespace: 'boom', signature: [s.number()] }, () => {
            throw new Boom('kaboom');
        });
        const res = await repo.invoke({ jsonrpc: '2.0', method: 'boom', params: [], id: 1 });
        expect(res).toMatchObject({ id: 1, error: { code: -32603, message: 'Internal error' } });
    });
});