# Schema 与 JSON-RPC 签名系统设计总结


## 0. 背景

在 JSON-RPC 中，有 3 类 schema:

1. typescript: 代码中的各种 type/interface 定义，用于在开发时，校验（IDE）代码的正确性；
2. zod-schema: 用于JavaScript在运行时，校验函数参数的合法性；
3. json-schema: 用于当远程方法被调用时，校验客户端发来的 JSON 数据。
  + 校验 request
  + 校验/转换 params

这里实现的是 json-schema。它只用于纯 JSON 数据的校验。

## 1. 设计目标

实现一个轻量、可扩展的 Schema 系统，用于描述和验证在 JSON-RPC 调用过程中使用的 JSON 数据。

它将用于:

1. 协议层的 Request 数据的校验；

``` js
const RequestSchema = s.object({
  jsonrpc: s.literal('2.0'),
  method: s.string().min(1),
  params: s.array(z.unknown()).nullable(),
  id: s.union([s.string().min(1), z.number()]),
}).struct();
```

2. 远程方法注册时 signature 部分的定义和校验；

``` js
repository.register(
    { 
        namespace: 'ping', 
        document: 'sum of numbers',
        grantTo: ['grant'], 
        signature: [s.void(), s.stirng().describe("param1")]   <<<
    }: Descriptor, 
    (v: string) => v
);


repository.register(
    { 
        namespace: 'ping', 
        document: (descriptor) => {
        },
        grantTo: ['grant'], 
        signature: [s.void(), s.stirng().describe("param1")]   <<<
    }: Descriptor, 
    (v: string) => v
);
```


``` js

```


核心目标：

- 类型安全：Schema 能推导对应的 TypeScript 类型。
- 运行时验证：校验客户端参数、注入参数和方法返回值。
- 结构化描述：Schema 和 RPC 签名都能导出人类可读、机器可处理的说明。
- 易于扩展：允许通过继承创建自定义 Schema。
- 简洁 API：使用 `s.string()`、`s.object()` 等工厂方法构建 Schema。
- 控制逻辑与数据类型分离：RPC 的 `void` 和注入参数不属于普通 JSON Schema。

## 2. Schema 类型体系

| 类名 | 工厂方法 | 基类 | 用途 |
| --- | --- | --- | --- |
| `Schema<T>` | — | — | 所有 Schema 的抽象基类（仅 description） |
| `NullableSchema<T>` | — | `Schema<T \| null>` | 提供 `.nullable(bool)` 的抽象基类 |
| `StringSchema` | `s.string()` | `NullableSchema` | 字符串 |
| `NumberSchema` | `s.number()` | `NullableSchema` | 有限数字 |
| `BooleanSchema` | `s.boolean()` | `NullableSchema` | 布尔值 |
| `LiteralSchema` | `s.literal(v)` | `NullableSchema` | 字面量（string/number/boolean） |
| `ArraySchema` | `s.array(schema)` | `NullableSchema` | 数组 |
| `ObjectSchema` | `s.object(shape)` | `NullableSchema` | 对象 |
| `RecordSchema` | `s.record(schema)` | `NullableSchema` | 键值映射 |
| `UnionSchema` | `s.union(schemas)` | `NullableSchema` | 联合类型 |
| `TupleSchema` | `s.tuple(schemas)` | `NullableSchema` | 元组 |
| `EnumSchema` | `s.enum(values)` | `NullableSchema` | 字符串枚举 |
| `UnknownSchema` | `s.unknown()` | `Schema` | 任意合法 JSON 值（已含 null） |
| `NullSchema` | `s.null()` | `Schema` | 精确的 null |

RPC 专用控制标记：

- `VoidMarker`：表示 RPC 方法没有返回值。
- `InjectableMarker`：表示参数由服务端注入，而非客户端提供。
- `StreamMarker`：表示流式返回值。

设计原则：

- `kind` 永远表示值的真实形状（`"string"`、`"object"`…），nullability 只通过 `SchemaDescription.nullable` 表达。
- `UnknownSchema` / `NullSchema` 天然接受 null，不继承 `NullableSchema`，也不提供 `.nullable()`——对它们调用 `.nullable()` 是冗余的，从 API 上直接不暴露。
- `UnionSchema` 在构造时会把每个 member schema clone 并 `nullable(false)`：null 是否允许由 union 自己（`.nullable()`）决定，member 上的 nullable 没有意义。

## 3. JSON 数据规则

### `s.unknown()`

`UnknownSchema` 接受所有合法 JSON 值：

- `null`
- 字符串
- 有限数字
- 布尔值
- 数组
- 普通对象

拒绝 `undefined`、`NaN`、`Infinity`、函数及循环引用等非 JSON 数据。

它直接继承 `Schema<JSONValue>`，不提供 `.nullable()`，因为 `null` 本身已经在接受范围内。

### `s.literal(value)`

只接受 `string | number | boolean`。null 用 `s.null()` 或 `.nullable()` 表达：

```ts
s.literal('hello');   // 字面量 'hello'
s.literal(42);        // 字面量 42
s.literal(true);      // 字面量 true
s.literal(null);      // ❌ 运行时抛 TypeError
s.literal('hello').nullable(); // 'hello' | null
```

### `s.null()`

`NullSchema` 精确表示 `null`：

```ts
s.null();      // 仅接受 null
s.unknown();   // 接受任意 JSON，包括 null
```

### `.nullable()`

`nullable` 是 `NullableSchema` 基类上的一个不可变布尔标记，表达「该值是否允许为 null」。
默认 `false`；`.nullable()` / `.nullable(true)` 置为 `true`，`.nullable(false)` 撤销。

```ts
s.string();                              // string
s.string().nullable();                   // string | null
s.string().nullable(true);               // string | null
s.string().nullable().nullable(false);   // string
s.number().nullable();                   // number | null
s.literal('x').nullable();               // 'x' | null
s.enum(['a', 'b']).nullable();           // 'a' | 'b' | null
```

要点：

- `kind` 永远表示值的真实形状，不会被 nullability 污染。
- `SchemaDescription.nullable?: boolean` 是 nullability 的唯一真相来源。
- `UnknownSchema` 和 `NullSchema` 不继承 `NullableSchema`，因此没有 `.nullable()`；`s.unknown().nullable()` 是类型错误。

### `s.union([...])` 与 nullability

`union` 的成员会被 clone 并 `nullable(false)`：

```ts
s.union([s.string().nullable(), s.number()])
```

等价于

```ts
s.union([s.string(), s.number()])
```

要让整个 union 接受 null，用 `.nullable()`：

```ts
s.union([s.string(), s.number()]).nullable(); // string | number | null
```

### `.min()` 与 `.max()`

| 类型 | 约束对象 | 参数要求 |
| --- | --- | --- |
| 字符串 | 字符数 | 非负整数 |
| 数字 | 数值上下界 | 有限数字，可为负数 |
| 数组 | 元素数量 | 非负整数 |
| Record | 对象键数量 | 非负整数 |

同一约束重复设置时，以最后一次调用为准。例如：

```
s.string().min(1).min(3); // 最小长度为 3
```

### 对象属性的缺失与额外属性

`ObjectSchema` 用两个正交维度控制对象校验：

- `optionalProps: string[]`：允许缺失的已声明属性名白名单。**默认包含 `shape` 的全部 key**，即默认所有已声明属性都可缺失。未在列表中的已声明属性若在输入中缺失，将报错。
- `allowUnknownProps: boolean`：是否允许未声明属性。**默认 `true`**，额外属性允许存在并保留；置为 `false` 时拒绝额外属性。

对应方法：

```ts
s.object({ name: s.string() });
// 默认：name 可缺失；额外属性允许并保留

s.object({ name: s.string() }).optionalProperties([]);
// 所有已声明属性必填；额外属性仍允许

s.object({ name: s.string() }).optionalProperties(['name']);
// name 可缺失；额外属性仍允许

s.object({ name: s.string() }).allowUnknownProperties(false);
// name 可缺失；额外属性报错

s.object({ name: s.string() }).strict();
// 等价于 optionalProperties([]).allowUnknownProperties(false)
// 即所有已声明属性必填，且拒绝额外属性
```

`strict(value: boolean = true)` 是组合快捷方式：

- `strict()` / `strict(true)`：`optionalProperties([])` + `allowUnknownProperties(false)`。
- `strict(false)`：恢复默认宽松状态，即 `optionalProperties(Object.keys(shape))` + `allowUnknownProperties(true)`。

`optionalProperties(keys)` 会校验每个 key 都是 `shape` 已声明的属性，否则抛 `TypeError`。

注意：这里的语义是本项目的约定，不应直接等同于 Zod 的 `.strict()`。

## 4. 扩展机制

自定义 Schema 可以继承抽象基类或具体 Schema。

例如，继承字符串 Schema 创建邮箱类型：

```
class EmailSchema extends StringSchema {
  // 可增加邮箱专属验证和方法
}
```

这样可以复用字符串的 `.min()`、`.max()` 和基础验证能力。

需要注意，实际扩展时必须保证自定义验证逻辑与 Schema 描述、类型推导和约束状态保持一致；如果需要复制 Schema 或实现不可变链式 API，也应统一设计，避免扩展类丢失已有约束。

## 5. RPC 签名设计

RPC 签名采用元组结构：

```
[
  returnSchema,
  parameterSchema1,
  parameterSchema2,
]
```

规则如下：

1. 第一个元素始终是返回值 Schema 或 `s.void()`。
2. 后续元素表示方法参数。
3. 普通 Schema 参数由客户端传入。
4. `s.injectable(key)` 参数由服务端解析器提供。
5. `VoidMarker` 和 `InjectableMarker` 不是普通 JSON Schema，不能作为 JSON 数据 Schema 嵌套使用。

例如：

```
[
  s.string(),
  s.string(),
  s.injectable("requestId"),
  s.number(),
] as const
```

表示返回字符串、接收一个字符串客户端参数、注入一个 `requestId`，再接收一个数字客户端参数。

## 6. `JSONRPC2Repository` 的职责

`signature.ts` 中的仓库类负责 RPC 方法注册与执行。

| 方法                                   | 职责                           |
| ------------------------------------ | ---------------------------- |
| `provide(key, resolver)`             | 注册服务端注入值的解析器                 |
| `register(name, signature, handler)` | 注册 RPC 方法                    |
| `has(name)`                          | 判断方法是否注册                     |
| `getSignature(name)`                 | 获取原始签名                       |
| `describe(name)`                     | 获取单个方法的结构化描述                 |
| `describeAll()`                      | 获取全部方法描述                     |
| `execute(name, params, context)`     | 验证参数、解析注入值、执行 handler 并验证返回值 |

执行流程：

接收 RPC 调用

方法名、客户端参数、请求上下文

检查方法与客户端参数数量

验证客户端参数并解析注入参数

执行 handler

验证返回值并返回结果

## 7. 描述与文档生成

每个 Schema 提供 `toJSON()`，返回结构化描述。`SchemaDescription` 是按 `kind` 区分的联合类型，公共字段为：

- `kind`：类型标识。
- `description`：人类可读说明。
- `nullable`：是否接受 `null`。
- `constraints`：长度、范围、枚举值、字面量值、对象属性策略等约束。无约束时该字段缺省，不输出空对象。

子 Schema 的字段按具体 `kind` 各自命名，单子节点直接携带子描述、多子节点按集合表达：

| kind | 子描述字段 | 形态 |
| --- | --- | --- |
| `object` | `properties` | `Record<string, SchemaDescription>`，按 key 描述每个属性的 schema |
| `array` | `element` | `SchemaDescription`，数组元素类型 |
| `record` | `value` | `SchemaDescription`，值类型（多类型用 `s.record(s.union([...]))` 表达） |
| `union` | `options` | `SchemaDescription[]`，所有允许的成员 schema |
| `tuple` | `elements` | `SchemaDescription[]`，按固定位置描述 |

叶子类型（`string` / `number` / `boolean` / `literal` / `enum` / `unknown` / `null`）没有子描述字段。

例如：

```ts
s.array(s.string().min(2)).describe("names")
// { kind: "array", description: "names",
//   element: { kind: "string", constraints: { min: 2 } } }

s.object({ id: s.number() }).strict()
// { kind: "object",
//   constraints: { optionalProps: [], allowUnknownProps: false },
//   properties: { id: { kind: "number" } } }

s.record(s.union([s.string(), s.number()]))
// { kind: "record",
//   value: { kind: "union",
//     options: [{ kind: "string" }, { kind: "number" }] } }
```

`JSONRPC2Repository.describe()` 则进一步输出 RPC 方法的参数来源、注入键、参数 Schema 和返回值 Schema。

`formatSignature()` 可以将结构化描述转换为简洁文本，例如：

```
greet(name: string, requestId: <injectable>) => string
```

## 8. 文件划分

建议保持两个核心文件：

- `schema.ts`：Schema 类型体系、校验逻辑、结构化描述、工厂 `s`。
- `signature.ts`：RPC 签名类型、方法注册、依赖注入、执行流程和签名格式化。

测试可以单独放在对应的测试文件中，不必进一步拆分核心实现，除非后续复杂度明显增加。

## 9. 后续实现前需要验证的事项

当前代码是设计实现的初稿，正式使用前建议优先处理以下问题：

1. 统一错误路径：数组、对象、元组和 `NullableSchema` 应使用一致的路径组合规则，避免重复路径或丢失子路径。
2. 完善扩展类的约束继承：验证自定义 Schema 继承后，已有约束、描述及链式调用是否都能正确保留。
3. 明确注入值的验证策略：当前实现只验证客户端参数和返回值，注入值尚未经过独立的 Schema 验证。若注入值需要强类型保证，应为注入标记增加可选的值 Schema，或者提供类型安全的解析器注册机制。
4. 明确 `void` 的返回值规则：当前实现忽略 handler 的实际返回值并返回 `undefined`。如果希望检测错误地返回了非 `undefined` 的值，需要额外增加运行时检查。
5. 验证 TypeScript 编译结果：重点检查元组推导、对象配置方法的类型、扩展类以及 `InjectableTypes` 的类型合并行为。
6. 增加回归测试：覆盖正常输入、边界值、非法 JSON 值、嵌套错误路径、注入顺序、重复注册、缺失解析器和返回值验证失败。

总体上，核心设计已经明确：Schema 负责 JSON 数据的定义与验证，RPC 签名负责方法参数和返回值的组织，注入标记负责连接服务端上下文。 三者职责分离，后续扩展会比较直接。