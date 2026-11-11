# js-jsonrpc2 规范

版本：2.1.1

包名：`@yuhere/js-jsonrpc2`

## 目录

1. 概述
2. 约定
3. 兼容性与范围
4. 架构
5. 方法注册
6. Schema 系统
7. 请求处理
8. 授权与依赖注入
9. 响应对象
10. 错误
11. 流式响应
12. HTTP 传输
13. WebSocket 传输
14. stdio 传输
15. 内置系统方法
16. 示例
17. 实现说明

## 1 概述

`js-jsonrpc2` 是一个使用 TypeScript 编写、面向 Node.js 的服务端 JSON-RPC 2.0 实现。
它提供方法仓库、请求和方法数据的运行时校验、权限检查、服务端注入值，以及 HTTP、WebSocket 和 stdio 传输方式。

该库使用 JSON-RPC 2.0 请求与响应对象。其公共 API 还定义了用于描述方法签名的 Schema 层。
该层用于运行时校验和方法自省，与 TypeScript 的编译期类型不同。

实现目标运行环境为 Node.js 18 或更高版本。

## 2 约定

本文中的 **MUST**（必须）、**MUST NOT**（禁止）、**REQUIRED**（必需）、**SHOULD**（应该）、**SHOULD NOT**（不应该）和 **MAY**（可以）用于描述本文范围内的要求。

- **协议要求**：继承自 JSON-RPC 2.0 的要求。
- **库行为**：本项目实际实现的行为。
- **应用策略**：集成该库的应用需要自行决定的行为。

JSON 成员名称和方法命名空间区分大小写。
方法签名采用位置式定义：签名中的第一个元素描述返回值，后续元素依次描述处理函数的参数。

## 3 兼容性与范围

该库实现 JSON-RPC 2.0 服务端模型，不兼容 JSON-RPC 1.0。

包的公共入口导出：

- `Repository` 和 `createRepository`
- `RPCError` 和 `codes`
- `s`：JSON 数据 Schema 与标记构造器集合
- `createExpressRouter`
- `attachWebSocket` 和 `createWebSocketServer`
- `serveStdio`
- `src/types.ts` 导出的公共类型，以及各传输方式的选项类型

包清单将包标识为 `@yuhere/js-jsonrpc2`，版本为 `2.1.x`，要求 Node.js `>=18`。
它声明了 ESM 包模式、ESM 模块入口、CommonJS `main` 入口以及 TypeScript 声明文件。
检查到的包导出映射没有显式的 `require` 条件；
使用者 **SHOULD** 检查自己的模块解析环境，而不应假设所有 CommonJS 加载方式都受支持。

本文描述所提供源码快照能够支持的行为。
独立的 `stringifyStream` 工具不属于本文所定义的公共协议功能。

## 4 架构

该库围绕三个概念组织：

1. **Repository（方法仓库）**：保存方法描述符和处理函数，校验传入请求，检查访问权限，解析注入参数，调用处理函数，并组织响应。
2. **Schema**：描述与 JSON 兼容的参数和返回数据，并在运行时校验值。
3. **Transport（传输层）**：接收请求数据、调用仓库，并写出普通响应或流式响应。

同一个 `Repository` 可以用于 Express 路由器、已挂载的 WebSocket 端点或 stdio。传输层可以提供自己的注入值构造函数和错误转换回调。

## 5 方法注册

### 5.1 方法描述符

注册方法时需要提供描述符和处理函数。

```ts
repository.register(
  {
    namespace: "subtract",
    document: "Subtract b from a.",
    grantTo: ["calculator"],
    signature: [
      s.number().describe("result"),
      s.number().describe("a"),
      s.number().describe("b"),
    ],
  },
  (a: number, b: number) => a - b,
);
```

描述符包含以下字段：

| 字段 | 要求与含义 |
|---|---|
| `namespace` | 必需的非空字符串，用于标识 RPC 方法。 |
| `signature` | 必需的元组，包含一个返回值槽位，后接若干参数槽位。 |
| `document` | 可选字符串或回调，用于提供方法帮助信息/文档。 |
| `grantTo` | 可选授权标识数组，方法权限检查会使用这些标识。 |

`document` 的回调形式接收描述符本身，可以返回字符串、解析为字符串的 Promise，或 `void`。

### 5.2 签名槽位

签名按以下顺序声明：

```ts
type RPCSignature = [RPCReturnSlot, ...RPCParamSlot[]];
type RPCReturnSlot =
  | Schema<unknown>
  | VoidMarker
  | StreamMarker<unknown>;
type RPCParamSlot = Schema<unknown> | InjectableMarker;
```

- 槽位 0 是返回值定义。
- 槽位 1 起依次定义处理函数的参数。
- 普通 Schema 用于校验调用方提供的 JSON 值。
- `s.injectable(key)` 表示该值由服务端提供。
- `s.void()` 表示方法没有有意义的返回结果。
- `s.stream(schema)` 表示流式返回，并定义每个产出项的 Schema。

`VoidMarker`、`InjectableMarker` 和 `StreamMarker` 都是控制标记，而不是普通 JSON 数据 Schema。应用 **MUST** 仅在各标记所支持的签名位置使用它们。

### 5.3 Repository 操作

`createRepository(options?)` 用于创建 `Repository`。`RepositoryOptions` 中的 `withSystemMethods` 控制是否安装内置系统方法；实现默认启用。

公共仓库操作包括：

- `register(descriptor, handler)`：按命名空间注册方法。
- `has(namespace)`：检查命名空间是否存在。
- `list()`：列出已注册的命名空间名称。
- `get(namespace)`：获取已注册的方法描述符。
- `signatureOf(descriptor)`：获取规范化后的签名描述。
- `invoke(input, options?)`：校验并调用传入请求，生成 RPC 响应或流式响应。

如果注册的命名空间已存在，实现会用新条目替换原条目。

## 6 Schema 系统

### 6.1 JSON 数据模型

Schema 系统描述与 JSON 兼容的值。其 JSON 类型模型包括字符串、数字、布尔值、`null`、数组和对象。`undefined`、`bigint`、`symbol`、函数、`NaN` 和无穷值等仅属于 JavaScript 的值并非 JSON 值，**SHOULD NOT** 将它们用作普通 RPC 数据。

通过 `s` 访问构造器。

### 6.2 构造器

| 构造器 | 含义 |
|---|---|
| `s.string()` | 字符串值。继承 `NullableSchema`。 |
| `s.number()` | 数字值。继承 `NullableSchema`。 |
| `s.boolean()` | 布尔值。继承 `NullableSchema`。 |
| `s.unknown()` | 任意 JSON 值，包括 `null`。不继承 `NullableSchema`；不暴露 `.nullable()`。 |
| `s.null()` | 精确的 `null`。不继承 `NullableSchema`；不暴露 `.nullable()`。 |
| `s.literal(value)` | 指定的字符串、数字或布尔值字面量。`null` 在构造时被拒绝。继承 `NullableSchema`。 |
| `s.enum(values)` | 字符串枚举中的一个值。继承 `NullableSchema`。 |
| `s.array(itemSchema)` | 元素均符合 `itemSchema` 的数组。继承 `NullableSchema`。 |
| `s.object(shape)` | 由属性到 Schema 的映射描述的对象。继承 `NullableSchema`。 |
| `s.record(valueSchema)` | 所有属性值均符合指定 Schema 的对象。继承 `NullableSchema`。 |
| `s.union(schemas)` | 至少符合一个给定 Schema 的值。继承 `NullableSchema`。构造时会把每个成员 clone 并 `nullable(false)`。 |
| `s.tuple(schemas)` | 按位置使用给定 Schema 校验的数组。继承 `NullableSchema`。 |

标记构造器包括 `s.void()`、`s.injectable(key)` 和 `s.stream(innerSchema)`。

### 6.3 通用 Schema 方法

所有 Schema 都提供 `.describe(text)` 和 `.toJSON()`。继承 `NullableSchema` 的 Schema 额外提供 nullability 控制；支持边界约束的 Schema 提供 `.min(value)` / `.max(value)`；对象 Schema 提供 `.strict()`。

- `.describe(text)`：附加便于人类阅读的描述元数据。
- `.nullable(value?: boolean)`：允许 `null`（默认 `true`）；`nullable(false)` 撤销。不可变。`s.unknown()` 与 `s.null()` 不提供此方法。
- `.min(value)` 和 `.max(value)`：在 Schema 类型支持时添加边界约束。
- `.strict()`：用于对象 Schema，要求声明的属性存在，并拒绝未声明的属性（这是默认行为）。

对象 Schema 默认是严格模式：所有声明的属性必填，且拒绝未声明属性。要放宽可分别使用 `.optionalProperties(keys)`（允许指定已声明属性缺失）、`.allowUnknownProperties(true)`（保留未知属性），或 `.strict(false)`（完全宽松）。`s.unknown()` 本身已经接受 `null`，因此 `.nullable()` 既不暴露也无必要。`s.literal(v)` 在构造时拒绝 `null`；要表达「就是 null」用 `s.null()`，要表达「字面量或 null」用 `.nullable()`。`s.union([...])` 在构造时会剥离成员的 nullable，只有 union 自身的 `.nullable()` 决定是否接受 `null`。

Schema 提供解析/校验能力以及用于自省的结构化描述。TypeScript 类型描述编译期预期，不能替代对网络接收数据的运行时校验。

## 7 请求处理

### 7.1 请求对象

实现使用 JSON-RPC 请求 Schema 校验输入。请求采用 JSON-RPC 2.0 的基本结构：

```json
{
  "jsonrpc": "2.0",
  "method": "subtract",
  "params": [42, 23],
  "id": 1
}
```

- `jsonrpc` **MUST** 为 `"2.0"`。
- `method` 标识已注册的命名空间。
- `params`（如果存在）包含请求参数。
- `id` 用于将请求与响应关联。公共请求 ID 类型为 `string | number`。

实现中的 `RPCRequestInput` 类型将 `params` 表示为数组。尽管 JSON-RPC 2.0 也描述了使用对象传递的命名参数，除非已确认特定库版本和调用路径支持命名参数，否则应用 **SHOULD** 使用位置式数组参数。

### 7.2 处理顺序

对于普通调用，仓库负责执行以下操作：

1. 校验传入请求的结构。
2. 查找请求的方法。
3. 将方法所需授权与当前可用授权进行检查。
4. 根据方法签名校验调用方提供的参数。
5. 从注入映射中解析服务端注入参数。
6. 调用已注册的处理函数。
7. 根据返回值槽位校验普通返回值，或准备流式响应。
8. 将可识别的失败转换为 JSON-RPC 错误响应。

具体传输层还可能在调用仓库之前或之后执行解析及传输相关的错误处理。

### 7.3 通知与批量请求

JSON-RPC 2.0 将不带 `id` 且服务器不返回响应的请求定义为通知，并将由请求对象组成的数组定义为批量请求。未检查当前实现之前，不应假设该库的所有传输方式都以相同方式实现了所有通知或批量请求规则。公开的 `RPCRequestInput` 类型要求 `id`，而现有源码摘录不足以确认完整的批量请求语义。

## 8 授权与依赖注入

### 8.1 授权标识

描述符可以指定 `grantTo`，即授权标识数组。仓库会将其与本次调用可用的授权进行比较。权限检查失败时使用库的 `PERMISSION_DENIED` 错误码（`-32604`）。

应用负责从可信的认证/授权上下文中生成授权标识。客户端提供的参数 **MUST NOT** 被当作授权证明。

### 8.2 注入参数

使用 `s.injectable("key")` 声明注入参数。调用方不需要在普通参数列表中提供该值；传输层会提供一个包含服务端值的映射。

```ts
repository.register(
  {
    namespace: "currentUser",
    signature: [
      s.object({ id: s.string() }).strict(),
      s.injectable("currentUser"),
    ],
  },
  (currentUser: { id: string }) => currentUser,
);
```

注入映射使用 `Injections` 表示，它是一个记录类型，值可以是直接值，也可以是同步或异步返回值的函数。`InjectableFactory` 的调用形式是 `mkInjectable(context, repository)`。

`context` 随传输方式变化：

- Express：`{ request, session, response }`。
- WebSocket：`{ socket, request }`。
- stdio：`{ input, output }`。

省略 `mkInjectable` 时，默认映射为：

- Express：`request`、`session`、`response`、`repository`。
- WebSocket：`socket`、`request`、`repository`。
- stdio：`repository`、`input`、`output`。

提供 `mkInjectable` 时，返回值会替换上述默认键，但传输层始终把 `repository` 设为当前仓库，并额外加入指向该映射自身的 `injections`。应用 **SHOULD** 只返回处理函数需要的值。

## 9 响应对象

### 9.1 普通响应

成功的普通响应具有以下结构：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": 19
}
```

失败响应具有以下结构：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Invalid params"
  }
}
```

普通响应包含 `result` 或 `error` 其中之一，不应同时包含两者。响应 ID 为请求 ID；如果无法确定请求 ID，则为 `null`。公共响应类型包括 `RPCSuccess`、`RPCFailure` 和 `RPCResponse`。

void 返回标记表示方法没有有意义的返回值。其传输层表示方式应针对所选传输方式和当前版本进行确认；调用方 **MUST NOT** 假设它与普通的 `null` Schema 等价。

### 9.2 错误载荷

错误载荷包含数字类型的 `code`、字符串类型的 `message`，以及可选的 `data`。库的 `RPCError` 类提供 `code`、可选的 `data`、`toPayload()` 和 `toJSON()`。

## 10 错误

公共导出 `codes` 包含以下错误码：

| 错误码 | 常量 | 含义 |
|---:|---|---|
| `-32700` | `PARSE_ERROR` | 解析错误 |
| `-32600` | `INVALID_REQUEST` | 请求结构无效 |
| `-32601` | `METHOD_NOT_FOUND` | 请求的方法不可用 |
| `-32602` | `INVALID_PARAMS` | 参数校验失败 |
| `-32603` | `INTERNAL_ERROR` | 内部错误 |
| `-32604` | `PERMISSION_DENIED` | 权限检查失败 |

应用可以抛出 `new RPCError(code, message, data?)`，以返回指定的协议错误。错误码为数字类型；在不与库的约定冲突时，可以使用应用自定义错误码。

传输层的 `errorTransform` 回调接收一个未知错误，并返回 `RPCError` 或 `undefined`。它可用于集中转换错误。应用 **SHOULD** 避免在错误消息或 `data` 中暴露凭据、内部堆栈或敏感实现细节。

在检查过的传输实现中，某些失败路径可能仅在非生产环境包含额外错误数据，并在生产环境中抑制该数据。不要依赖开发环境才会出现的 `data` 一定存在于生产响应中。

## 11 流式响应

### 11.1 声明流

方法可在返回值槽位使用 `s.stream(itemSchema)` 声明流，并返回与仓库实现兼容的异步生成器/异步可迭代对象。

```ts
repository.register(
  {
    namespace: "ticks",
    signature: [s.stream(s.string()), s.number().min(1).max(10)],
  },
  async function* (count: number) {
    for (let i = 0; i < count; i++) {
      yield `tick ${i}`;
    }
  },
);
```

内部 Schema 描述每个产出的值。流不是一个先完整物化为数组、再放入普通 `result` 的响应。

### 11.2 流数据块

公共的 `RPCStreamChunk` 结构如下：

```ts
interface RPCStreamChunk {
  jsonrpc: "2.0";
  id: string | number;
  done: boolean;
  index?: number;
  value?: unknown;
  error?: { code: number; message: string };
}
```

数据帧的 `done` 为 `false`，并带有 `index` 和 `value`。成功结束帧的 `done` 为 `true`，并带有最终索引。如果迭代失败，结束帧可能包含由错误码和消息组成的错误对象。在清理路径中，实现会尝试调用源生成器的 `return()`。

流在线路上的分帧方式取决于传输层：WebSocket 发送独立 JSON 消息，stdio 写出以换行符结束的 JSON 帧，Express 响应器则增量写出流内容。客户端 **MUST** 遵循所选传输方式的分帧规则，而不应假设所有传输方式都以相同方式编码流。

## 12 HTTP 传输

### 12.1 `createExpressRouter`

```ts
createExpressRouter(repository: Repository, options?: ExpressOptions): Router
```

选项如下：

| 选项 | 默认值 | 含义 |
|---|---|---|
| `mkInjectable` | 内置映射 | 返回服务端注入值的函数。 |
| `errorTransform` | `undefined` | 将其他未处理的错误转换为 `RPCError`。 |
| `bodyLimit` | `"1mb"` | JSON 请求体大小限制。 |
| `useHtdoc` | `NODE_ENV !== "production"` | 启用时提供内置文档 UI。 |

路由器处理内容类型为 JSON 的 `POST /` 请求。如果请求未被识别为 `application/json`，则交由下一个 Express 中间件处理。可以将路由器挂载到所需路径，例如 `app.use("/rpc", createExpressRouter(repository))`。

请求体解析器会将原始请求体保存在 `req.rawBody`。解析失败会映射为 `PARSE_ERROR`。响应器分别处理普通响应和流式响应。

## 13 WebSocket 传输

### 13.1 `attachWebSocket`

```ts
attachWebSocket(
  server: Server,
  repository: Repository,
  options: WSOptions,
): WebSocketServer
```

该函数将 JSON-RPC WebSocket 端点挂载到现有 Node HTTP 服务器，并返回底层的 `WebSocketServer`。

`WSOptions` 包含：

| 选项 | 默认值/行为 |
|---|---|
| `mkInjectable` | 可选函数，为连接创建注入值。 |
| `errorTransform` | 可选的全局错误转换函数。 |
| `path` | `"/"`；由 `attachWebSocket` 使用。 |
| `allowOrigin` | 可选升级回调，接收 origin 和 request；返回 `false` 会拒绝升级。 |
| `maxPayload` | 1 MiB，传递给 `ws` 服务器。 |
| `onConnection` | 建立连接后调用的可选回调。 |

`allowOrigin` 只是 WebSocket 升级阶段的门禁，并不是完整的身份认证或授权系统。

### 13.2 `createWebSocketServer`

```ts
createWebSocketServer(options?: StandaloneWsOptions): Promise<StandaloneWsHandle>
```

`StandaloneWsOptions` 扩展 `WSOptions`，增加以下字段：

- `server?: Server`：要挂载到的现有 HTTP 服务器。
- `port?: number`：创建服务器时默认为 `8080`。
- `host?: string`：创建服务器时默认为 `"127.0.0.1"`。

返回的句柄包含 `server`、`wss` 和 `close(): Promise<void>`。如果该辅助函数创建了 HTTP 服务器，`close()` 会同时关闭 WebSocket 服务器和该 HTTP 服务器。如果调用方传入了服务器，辅助函数不会拥有该 HTTP 服务器，也不会将其关闭。

## 14 stdio 传输

### 14.1 `serveStdio`

```ts
serveStdio(options?: StdioOptions): Promise<void>
```

选项如下：

| 选项 | 默认值 | 含义 |
|---|---|---|
| `repository` | 新建 `Repository` | 要调用的方法仓库。 |
| `input` | `process.stdin` | 可读输入流。 |
| `output` | `process.stdout` | 可写输出流。 |
| `framing` | `"lines"` | 使用 `"lines"` 或 `"json"` 提取帧。 |
| `mkInjectable` | 内置映射 | 创建注入值的函数。 |
| `errorTransform` | `undefined` | 全局错误转换函数。 |
| `maxFrameBytes` | 1 MiB | 缓冲帧的最大大小。 |
| `onResponse` | 无 | 非流式响应写出完成后调用。 |

在 `"lines"` 模式下，每个非空行都会被解析为一个 JSON 值。在 `"json"` 模式下，实现会提取由可选空白字符分隔的连续 JSON 值。输出写入会被串行化，以避免响应字节相互交错。当输入结束且所有待处理写入完成时，返回的 Promise 会完成。

stdio 的调用形式是 `mkInjectable({ input, output }, repository)`。`input` 和 `output` 是配置的流（默认分别是 `process.stdin` 和 `process.stdout`），没有 HTTP request/response 参数。省略工厂时，默认映射提供 `repository`、`input` 和 `output`。

## 15 内置系统方法

启用 `withSystemMethods` 时，仓库会安装用于方法发现/帮助信息的系统方法；检查到的源码中包括 `system.methodSignature` 和 `system.methodHelp`。

系统方法行为属于具体实现，而不是基础 JSON-RPC 2.0 协议的一部分。在围绕这些方法构建客户端之前，应用 **SHOULD** 根据当前源码或声明文件确认其确切的参数和返回结构。

## 16 示例

### 16.1 Express 服务端

```ts
import express from "express";
import { createRepository, createExpressRouter, s } from "@yuhere/js-jsonrpc2";

const repository = createRepository();

repository.register(
  {
    namespace: "ping",
    document: "Return a pong message.",
    signature: [s.string(), s.string().describe("message")],
  },
  (message: string) => `pong: ${message}`,
);

const app = express();
app.use("/rpc", createExpressRouter(repository));
app.listen(3000);
```

### 16.2 自定义应用错误

```ts
import { RPCError } from "@yuhere/js-jsonrpc2";

throw new RPCError(10001, "The requested operation is not allowed");
```

预期仓库/传输处理流程会将该异常映射为 JSON-RPC 错误响应。

### 16.3 将 WebSocket 挂载到现有服务器

```ts
import { createServer } from "node:http";
import express from "express";
import {
  createRepository,
  createExpressRouter,
  attachWebSocket,
} from "@yuhere/js-jsonrpc2";

const repository = createRepository();
const app = express();
app.use("/rpc", createExpressRouter(repository));

const server = createServer(app);
attachWebSocket(server, repository, { path: "/ws" });
server.listen(3000);
```

### 16.4 stdio 服务

```ts
import { createRepository, s, serveStdio } from "@yuhere/js-jsonrpc2";

const repository = createRepository();
repository.register(
  { namespace: "echo", signature: [s.unknown(), s.unknown()] },
  (value: unknown) => value,
);

await serveStdio({ repository, framing: "lines" });
```

## 17 实现说明

1. 本规范描述该库的服务端 API 和传输行为，并非对 JSON-RPC 2.0 每一项要求的完整重述。
2. 不应仅凭 JSON-RPC 2.0 标准就推断库完整支持批量请求、通知或命名参数；请核对当前请求 Schema 和传输调用路径。
3. 不要将 TypeScript 处理函数的类型注解视为运行时校验。应使用 `s` Schema 约束远程输入和输出。
4. 不要将 `grantTo` 等同于身份认证。应用必须提供可信的授权标识和注入值。
5. 应使用实际客户端和传输方式测试传输相关的流帧格式及清理行为。
6. 为确保 API 兼容性，安装后应优先参考包生成的声明文件；本文根据所提供的源码快照编写。
