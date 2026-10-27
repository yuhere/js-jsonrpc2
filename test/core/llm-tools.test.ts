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
});