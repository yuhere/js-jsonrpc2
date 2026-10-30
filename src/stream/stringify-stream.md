# stringifyStream

流式 JSON 序列化 `AsyncGenerator`，在尽可能兼容原生 `JSON.stringify` 的前提下，支持对超大结构进行分块输出，并额外处理 `Promise` / `Generator` / `AsyncGenerator` / `Buffer` 等类型。

## 特性

- **流式输出**：返回 `AsyncGenerator<string>`，按 `bufferSize` 分块 `yield`，降低内存峰值。
- **高度兼容原生 `JSON.stringify`**
  - 支持 `replacer`（函数 / 数组）。
  - 支持 `space`（缩进）。
  - 正确处理 `toJSON`、循环引用、BigInt、Symbol、不可枚举属性等。
- **增强能力**
  - `Promise`：自动 `await` 后继续序列化。
  - `Generator` / `AsyncGenerator` / `Iterator`：遍历后序列化为数组。
  - `Buffer`（Node.js）：序列化为十六进制字符串。
- **stringify**
  - 同时提供 `stringify`，用于一次性获得完整 JSON 字符串，具备相同的增强能力。
- **TypeScript 支持**：完整类型定义。

## 安装

```bash
# 直接复制源码使用，或按你的项目结构引入
```

## API

```ts
function stringifyStream(
  input: unknown,
  options?: {
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
): AsyncGenerator<string, void, unknown>;

/** 一次性获得完整 JSON 字符串 */
function stringify(
  input: unknown,
  options?: {
    space?: string | number;
    replacer?:
      | ((this: any, key: string, value: any) => any)
      | (string | number)[]
      | null;
  }
): Promise<string>;
```

## 快速开始

```ts
import { stringifyStream, stringify } from './stringify-stream';

// 1. 流式使用（推荐用于大对象 / HTTP 响应）
for await (const chunk of stringifyStream(hugeData, { space: 2 })) {
  res.write(chunk); // 或 process.stdout.write(chunk)
}

// 2. 一次性获得完整字符串
const json = await stringify(data);
console.log(json);

// 3. 带 replacer 和缩进
const json2 = await stringify(user, {
  space: 2,
  replacer(key, value) {
    if (key === 'password') return undefined;
    return value;
  },
});
```

## 与原生 `JSON.stringify` 的差异

| 场景 | 原生行为 | stringifyStream | 说明 |
|------|----------|-----------------|------|
| 基本类型 / 对象 / 数组 | 正常序列化 | 正常序列化 | 尽可能保持一致 |
| `toJSON` / `replacer` / `space` | 支持 | 支持 | 尽可能保持原生语义 |
| 循环引用 | 抛 `TypeError` | 抛 `TypeError` | 包括 Iterable 中的循环引用 |
| BigInt | 抛 `TypeError` | 抛 `TypeError` | 不调用 `BigInt.prototype.toJSON` |
| Symbol key / 不可枚举属性 | 忽略 | 忽略 | 一致 |
| 数组中的 `undefined` / `function` / `symbol` | `null` | `null` | 一致 |
| 对象中的 `undefined` / `function` / `symbol` | 省略 | `null` | 有意采用不同的处理规则 |
| 根是 `undefined` / `function` / `symbol` | `undefined` | `null` | 有意采用不同的处理规则 |
 | `Promise` | 当作普通对象处理 | **await 后递归序列化** | 增强 |
| `Generator` / `AsyncGenerator` / `Iterator` | 当作普通对象处理 | **遍历后序列化为数组** | 增强 |
| `Buffer`（Node.js） | 使用自带 `toJSON` | **`toString('hex')`** | 增强 |
| 输出形式 | 一次性完整字符串 | `AsyncGenerator<string>` | 核心目标 |

## 支持的特殊类型处理规则

| 类型 | 处理方式 |
|------|----------|
| 原始类型（string / number / boolean / null 等） | 直接使用 `JSON.stringify` 处理 |
| `Date` | 通过 `toJSON` 转换为 ISO 字符串 |
| `Buffer` | `toString('hex')` |
| boxed primitives（`new Number` 等） | 取 `valueOf()` |
| `Array` | 递归序列化，稀疏位置补 `null` |
| TypedArray | 按对象形式 `{"0":..., "1":...}` |
| `Map` / `Set` / `WeakMap` / `WeakSet` | `{}` |
| `Promise` | `await` 后继续序列化 |
| `Generator` / `AsyncGenerator` / `Iterator` | 遍历后当作数组 |
| 含 `toJSON` 的对象 | 先调用 `toJSON`，再对返回值序列化 |

## 示例

### 处理 Promise 与异步数据

```ts
const data = {
  user: Promise.resolve({ id: 1, name: 'Alice' }),
  scores: Promise.resolve([100, 98, 95]),
};

const json = await stringify(data);
// {"user":{"id":1,"name":"Alice"},"scores":[100,98,95]}
```

### 处理 Generator

```ts
function* idGenerator() {
  yield 1;
  yield 2;
  yield 3;
}

const json = await stringify(idGenerator());
// [1,2,3]
```

### 流式写入文件 / 响应

```ts
import { createWriteStream } from 'fs';
import { stringifyStream } from './stringify-stream';

const stream = createWriteStream('output.json');

for await (const chunk of stringifyStream(largeObject, {
  space: 2,
  bufferSize: 64 * 1024,
})) {
  if (!stream.write(chunk)) {
    await new Promise((r) => stream.once('drain', r));
  }
}

stream.end();
```

## 测试

项目使用 Vitest，覆盖了：

- 与原生 `JSON.stringify` 的行为一致性。
- `replacer`（函数 / 数组）、`space`、`toJSON`。
- 循环引用检测，包括普通对象、数组和 Iterable。
- BigInt、Symbol 及特殊对象。
- Promise / Generator / AsyncGenerator / Iterator / Buffer。
- 迭代器异常处理及资源清理。
- 分块边界，包括 UTF-16 surrogate pair。
- `bufferSize` 的边界值和大数值处理。
- 边界情况（稀疏数组、Invalid Date、null prototype、boxed primitives 等）。

运行测试：

```bash
npm test
# 或
npx vitest run
```

## 设计说明

### 1. 内存友好的流式输出

通过内部缓冲区和 `bufferSize` 控制每次 `yield` 的输出大小，避免一次性构建巨大字符串。

`bufferSize` 表示字符数，而不是字节数。对于正常情况，输出块不会超过设定阈值；为了避免拆分 UTF-16 surrogate pair，个别输出块可能比阈值多一个字符。

对于 `bufferSize` 的处理，会先进行有限性检查和整数归一化，避免超大数值、无穷值或非法数值导致异常行为。

### 2. 正确处理 UTF-16 字符边界

JavaScript 字符串使用 UTF-16 编码，一个 Unicode 字符可能由两个 code unit（surrogate pair）组成。

如果直接按照 `bufferSize` 切割字符串，可能将一对 surrogate 拆分到两个输出块中。消费者如果分别将每个 chunk 编码为 UTF-8，可能产生错误字符。

因此，分块时会检查切割位置。如果恰好位于 high surrogate 和 low surrogate 之间，就将切割位置向后移动一个字符，确保一对 surrogate 始终位于同一个 chunk 中。

### 3. replacer / toJSON 只执行一次

在序列化过程中，确保 `toJSON` 和函数形式的 `replacer` 按照预期执行，避免 Promise 解析后的值再次经过不必要的处理。

函数形式的 `replacer` 使用当前属性的持有对象作为 `this`，保持与原生序列化语义一致。

### 4. 循环引用检测

使用 `WeakSet` 跟踪当前递归序列化路径中正在处理的对象。

发现循环引用时立即抛出 `TypeError`，避免无限递归。

对于 Iterable，同样进行循环引用检测。例如，一个迭代器产生自身时，也会被识别为循环引用。

对象完成当前分支的序列化后，会从跟踪集合中移除，因此同一个对象可以在不同分支中重复出现，而不会被误判为循环引用。

### 5. 迭代器资源清理

遍历 Generator / AsyncGenerator / Iterator 时，如果序列化过程中发生异常或提前终止，会尝试调用迭代器的 `return()` 方法，以便执行迭代器自身的清理逻辑。

循环引用跟踪状态也会通过 `finally` 清理，确保异常情况下不会残留状态。

### 6. 特殊类型与原生行为的取舍

在尽可能兼容 `JSON.stringify` 的基础上，针对异步值和迭代器提供扩展处理。

其中，`Promise` 会先解析再序列化；Iterable 会被遍历并序列化为数组；Node.js `Buffer` 会转换为十六进制字符串。

这些增强规则是 `stringifyStream` 与原生 `JSON.stringify` 的有意区别。