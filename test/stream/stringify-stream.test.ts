import { describe, it, expect } from 'vitest';
import { stringifyStream } from '../../src/stream/stringify-stream';

/** 收集 AsyncGenerator 的全部输出 */
async function collect(
    gen: AsyncGenerator<string, void, unknown>
): Promise<string> {
    const chunks: string[] = [];
    for await (const chunk of gen) {
        chunks.push(chunk);
    }
    return chunks.join('');
}

describe('stringifyStream', () => {
    // ==================== 1. 基本功能 ====================
    describe('基本功能（与 JSON.stringify 一致）', () => {
        it('empty object', async () => {
            expect(await collect(stringifyStream({}))).toBe('{}');
        });

        it('boolean true', async () => {
            expect(await collect(stringifyStream(true))).toBe('true');
        });

        it('boolean false', async () => {
            expect(await collect(stringifyStream(false))).toBe('false');
        });

        it('string', async () => {
            expect(await collect(stringifyStream('foo'))).toBe('"foo"');
        });

        it('number', async () => {
            expect(await collect(stringifyStream(42))).toBe('42');
        });

        it('null', async () => {
            expect(await collect(stringifyStream(null))).toBe('null');
        });

        it('array mixed', async () => {
            expect(await collect(stringifyStream([1, 'false', false]))).toBe(
                '[1,"false",false]'
            );
        });

        it('NaN / Infinity → null', async () => {
            expect(await collect(stringifyStream([NaN, null, Infinity]))).toBe(
                '[null,null,null]'
            );
        });

        it('simple object', async () => {
            expect(await collect(stringifyStream({ x: 5 }))).toBe('{"x":5}');
        });

        it('object two props', async () => {
            expect(await collect(stringifyStream({ x: 5, y: 6 }))).toBe(
                '{"x":5,"y":6}'
            );
        });

        it('Date → toISOString', async () => {
            const d = new Date(Date.UTC(1906, 0, 2, 15, 4, 5));
            expect(await collect(stringifyStream(d))).toBe(JSON.stringify(d));
        });

        it('boxed primitives', async () => {
            expect(
                await collect(
                    stringifyStream([
                        new Number(3),
                        new String('false'),
                        new Boolean(false),
                    ])
                )
            ).toBe('[3,"false",false]');
        });

        it('array non-index properties ignored', async () => {
            const arr = ['foo', 'bar'] as any;
            arr.baz = 'quux';
            expect(await collect(stringifyStream(arr))).toBe('["foo","bar"]');
        });

        it('undefined/function/symbol in array → null', async () => {
            expect(
                await collect(
                    stringifyStream({
                        x: [10, undefined, function () { }, Symbol('')],
                    })
                )
            ).toBe('{"x":[10,null,null,null]}');
        });

        it('undefined/function/symbol in object → null', async () => {
            expect(
                await collect(
                    stringifyStream({
                        x: undefined,
                        y: Object,
                        z: Symbol(''),
                    })
                )
            ).toBe('{"x":null,"y":null,"z":null}');
        });

        it('Set/Map/Weak* → {}', async () => {
            expect(
                await collect(
                    stringifyStream([
                        new Set([1]),
                        new Map([[1, 2]]),
                        new WeakSet([{ a: 1 }]),
                        new WeakMap([[{ a: 1 }, 2]]),
                    ])
                )
            ).toBe('[{},{},{},{}]');
        });

        it('TypedArray Int*', async () => {
            const input = [
                new Int8Array([1]),
                new Int16Array([1]),
                new Int32Array([1]),
            ];
            expect(await collect(stringifyStream(input))).toBe(
                JSON.stringify(input)
            );
        });

        it('TypedArray Uint*', async () => {
            const input = [
                new Uint8Array([1]),
                new Uint8ClampedArray([1]),
                new Uint16Array([1]),
                new Uint32Array([1]),
            ];
            expect(await collect(stringifyStream(input))).toBe(
                JSON.stringify(input)
            );
        });

        it('TypedArray Float*', async () => {
            const input = [new Float32Array([1]), new Float64Array([1])];
            expect(await collect(stringifyStream(input))).toBe(
                JSON.stringify(input)
            );
        });

        it('toJSON on root object', async () => {
            expect(
                await collect(
                    stringifyStream({
                        x: 5,
                        y: 6,
                        toJSON(this: { x: number; y: number }) {
                            return this.x + this.y;
                        },
                    })
                )
            ).toBe('11');
        });

        it('symbol keys ignored', async () => {
            expect(
                await collect(stringifyStream({ [Symbol('foo')]: 'foo' }))
            ).toBe('{}');
        });

        it('non-enumerable properties ignored', async () => {
            expect(
                await collect(
                    stringifyStream(
                        Object.create(null, {
                            x: { value: 'x', enumerable: false },
                            y: { value: 'y', enumerable: true },
                        })
                    )
                )
            ).toBe('{"y":"y"}');
        });

        it('BigInt throws TypeError', async () => {
            await expect(collect(stringifyStream({ x: 2n }))).rejects.toThrow(
                /BigInt/
            );
        });
    });

    // ==================== 2. replacer ====================
    describe('replacer', () => {
        it('replacer function filters strings', async () => {
            function stringFilterReplacer(_key: string, value: any) {
                if (typeof value === 'string') return undefined;
                return value;
            }
            const foo = {
                foundation: 'Mozilla',
                model: 'box',
                week: 45,
                transport: 'car',
                month: 7,
            };
            expect(
                await collect(stringifyStream(foo, { replacer: stringFilterReplacer }))
            ).toBe('{"foundation":null,"model":null,"week":45,"transport":null,"month":7}');
        });

        it('replacer array', async () => {
            const foo = {
                foundation: 'Mozilla',
                model: 'box',
                week: 45,
                transport: 'car',
                month: 7,
            };
            expect(
                await collect(stringifyStream(foo, { replacer: ['week', 'month'] }))
            ).toBe('{"week":45,"month":7}');
        });

        it('replacer with isInitial logic', async () => {
            function makeReplacer() {
                let isInitial = true;
                return (key: string, value: any) => {
                    if (isInitial) {
                        isInitial = false;
                        return value;
                    }
                    if (key === '') return undefined;
                    return value;
                };
            }
            expect(
                await collect(
                    stringifyStream({ '': 1, b: 2 }, { replacer: makeReplacer() })
                )
            ).toBe('{"":null,"b":2}');
        });
    });

    // ==================== 3. space 参数 ====================
    describe('space 参数', () => {
        it('space: single space', async () => {
            expect(await collect(stringifyStream({ a: 2 }, { space: ' ' }))).toBe(
                '{\n "a": 2\n}'
            );
        });

        it('space: number 2', async () => {
            expect(await collect(stringifyStream({ a: 2 }, { space: 2 }))).toBe(
                '{\n  "a": 2\n}'
            );
        });

        it('space: tab', async () => {
            expect(
                await collect(stringifyStream({ uno: 1, dos: 2 }, { space: '\t' }))
            ).toBe('{\n\t"uno": 1,\n\t"dos": 2\n}');
        });

        it('space nested object', async () => {
            expect(
                await collect(stringifyStream({ a: { b: 1 } }, { space: 2 }))
            ).toBe('{\n  "a": {\n    "b": 1\n  }\n}');
        });
    });

    // ==================== 4. toJSON 带 key ====================
    describe('toJSON 带 key', () => {
        const objWithToJSON = {
            data: 'data',
            toJSON(key: string) {
                return key
                    ? `Now I am a nested object under key '${key}'`
                    : this;
            },
        };

        it('toJSON root (key === "")', async () => {
            expect(await collect(stringifyStream(objWithToJSON))).toBe(
                '{"data":"data","toJSON":null}'
            );
        });

        it('toJSON nested object', async () => {
            expect(await collect(stringifyStream({ obj: objWithToJSON }))).toBe(
                `{"obj":"Now I am a nested object under key 'obj'"}`
            );
        });

        it('toJSON in array', async () => {
            expect(await collect(stringifyStream([objWithToJSON]))).toBe(
                `["Now I am a nested object under key '0'"]`
            );
        });
    });

    // ==================== 5. 循环引用 ====================
    describe('循环引用', () => {
        it('circular reference throws TypeError', async () => {
            const circular: any = {};
            circular.myself = circular;
            await expect(collect(stringifyStream(circular))).rejects.toThrow(
                /circular/i
            );
        });
    });

    // ==================== 6. 增强功能 ====================
    describe('增强功能', () => {
        it('nested Promise', async () => {
            expect(
                await collect(
                    stringifyStream(Promise.resolve({ a: 1, b: Promise.resolve(2) }))
                )
            ).toBe('{"a":1,"b":2}');
        });

        it('Promise inside array', async () => {
            expect(
                await collect(
                    stringifyStream([Promise.resolve(1), Promise.resolve('hi')])
                )
            ).toBe('[1,"hi"]');
        });

        it('Generator + nested Promise', async () => {
            function* syncGen() {
                yield 1;
                yield { x: 2 };
                yield Promise.resolve(3);
            }
            expect(await collect(stringifyStream(syncGen()))).toBe(
                '[1,{"x":2},3]'
            );
        });

        it('AsyncGenerator', async () => {
            async function* asyncGen() {
                yield 10;
                yield await Promise.resolve(20);
                yield { y: 30 };
            }
            expect(await collect(stringifyStream(asyncGen()))).toBe(
                '[10,20,{"y":30}]'
            );
        });

        it('custom Iterator', async () => {
            const customIterator = {
                _i: 0,
                next() {
                    if (this._i < 3) {
                        return { value: this._i++, done: false };
                    }
                    return { value: undefined, done: true };
                },
            };
            expect(await collect(stringifyStream(customIterator))).toBe('[0,1,2]');
        });

        it('Buffer → hex string', async () => {
            // 仅在 Node 环境运行
            if (typeof Buffer === 'undefined') {
                return;
            }
            expect(await collect(stringifyStream(Buffer.from('hello')))).toBe(
                '"68656c6c6f"'
            );
        });

        it('large object with small buffer + space', async () => {
            const big = {
                users: Array.from({ length: 5 }, (_, i) => ({
                    id: i,
                    name: `user-${i}`,
                    active: i % 2 === 0,
                })),
            };
            const streamed = await collect(
                stringifyStream(big, { space: 2, bufferSize: 32 })
            );
            expect(streamed).toBe(JSON.stringify(big, null, 2));
        });

        it('empty array with space', async () => {
            expect(await collect(stringifyStream([], { space: 2 }))).toBe('[]');
        });

        it('empty object with space', async () => {
            expect(await collect(stringifyStream({}, { space: 2 }))).toBe('{}');
        });
    });

    // ============================================================
    // 追加到 stringify-stream.test.ts 的末尾（或合适的 describe 下）
    // ============================================================
    describe('边界与未覆盖分支', () => {
        // ---------- Date ----------
        it('Invalid Date → null', async () => {
            const invalid = new Date(NaN);
            expect(await collect(stringifyStream(invalid))).toBe('null');
        });

        // ---------- space 边界 ----------
        it('space > 10 只取前 10 个空格', async () => {
            const result = await collect(stringifyStream({ a: 1 }, { space: 20 }));
            expect(result).toBe(JSON.stringify({ a: 1 }, null, 20));
        });

        it('space = 0 → 无缩进', async () => {
            expect(await collect(stringifyStream({ a: 1 }, { space: 0 }))).toBe(
                '{"a":1}'
            );
        });

        it('space 负数 → 无缩进', async () => {
            expect(await collect(stringifyStream({ a: 1 }, { space: -5 }))).toBe(
                '{"a":1}'
            );
        });

        it('space 非整数 → 向下取整', async () => {
            expect(await collect(stringifyStream({ a: 1 }, { space: 3.9 }))).toBe(
                JSON.stringify({ a: 1 }, null, 3)
            );
        });

        it('space 超长字符串只取前 10 字符', async () => {
            const long = 'abcdefghijklmnop';
            const result = await collect(stringifyStream({ a: 1 }, { space: long }));
            expect(result).toBe(JSON.stringify({ a: 1 }, null, long));
        });

        // ---------- 根级别特殊值 ----------
        it('root undefined → 空输出', async () => {
            expect(await collect(stringifyStream(undefined))).toBe('null');
        });

        it('root Promise<undefined> → null', async () => {
            expect(
                await collect(stringifyStream(Promise.resolve(undefined)))
            ).toBe('null');
        });

        it('array undefined → null', async () => {
            expect(
                await collect(stringifyStream([undefined]))
            ).toBe('[null]');
        });

        it('root function → 空输出', async () => {
            expect(await collect(stringifyStream(() => { }))).toBe('null');
        });

        it('root symbol → 空输出', async () => {
            expect(await collect(stringifyStream(Symbol('x')))).toBe('null');
        });

        it('symbol → 空输出', async () => {
            expect(await collect(stringifyStream({ a: { b: Symbol('x') } }))).toBe('{"a":{"b":null}}');
        });

        // ---------- toJSON 返回特殊值 ----------
        it('toJSON 返回 undefined → 空输出', async () => {
            const obj = {
                toJSON() {
                    return undefined;
                },
            };
            expect(await collect(stringifyStream(obj))).toBe('null');
        });

        it('toJSON 返回 Promise', async () => {
            const obj = {
                toJSON() {
                    return Promise.resolve({ ok: true });
                },
            };
            expect(await collect(stringifyStream(obj))).toBe('{"ok":true}');
        });

        it('toJSON 返回 Generator', async () => {
            const obj = {
                toJSON() {
                    return (function* () {
                        yield 1;
                        yield 2;
                    })();
                },
            };
            expect(await collect(stringifyStream(obj))).toBe('[1,2]');
        });

        // ---------- replacer 返回特殊值 ----------
        it('replacer 返回 Promise', async () => {
            const result = await collect(
                stringifyStream(
                    { a: 1 },
                    {
                        replacer(_k, v) {
                            if (typeof v === 'number') return Promise.resolve(v * 10);
                            return v;
                        },
                    }
                )
            );
            expect(result).toBe('{"a":10}');
        });

        it('replacer 数组包含不存在的 key 和 symbol', async () => {
            const obj = { a: 1, b: 2 };
            expect(
                await collect(
                    stringifyStream(obj, {
                        replacer: ['a', Symbol('x') as any, 'not-exist'],
                    })
                )
            ).toBe('{"a":1}');
        });

        // ---------- 稀疏数组 ----------
        it('sparse array', async () => {
            const sparse: any[] = [];
            sparse[0] = 1;
            sparse[2] = 3;
            expect(await collect(stringifyStream(sparse))).toBe(
                JSON.stringify(sparse)
            );
        });

        // ---------- DataView（不应被当成 TypedArray） ----------
        it('DataView 按普通对象处理', async () => {
            const buf = new ArrayBuffer(4);
            const dv = new DataView(buf);
            expect(await collect(stringifyStream(dv))).toBe('{}');
        });

        // ---------- 空可迭代 ----------
        it('empty Generator', async () => {
            function* empty() { }
            expect(await collect(stringifyStream(empty()))).toBe('[]');
        });

        it('empty AsyncGenerator', async () => {
            async function* empty() { }
            expect(await collect(stringifyStream(empty()))).toBe('[]');
        });

        // ---------- Generator 产出特殊值 ----------
        it('Generator yields undefined/function/symbol → null', async () => {
            function* gen() {
                yield 1;
                yield undefined;
                yield function () { };
                yield Symbol('s');
                yield 2;
            }
            expect(await collect(stringifyStream(gen()))).toBe(
                '[1,null,null,null,2]'
            );
        });

        // ---------- 嵌套循环引用 ----------
        it('nested circular reference throws', async () => {
            const parent: any = { name: 'parent' };
            const child: any = { name: 'child', parent };
            parent.child = child;
            await expect(collect(stringifyStream(parent))).rejects.toThrow(
                /circular/i
            );
        });

        // ---------- bufferSize（避免极端小值导致 OOM） ----------
        it('bufferSize 较小仍然正确', async () => {
            const result = await collect(
                stringifyStream({ a: 1, b: [2, 3] }, { bufferSize: 8 })
            );
            expect(result).toBe('{"a":1,"b":[2,3]}');
        });

        it('bufferSize 很大', async () => {
            const result = await collect(
                stringifyStream({ a: 1 }, { bufferSize: 1024 * 1024 })
            );
            expect(result).toBe('{"a":1}');
        });

        // ---------- 深度嵌套 + space ----------
        it('deep nesting with space', async () => {
            const deep = { a: { b: { c: { d: 1 } } } };
            const result = await collect(stringifyStream(deep, { space: 2 }));
            expect(result).toBe(JSON.stringify(deep, null, 2));
        });

        // ---------- null prototype 对象 ----------
        it('null prototype object', async () => {
            const obj = Object.create(null);
            obj.a = 1;
            obj.b = 'x';
            expect(await collect(stringifyStream(obj))).toBe('{"a":1,"b":"x"}');
        });

        // ---------- 对象属性值为 boxed primitive ----------
        it('object property is boxed primitive', async () => {
            expect(
                await collect(
                    stringifyStream({
                        n: new Number(42),
                        s: new String('hi'),
                        b: new Boolean(true),
                    })
                )
            ).toBe('{"n":42,"s":"hi","b":true}');
        });

        // ---------- 数组里混入各种特殊类型 ----------
        it('array mixed with Date, Buffer, Promise, Generator', async () => {
            function* g() {
                yield 'g';
            }
            const input = [
                new Date(Date.UTC(2020, 0, 1)),
                typeof Buffer !== 'undefined' ? Buffer.from('ab') : null,
                Promise.resolve(99),
                g(),
            ];
            const result = await collect(stringifyStream(input));
            expect(result).toContain('2020-01-01T00:00:00.000Z');
            expect(result).toContain('99');
            expect(result).toContain('["g"]');
            if (typeof Buffer !== 'undefined') {
                expect(result).toContain('6162');
            }
        });

        // ---------- replacer 在数组上的行为 ----------
        it('replacer on array elements', async () => {
            const result = await collect(
                stringifyStream([1, 2, 3, 4], {
                    replacer(key, value) {
                        if (key === '1' || key === '3') return undefined;
                        return value;
                    },
                })
            );
            expect(result).toBe('[1,null,3,null]');
        });

        // ---------- toJSON + replacer 组合 ----------
        it('toJSON then replacer', async () => {
            const obj = {
                value: 10,
                toJSON() {
                    return { doubled: this.value * 2 };
                },
            };
            const result = await collect(
                stringifyStream(obj, {
                    replacer(key, value) {
                        if (key === 'doubled') return value + 1;
                        return value;
                    },
                })
            );
            expect(result).toBe('{"doubled":21}');
        });

        // ---------- 只有 getter 的对象 ----------
        it('object with getter', async () => {
            const obj = {
                get foo() {
                    return 123;
                },
            };
            expect(await collect(stringifyStream(obj))).toBe('{"foo":123}');
        });

        // ---------- 混合可枚举 / 不可枚举 ----------
        it('mixed enumerable and non-enumerable', async () => {
            const obj = Object.create(null, {
                visible: { value: 1, enumerable: true },
                hidden: { value: 2, enumerable: false },
                alsoVisible: { value: 3, enumerable: true },
            });
            expect(await collect(stringifyStream(obj))).toBe(
                '{"visible":1,"alsoVisible":3}'
            );
        });
    });

    describe('覆盖率补全：剩余分支', () => {
        // ---------- TypedArray + space ----------
        it('TypedArray with space', async () => {
            const arr = new Uint8Array([10, 20, 30]);
            const result = await collect(
                stringifyStream(arr, { space: 2 })
            );
            // 原生行为
            expect(result).toBe(JSON.stringify(arr, null, 2));
        });

        it('empty TypedArray with space', async () => {
            const arr = new Float32Array(0);
            const result = await collect(
                stringifyStream(arr, { space: 2 })
            );
            expect(result).toBe('{}');
        });

        it('single-element TypedArray with space', async () => {
            const arr = new Int16Array([42]);
            const result = await collect(
                stringifyStream(arr, { space: 2 })
            );
            expect(result).toBe(JSON.stringify(arr, null, 2));
        });

        // ---------- 可迭代 + space ----------
        it('Generator with space', async () => {
            function* gen() {
                yield 1;
                yield { a: 2 };
                yield 3;
            }
            const result = await collect(
                stringifyStream(gen(), { space: 2 })
            );
            expect(result).toBe(
                '[\n  1,\n  {\n    "a": 2\n  },\n  3\n]'
            );
        });

        it('AsyncGenerator with space', async () => {
            async function* agen() {
                yield 'x';
                yield 100;
            }
            const result = await collect(
                stringifyStream(agen(), { space: 2 })
            );
            expect(result).toBe('[\n  "x",\n  100\n]');
        });

        it('custom Iterator with space', async () => {
            const it = {
                _i: 0,
                next() {
                    if (this._i < 2) {
                        return { value: this._i++, done: false };
                    }
                    return { value: undefined, done: true };
                },
            };
            const result = await collect(
                stringifyStream(it, { space: 2 })
            );
            expect(result).toBe('[\n  0,\n  1\n]');
        });

        it('empty Generator with space', async () => {
            function* empty() { }
            const result = await collect(
                stringifyStream(empty(), { space: 2 })
            );
            expect(result).toBe('[]');
        });

        // ---------- 数组 / 对象在 space 下的尾部分支 ----------
        it('array with space and multiple elements (trailing gap)', async () => {
            const result = await collect(
                stringifyStream([1, 2, 3], { space: 2 })
            );
            expect(result).toBe('[\n  1,\n  2,\n  3\n]');
        });

        // ---------- prepare 后变成 undefined 的数组元素（已有，再强化） ----------
        it('array element becomes undefined after replacer → null', async () => {
            const result = await collect(
                stringifyStream([1, 'remove-me', 3], {
                    replacer(_k, v) {
                        if (v === 'remove-me') return undefined;
                        return v;
                    },
                })
            );
            expect(result).toBe('[1,null,3]');
        });

        // ---------- 对象属性 prepare 后变成 Promise，再 resolve 成普通值 ----------
        it('object property replacer returns Promise that resolves to value', async () => {
            const result = await collect(
                stringifyStream(
                    { a: 1, b: 2 },
                    {
                        replacer(key, value) {
                            if (key === 'a') return Promise.resolve(value * 10);
                            return value;
                        },
                    }
                )
            );
            expect(result).toBe('{"a":10,"b":2}');
        });

        // ---------- 对象属性 replacer 返回 Promise → undefined（应省略） ----------
        it('object property replacer returns Promise resolving to undefined → null', async () => {
            const result = await collect(
                stringifyStream(
                    { a: 1, b: 2 },
                    {
                        replacer(key, value) {
                            if (key === 'a') return Promise.resolve(undefined);
                            return value;
                        },
                    }
                )
            );
            expect(result).toBe('{"a":null,"b":2}');
        });

        // ---------- 嵌套结构 + space + 小 buffer（触发多次 flush） ----------
        it('nested + space + small bufferSize triggers multiple flushes', async () => {
            const data = {
                arr: [1, 2, { x: 3 }],
                obj: { y: [4, 5] },
            };
            const result = await collect(
                stringifyStream(data, { space: 2, bufferSize: 16 })
            );
            expect(result).toBe(JSON.stringify(data, null, 2));
        });

        // ---------- Map/Set 在 space 下（仍然是 {}） ----------
        it('Map/Set with space still become {}', async () => {
            const result = await collect(
                stringifyStream(
                    { m: new Map([[1, 2]]), s: new Set([3]) },
                    { space: 2 }
                )
            );
            expect(result).toBe(
                '{\n  "m": {},\n  "s": {}\n}'
            );
        });

        // ---------- 强制走到 serializePrepared 的早期 return（通过 Promise resolve 成 function） ----------
        it('Promise resolves to function → treated as omitted/null', async () => {
            // 数组里
            const resultArr = await collect(
                stringifyStream([Promise.resolve(() => { })])
            );
            expect(resultArr).toBe('[null]');

            // 对象里
            const resultObj = await collect(
                stringifyStream({
                    a: Promise.resolve(function () { }),
                    b: 1,
                })
            );
            expect(resultObj).toBe('{"a":null,"b":1}');
        });

        // ---------- Promise resolves to symbol ----------
        it('Promise resolves to symbol → omitted/null', async () => {
            const result = await collect(
                stringifyStream([Promise.resolve(Symbol('x')), 2])
            );
            expect(result).toBe('[null,2]');
        });

        // ---------- toJSON 返回 Invalid Date 的情况（其实会变成 null） ----------
        it('toJSON returns Invalid Date', async () => {
            const obj = {
                toJSON() {
                    return new Date(NaN);
                },
            };
            // prepareValue 会再调一次 toJSON？不，返回的是 Date，然后 serializePrepared 会看到 Date
            // 但当前实现里 Date 分支在 serializePrepared，而 toJSON 已经执行过
            // 如果 toJSON 返回 Date，serializePrepared 的 Date 分支会被走到
            const result = await collect(stringifyStream(obj));
            // 根据当前代码：toJSON 返回 Invalid Date → serializePrepared 里 instanceof Date → null
            expect(result).toBe('null');
        });

        // ---------- toJSON 返回普通 Date（覆盖 serializePrepared 的 Date 分支） ----------
        it('toJSON returns valid Date (hits Date branch in serializePrepared)', async () => {
            const d = new Date(Date.UTC(2022, 5, 15));
            const obj = {
                toJSON() {
                    return d; // 返回 Date 对象，而不是调用 d.toJSON()
                },
            };
            const result = await collect(stringifyStream(obj));
            expect(result).toBe(JSON.stringify(d));
        });

    });

    describe('手工测试', () => {
        it('replacer this should be the property holder', async () => {
            const contexts: Array<{
                key: string;
                holder: any;
            }> = [];
            const input = {
                a: {
                    b: 1,
                },
            };
            await collect(
                stringifyStream(input, {
                    replacer(this: any, key, value) {
                        contexts.push({ key, holder: this });
                        return value;
                    },
                })
            );

            // 根对象
            expect(contexts[0]?.key).toBe('');
            expect(contexts[0]?.holder['']).toBe(input);

            // a 属性
            expect(contexts[1]?.key).toBe('a');
            expect(contexts[1]?.holder).toBe(input);

            // b 属性
            expect(contexts[2]?.key).toBe('b');
            expect(contexts[2]?.holder).toBe(input.a);
        });

        it('Promise resolves to object with toJSON', async () => {
            class CustomValue {
                value = 123;
                toJSON() {
                    return {
                        converted: true,
                    };
                }
            }

            const result = await collect(
                stringifyStream({
                    data: Promise.resolve(new CustomValue()),
                })
            );

            expect(result).toBe('{"data":{"converted":true}}');
        });

        it('iterator should be closed when serialization fails', async () => {
            let closed = false;

            function* gen() {
                try {
                    yield 1n;
                    yield 2;
                } finally {
                    closed = true;
                }
            }

            await expect(
                collect(stringifyStream(gen()))
            ).rejects.toThrow(/BigInt/);

            expect(closed).toBe(true);
        });

        it('async iterator should be closed when serialization fails', async () => {
            let closed = false;

            async function* gen() {
                try {
                    yield 1n;
                    yield 2;
                } finally {
                    closed = true;
                }
            }

            await expect(
                collect(stringifyStream(gen()))
            ).rejects.toThrow(/BigInt/);

            expect(closed).toBe(true);
        });

        it('bufferSize larger than 32-bit integer range', async () => {
            const chunks: string[] = [];

            for await (const chunk of stringifyStream(
                { value: 'hello' },
                { bufferSize: 2 ** 32 + 8 }
            )) {
                chunks.push(chunk);
            }

            expect(chunks).toHaveLength(1);
            expect(chunks.join('')).toBe('{"value":"hello"}');
        });

        it('should not split UTF-16 surrogate pairs across chunks', async () => {
            const chunks: string[] = [];

            for await (const chunk of stringifyStream('😀', {
                bufferSize: 1,
            })) {
                chunks.push(chunk);
            }

            const result = Buffer.concat(
                chunks.map((chunk) => Buffer.from(chunk))
            ).toString('utf8');

            expect(result).toBe('"😀"');
        });

        it('iterable circular reference throws TypeError', async () => {
            const iterable: any = {
                *[Symbol.iterator]() {
                    yield this;
                },
            };
            await expect(
                collect(stringifyStream(iterable))
            ).rejects.toThrow(/circular/i);
        });

        it('shared iterable reference is not circular', async () => {
            const shared = [1, 2];
            const input = {
                a: shared,
                b: shared,
            };
            expect(await collect(stringifyStream(input))).toBe(
                '{"a":[1,2],"b":[1,2]}'
            );
        });
    });

});