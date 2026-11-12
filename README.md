# @yuhere/js-jsonrpc2

A TypeScript JSON-RPC 2.0 server library with schema validation, authorization, dependency injection, and multiple transports.

Agent-oriented constraints and common mistakes are in [SKILL.md](./SKILL.md). A short index is in [llms.txt](./llms.txt).

## Features

### Deviations from the JSON-RPC 2.0 spec

- **No named parameters.** `params` must be a positional array (or `null`).
- **No notifications.** Every request must carry an `id`.
- **No batch requests.** A batch payload is rejected with `INVALID_REQUEST`.
- **`params` is required.** Omitting `params` is an `INVALID_REQUEST`. Pass `[]` or `null` when there are none.
- **No null `id`.** `id` must be a string or a number; `null` is an `INVALID_REQUEST`.
- **No extra fields.** Unknown members on the request object are rejected with `INVALID_REQUEST`.

### Extensions

- **Permission checks.** Declare `grantTo` on a method and provide a `perm_check`
  injectable; calls without permission fail with `PERMISSION_DENIED (-32604)`.
- **`system.*` methods.** `system.listMethods`, `system.methodSignature`,
  `system.methodHelp` are registered automatically.
- **Global error transform.** Map arbitrary thrown errors to `RPCError` via the
  `errorTransform` option.
- **Streaming JSON serializer.** Responses are serialized with a streaming
  stringifier that supports `Promise`, `Generator` / `AsyncGenerator`, and
  `Buffer` (internal; not exported from the package root).

## Install

```shell
npm install @yuhere/js-jsonrpc2
```

`express` is a peer dependency (v4 or v5). Node.js 18+ is required.

## Quick start

```ts
import express from 'express';
import { createRepository, createExpressRouter, s } from '@yuhere/js-jsonrpc2';

const repository = createRepository({ withSystemMethods: true });

repository.register(
  {
    namespace: 'add',
    document: 'addition of 2 numbers',
    signature: [
      s.number().describe('两数之和'),
      s.number().describe('被加数 a'),
      s.number().describe('加数 b'),
    ],
  },
  (a: number, b: number) => a + b,
);

const app = express();
app.use('/', createExpressRouter(repository, {}));
app.listen(5000);
```

Calling it:

```shell
curl -s http://localhost:5000/ -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"add","params":[1,2],"id":1}'
# => {"jsonrpc":"2.0","id":1,"result":3}
```

## Registering methods

`Repository.register(descriptor, handler)` takes a descriptor and a handler.
The descriptor has three fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `namespace` | `string` | Method name (non-empty). |
| `document` | `string \| (d) => string \| Promise<string>` | Optional help text for `system.methodHelp`. |
| `grantTo` | `string[]` | Optional list of permissions required to call the method. |
| `signature` | `[returnSchema, ...parameterSchema[]]` | Return type first, then parameters. |

`signature[0]` is the return schema (`s.Schema`, `s.void()`, or `s.stream(inner)`).
Every later slot is either a `s.Schema` (client-supplied) or
`s.injectable(key)` (server-injected). Injectable slots may appear at any
position except index `0`.

```ts
import { s } from '@yuhere/js-jsonrpc2';

repository.register(
  {
    namespace: 'whoami',
    document: 'returns the caller user agent',
    signature: [
      s.object({
        userAgent: s.string().nullable().describe('请求头 user-agent，缺失时为 null'),
      }).describe('调用者信息'),
      s.injectable('request'),
    ],
  },
  (req: { headers: Record<string, string> }) => ({
    userAgent: req.headers['user-agent'] ?? null,
  }),
);
```

## Schemas

Schemas serve two roles:

1. **Description** — document the RPC signature (`toJSON` / `system.methodSignature` / WebUI).
2. **Validation** — check client parameters at invoke time (`parse` / `safeParse`, used by `convertParams`).

They are built with the `s` factory. They validate at runtime (unless turned off) and derive TypeScript types.

```ts
s.string().describe('任意字符串')
s.string().min(1).max(64).describe('1~64 字符的短文本')
s.number().describe('有限数字')
s.boolean().describe('布尔开关')
s.literal('2.0').describe('固定字面量 "2.0"')
s.null().describe('精确的 null')
s.array(s.string()).describe('字符串数组')
s.object({ id: s.number().describe('主键') }).describe('用户对象') // all declared props required; extras rejected
s.object({ id: s.number().describe('主键') }).optionalProperties(['id']).describe('可省略 id 的对象')
s.record(s.number()).describe('字符串键到数字的映射')
s.union([s.string(), s.number()]).describe('字符串或数字')
s.tuple([s.string(), s.number()]).describe('[名称, 数量]')
s.enum(['pending', 'success', 'failed']).describe('任务状态')
s.unknown().describe('任意 JSON value（already includes null）')
s.void()                                   // RPC-only: no return value
s.stream(s.string().describe('日志行')).describe('日志行流') // RPC-only: streaming return
s.injectable('request')                    // RPC-only: server-injected; no describe needed
```

> The `describe` calls above are illustrative; in real code put the *meaning*
> of each parameter, not a restatement of the type.

### Describing parameters with `.describe()`

`.describe(text)` attaches a human-readable meaning to a schema. It is not
cosmetic — the text is surfaced to every consumer of the signature:

- `system.methodSignature` / `signatureOf` → `description` on the slot
- the bundled WebUI → parameter labels
- `llm.tools` → each parameter's JSON Schema `description`, which is what an
  LLM sees when deciding how to fill the argument

Prefer describing **meaning**, not type. `s.number().describe('年龄')` tells a
caller more than `s.number().describe('number')`.

```ts
signature: [
  s.number().describe('两数之和'),
  s.number().min(0).describe('年龄（非负）'),
  s.string().describe('昵称'),
]
```

This applies to s.unknown() as well. The type carries no information there,
so the description is the only semantic hint:

```ts
s.unknown().describe('webhook 负载，形状由第三方决定')
```

For nested objects, describe the object and its fields:

```ts
s.object({
  id: s.number().describe('用户 ID'),
  profile: s.object({
    name: s.string().describe('姓名'),
    tags: s.array(s.string()).describe('标签'),
  }).describe('用户资料'),
}).describe('用户')
```

Slots that do not need a description: `s.injectable(...)` is server-filled and
never shown to clients, and a slot whose meaning is already unambiguous from
`document` plus parameter order may omit it. Everything else — including
`s.unknown()` — should be described.

### Chainable modifiers

| Modifier | Applies to | Meaning |
| --- | --- | --- |
| `.describe(text)` | all schemas | Human-readable description. Shown in `system.methodSignature`, the WebUI, and as the parameter `description` in `llm.tools`. Describe the *meaning*. |
| `.min(n)` / `.max(n)` | string (length), number (bounds), array / record (size) | Inclusive bounds. |
| `.nullable()` / `.nullable(true)` | most schemas | Allow `null`. Immutable; returns a new schema. |
| `.nullable(false)` | same | Clear a previous nullable flag. |
| `.validate(false)` / `.validate(true)` | all schemas | Toggle runtime validation. Default is **on**. When off, `parse` / `safeParse` accept any value and return it unchanged; the schema still describes the type for signatures and the WebUI. |
| `.optionalProperties(keys)` | object | Whitelist of declared keys that may be missing. |
| `.allowUnknownProperties(bool)` | object | Whether undeclared keys are kept (`true`) or rejected (`false`). |
| `.strict()` / `.strict(true)` | object | Explicitly require every declared key and reject extras (this is the default). |
| `.strict(false)` | object | Fully permissive: every declared key may be missing and extra keys are kept. |

Validation: `.parse(input)` (throws `SchemaValidationError` when validation is on)
and `.safeParse(input)` (returns a result object).
Introspection: `.toJSON()` returns a `SchemaDescription`.

### Disabling validation

Schemas always participate in **signature description**. Runtime **parameter
checks** can be turned off per schema when the server trusts the caller or the
shape is only documentary:

```ts
// Still appears as string in system.methodSignature / WebUI,
// but convertParams will not reject non-strings.
s.string().describe('任意输入，不校验').validate(false)

// Nested: only the inner schema skips checks
s.object({
  id: s.number().describe('记录 ID'),
  payload: s.unknown().describe('任意负载').validate(false),
}).describe('含未校验负载的记录')
```

- Default is `validate: true` (omitted from `toJSON()` to keep descriptions small).
- `.validate(false)` writes `validate: false` into the description.
- `.validate(true)` restores the default; the flag is not emitted.
- Calls are immutable (same pattern as `.nullable()`).

Return-type slots are not run through `convertParams`; turning validation off on
a return schema only affects direct `.parse` / `.safeParse` use and the
description flag.

### Object defaults and strictness

By default an object schema is **strict**:

- every declared property is required;
- undeclared properties are rejected.

```ts
const closed = s.object({
  name: s.string().describe('姓名'),
  age: s.number().describe('年龄'),
}).describe('用户');

closed.parse({ name: 'Ada', age: 30 });             // ok
closed.parse({});                                   // error: missing name, age
closed.parse({ name: 'Ada', age: 30, extra: 1 });   // error: unknown property
// missing declared key → error; extra keys → error
```

Loosen each aspect independently:

```ts
// only `age` may be missing; extras are still rejected
s.object({
  name: s.string().describe('姓名'),
  age: s.number().describe('年龄'),
}).optionalProperties(['age']).describe('用户（age 可选）');

// every declared key is still required, but unknown keys are kept
s.object({ name: s.string().describe('姓名') })
  .allowUnknownProperties(true)
  .describe('用户（保留额外字段）');

// fully permissive: all declared keys optional + unknown keys kept
s.object({ name: s.string().describe('姓名') })
  .strict(false)
  .describe('用户（全宽松）');
```

`optionalProperties` rejects key names that are not in the shape (throws
`TypeError`). `.strict()` is equivalent to the default and mainly documents
intent; `.strict(false)` is the shortcut for a fully permissive object.

### Nullability notes

- `.nullable()` / `.nullable(true)` allow `null`; `.nullable(false)` clears it. All calls are immutable.
- `s.unknown()` and `s.null()` do not expose `.nullable()`; they already accept / are `null`.
- `s.literal(v)` accepts `string | number | boolean`. Use `s.null()` for exact null, or `.nullable()` for "literal or null".
- `s.union([...])` strips member-level nullability; only the union's own `.nullable()` decides whether `null` is accepted.

### `toJSON()` / `SchemaDescription`

Descriptions are a discriminated union on `kind`. There is **no** generic
`children` bag for ordinary schemas:

| kind | Child field(s) |
| --- | --- |
| `array` | `element` (single schema) |
| `record` | `value` (single schema) |
| `object` | `properties` (map) |
| `union` | `options` (array) |
| `tuple` | `elements` (array) |

Object constraints are reported as:

```ts
constraints: {
  optionalProps: string[];      // keys allowed to be missing
  allowUnknownProps: boolean;   // whether extra keys are kept
}
```

Empty constraint objects are omitted (no `constraints: {}`). Descriptions are
omitted when unset or empty (no `description: ""`).

When validation is disabled, the description includes `validate: false`.
The default enabled state is not serialized.

Stream returns from `system.methodSignature` / `signatureOf` use a marker
shape with the inner schema at the top level:

```ts
{ kind: 'stream', inner: <SchemaDescription> }
```

## Transports

### Express

```ts
import { createExpressRouter } from '@yuhere/js-jsonrpc2';

app.use('/', createExpressRouter(repository, {
  bodyLimit: '1mb',
  useHtdoc: true,
  mkInjectable: ({ request, response }, repository) => ({
    request,
    response,
    repository,
  }),
  errorTransform: (error) => /* return RPCError | undefined */ undefined,
}));
```

The router handles `POST /` only. A POST whose `Content-Type` is not
`application/json` gets HTTP 415 and a JSON-RPC `Invalid Request`
(`-32600`, `id` null). Malformed JSON still returns `-32700`. `useHtdoc`
serves the bundled web UI (static assets under `htdoc/`) for other methods
such as GET.

### WebSocket

Attach to an existing HTTP server:

```ts
import { createServer } from 'node:http';
import { attachWebSocket } from '@yuhere/js-jsonrpc2';

const server = createServer(app);
attachWebSocket(server, repository, {
  path: '/',
  mkInjectable: ({ socket, request }, repository) => ({
    socket,
    request,
    repository,
  }),
});
server.listen(5000);
```

Or create a standalone server:

```ts
import { createWebSocketServer } from '@yuhere/js-jsonrpc2';

const { server, wss, close } = await createWebSocketServer({
  port: 8080,
  host: '127.0.0.1',
});
```

### stdio (NDJSON)

```ts
import { serveStdio } from '@yuhere/js-jsonrpc2';

await serveStdio({ repository, framing: 'lines' });
```

`framing: 'lines'` reads one JSON value per line; `framing: 'json'` accepts
concatenated JSON values.

## Streaming returns

Only the return slot can stream. Declare `s.stream(inner)` at `signature[0]`
and return an async generator. A plain return value is sent as a normal
`result`. Chunks are not validated against `inner`.

```ts
repository.register(
  {
    namespace: 'logs.tail',
    document: 'stream log lines',
    signature: [
      s.stream(s.string().describe('一行日志')).describe('日志行流'),
      s.string().describe('日志文件路径'),
    ],
  },
  async function* tail(path: string) {
    yield path;
  },
);
```

`Repository.invoke` then returns `RPCStreamSuccess`: `{ jsonrpc, id, chunks }`.
Each frame is `{ jsonrpc, id, done, index?, value?, error? }`.

## llm.tools

`llm.tools` lists OpenAI-style tools for methods the caller may invoke.
Parameters are positional and named `param0`, `param1`, … in signature order.
Injectable slots are skipped. Each parameter description starts with
`第 N 个位置参数`, then the slot's `.describe(text)` (when present). Pass
`{ format: 'anthropic' }` for `{ name, description, input_schema }`. The
default format is `openai`.

```ts
repository.register(
  {
    namespace: 'user.create',
    document: 'create a user',
    signature: [
      s.object({ id: s.number().describe('新用户 ID') }).describe('创建结果'),
      s.string().min(1).describe('昵称'),
      s.number().min(0).describe('年龄（非负）'),
    ],
  },
  (name: string, age: number) => ({ id: 1 }),
);

const listed = await repository.invoke(
  { jsonrpc: '2.0', method: 'llm.tools', params: [{ prefix: 'user.' }], id: 1 },
  { injections: { repository } },
);
// listed.result[0].function.parameters.properties.param0.description
//   => "第 1 个位置参数。昵称"
// listed.result[0].function.parameters.properties.param1.description
//   => "第 2 个位置参数。年龄（非负）"
```

Code can convert an OpenAI list with `toAnthropicTools(tools)`.

## Web client

Import `@yuhere/js-jsonrpc2/webclient`. `timeout` is a millisecond limit.
Omit it for no limit. Pass `httpCallOptions({ timeout, signal })` as the last
`call` argument. A plain object in that position is still a JSON-RPC parameter.
The timer and the signal both abort an HTTP call, including a streaming body.
WebSocket calls ignore that options object; do not append it on the `ws` transport.

```ts
import { createRPC, httpCallOptions } from '@yuhere/js-jsonrpc2/webclient';

const rpc = createRPC({ transport: 'http', endpoint: '/rpc', timeout: 10_000 });
await rpc.call('add', 1, 2, httpCallOptions({ timeout: 500, signal }));
```

## Invoking directly

`Repository.invoke(input, options?)` returns an `RPCResponse`
(`RPCSuccess | RPCStreamSuccess | RPCFailure`). Useful for tests or custom transports.

```ts
const response = await repository.invoke(
  { jsonrpc: '2.0', method: 'add', params: [1, 2], id: 1 },
  { injections: { request: fakeReq } },
);
```

## Injectables

`mkInjectable` has this signature:

```ts
(context, repository) => injections
```

`repository` is the server `Repository`. `context` depends on the transport:

| Transport | `context` | Defaults when `mkInjectable` is omitted |
| --- | --- | --- |
| Express | `{ request, session, response }` | `request`, `session`, `response`, `repository` |
| WebSocket | `{ socket, request }` | `socket`, `request`, `repository` |
| stdio | `{ input, output }` | `repository`, `input`, `output` |

The transport calls the factory, then sets `repository` on the returned map
and adds `injections` pointing at that map. A factory replaces the other
default keys, so return any of them that handlers still need. Values may be
plain values or zero-argument functions; those functions are awaited before
injection. The map is available to any signature slot declared as
`s.injectable(key)`.

## Permission checks

When a descriptor declares `grantTo`, the injected
`perm_check(grantTo, descriptor, injections)` is called:

- returns `true` → allowed
- returns an `RPCError` → re-thrown as-is
- anything else → `PERMISSION_DENIED (-32604)`

`grantTo` is only enforced when a `perm_check` injectable is provided. Without
`perm_check`, methods that declare `grantTo` are callable by anyone.

`perm_check` is called with those three arguments. It is not evaluated with
zero arguments the way a signature `s.injectable()` value is.

```ts
app.use('/', createExpressRouter(repository, {
  mkInjectable: ({ request, session }) => ({
    request,
    perm_check: async (grantTo, descriptor, injections) => {
      const roles =
        (session as { user?: { roles?: string[] } } | undefined)?.user?.roles ??
        [];
      const allowed = roles.some((role) => grantTo.includes(role));
      console.log(descriptor.namespace, injections.request);
      return allowed;
    },
  }),
}));
```

## Error transform

`errorTransform(error)` may return an `RPCError` to override the default
`INTERNAL_ERROR` mapping. Return `undefined` to fall back to the default
behaviour. It is applied only to errors thrown by the method handler, not
by request validation.

```ts
createExpressRouter(repository, {
  errorTransform: (error) =>
    error instanceof MyDomainError
      ? new RPCError(-32000, 'Domain error', error.message)
      : undefined,
});
```

## Common mistakes

- `params` must be an array or `null`. A bare object is `INVALID_PARAMS`.
- Every request needs a string or number `id`. There is no notification or batch support.
- The descriptor fields are `signature` and `document`, not `sign` or `doc`.
- `s.injectable()` cannot be `signature[0]`.
- **Leaving client-facing schemas undescribed.** `describe` is what shows up in
  `system.methodSignature`, the WebUI, and `llm.tools`. A bare `s.number()` gives
  an LLM only the position (`第 N 个位置参数`) and no meaning. A bare
  `s.unknown()` gives it neither type nor meaning.
- `perm_check` is called as `(grantTo, descriptor, injections)`. A zero-argument function that returns the real checker is denied, not unwrapped.
- `errorTransform` does not see validation errors.
- `s.stream(inner)` streams only when the handler returns an async iterable. `inner` is not applied to each chunk.
- More traps, including stream frames and the web client, are in [SKILL.md](./SKILL.md).

## Built-in methods

| Method | Description |
| --- | --- |
| `system.listMethods` | Returns `string[]` of registered method names. |
| `system.methodSignature` | Returns the schema list for a method. |
| `system.methodHelp` | Returns the method's `document` (or `null`). |

Disable them with `createRepository({ withSystemMethods: false })`.

## Error codes

| Code | Meaning |
| --- | --- |
| -32700 | Parse error |
| -32600 | Invalid Request |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |
| -32604 | Permission denied |
| -32000..-32099 | Implementation-defined server errors |

`codes` is exported from the package root:

```ts
import { codes } from '@yuhere/js-jsonrpc2';
codes.INVALID_PARAMS; // -32602
```

## Demo server

The `js-jsonrpc2` command serves the demo methods and the WebUI. It listens on
`127.0.0.1` port `5000`. Pass `--host <address>` or set `HOST` to bind a
different address, and set `PORT` to change the port.

## License

MIT
