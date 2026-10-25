/**
 * 流式 JSON 序列化 AsyncGenerator
 * 尽可能兼容原生 JSON.stringify，同时支持 Promise / Generator / AsyncGenerator / Buffer
 */

export interface StringifyStreamOptions {
    /** 缓冲大小（字符数），默认 16KB */
    bufferSize?: number;
    /** 缩进，同 JSON.stringify 的 space */
    space?: string | number;
    /** replacer，同 JSON.stringify */
    replacer?:
    | ((this: any, key: string, value: any) => any)
    | (string | number)[]
    | null;
}

const MAX_GAP_LENGTH = 10;
const DEFAULT_BUFFER_SIZE = 16 * 1024;

export async function* stringifyStream(
    input: unknown,
    options: StringifyStreamOptions = {}
): AsyncGenerator<string, void, unknown> {
    const {
        bufferSize: rawBufferSize = DEFAULT_BUFFER_SIZE,
        space,
        replacer,
    } = options;
    const bufferSize = Math.max(1, rawBufferSize | 0);

    const seen = new WeakSet<object>();
    let gap = '';
    if (typeof space === 'number') {
        gap = ' '.repeat(Math.min(MAX_GAP_LENGTH, Math.max(0, Math.floor(space))));
    } else if (typeof space === 'string') {
        gap = space.slice(0, MAX_GAP_LENGTH);
    }

    let replacerFn: ((this: any, key: string, value: any) => any) | null = null;
    let propertyList: Set<string> | null = null;

    if (typeof replacer === 'function') {
        replacerFn = replacer;
    } else if (Array.isArray(replacer)) {
        propertyList = new Set<string>();
        for (const p of replacer) {
            if (typeof p === 'string' || typeof p === 'number') {
                propertyList.add(String(p));
            }
        }
    }

    let buffer = '';

    function* flush(force = false): Generator<string, void, unknown> {
        while (buffer.length >= bufferSize || (force && buffer.length > 0)) {
            const chunk = buffer.slice(0, bufferSize);
            buffer = buffer.slice(bufferSize);
            yield chunk;
        }
    }

    function write(str: string): void {
        buffer += str;
    }

    function writeJSONString(str: string): void {
        write(JSON.stringify(str));
    }

    function checkCycle(value: object): void {
        if (seen.has(value)) {
            throw new TypeError('Converting circular structure to JSON');
        }
        seen.add(value);
    }

    function uncheckCycle(value: object): void {
        seen.delete(value);
    }

    function isPrimitive(v: unknown): boolean {
        const t = typeof v;
        return (
            v === null ||
            t === 'string' ||
            t === 'number' ||
            t === 'boolean' ||
            t === 'undefined' ||
            t === 'symbol' ||
            t === 'bigint'
        );
    }

    function assertNoBigInt(v: unknown): void {
        if (typeof v === 'bigint') {
            throw new TypeError('Do not know how to serialize a BigInt');
        }
    }

    function isTypedArray(value: unknown): boolean {
        return ArrayBuffer.isView(value) && !(value instanceof DataView);
    }

    function prepareValue(value: unknown, key: string): unknown {
        // 1. toJSON（跳过 Buffer）
        if (
            value !== null &&
            typeof value === 'object' &&
            typeof (value as any).toJSON === 'function' &&
            !(typeof Buffer !== 'undefined' && Buffer.isBuffer(value))
        ) {
            value = (value as any).toJSON(key);
        }

        // 2. replacer
        if (replacerFn) {
            value = replacerFn.call(
                key === '' ? undefined : null,
                key,
                value
            );
        }

        return value;
    }

    async function* serialize(
        value: unknown,
        key: string,
        depth: number
    ): AsyncGenerator<string, void, unknown> {
        // ========== 只在这里做一次 prepare ==========
        value = prepareValue(value, key);

        // undefined / function / symbol → 由调用方决定（对象省略，数组写 null）
        if (
            value === undefined ||
            typeof value === 'function' ||
            typeof value === 'symbol'
        ) {
            return;
        }

        assertNoBigInt(value);

        // Promise（replacer 或 toJSON 返回的 Promise 在这里统一处理）
        if (value instanceof Promise) {
            value = await Promise.resolve(value);
            // 注意：await 之后要重新走完整流程（包括可能的再次 toJSON/replacer？）
            // 为了与「只 prepare 一次」一致，这里选择不再 prepare，直接递归时跳过 prepare
            // 最简单且安全的做法：再调一次 serialize（此时 value 已是 resolved 后的值）
            // 但为了避免对 resolved 后的 number 再次触发 replacer，我们改成内部递归时传一个 flag
            yield* serializePrepared(value, key, depth);
            return;
        }

        yield* serializePrepared(value, key, depth);
    }

    /** 已经完成 prepare 的值，直接序列化（不再调用 toJSON/replacer） */
    async function* serializePrepared(
        value: unknown,
        key: string,
        depth: number
    ): AsyncGenerator<string, void, unknown> {
        if (
            value === undefined ||
            typeof value === 'function' ||
            typeof value === 'symbol'
        ) {
            return;
        }

        assertNoBigInt(value);

        if (isPrimitive(value)) {
            write(JSON.stringify(value));
            return;
        }

        if (value instanceof Date) {
            if (Number.isNaN(value.getTime())) {
                write('null');
            } else {
                writeJSONString(value.toISOString());
            }
            return;
        }

        if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
            writeJSONString(value.toString('hex'));
            return;
        }

        // boxed primitives
        if (value instanceof Number) {
            write(JSON.stringify((value as Number).valueOf()));
            return;
        }
        if (value instanceof String) {
            write(JSON.stringify((value as String).valueOf()));
            return;
        }
        if (value instanceof Boolean) {
            write(JSON.stringify((value as Boolean).valueOf()));
            return;
        }

        // 数组
        if (Array.isArray(value)) {
            checkCycle(value);
            write('[');
            let first = true;
            for (let i = 0; i < value.length; i++) {
                if (!first) write(',');
                first = false;
                if (gap) write('\n' + gap.repeat(depth + 1));

                let elem = prepareValue(value[i], String(i));
                if (elem instanceof Promise) {
                    elem = await Promise.resolve(elem);
                }
                if (
                    elem === undefined ||
                    typeof elem === 'function' ||
                    typeof elem === 'symbol'
                ) {
                    write('null');
                } else {
                    yield* serializePrepared(elem, String(i), depth + 1);
                }
                yield* flush();
            }
            if (gap && value.length > 0) {
                write('\n' + gap.repeat(depth));
            }
            write(']');
            uncheckCycle(value);
            return;
        }

        // TypedArray
        if (isTypedArray(value)) {
            checkCycle(value as object);
            write('{');
            let first = true;
            const arr = value as ArrayLike<number>;
            for (let i = 0; i < arr.length; i++) {
                if (!first) write(',');
                first = false;
                if (gap) write('\n' + gap.repeat(depth + 1));
                writeJSONString(String(i));
                write(gap ? ': ' : ':');
                write(JSON.stringify(arr[i]));
                yield* flush();
            }
            if (gap && arr.length > 0) {
                write('\n' + gap.repeat(depth));
            }
            write('}');
            uncheckCycle(value as object);
            return;
        }

        // 可迭代
        const hasAsyncIterator =
            value != null &&
            typeof (value as any)[Symbol.asyncIterator] === 'function';
        const hasIterator =
            value != null &&
            typeof (value as any)[Symbol.iterator] === 'function';
        const isIteratorLike =
            value != null &&
            typeof (value as any).next === 'function';

        const shouldTreatAsIterable =
            (hasAsyncIterator || hasIterator || isIteratorLike) &&
            !(value instanceof Map) &&
            !(value instanceof Set) &&
            !(value instanceof WeakMap) &&
            !(value instanceof WeakSet);

        if (shouldTreatAsIterable) {
            write('[');
            let first = true;
            let idx = 0;

            let iterator: AsyncIterator<unknown> | Iterator<unknown>;
            if (hasAsyncIterator) {
                iterator = (value as AsyncIterable<unknown>)[Symbol.asyncIterator]();
            } else if (hasIterator) {
                iterator = (value as Iterable<unknown>)[Symbol.iterator]();
            } else {
                iterator = value as Iterator<unknown>;
            }

            while (true) {
                const step = await Promise.resolve(iterator.next());
                if (step.done) break;

                if (!first) write(',');
                first = false;
                if (gap) write('\n' + gap.repeat(depth + 1));

                // const before = buffer.length;
                // yield* serialize(step.value, String(idx), depth + 1);
                // if (buffer.length === before) {
                //     write('null');
                // }
                // prepare + await 后再决定写 null 还是序列化（与对象路径一致）
                let elem = prepareValue(step.value, String(idx));
                if (elem instanceof Promise) {
                    elem = await Promise.resolve(elem);
                }
                if (
                    elem === undefined ||
                    typeof elem === 'function' ||
                    typeof elem === 'symbol'
                ) {
                    write('null');
                } else {
                    yield* serializePrepared(elem, String(idx), depth + 1);
                }
                idx++;
                yield* flush();
            }

            if (gap && !first) {
                write('\n' + gap.repeat(depth));
            }
            write(']');
            return;
        }

        // 普通对象
        checkCycle(value as object);

        if (
            value instanceof Set ||
            value instanceof Map ||
            value instanceof WeakSet ||
            value instanceof WeakMap
        ) {
            write('{}');
            uncheckCycle(value as object);
            return;
        }

        write('{');
        let first = true;

        const keys = propertyList
            ? [...propertyList].filter((k) =>
                Object.prototype.hasOwnProperty.call(value, k)
            )
            : Object.keys(value as object);

        for (const k of keys) {
            // 1. 先 prepare
            let propValue = prepareValue((value as any)[k], k);

            // 2. 如果是 Promise，先 await（关键！）
            if (propValue instanceof Promise) {
                propValue = await Promise.resolve(propValue);
            }

            // 3. 现在再判断是否应该省略
            if (
                propValue === undefined ||
                typeof propValue === 'function' ||
                typeof propValue === 'symbol'
            ) {
                continue;
            }

            // 4. 可以安全地写 key 了
            if (!first) write(',');
            first = false;

            if (gap) {
                write('\n' + gap.repeat(depth + 1));
            }

            writeJSONString(k);
            write(gap ? ': ' : ':');

            // 5. 直接序列化已经 prepare + await 过的值
            yield* serializePrepared(propValue, k, depth + 1);
            yield* flush();
        }

        if (gap && !first) {
            write('\n' + gap.repeat(depth));
        }
        write('}');
        uncheckCycle(value as object);
    }

    yield* serialize(input, '', 0);
    yield* flush(true);
}


export async function stringify(
    input: unknown,
    options: StringifyStreamOptions = {}
): Promise<string> {
    const gen = stringifyStream(input, options);
    const chunks: string[] = [];
    for await (const chunk of gen) {
        chunks.push(chunk);
    }
    return chunks.join('');
}
