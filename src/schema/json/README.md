# Schema 与 JSON-RPC 签名系统设计总结

## 0. 背景

在 JSON-RPC 中，常见有三类 schema 概念：

1. **TypeScript**：源码里的 `type` / `interface`，供 IDE 与编译期检查。
2. **运行时校验库**（如 Zod）：在进程内校验函数参数。
3. **JSON 数据 schema**：校验客户端发来的纯 JSON（请求体、`params` 等）。

本目录实现的是第 3 类：只面向 **JSON 可表示** 的数据。它同时承担两件事：

1. **描述**：为 RPC 签名、`system.methodSignature`、WebUI、文档生成提供结构化说明（`toJSON()` / `SchemaDescription`）。
2. **验证**：在 `convertParams` 等路径上对客户端参数做运行时校验（`parse` / `safeParse`）。

两件事可以拆开配置：默认两者都开；可用 `.validate(false)` 关掉校验，只保留描述（见 §3.5）。

## 1. 设计目标

实现一个轻量、可扩展的 Schema 系统，用于描述并（可选地）验证 JSON-RPC 调用中的 JSON 数据。

典型用途：

1. 协议层 Request 形状（示例，具体实现以代码为准）：

```ts
const RequestSchema = s.object({
  jsonrpc: s.literal('2.0'),
  method: s.string().min(1),
  params: s.array(s.unknown()).nullable(),
  id: s.union([s.string().min(1), s.number()]),
});
```

2. 方法注册时的 `signature`：

```ts
repository.register(
  {
    namespace: 'ping',
    document: 'echo a string',
    signature: [s.string(), s.string().describe('message')],
  },
  (msg: string) => msg,
);
```

核心目标：

- **类型安全**：Schema 能推导对应的 TypeScript 类型。
- **运行时验证**：默认校验客户端参数；可用开关关闭。
- **结构化描述**：导出人类可读、机器可处理的 `SchemaDescription`。
- **简洁 API**：`s.string()`、`s.object()` 等工厂 + 不可变链式修饰。
- **控制与数据分离**：`s.void()`、`s.injectable()`、`s.stream()` 是 RPC 标记，不是普通 JSON 值 schema。

## 2. Schema 类型体系

| 类名 | 工厂方法 | 基类 | 用途 |
| --- | --- | --- | --- |
| `Schema<T>` | — | — | 抽象基类（`description`、校验开关、`parse` / `toJSON`） |
| `NullableSchema<T>` | — | `Schema<T \| null>` | 提供 `.nullable(bool)` |
| `StringSchema` | `s.string()` | `NullableSchema` | 字符串 |
| `NumberSchema` | `s.number()` | `NullableSchema` | 有限数字 |
| `BooleanSchema` | `s.boolean()` | `NullableSchema` | 布尔值 |
| `LiteralSchema` | `s.literal(v)` | `NullableSchema` | 字面量（`string` / `number` / `boolean`） |
| `ArraySchema` | `s.array(schema)` | `NullableSchema` | 数组 |
| `ObjectSchema` | `s.object(shape)` | `NullableSchema` | 对象 |
| `RecordSchema` | `s.record(schema)` | `NullableSchema` | 键值映射 |
| `UnionSchema` | `s.union(schemas)` | `NullableSchema` | 联合类型 |
| `TupleSchema` | `s.tuple(schemas)` | `NullableSchema` | 元组 |
| `EnumSchema` | `s.enum(values)` | `NullableSchema` | 字符串枚举 |
| `UnknownSchema` | `s.unknown()` | `Schema` | 任意合法 JSON（已含 `null`） |
| `NullSchema` | `s.null()` | `Schema` | 精确的 `null` |

RPC 专用控制标记（见 `marker.ts`）：

- `VoidMarker`（`s.void()`）：无返回值。
- `InjectableMarker`（`s.injectable(key)`）：服务端注入，不由客户端提供。
- `StreamMarker`（`s.stream(inner)`）：流式返回；仅合法于 `signature[0]`。

设计原则：

- `kind` 表示值的真实形状（`"string"`、`"object"`…）；是否可空只通过 `SchemaDescription.nullable`（及运行时的 nullable 标志）表达。
- `UnknownSchema` / `NullSchema` 不继承 `NullableSchema`，不暴露 `.nullable()`。
- `UnionSchema` 构造时会把每个 member clone 并 `nullable(false)`：`null` 是否允许只由 union 自身的 `.nullable()` 决定。

## 3. JSON 数据规则与链式修饰

### 3.1 `s.unknown()` / `s.null()` / `s.literal()`

- `s.unknown()`：任意合法 JSON（含 `null`）；拒绝 `undefined`、`NaN`、`Infinity`、函数、循环引用等。
- `s.null()`：仅接受 `null`。
- `s.literal(v)`：`v` 只能是 `string | number | boolean`；`s.literal(null)` 抛 `TypeError`。需要「字面量或 null」时用 `.nullable()`；需要「精确 null」时用 `s.null()`。

### 3.2 `.nullable()`

不可变布尔标记，默认 `false`：

```ts
s.string();                            // string
s.string().nullable();                 // string | null
s.string().nullable().nullable(false); // string
```

### 3.3 边界与描述

- `.min(n)` / `.max(n)`：string 长度、number 数值、array / record 元素个数。
- `.describe(text)`：人类可读说明，进入 `toJSON().description`。

### 3.4 对象：`optionalProperties` / `allowUnknownProperties` / `strict`

默认对象配置是**严谨**的：

- `optionalProps` 默认 = `[]`（不可缺失任何属性）。
- `allowUnknownProps` 默认 = `false`（不允许未声明属性保留）。

```ts
s.object({ name: s.string() });
// name 必填；额外属性报错（默认即 strict）

s.object({ name: s.string() }).optionalProperties(['name']);
// name 可缺失；额外属性仍报错

s.object({ name: s.string() }).allowUnknownProperties(true);
// name 必填；额外属性允许并保留

s.object({ name: s.string() }).strict();
// ≡ optionalProperties([]).allowUnknownProperties(false)，即默认配置

s.object({ name: s.string() }).strict(false);
// 完全宽松：所有已声明属性可缺失 + 未知属性保留
```

`optionalProperties(keys)` 中的 key 必须落在 `shape` 上，否则抛 `TypeError`。未知属性判定使用 `Object.prototype.hasOwnProperty.call(shape, key)`，避免原型链键（如 `"toString"`）被当成已声明属性。

说明：语义是本项目约定，不要直接等同于 Zod 的 `.strict()`。

### 3.5 `.validate(enabled = true)` — 描述与校验解耦

Schema 默认 **开启** 运行时校验。链式：

```ts
s.string().min(1).validate(false);  // 只描述，不校验
s.number().validate(false).validate(true); // 可撤销，与 nullable 一致
```

行为约定：

| `validate` | `parse` / `safeParse` | `toJSON` |
| --- | --- | --- |
| `true`（默认） | 正常走 `_parse` | 不输出 `validate` 字段（保持描述干净） |
| `false` | **不**做类型/约束检查，将输入原样作为成功结果返回（`safeParse` 恒 `success: true`） | 写出 `validate: false` |

用途示例：

- 签名仍要在 WebUI / `system.methodSignature` 上展示类型，但服务端信任网关或上游已校验，不想再付一遍校验成本。
- 渐进迁移：先挂描述，后打开校验。

注意：

- 关闭校验 **不会** 改变 TypeScript 推导类型，也不会做强制转换；非法 JSON 形状仍可能在业务代码里炸。
- `convertParams` 走 `safeParse`：参数 schema 为 `.validate(false)` 时，不再因该槽位类型错误抛 `INVALID_PARAMS`。
- 与 `.nullable()` 一样，调用返回新实例（不可变）。

## 4. 扩展机制

可继承抽象基类或具体 Schema（例如 `class EmailSchema extends StringSchema`），复用 `.min()` / `.max()` 等。扩展时需保证：

- 自定义校验与 `_describe` / `toJSON` 一致；
- 链式修饰（含 `validate` / `nullable`）通过 clone 保留已有状态。

## 5. RPC 签名设计

签名为元组：

```ts
[returnSchema, ...parameterSchemas]
```

规则：

1. `signature[0]`：返回类型 — `s.Schema`、`s.void()` 或 `s.stream(inner)`。禁止 injectable。
2. 后续槽位：客户端 `s.Schema` 或 `s.injectable(key)`。
3. `VoidMarker` / `InjectableMarker` / `StreamMarker` 不能嵌进普通 JSON schema 树。
4. `s.stream(inner)` 仅允许出现在返回位；`inner` 只用于文档与 UI，**不**对每个 chunk 做运行时校验。

示例：

```ts
[
  s.string(),
  s.string(),
  s.injectable('requestId'),
  s.number(),
]
```

表示：返回 string；客户端一个 string；注入 `requestId`；再一个 number 客户端参数。

## 6. 与 Repository / convert 的关系

实际运行路径（当前代码）：

- `buildDescriptor`：解析 signature，区分 indexed 客户端参数与 injectables。
- `convertParams`：对每个 indexed 槽位调用 `schema.safeParse`；失败则 `INVALID_PARAMS`。
- 注入值 **不** 经 schema 校验（由 `mkInjectable` 保证）。
- 返回值：普通结果不强制再 parse；stream 要求 handler 为 `AsyncGenerator`，chunk 不按 `inner` 校验。

因此：在参数 schema 上设 `.validate(false)` 即可跳过该槽位的运行时校验，同时保留描述输出。

## 7. 描述与文档生成

每个 Schema 提供 `toJSON()` → `SchemaDescription`（按 `kind` 区分的联合类型）。

公共字段：

- `kind`
- `description?`（未设置或为空字符串时 **省略**）
- `nullable?`
- `constraints?`（无约束时 **省略**，不输出 `{}`）
- `validate?: false`（仅在关闭校验时出现）

| kind | 子描述字段 | 形态 |
| --- | --- | --- |
| `object` | `properties` | `Record<string, SchemaDescription>` |
| `array` | `element` | 单个 `SchemaDescription` |
| `record` | `value` | 单个 `SchemaDescription` |
| `union` | `options` | `SchemaDescription[]` |
| `tuple` | `elements` | `SchemaDescription[]` |

叶子（`string` / `number` / `boolean` / `literal` / `enum` / `unknown` / `null`）无子字段。

对象约束在描述中的键名与内部字段对齐：

```ts
constraints: {
  optionalProps: string[];
  allowUnknownProps: boolean;
}
```

示例：

```ts
s.array(s.string().min(2)).describe('names')
// { kind: "array", description: "names",
//   element: { kind: "string", constraints: { min: 2 } } }

s.object({ id: s.number(), tags: s.array(s.string()) }).strict()
// { kind: "object",
//   constraints: { optionalProps: [], allowUnknownProps: false },
//   properties: {
//     id: { kind: "number" },
//     tags: { kind: "array", element: { kind: "string" } } } }

s.record(s.union([s.string(), s.number()]))
// { kind: "record",
//   value: { kind: "union",
//     options: [{ kind: "string" }, { kind: "number" }] } }

s.string().min(1).validate(false)
// { kind: "string", constraints: { min: 1 }, validate: false }
```

**Stream**：`signatureOf` / `system.methodSignature` 对返回位上的 stream 标记输出：

```ts
{ kind: 'stream', inner: <SchemaDescription> }
```

## 8. 文件划分

| 路径 | 职责 |
| --- | --- |
| `primitives.ts` | Schema 类型体系、校验、`toJSON`、工厂 `s` |
| `marker.ts` | `void` / `injectable` / `stream` 标记 |
| `index.ts` | 对外导出 |

RPC 注册、注入、`convertParams`、`system.*` 在 `src/core/`，不在本目录。

## 9. 实现与测试注意点

1. **错误 path**：数组 / 元组嵌套失败时应保留子 path（如 `['0', 'id']`），与 `ArraySchema` / `TupleSchema` 一致。
2. **不可变链式**：`.nullable` / `.validate` / 对象配置方法均返回新实例，不修改原对象。
3. **注入值**：默认不校验；若将来要强类型，需另设机制，不要 silently 复用客户端参数 schema。
4. **`void` 返回**：当前不强制 handler 必须返回 `undefined`。
5. **回归用例建议**：`.validate(false)` 的 `parse` / `safeParse` / `convertParams`；`toJSON` 仅在 false 时带字段；`strict` / `optionalProperties` / 原型链 key；空 `constraints` 省略。

---

**一句话**：Schema 同时服务「签名描述」与「参数校验」；描述结构用语义字段（`element` / `value` / `properties` / …）表达；校验可用 `.validate(false)` 关闭而不丢掉类型文档。
