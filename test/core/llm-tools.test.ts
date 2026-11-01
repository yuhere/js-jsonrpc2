// test/core/llm-tools.test.ts（新建）
import { describe, it, expect } from 'vitest';
import { Repository } from '../../src/core/Repository';
import { s } from '../../src/schema/json';

describe('llm.tools JSON Schema conversion', () => {
    it('maps s.null() to type "null"', async () => {
        const repo = new Repository({ withSystemMethods: false });
        repo.register(
            { namespace: 'n', signature: [s.null(), s.null()] },
            () => null,
        );
        const tools = await repo.listLlmTools({});
        const param = tools[0]!.function.parameters as any;
        expect(param.properties.param0).toEqual({ type: 'null' });
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
            items: [{ type: 'string' }, { type: 'number' }],
        });
        expect(props.param1.anyOf).toEqual([
            { const: 'a', type: 'string' },
            { const: 'b', type: 'string' },
        ]);
    });


});