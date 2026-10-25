import { describe, it, expect } from 'vitest';
import { Repository } from '../../src/core/Repository';
import { installDebugMethods } from '../transport/express/fixtures/test';

function buildRepository() {
  const repository = new Repository({});
  installDebugMethods(repository);
  return repository;
}

describe('JSON-RPC 2.0 specification (protocol)', () => {
  it('handles positional parameters', async () => {
    const repository = buildRepository();
    const res = await repository.invoke({ jsonrpc: '2.0', method: 'subtract', params: [42, 23], id: 1 });
    expect(res).toEqual({ jsonrpc: '2.0', id: 1, result: 19 });
  });

  it('rejects missing id (no notification support)', async () => {
    const repository = buildRepository();
    const res = await repository.invoke({ jsonrpc: '2.0', method: 'update', params: [1, 2, 3] });
    expect(res).toMatchObject({ id: null, error: { code: -32600, message: 'Invalid Request' } });
  });

  it('rejects non-existent methods', async () => {
    const repository = buildRepository();
    const res = await repository.invoke({ jsonrpc: '2.0', method: 'foobar', id: '1', params: null });
    expect(res).toMatchObject({ id: '1', error: { code: -32601, message: 'Method not found' } });
  });

  it('rejects invalid request objects', async () => {
    const repository = buildRepository();
    const res = await repository.invoke({ jsonrpc: '2.0', method: 1, params: 'bar' });
    expect(res).toMatchObject({ id: null, error: { code: -32600, message: 'Invalid Request' } });
  });

  it('does not support batch at repository level', async () => {
    const repository = buildRepository();
    const res = await repository.invoke([{ jsonrpc: '2.0', method: 'sum', params: [1, 2, 4], id: '1' }]);
    expect(res).toMatchObject({ id: null, error: { code: -32600 } });
  });
});
