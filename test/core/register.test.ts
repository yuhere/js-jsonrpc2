import { describe, it, expect } from 'vitest';
import { Repository } from '../../src/core/Repository';
import { s } from '../../src/schema/json';
import { buildDescriptor, signatureOf } from '../../src/core/descriptor';

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

    it('returns an empty string when a method has no document', async () => {
        const repo = new Repository({ withSystemMethods: true });
        repo.register({ namespace: 'bare', signature: [s.string()] }, () => 'x');
        const help = await repo.invoke({
            jsonrpc: '2.0',
            method: 'system.methodHelp',
            params: ['bare'],
            id: 1,
        }, { injections: { repository: repo } });
        expect(help).toMatchObject({ result: '' });
    });
});

describe('signatureOf description shape', () => {
    it('uses semantic fields for container schemas (no children wrapper)', () => {
        const d = buildDescriptor(
            {
                namespace: 'shapes',
                signature: [
                    s.object({
                        arr: s.array(s.string()),
                        rec: s.record(s.number()),
                        tup: s.tuple([s.boolean()]),
                        uni: s.union([s.string(), s.number()]),
                    }),
                ],
            },
            () => ({}),
        );
        const [ret] = signatureOf(d) as any[];
        expect(ret.kind).toBe('object');
        expect(ret.properties.arr).toMatchObject({
            kind: 'array',
            element: { kind: 'string' },
        });
        expect(ret.properties.arr).not.toHaveProperty('children');
        expect(ret.properties.rec).toMatchObject({
            kind: 'record',
            value: { kind: 'number' },
        });
        expect(ret.properties.tup).toMatchObject({
            kind: 'tuple',
            elements: [{ kind: 'boolean' }],
        });
        expect(ret.properties.uni).toMatchObject({
            kind: 'union',
            options: [{ kind: 'string' }, { kind: 'number' }],
        });
    });

    it('stream return uses top-level inner', () => {
        const d = buildDescriptor(
            {
                namespace: 'stream.demo',
                signature: [s.stream(s.string().describe('frame'))],
            },
            async function* () {
                yield 'x';
            },
        );
        const [ret] = signatureOf(d) as any[];
        expect(ret.kind).toBe('stream');
        expect(ret.inner).toMatchObject({ kind: 'string', description: 'frame' });
        expect(ret).not.toHaveProperty('children');
    });

    it('void return is kind void', () => {
        const d = buildDescriptor(
            { namespace: 'v', signature: [s.void()] },
            () => undefined,
        );
        const [ret] = signatureOf(d) as any[];
        expect(ret).toEqual({ kind: 'void' });
    });

    it('object constraints expose optionalProps and allowUnknownProps', () => {
        const d = buildDescriptor(
            {
                namespace: 'o',
                signature: [
                    s.object({ a: s.string(), b: s.number() }).strict(),
                ],
            },
            () => ({}),
        );
        const [ret] = signatureOf(d) as any[];
        expect(ret.constraints).toEqual({
            optionalProps: [],
            allowUnknownProps: false,
        });
    });
});

describe('system.methodSignature integration', () => {
    it('declares the fields signatureOf actually returns', () => {
        const repo = new Repository({ withSystemMethods: true });
        const descriptor = repo.get('system.methodSignature');
        const [slot] = signatureOf(descriptor!) as Array<{ kind: string; element?: { properties?: Record<string, unknown> } }>;
        expect(slot?.kind).toBe('array');
        const properties = slot?.element?.properties ?? {};
        for (const name of ['kind', 'properties', 'element', 'inner', 'options', 'elements']) {
            expect(properties).toHaveProperty(name);
        }
        const help = descriptor!.document;
        expect(help).toEqual(expect.stringContaining('properties'));
        expect(help).toEqual(expect.stringContaining('inner'));
    });

    it('returns stream shape via system.methodSignature', async () => {
        const repo = new Repository({ withSystemMethods: true });
        repo.register(
            {
                namespace: 'stream.echo',
                signature: [s.stream(s.number()), s.number()],
            },
            async function* (n: number) {
                yield n;
            },
        );
        const res = await repo.invoke(
            {
                jsonrpc: '2.0',
                method: 'system.methodSignature',
                params: ['stream.echo'],
                id: 1,
            },
            {
                injections: {
                    repository: () => repo,
                    injections: () => ({}),
                },
            },
        );
        expect(res).toMatchObject({ id: 1 });
        const sig = (res as { result: unknown[] }).result;
        expect(sig[0]).toMatchObject({
            kind: 'stream',
            inner: { kind: 'number' },
        });
        expect(sig[0]).not.toHaveProperty('children');
        expect(sig[1]).toMatchObject({ kind: 'number' });
    });
});