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

  it('echoes a string or number id and the schema detail when validation fails', async () => {
    const repository = buildRepository();
    const wrongVersion = await repository.invoke({
      jsonrpc: '1.0',
      method: 'subtract',
      params: [1, 2],
      id: 7,
    });
    expect(wrongVersion).toMatchObject({
      id: 7,
      error: { code: -32600, message: 'Invalid Request' },
    });
    expect(wrongVersion).toHaveProperty('error.data');
    if ('error' in wrongVersion) {
      expect(wrongVersion.error.data).toEqual(expect.stringContaining('2.0'));
      expect(wrongVersion.error.data).not.toBe('Invalid Request');
    }

    const extra = await repository.invoke({
      jsonrpc: '2.0',
      method: 'subtract',
      params: [1, 2],
      id: 1,
      extra: true,
    });
    expect(extra).toMatchObject({
      id: 1,
      error: { code: -32600, message: 'Invalid Request' },
    });
    if ('error' in extra) {
      expect(extra.error.data).toEqual(expect.stringContaining('extra'));
    }
  });

  it('uses a null id when the request id is an object or array', async () => {
    const repository = buildRepository();
    const objectId = await repository.invoke({
      jsonrpc: '2.0',
      method: 'subtract',
      params: [1, 2],
      id: { n: 1 },
    });
    const arrayId = await repository.invoke({
      jsonrpc: '2.0',
      method: 'subtract',
      params: [1, 2],
      id: [1],
    });
    expect(objectId).toMatchObject({ id: null, error: { code: -32600 } });
    expect(arrayId).toMatchObject({ id: null, error: { code: -32600 } });
  });

  it('omits invalid-request data in production', async () => {
    const previous = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      const repository = buildRepository();
      const res = await repository.invoke({
        jsonrpc: '1.0',
        method: 'subtract',
        params: [1, 2],
        id: 7,
      });
      expect(res).toMatchObject({
        id: 7,
        error: { code: -32600, message: 'Invalid Request' },
      });
      if ('error' in res) expect(res.error).not.toHaveProperty('data');
    } finally {
      if (previous === undefined) delete process.env['NODE_ENV'];
      else process.env['NODE_ENV'] = previous;
    }
  });
});
