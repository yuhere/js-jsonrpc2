import { s } from '../schema/json';
import type { Repository } from '../core/Repository';

/**
 * 注册一整套用于演示/调试的 RPC 方法。
 * 覆盖：基础类型、字面量/枚举、数组/元组、对象、Record、联合、
 * nullable、unknown、注入参数、各种返回形态、深层嵌套、混合大杂烩、流式返回。
 *
 * 被 dev/express.ts 与 src/cli.ts 共用。
 */
export function installDemoMethods(repository: Repository): void {
    // ─────────────────────────────────────────────────────────────
    // 0. ping
    // ─────────────────────────────────────────────────────────────
    repository.register(
        {
            namespace: 'ping',
            signature: [s.string(), s.string()],
        },
        (msg: string) => `pong: ${msg}`,
    );

    // ─────────────────────────────────────────────────────────────
    // 1. 基础类型 + 约束 + 描述
    // ─────────────────────────────────────────────────────────────
    repository.register(
        {
            namespace: 'basic.echo',
            document: '回显一个带长度约束和描述的字符串。',
            signature: [
                s.string().describe('返回值：原样返回'),
                s.string().min(1).max(64).describe('消息内容，1~64 字符'),
            ],
        },
        (msg: string) => msg,
    );

    repository.register(
        {
            namespace: 'basic.number',
            document: '接收两个数字并返回其和。',
            signature: [
                s.number().describe('两数之和'),
                s.number().min(-1000).max(1000).describe('被加数'),
                s.number().min(0).describe('加数（非负）'),
            ],
        },
        (a: number, b: number) => a + b,
    );

    repository.register(
        {
            namespace: 'basic.boolean',
            signature: [s.boolean(), s.boolean().describe('开关')],
        },
        (v: boolean) => v,
    );

    // ─────────────────────────────────────────────────────────────
    // 2. 字面量 / 枚举
    // ─────────────────────────────────────────────────────────────
    repository.register(
        {
            namespace: 'literal.mixed',
            document: '演示字符串、数字、布尔三种字面量。',
            signature: [
                s.unknown(),
                s.literal('hello').describe('固定字符串字面量'),
                s.literal(42).describe('固定数字字面量'),
                s.literal(true).describe('固定布尔字面量'),
            ],
        },
        (...args: unknown[]) => args,
    );

    repository.register(
        {
            namespace: 'enum.color',
            document: '选择一个颜色。',
            signature: [
                s.string(),
                s.enum(['red', 'green', 'blue'] as const).describe('颜色枚举'),
            ],
        },
        (c: string) => `chosen: ${c}`,
    );

    // ─────────────────────────────────────────────────────────────
    // 3. 数组 / 元组
    // ─────────────────────────────────────────────────────────────
    repository.register(
        {
            namespace: 'array.primitives',
            document: '数组的各种约束。',
            signature: [
                s.array(s.string()),
                s.array(s.number()).min(1).max(5).describe('1~5 个数字'),
                s.array(s.boolean()).describe('布尔数组'),
            ],
        },
        (a: string[], b: number[], c: boolean[]) => ({ a, b, c }),
    );

    repository.register(
        {
            namespace: 'array.nested',
            document: '嵌套数组。',
            signature: [
                s.array(s.array(s.number())).describe('二维数字数组'),
                s.array(s.array(s.array(s.string()))).describe('三维字符串数组'),
            ],
        },
        (m: number[][], t: string[][][]) => ({ m, t }),
    );

    repository.register(
        {
            namespace: 'array.ofObjects',
            signature: [
                s.array(
                    s.object({
                        id: s.number(),
                        name: s.string().describe('名称'),
                        active: s.boolean(),
                    }),
                ).describe('对象数组'),
            ],
        },
        (items: unknown[]) => items,
    );

    repository.register(
        {
            namespace: 'tuple.mixed',
            document: '固定长度元组，类型混合。',
            signature: [
                s.unknown(),
                s.tuple([s.string(), s.number(), s.boolean()]).describe('字符串、数字、布尔元组'),
                s.tuple([s.literal('v1'), s.literal(2)]).describe('字面量元组'),
            ],
        },
        (...args: unknown[]) => args,
    );

    // ─────────────────────────────────────────────────────────────
    // 4. 对象（嵌套 / strict）
    // ─────────────────────────────────────────────────────────────
    repository.register(
        {
            namespace: 'object.nested',
            document: '多层嵌套对象。',
            signature: [
                s.object({
                    user: s.object({
                        id: s.number().describe('用户 ID'),
                        profile: s.object({
                            name: s.string().describe('姓名'),
                            email: s.string().describe('邮箱'),
                            tags: s.array(s.string()).describe('标签'),
                        }).describe('用户资料'),
                    }).describe('用户'),
                    meta: s.object({
                        createdAt: s.string().describe('ISO 时间'),
                        version: s.number(),
                    }).describe('元信息'),
                }).describe('顶层对象'),
                s.object({
                    user: s.object({
                        id: s.number().describe('用户 ID'),
                        profile: s.object({
                            name: s.string().describe('姓名'),
                            email: s.string().describe('邮箱'),
                            tags: s.array(s.string()).describe('标签'),
                        }).describe('用户资料'),
                    }).describe('用户'),
                    meta: s.object({
                        createdAt: s.string().describe('ISO 时间'),
                        version: s.number(),
                    }).describe('元信息'),
                }).describe('顶层对象'),
            ],
        },
        (payload: unknown) => payload,
    );

    repository.register(
        {
            namespace: 'object.strict',
            document: '严格对象：属性必须全部存在，且拒绝额外属性。',
            signature: [
                s.unknown(),
                s.object({
                    a: s.string(),
                    b: s.number(),
                }).strict().describe('严格对象'),
            ],
        },
        (v: unknown) => v,
    );

    // ─────────────────────────────────────────────────────────────
    // 5. Record
    // ─────────────────────────────────────────────────────────────
    repository.register(
        {
            namespace: 'record.basic',
            document: '键值映射。',
            signature: [
                s.record(s.number()).describe('字符串键到数字值的映射'),
                s.record(s.string()).min(1).max(3).describe('1~3 个键的字符串映射'),
                s.record(
                    s.object({
                        x: s.number(),
                        y: s.number(),
                    }),
                ).describe('字符串键到坐标对象的映射'),
            ],
        },
        (a: unknown, b: unknown, c: unknown) => ({ a, b, c }),
    );

    // ─────────────────────────────────────────────────────────────
    // 6. 联合
    // ─────────────────────────────────────────────────────────────
    repository.register(
        {
            namespace: 'union.various',
            document: '不同形态的联合类型。',
            signature: [
                s.union([s.string(), s.number()]).describe('字符串或数字'),
                s.union([
                    s.object({ kind: s.literal('a'), a: s.number() }),
                    s.object({ kind: s.literal('b'), b: s.string() }),
                ]).describe('判别联合'),
                s.union([s.string(), s.number(), s.boolean()]).describe('三选一'),
            ],
        },
        (...args: unknown[]) => args,
    );

    // ─────────────────────────────────────────────────────────────
    // 7. Nullable
    // ─────────────────────────────────────────────────────────────
    repository.register(
        {
            namespace: 'nullable.various',
            document: '各种可空类型。',
            signature: [
                s.string().nullable().describe('可为空的字符串'),
                s.number().nullable().describe('可为空的数字'),
                s.array(s.string()).nullable().describe('可为空的字符串数组'),
                s.object({ a: s.number() }).nullable().describe('可为空的对象'),
                s.union([s.string(), s.number()]).nullable().describe('可为空的联合'),
            ],
        },
        (...args: unknown[]) => args,
    );

    // ─────────────────────────────────────────────────────────────
    // 8. Unknown
    // ─────────────────────────────────────────────────────────────
    repository.register(
        {
            namespace: 'unknown.basic',
            document: '任意 JSON 值。',
            signature: [
                s.unknown(),
                s.unknown().describe('任意 JSON'),
            ],
        },
        (v: unknown) => v,
    );

    repository.register(
        {
            namespace: 'unknown.nested',
            signature: [
                s.object({
                    payload: s.unknown().describe('任意负载'),
                    extra: s.array(s.unknown()).describe('任意值数组'),
                }).describe('含 unknown 的对象'),
            ],
        },
        (v: unknown) => v,
    );

    // ─────────────────────────────────────────────────────────────
    // 9. 注入参数（在首位 / 中间 / 末位 / 多个）
    // ─────────────────────────────────────────────────────────────
    repository.register(
        {
            namespace: 'inject.first',
            document: '注入参数在首位。',
            signature: [
                s.string(),
                s.injectable('requestId'),
                s.string().describe('消息'),
            ],
        },
        (requestId: unknown, msg: string) => `${String(requestId)}: ${msg}`,
    );

    repository.register(
        {
            namespace: 'inject.middle',
            document: '注入参数在中间。',
            signature: [
                s.string(),
                s.string().describe('左'),
                s.injectable('requestId'),
                s.string().describe('右'),
            ],
        },
        (left: string, requestId: unknown, right: string) =>
            `${left} | ${String(requestId)} | ${right}`,
    );

    repository.register(
        {
            namespace: 'inject.multiple',
            document: '多个注入参数 + 多个普通参数交替。',
            signature: [
                s.unknown(),
                s.string().describe('普通1'),
                s.injectable('requestId'),
                s.number().describe('普通2'),
                s.injectable('session'),
                s.object({ a: s.number() }).describe('普通3'),
            ],
        },
        (...args: unknown[]) => args,
    );

    // ─────────────────────────────────────────────────────────────
    // 10. 返回值形态
    // ─────────────────────────────────────────────────────────────
    repository.register(
        {
            namespace: 'return.void',
            document: '无返回值。',
            signature: [s.void(), s.string().describe('仅用于触发')],
        },
        (_v: string) => undefined,
    );

    repository.register(
        {
            namespace: 'return.complex',
            document: '返回嵌套对象。',
            signature: [
                s.object({
                    ok: s.boolean(),
                    data: s.object({
                        items: s.array(s.object({ id: s.number(), name: s.string() })),
                    }),
                }),
                s.string().describe('输入'),
            ],
        },
        (input: string) => ({
            ok: true,
            data: { items: [{ id: 1, name: input }] },
        }),
    );

    repository.register(
        {
            namespace: 'return.array',
            document: '返回数组。',
            signature: [
                s.array(s.number()),
                s.number().describe('数量'),
            ],
        },
        (n: number) => Array.from({ length: n }, (_, i) => i),
    );

    // ─────────────────────────────────────────────────────────────
    // 11. 深层嵌套（压测渲染递归）
    // ─────────────────────────────────────────────────────────────
    repository.register(
        {
            namespace: 'deep.nested',
            document: '多层嵌套，验证递归渲染。',
            signature: [
                s.object({
                    level1: s.object({
                        level2: s.object({
                            level3: s.object({
                                level4: s.object({
                                    value: s.string(),
                                    items: s.array(
                                        s.object({
                                            idx: s.number(),
                                            tags: s.array(s.string()),
                                        }),
                                    ),
                                }).describe('第四层'),
                            }).describe('第三层'),
                        }).describe('第二层'),
                    }).describe('第一层'),
                    unionField: s.union([
                        s.object({ type: s.literal('a'), a: s.array(s.number()) }),
                        s.object({ type: s.literal('b'), b: s.record(s.string()) }),
                    ]).describe('联合字段'),
                }).describe('顶层'),
            ],
        },
        (v: unknown) => v,
    );

    // ─────────────────────────────────────────────────────────────
    // 12. 混合大杂烩
    // ─────────────────────────────────────────────────────────────
    repository.register(
        {
            namespace: 'mix.everything',
            document: '把所有类型塞进一个签名里。',
            signature: [
                s.object({
                    str: s.string().min(1).max(10),
                    num: s.number().min(0),
                    bool: s.boolean(),
                    nul: s.string().nullable(),
                    arr: s.array(s.number()),
                    tup: s.tuple([s.string(), s.number()]),
                    obj: s.object({ k: s.string() }),
                    rec: s.record(s.boolean()),
                    uni: s.union([s.string(), s.number()]),
                    en: s.enum(['x', 'y'] as const).nullable(),
                    lit: s.literal('fixed'),
                    unk: s.unknown(),
                }).describe('大杂烩对象'),
                s.string().describe('普通字符串参数'),
                s.object({
                    str: s.string().min(1).max(10),
                    num: s.number().min(0),
                    bool: s.boolean(),
                    nul: s.string().nullable(),
                    arr: s.array(s.number()),
                    tup: s.tuple([s.string(), s.number()]),
                    obj: s.object({ k: s.string() }),
                    rec: s.record(s.boolean()),
                    uni: s.union([s.string(), s.number()]),
                    en: s.enum(['x', 'y'] as const).nullable(),
                    lit: s.literal('fixed'),
                    unk: s.unknown(),
                }).describe('大杂烩参数'),
            ],
        },
        (v: unknown, s2: string) => ([v, s2]),
    );

    // ─────────────────────────────────────────────────────────────
    // 13. stream 返回值
    // ─────────────────────────────────────────────────────────────

    // 13.1 基本字符串流：每隔 200ms 发一条，共 n 条
    repository.register(
        {
            namespace: 'stream.strings',
            document: '每 200ms 发一条 "tick #i"，共 n 条；用于验证基本流式。',
            signature: [
                s.stream(s.string().describe('字符串流')),
                s.number().min(1).max(100).describe('条数 n'),
            ],
        },
        async function* streamStrings(n: number) {
            for (let i = 0; i < n; i++) {
                await new Promise((r) => setTimeout(r, 200));
                yield `tick #${i}`;
            }
        },
    );

    // 13.2 对象流：带约束和描述，验证 UI 渲染 + 描述输出
    repository.register(
        {
            namespace: 'stream.objects',
            document: '流式返回包含序号、标签、布尔状态的对象。',
            signature: [
                s.stream(
                    s.object({
                        idx: s.number().describe('序号'),
                        label: s.string().describe('标签'),
                        ok: s.boolean(),
                    }).describe('对象流')
                ),
                s.number().min(1).max(20).describe('条数 n'),
            ],
        },
        async function* streamObjects(n: number) {
            for (let i = 0; i < n; i++) {
                await new Promise((r) => setTimeout(r, 150));
                yield { idx: i, label: `item-${i}`, ok: i % 2 === 0 };
            }
        },
    );

    // 13.3 任意 JSON 流：s.stream(s.unknown())
    repository.register(
        {
            namespace: 'stream.unknown',
            document: 's.stream(s.unknown())：每帧可以是任意 JSON。',
            signature: [
                s.stream(s.unknown().describe('任意 JSON 流')),
            ],
        },
        async function* streamUnknown() {
            const frames: unknown[] = [
                null,
                'hello',
                42,
                true,
                [1, 2, 3],
                { nested: { a: 1, b: [true, null] } },
            ];
            for (const v of frames) {
                await new Promise((r) => setTimeout(r, 100));
                yield v;
            }
        },
    );

    // 13.4 无限流：验证客户端断开后 handler 能感知（finally 打印日志）
    repository.register(
        {
            namespace: 'stream.infinite',
            document:
                '无限流，每 300ms 发一条。浏览器关闭 / fetch abort 后服务端应打印 "stream.infinite finally"。',
            signature: [
                s.stream(s.object({
                    n: s.number(),
                    at: s.string().describe('ISO 时间'),
                }).describe('无限计数流')),
            ],
        },
        async function* streamInfinite() {
            let n = 0;
            try {
                while (true) {
                    yield { n, at: new Date().toISOString() };
                    n++;
                    await new Promise((r) => setTimeout(r, 300));
                }
            } finally {
                console.log(`stream.infinite finally, emitted=${n}`);
            }
        },
    );

    // 13.5 中途抛错：验证终止帧 { done: true, error: { code, message } }
    repository.register(
        {
            namespace: 'stream.boom',
            document:
                '发 3 条后抛错。客户端应收到 3 个数据帧 + 1 个带 error 的终止帧。',
            signature: [
                s.stream(s.string().describe('字符串流')),
            ],
        },
        async function* streamBoom() {
            for (let i = 0; i < 3; i++) {
                yield `before-boom-${i}`;
                await new Promise((r) => setTimeout(r, 100));
            }
            throw new Error('boom at stream.boom');
        },
    );

    // 13.6 声明 stream 却返回非 generator：验证 INTERNAL_ERROR
    //   注意：这个 handler 故意写错，用于测试服务端校验。
    repository.register(
        {
            namespace: 'stream.misdeclared',
            document:
                '声明了 s.stream(...) 但 handler 返回普通值。预期 INVOKE 返回 INTERNAL_ERROR。',
            grantTo: ["a"],
            signature: [
                s.stream(s.string().describe('字符串流')),
            ],
        },
        // 故意返回非 AsyncGenerator
        () => 'not a stream',
    );

    // 13.7 空流：立刻结束，只有 { done: true }
    repository.register(
        {
            namespace: 'stream.empty',
            document: '立即结束的空流，只应收到一个 { done: true } 终止帧。',
            signature: [
                s.stream(s.number().describe('数字流')),
            ],
        },
        async function* streamEmpty() {
            // 不 yield
        },
    );

    // 13.8 带注入参数的流方法：验证 convertParams 与流式共存
    repository.register(
        {
            namespace: 'stream.withInject',
            document: '流式方法同时使用注入参数。',
            signature: [
                s.stream(s.string().describe('字符串流')),
                s.injectable('requestId'),
                s.number().min(1).max(10).describe('条数'),
            ],
        },
        async function* streamWithInject(requestId: unknown, n: number) {
            for (let i = 0; i < n; i++) {
                yield `${String(requestId)}#${i}`;
                await new Promise((r) => setTimeout(r, 100));
            }
        },
    );
}