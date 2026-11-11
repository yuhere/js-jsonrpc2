// test/core/llm-tools.test.ts（新建）
import { describe, it, expect } from 'vitest';
import { Repository } from '../../src/core/Repository';
import {
    decodeMethodName,
    encodeMethodName,
    toAnthropicTools,
} from '../../src/core/llm-tools';
import { s } from '../../src/schema/json';
import { INVALID_PARAMS } from '../../src/errors/codes';
import { RPCError } from '../../src/errors/RPCError';

describe('llm.tools JSON Schema conversion', () => {
    it('maps s.null() to type "null"', async () => {
        const repo = new Repository({ withSystemMethods: false });
        repo.register(
            { namespace: 'n', signature: [s.null(), s.null()] },
            () => null,
        );
        const tools = await repo.listLlmTools({});
        const param = tools[0]!.function.parameters as any;
        expect(param.properties.param0).toMatchObject({ type: 'null' });
        expect(param.properties.param0.description).toContain('第 1 个位置参数');
    });

    it('maps s.string().nullable() to type ["string","null"]', async () => {
        const repo = new Repository({ withSystemMethods: false });
        repo.register(
            { namespace: 'n', signature: [s.void(), s.string().nullable()] },
            () => undefined,
        );
        const tools = await repo.listLlmTools({});
        const param = tools[0]!.function.parameters as any;
        expect(param.properties.param0.type).toEqual(['string', 'null']);
    });

    it('does not append "null" twice for s.unknown()', async () => {
        const repo = new Repository({ withSystemMethods: false });
        repo.register(
            { namespace: 'n', signature: [s.void(), s.unknown()] },
            () => undefined,
        );
        const tools = await repo.listLlmTools({});
        const type = (tools[0]!.function.parameters as any).properties.param0.type;
        expect(type.filter((t: string) => t === 'null')).toHaveLength(1);
    });

    it('union member nullability does not leak into JSON Schema', async () => {
        const repo = new Repository({ withSystemMethods: false });
        repo.register(
            { namespace: 'n', signature: [s.void(), s.union([s.string().nullable(), s.number()])] },
            () => undefined,
        );
        const tools = await repo.listLlmTools({});
        const anyOf = (tools[0]!.function.parameters as any).properties.param0.anyOf;
        expect(anyOf[0].type).toBe('string');
        expect(anyOf[1].type).toBe('number');
    });


    it('maps array/record/object via element/value/properties', async () => {
        const repo = new Repository({ withSystemMethods: false });
        repo.register(
            {
                namespace: 'c',
                signature: [
                    s.void(),
                    s.array(s.string().min(1)),
                    s.record(s.number()),
                    s.object({ id: s.number() }).strict(),
                ],
            },
            () => undefined,
        );
        const tools = await repo.listLlmTools({});
        const props = (tools[0]!.function.parameters as any).properties;

        expect(props.param0).toMatchObject({
            type: 'array',
            items: { type: 'string', minLength: 1 },
        });
        expect(props.param1).toMatchObject({
            type: 'object',
            additionalProperties: { type: 'number' },
        });
        expect(props.param2).toMatchObject({
            type: 'object',
            properties: { id: { type: 'number' } },
            required: ['id'],
            additionalProperties: false,
        });
    });

    it('maps tuple and union options', async () => {
        const repo = new Repository({ withSystemMethods: false });
        repo.register(
            {
                namespace: 'tu',
                signature: [
                    s.void(),
                    s.tuple([s.string(), s.number()]),
                    s.union([s.literal('a'), s.literal('b')]),
                ],
            },
            () => undefined,
        );
        const tools = await repo.listLlmTools({});
        const props = (tools[0]!.function.parameters as any).properties;

        expect(props.param0).toMatchObject({
            type: 'array',
            minItems: 2,
            maxItems: 2,
            prefixItems: [{ type: 'string' }, { type: 'number' }],
            items: false,
        });
        expect(props.param0.description).toContain('第 1 个位置参数');
        expect(props.param1.description).toContain('第 2 个位置参数');
        expect(props.param1.anyOf).toEqual([
            { const: 'a', enum: ['a'], type: 'string' },
            { const: 'b', enum: ['b'], type: 'string' },
        ]);
    });


});

describe('llm.tools names and options', () => {
    function repoWith(names: string[]) {
        const repo = new Repository({ withSystemMethods: false });
        for (const namespace of names) {
            repo.register(
                { namespace, signature: [s.string()] },
                () => namespace,
            );
        }
        return repo;
    }

    async function callTools(repo: Repository, options: unknown) {
        return repo.invoke(
            { jsonrpc: '2.0', method: 'llm.tools', params: [options], id: 1 },
            {
                injections: {
                    repository: () => repo,
                    injections: () => ({}),
                },
            },
        );
    }

    it('accepts empty, partial, and null options', async () => {
        const repo = new Repository({ withSystemMethods: true });
        const empty = await callTools(repo, {});
        const partial = await callTools(repo, { includeStreaming: true });
        const absent = await callTools(repo, null);
        const unknown = await callTools(repo, { nope: true });

        expect(empty).toMatchObject({ id: 1 });
        expect(partial).toMatchObject({ id: 1 });
        expect(absent).toMatchObject({ id: 1 });
        expect(Array.isArray((empty as { result: unknown }).result)).toBe(true);
        expect(Array.isArray((partial as { result: unknown }).result)).toBe(true);
        expect(Array.isArray((absent as { result: unknown }).result)).toBe(true);
        expect(unknown).toMatchObject({ error: { code: INVALID_PARAMS } });
    });

    it('filters with prefix and prepends namePrefix', async () => {
        const repo = repoWith(['a.b', 'a_b', 'b.c']);
        const tools = await repo.listLlmTools({}, { prefix: 'a.', namePrefix: 'tool_' });
        expect(tools.map((tool) => tool.function.name)).toEqual(['tool_a__b']);
        expect(await repo.invokeLlmTool(
            { name: 'tool_a__b', arguments: {} },
            {},
            { namePrefix: 'tool_' },
        )).toBe('a.b');
    });

    it('round-trips dots, underscores, and existing _x / __ sequences', () => {
        const samples = ['foo', 'foo_bar', 'a.b', 'a_b', 'a.b_c', 'a_x', 'a__b', '._', '_.', 'a_.b', 'x_x.__'];
        for (const method of samples) {
            expect(decodeMethodName(encodeMethodName(method))).toBe(method);
        }

        const seen = new Map<string, string>();
        const alphabet = ['a', '.', '_', 'x'];
        const visit = (value: string) => {
            const encoded = encodeMethodName(value);
            const previous = seen.get(encoded);
            expect(previous, `${value} collided with ${previous} as ${encoded}`).toBeUndefined();
            seen.set(encoded, value);
            expect(decodeMethodName(encoded)).toBe(value);
            if (value.length >= 4) return;
            for (const ch of alphabet) visit(value + ch);
        };
        for (const ch of alphabet) visit(ch);
    });

    it('lists a.b and a_b separately and calls each method', async () => {
        const repo = repoWith(['foo_bar', 'a.b', 'a_b']);
        const tools = await repo.listLlmTools({});
        const names = tools.map((tool) => tool.function.name);
        expect(names).toEqual(['foo_xbar', 'a__b', 'a_xb']);

        expect(await repo.invokeLlmTool({ name: 'foo_xbar', arguments: {} }, {})).toBe('foo_bar');
        expect(await repo.invokeLlmTool({ name: 'a__b', arguments: {} }, {})).toBe('a.b');
        expect(await repo.invokeLlmTool({ name: 'a_xb', arguments: {} }, {})).toBe('a_b');
    });

    it('rejects tool names that break the LLM name rule', async () => {
        const slash = repoWith(['foo/bar']);
        await expect(slash.listLlmTools({})).rejects.toThrow(/foo\/bar/);

        const longName = 'a'.repeat(65);
        const long = repoWith([longName]);
        await expect(long.listLlmTools({})).rejects.toThrow(/65|match/);

        const prefixed = repoWith(['a'.repeat(60)]);
        await expect(prefixed.listLlmTools({}, { namePrefix: 'prefix_' })).rejects.toThrow(/prefix_/);
    });

    it('returns Anthropic tools when format is anthropic', async () => {
        const repo = repoWith(['math.add']);
        const tools = await repo.listLlmTools({}, { format: 'anthropic' });
        expect(tools).toEqual(toAnthropicTools(await repo.listLlmTools({})));
        expect(tools[0]).toMatchObject({
            name: 'math__add',
            input_schema: { type: 'object', additionalProperties: false },
        });
        expect(tools[0]).not.toHaveProperty('function');
    });
});

describe('invokeLlmTool errors', () => {
    it('keeps code, message, and data when a parameter is invalid', async () => {
        const repo = new Repository({ withSystemMethods: false });
        repo.register(
            { namespace: 'need', signature: [s.string(), s.string().min(2)] },
            (value: string) => value,
        );
        const error = await repo.invokeLlmTool(
            { name: 'need', arguments: { param0: 'x' } },
            {},
        ).then(() => { throw new Error('expected rejection'); }, (err: unknown) => err);
        expect(error).toBeInstanceOf(RPCError);
        const rpc = error as RPCError;
        expect(rpc.code).toBe(INVALID_PARAMS);
        expect(typeof rpc.data).toBe('string');
        expect(rpc.message).toContain(String(rpc.data));
    });

    it('reports a missing paramN with the same error shape', async () => {
        const repo = new Repository({ withSystemMethods: false });
        repo.register(
            { namespace: 'need', signature: [s.string(), s.string(), s.string()] },
            () => 'ok',
        );
        const error = await repo.invokeLlmTool(
            { name: 'need', arguments: { param1: 'b' } },
            {},
        ).then(() => { throw new Error('expected rejection'); }, (err: unknown) => err);
        expect(error).toBeInstanceOf(RPCError);
        const rpc = error as RPCError;
        expect(rpc.code).toBe(INVALID_PARAMS);
        expect(rpc.data).toBe('Missing tool argument `param0`.');
        expect(rpc.message).toContain('Missing tool argument `param0`.');
    });
});