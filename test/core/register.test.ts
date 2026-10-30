import { describe, it, expect } from 'vitest';
import { Repository } from '../../src/core/Repository';
import { s } from '../../src/schema/json';

describe('Repository.register validation', () => {
    it('accepts a well-formed descriptor', () => {
        const repo = new Repository({ withSystemMethods: false });
        expect(() =>
            repo.register({ namespace: 'ok', signature: [s.string()] }, () => 'x'),
        ).not.toThrow();
    });

    it('rejects empty namespace', () => {
        const repo = new Repository({ withSystemMethods: false });
        expect(() =>
            repo.register({ namespace: '', signature: [s.string()] }, () => 'x'),
        ).toThrow(TypeError);
    });

    it('rejects non-function handler', () => {
        const repo = new Repository({ withSystemMethods: false });
        expect(() =>
            repo.register(
                { namespace: 'bad', signature: [s.string()] },
                123 as unknown as () => unknown,
            ),
        ).toThrow(TypeError);
    });

    it('rejects legacy doc/sign field names', () => {
        const repo = new Repository({ withSystemMethods: false });
        expect(() =>
            repo.register(
                { namespace: 'legacy', doc: 'x', sign: [s.string()] } as never,
                () => 'x',
            ),
        ).toThrow(TypeError);
    });

    it('rejects non-schema return slot', () => {
        const repo = new Repository({ withSystemMethods: false });
        expect(() =>
            repo.register({ namespace: 'bad', signature: [{} as never] }, () => 'x'),
        ).toThrow(TypeError);
    });

    it('forwards document to system.methodHelp', async () => {
        const repo = new Repository({ withSystemMethods: true });
        repo.register({ namespace: 'hi', document: 'hello', signature: [s.string()] }, () => 'hi');
        const help = await repo.invoke({
            jsonrpc: '2.0',
            method: 'system.methodHelp',
            params: ['hi'],
            id: 1,
        }, {
            injections: {
                repository: () => repo
            }
        });
        expect(help).toMatchObject({ result: 'hello' });
    });

    it('supports async document function', async () => {
        const repo = new Repository({ withSystemMethods: true });
        repo.register(
            { namespace: 'hi', document: async () => 'async-hello', signature: [s.string()] },
            () => 'hi',
        );
        const help = await repo.invoke({
            jsonrpc: '2.0',
            method: 'system.methodHelp',
            params: ['hi'],
            id: 1,
        }, {
            injections: {
                repository: () => repo
            }
        });
        expect(help).toMatchObject({ result: 'async-hello' });
    });
});