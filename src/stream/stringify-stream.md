# stringifyStream

流式 JSON 序列化 `AsyncGenerator`，在尽可能兼容原生 `JSON.stringify` 的前提下，支持对超大结构进行分块输出，并额外处理 `Promise` / `Generator` / `AsyncGenerator` / `Buffer` 等类型。

## 特性

- **流式输出**：返回 `AsyncGenerator<string>`，按 `bufferSize` 分块 `yield`，降低内存峰值
- **高度兼容原生 `JSON.stringify`**
  - 支持 `replacer`（函数 / 数组）
  - 支持 `space`（缩进）
  - 正确处理 `toJSON`、循环引用、BigInt、Symbol、不可枚举属性等
- **增强能力**
  - `Promise`：自动 `await` 后继续序列化
  - `Generator` / `AsyncGenerator` / `Iterator`：遍历后序列化为数组
  - `Buffer`（Node.js）：序列化为十六进制字符串
- **stringify**
  - 同时提供了 stringify 用于一次性获得 JSON。具备增强能力。
- **TypeScript 支持**，完整类型定义

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
): AsyncGenerator<string, void, unknown>
```

辅助函数：

```ts
/** 收集全部输出为完整字符串 */
function collect(
  gen: AsyncGenerator<string, void, unknown>
): Promise<string>
```

## 快速开始

```ts
import { stringifyStream, collect } from './stringify-stream';

// 1. 流式使用（推荐用于大对象 / HTTP 响应）
for await (const chunk of stringifyStream(hugeData, { space: 2 })) {
  res.write(chunk);          // 或 process.stdout.write(chunk)
}

// 2. 收集为完整字符串
const json = await collect(stringifyStream(data));
console.log(json);

// 3. 带 replacer 和缩进
const json2 = await collect(
  stringifyStream(user, {
    space: 2,
    replacer(key, value) {
      if (key === 'password') return undefined;
      return value;
    },
  })
);
```

## 与原生 `JSON.stringify` 的差异

| 场景 | 原生行为 | stringifyStream | 说明 |
|------|----------|-----------------|------|
| 基本类型 / 对象 / 数组 | ✅ | ✅ | 完全一致 |
| `toJSON` / `replacer` / `space` | ✅ | ✅ | 完全一致 |
| 循环引用 | 抛 `TypeError` | 抛 `TypeError` | 一致 |
| BigInt | 抛 `TypeError` | 抛 `TypeError` | 一致 |
| Symbol key / 不可枚举属性 | 忽略 | 忽略 | 一致 |
| 数组中的 `undefined` / `function` / `symbol` | `null` | `null` | 一致 |
| 对象中的 `undefined` / `function` / `symbol` | 省略 | 省略 | 一致 |
| **Promise** | 当作普通对象 `{}` | **await 后递归序列化** | 增强 |
| **Generator / AsyncGenerator / Iterator** | 当作普通对象 `{}` | **遍历后序列化为数组** | 增强 |
| **Buffer** (Node) | 使用自带 `toJSON` | **`toString('hex')`** | 增强 |
| 输出形式 | 一次性完整字符串 | `AsyncGenerator<string>` | 核心目标 |

## 支持的特殊类型处理规则

| 类型 | 处理方式 |
|------|----------|
| 原始类型（string / number / boolean / null 等） | 直接 `JSON.stringify` |
| `Date` | 通过 `toJSON` → ISO 字符串（与原生一致） |
| `Buffer` | `toString('hex')` |
| boxed primitives (`new Number` 等) | 取 `valueOf()` |
| `Array` | 递归序列化，稀疏位置补 `null` |
| TypedArray | 按对象形式 `{"0":..., "1":...}`（与原生一致） |
| `Map` / `Set` / `WeakMap` / `WeakSet` | `{}`（与原生一致） |
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

const json = await collect(stringifyStream(data));
// {"user":{"id":1,"name":"Alice"},"scores":[100,98,95]}
```

### 处理 Generator

```ts
function* idGenerator() {
  yield 1;
  yield 2;
  yield 3;
}

const json = await collect(stringifyStream(idGenerator()));
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

- 与原生 `JSON.stringify` 的行为一致性
- `replacer` / `space` / `toJSON`
- 循环引用、BigInt
- Promise / Generator / AsyncGenerator / Iterator / Buffer
- 边界情况（稀疏数组、Invalid Date、null prototype、boxed primitives 等）

```bash
npm test
# 或
npx vitest run
```

## 设计说明

- **内存友好**：通过内部缓冲 + `bufferSize` 控制每次 `yield` 的大小，避免一次性构建巨大字符串。
- **replacer / toJSON 只执行一次**：保证与原生语义一致，并避免对 Promise resolve 后的值重复调用 replacer 导致的问题。
- **循环检测**：使用 `WeakSet` 跟踪正在序列化的对象，发现循环立即抛出与原生一致的错误。

