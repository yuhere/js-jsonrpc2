import { describe, it, expect } from 'vitest';
import { Repository } from '../../../src/core/Repository';
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

describe.skip('ws transport (wire level)', () => {
    it('placeholder: requires src/transport/ws implementation', () => {
        expect(true).toBe(true);
    });
});