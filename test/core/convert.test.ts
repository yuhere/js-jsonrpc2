import { describe, it, expect } from 'vitest';
import { convertParams } from '../../src/core/convert';
import { buildDescriptor } from '../../src/core/descriptor';
import { RPCError } from '../../src/errors/RPCError';
import { INVALID_PARAMS } from '../../src/errors/codes';
import { s } from '../../src/schema/json';

describe('convertParams', () => {
    const descriptor = buildDescriptor(
        {
            namespace: 'echo',
            signature: [s.string(), s.string()],
        },
        (v: string) => v,
    );

    it('converts valid positional params', async () => {
        const args = await convertParams(descriptor, ['hello'], {});
        expect(args).toEqual(['hello']);
    });

    it('rejects wrong arity', async () => {
        await expect(convertParams(descriptor, [], {})).rejects.toBeInstanceOf(RPCError);
        await expect(convertParams(descriptor, [], {})).rejects.toMatchObject({ code: INVALID_PARAMS });
    });

    it('rejects null for a non-nullable schema', async () => {
        await expect(convertParams(descriptor, [null], {})).rejects.toMatchObject({ code: INVALID_PARAMS });
    });

    it('accepts null when schema is nullable', async () => {
        const nullable = buildDescriptor(
            { namespace: 'echoNullable', signature: [s.string(), s.string().nullable()] },
            (v: string | null) => String(v),
        );
        const args = await convertParams(nullable, [null], {});
        expect(args).toEqual([null]);
    });

    it('injects injectables', async () => {
        const withInj = buildDescriptor(
            {
                namespace: 'withReq',
                signature: [s.string(), s.injectable('request'), s.string()],
            },
            (_req: unknown, v: string) => v,
        );
        const args = await convertParams(withInj, ['hi'], { request: { url: '/' } });
        expect(args[0]).toEqual({ url: '/' });
        expect(args[1]).toBe('hi');
    });

    it('passes undefined when an injectable key is missing', async () => {
        const descriptor = buildDescriptor(
            { namespace: 'withReq', signature: [s.string(), s.injectable('request')] },
            (req: unknown) => (req === undefined ? 'missing' : 'present'),
        );
        const args = await convertParams(descriptor, [], {});
        expect(args).toEqual([undefined]);
    });

    it('still awaits function injectables', async () => {
        const descriptor = buildDescriptor(
            { namespace: 'withFn', signature: [s.string(), s.injectable('lazy')] },
            (v: unknown) => v,
        );
        const args = await convertParams(descriptor, [], { lazy: async () => 'resolved' });
        expect(args).toEqual(['resolved']);
    });

    it('accepts null for s.null()', async () => {
        const d = buildDescriptor(
            { namespace: 'n', signature: [s.void(), s.null()] },
            () => undefined,
        );
        await expect(convertParams(d, [null], {})).resolves.toEqual([null]);
    });

    it('rejects non-null for s.null()', async () => {
        const d = buildDescriptor(
            { namespace: 'n', signature: [s.void(), s.null()] },
            () => undefined,
        );
        await expect(convertParams(d, ['x'], {})).rejects.toMatchObject({ code: INVALID_PARAMS });
    });

    it('rejects null for union whose members had nullable set', async () => {
        const d = buildDescriptor(
            { namespace: 'u', signature: [s.void(), s.union([s.string().nullable(), s.number()])] },
            () => undefined,
        );
        await expect(convertParams(d, [null], {})).rejects.toMatchObject({ code: INVALID_PARAMS });
    });

    // ── validate(false)：跳过参数校验 ─────────────────────────────

    it('skips validation when schema uses validate(false)', async () => {
        const descriptor = buildDescriptor(
            {
                namespace: 'trust',
                signature: [
                    s.unknown(),
                    s.number().min(0).validate(false),
                    s.string().min(3).validate(false),
                ],
            },
            (n: unknown, s: unknown) => [n, s],
        );
        // 未开启 validate(false) 时会失败的值，现在应原样通过
        await expect(convertParams(descriptor, [-1, 'ab'], {})).resolves.toEqual([
            -1,
            'ab',
        ]);
    });

    it('still validates sibling params that keep default validate(true)', async () => {
        const descriptor = buildDescriptor(
            {
                namespace: 'mixed',
                signature: [
                    s.unknown(),
                    s.number().validate(false),
                    s.string().min(2),
                ],
            },
            (n: unknown, s: string) => [n, s],
        );
        // 第二个参数不校验；第三个仍校验
        await expect(convertParams(descriptor, [0, 'x'], {})).rejects.toMatchObject({
            code: INVALID_PARAMS,
        });
        await expect(convertParams(descriptor, [0, 'ok'], {})).resolves.toEqual([0, 'ok']);
    });

    it('validate(false) does not change arity or injectable rules', async () => {
        const descriptor = buildDescriptor(
            {
                namespace: 'arity',
                signature: [
                    s.string(),
                    s.string().validate(false),
                    s.injectable('requestId'),
                ],
            },
            (msg: string, requestId: unknown) => `${msg}:${String(requestId)}`,
        );
        await expect(convertParams(descriptor, [], { requestId: 'r' })).rejects.toMatchObject({
            code: INVALID_PARAMS,
        });
        await expect(
            convertParams(descriptor, ['anything'], { requestId: 'r' }),
        ).resolves.toEqual(['anything', 'r']);
    });

});