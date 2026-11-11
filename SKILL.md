---
name: js-jsonrpc2
description: Use when building or modifying a JSON-RPC 2.0 server with @yuhere/js-jsonrpc2 — registering methods with schema signatures, wiring the Express/WebSocket/stdio transport, streaming returns, or debugging params, permissions, and error mapping.
---

# @yuhere/js-jsonrpc2

JSON-RPC 2.0 server middleware. Package name `@yuhere/js-jsonrpc2`. Node 18+.

Hard constraints (by design, do not work around):

- No named params. `params` MUST be a positional array or `null`.
- No notifications. Every request MUST carry an `id`.
- No batch. A batch payload returns `-32600 Invalid Request`.
- No request-side streaming. Only method **return values** can be streamed.

## Register a method

1. Create the repository: `createRepository({ withSystemMethods: true })`.
   Omit the option to get the same default. Pass `false` only to drop `system.*`.
2. Call `repository.register(descriptor, handler)`.
3. Set `descriptor.namespace` to a non-empty string.
4. Set `descriptor.signature` to `[returnSchema, ...parameterSchema[]]`.
   - `signature[0]` MUST be `s.Schema`, `s.void()`, or `s.stream(inner)`.
     Never an injectable.
   - Each later slot MUST be `s.Schema` (client param) or `s.injectable(key)`.
5. Write `handler` so its positional args match the non-injectable slots in order;
   injectable slots are filled at their declared positions.
6. Use `s.*` factories for schemas: `s.string()`, `s.number()`, `s.boolean()`,
   `s.literal(v)` (`v` is `string | number | boolean` only), `s.null()`,
   `s.array(item)`, `s.object(shape)`, `s.record(v)`, `s.union([...])`,
   `s.tuple([...])`, `s.enum([...])`, `s.unknown()`.
7. Chain modifiers before registering:
   - Bounds / docs: `.min()`, `.max()`, `.describe(text)`.
   - Nullability: `.nullable()` / `.nullable(true)` / `.nullable(false)` (immutable).
   - Validation gate: `.validate(true|false)` (immutable; default **on**).
     - Schemas serve two roles: **describe** the RPC signature and **validate**
       client params at runtime.
     - `.validate(false)` keeps the schema in `signature` / `system.methodSignature`
       / WebUI / docs, but `parse` / `safeParse` become no-ops (return the input
       unchanged). `convertParams` therefore will not reject bad values for that
       slot.
     - Prefer this only when a param is intentionally untrusted-schema or
       validated elsewhere; do not use it as a substitute for `s.unknown()`.
   - Object shape control:
     - Default object is **strict**: every declared key is required;
       undeclared keys are rejected.
     - `.optionalProperties(keys)` — whitelist of declared keys that may be
       missing (unknown names throw `TypeError`).
     - `.allowUnknownProperties(bool)` — keep (`true`) or reject (`false`, the
       default) extras.
     - `.strict()` / `.strict(true)` — the default: no missing declared keys +
       reject extras.
     - `.strict(false)` — fully permissive: all declared keys optional + extra
       keys kept.
8. Nullability rules:
   - `.nullable()` / `.nullable(true)` allow `null`; `.nullable(false)` clears it. Calls are immutable.
   - `s.unknown()` and `s.null()` already handle `null`; they do not expose `.nullable()`.
   - `s.literal(v)` rejects `null`; use `s.null()` for exact null, `.nullable()` for "literal or null".
   - `s.union([...])` strips member-level nullability at construction; use `s.union([...]).nullable()` to accept `null`.

```ts
import { createRepository, s } from '@yuhere/js-jsonrpc2';

const repository = createRepository();
repository.register(
  { namespace: 'add', document: 'a + b', signature: [s.number(), s.number(), s.number()] },
  (a: number, b: number) => a + b,
);

// Describe shape for clients / WebUI, but skip runtime checks on this param:
repository.register(
  {
    namespace: 'legacy.passthrough',
    signature: [
      s.unknown(),
      s.object({ id: s.number(), tags: s.array(s.string()) }).validate(false),
    ],
  },
  (payload) => payload,
);
```

### Schema descriptions (`toJSON` / `system.methodSignature`)

Ordinary schemas use a discriminated union on `kind`. There is **no** generic
`children` bag:

| kind | Child field(s) |
| --- | --- |
| `array` | `element` |
| `record` | `value` |
| `object` | `properties` |
| `union` | `options` |
| `tuple` | `elements` |

Object constraints in the description:

```ts
constraints: {
  optionalProps: string[];
  allowUnknownProps: boolean;
}
```

Empty constraint objects are omitted (no `constraints: {}`). Empty
descriptions are omitted too (no `description: ""`).

When validation is turned off, the description includes an explicit flag
(default is on and omitted to keep noise low):

```ts
{ kind: 'object', validate: false, properties: { ... } }
```

Do **not** read legacy paths such as `children.items` or `children.values`.

Stream returns are the exception (marker path in `signatureOf`):

```ts
{ kind: 'stream', inner: <SchemaDescription> }
```

## Stream a return value

Declare `s.stream(inner)` as `signature[0]`. A call is streamed only when
that declaration is set and the handler actually returns an `AsyncIterable`.
Otherwise the plain value is returned in `result`.

1. Set `signature[0]` to `s.stream(inner)`. `inner` is any `s.Schema`
   (including `s.unknown()`). No stream-of-stream, and `s.stream()` is not
   valid in a parameter slot.
2. Make the handler an `async function*` that yields values matching `inner`.
3. Do NOT rely on `inner` for runtime chunk validation — chunks are **not**
   validated. `inner` is documentation only; the WebUI uses it to render types.
4. Expect frames of shape `RPCStreamChunk`, each a **complete** JSON-RPC-shaped
   object (not nested under `result`):
   `{ jsonrpc, id, done, index?, value?, error? }`.
   - Normal data frame: `{ done: false, index, value }`.
   - Normal end: `{ done: true, index }`.
   - Mid-stream throw: `{ done: true, index?, error: { code, message } }`.
   `id` is always the request id (never `null` for streams).
5. The server yields exactly one terminal frame (`done: true`) per stream,
   whether it finished normally or threw. A transport that receives the
   terminal frame ends the response cleanly; it does not treat a terminal
   `error` frame as a transport failure.
6. Put cleanup in a `finally` inside the generator; the server calls
   `source.return()` when the client disconnects, so `finally` runs.

```ts
repository.register(
  {
    namespace: 'logs.tail',
    document: 'stream log lines',
    signature: [s.stream(s.string()), s.string()],
  },
  async function* tail(path: string) {
    for await (const line of follow(path)) yield line;
  },
);
```

Reference implementations for every stream shape (finite, infinite, throwing,
empty, with injectables, `s.unknown()`) live in `dev/express.ts` under the
`stream.*` namespace.

## Wire a transport

Pick exactly one transport per server process.

- **Express**: call `app.use('/', createExpressRouter(repository, opts))`.
  The router only handles `POST /`. A non-JSON POST returns HTTP 415 and
  JSON-RPC `-32600`. Options: `mkInjectable`, `errorTransform`,
  `bodyLimit`, `useHtdoc`, `streamFormat`.
- **WebSocket on existing server**: call `attachWebSocket(server, repository, opts)`.
  Options: `path`, `mkInjectable`, `errorTransform`, `allowOrigin`, `maxPayload`,
  `onConnection`.
- **Standalone WebSocket**: `await createWebSocketServer({ port, host })`;
  it returns `{ server, wss, close() }`.
- **stdio**: `await serveStdio({ repository, framing: 'lines' })`.
  Use `framing: 'json'` for concatenated JSON values.

All transports support stream returns.

- Express emits one `RPCStreamChunk` per NDJSON line (`streamFormat: 'ndjson'`,
  the default). `streamFormat: 'sse'` is reserved for `text/event-stream`;
  currently the NDJSON path is the implemented one — do not depend on SSE
  unless the transport source shows it.
- WS and stdio emit one `RPCStreamChunk` per message/line.
- Non-stream responses are serialized with a streaming JSON writer. If
  serialization fails partway, the transport aborts the connection rather than
  sending a truncated body with `200 OK`; if it fails before writing any byte,
  the transport emits an `INTERNAL_ERROR` response instead.

Supply `mkInjectable` when the handler needs request/socket context. Call it
as `(context, repository) => injections`, not as `(req, res, repo)`.

| Transport | `context` | Defaults when omitted |
| --- | --- | --- |
| Express | `{ request, session, response }` | `request`, `session`, `response`, `repository` |
| WebSocket | `{ socket, request }` | `socket`, `request`, `repository` |
| stdio | `{ input, output }` | `repository`, `input`, `output` |

The transport then sets `repository` and adds `injections` (the map itself).
A factory replaces the other defaults, so return any default key the handler
still reads. Values may be plain values or zero-argument functions; functions
are awaited.

## Enforce permissions

1. Add `grantTo: ['role', ...]` to the descriptor.
2. Inject `perm_check(grantTo, descriptor)` via `mkInjectable`.
3. Return `true` to allow, return an `RPCError` to re-throw it verbatim, or
   return anything else to get `PERMISSION_DENIED (-32604)`.
4. Do not rely on `grantTo` alone — without `perm_check`, the check is skipped.

## Map domain errors

Call `errorTransform(error)` inside the transport options. Return an `RPCError`
to override `INTERNAL_ERROR`, return `undefined` to fall back to the default.
It applies only to errors thrown by the handler **before** streaming starts,
not to request validation. Errors thrown **after** the first chunk has been
sent cannot become `RPCFailure`; they surface as a `{ done: true, error }`
terminal chunk instead.

```ts
createExpressRouter(repository, {
  errorTransform: (e) => (e instanceof MyDomainError ? new RPCError(-32000, 'Domain', e.message) : undefined),
});
```

## Invoke directly

Call `repository.invoke(input, { injections?, errorTransform? })`. It returns
`RPCResponse` (`RPCSuccess | RPCStreamSuccess | RPCFailure`) and never throws
for protocol errors.

For streaming methods the result is `RPCStreamSuccess`:
`{ jsonrpc, id, chunks: AsyncGenerator<RPCStreamChunk> }`. It has no `result`
and no boolean `stream` flag — branch on the presence of `chunks`:

```ts
const r = await repository.invoke(input);
if ('chunks' in r) for await (const frame of r.chunks) { /* frame is RPCStreamChunk */ }
else if ('error' in r) { /* RPCFailure */ }
else { /* RPCSuccess, r.result */ }
```

Consume `chunks` yourself, or hand it to a transport. If a client disconnects
mid-stream, the transport calls `chunks.return()`, which triggers the handler's
`finally`.

## Client (`webui`)

`RpcClient.call<T>(method, ...params)` returns
`CallResult<T> = Promise<T> | AsyncGenerator<T>`. It inspects the first
frame: a `done` field means stream, otherwise the resolved value is the
ordinary `result`. Use `isStreamResult(x)` to narrow.

- `const r = await rpc.call('add', 1, 2)` → `r` is `3`.
- `const r = await rpc.call('logs.tail', '/var/log/app.log')` → `r` is an
  `AsyncGenerator`; `for await (const line of r) ...`.
- HTTP transport calls `reader.cancel()` only on early exit (`break` / throw /
  bad first frame), so the connection is aborted and the server's
  `res.on('close')` fires. A clean read lets the connection return to the pool;
  it does not cancel.
- WS transport routes the first message via a one-shot waiter, then streams
  subsequent frames per `id`.

## Handle errors

Read error codes from the exported `codes` object. `RPCError` carries
`code`, `message`, `data`. Common codes: `-32700` parse, `-32600` invalid
request, `-32601` method not found, `-32602` invalid params, `-32603` internal,
`-32604` permission denied.

For streams, a mid-stream `RPCError` becomes a terminal chunk with
`error: { code, message }`; clients re-throw it as `RPCError`.

## Use built-in methods

Keep `withSystemMethods` on (default) to expose `system.listMethods`,
`system.methodSignature`, `system.methodHelp`. Set `document` on a descriptor
so `system.methodHelp` returns useful text.

`system.methodSignature` reports ordinary containers with semantic fields
(`element` / `value` / `properties` / `options` / `elements`). A stream return
is reported as:

```ts
{ kind: 'stream', inner: <schema> }
```

Schemas with `.validate(false)` appear with `validate: false` in the signature
description so clients and the WebUI can show that the server will not enforce
that slot at runtime.

## Common mistakes

- **Passing named params or a bare object as `params`.** `convertParams` rejects
  anything that is not an array or `null` with `INVALID_PARAMS`. Always send
  `params: [...]`.
- **Omitting `id`.** `RPCRequestSchema` requires it; the request fails with
  `INVALID_REQUEST`. Notifications are not supported.
- **Naming descriptor fields `sign` / `doc`.** The schema is strict; registration
  throws `TypeError`. Use `signature` and `document`.
- **Putting `s.injectable()` at `signature[0]`.** `buildDescriptor` throws; the
  first slot is the return type.
- **Forgetting `mkInjectable` for a `s.injectable(key)` slot.** `convertParams`
  throws `INVALID_PARAMS` for the missing key.
- **Expecting `errorTransform` to catch validation errors.** It only wraps the
  handler call.
- **Declaring `s.stream(inner)` but returning a plain value from the handler.**
  A call is a stream only when the method declares `s.stream` and the return
  value is an `AsyncIterable`. A plain value is returned in `result`.
- **Expecting chunks to be validated against `inner`.** They are not. `inner`
  is documentation only.
- **Trying to stream `params`.** Not supported; only return values can stream.
- **Nesting `s.stream()` inside `s.stream()` or inside a parameter slot.**
  `s.stream()` is only valid at `signature[0]`.
- **Forgetting `finally` in a streaming handler.** When the client disconnects
  the server calls `source.return()`, so `finally` is the only place to close
  DB cursors, files, etc.
- **Calling `rpc.call()` and assuming `Promise`.** For stream methods it
  resolves to an `AsyncGenerator`. Branch with `isStreamResult(r)`.
- **Assuming stream frames are nested under `result` or carry a `stream: true`
  flag.** Each frame is a complete `RPCStreamChunk` with `jsonrpc` and `id`.
  Branch on `done` (and `error`), not on a wrapper field.
- **Treating a terminal `error` frame as a broken connection.** A mid-stream
  throw is delivered as `{ done: true, error }`; the HTTP/WS/stdio response
  itself ends cleanly. Only transport-level failures abort the connection.
- **Calling `.nullable()` on `s.unknown()` or `s.null()`.** Those schemas do not
  extend `NullableSchema`; the call is a TypeScript error. Use `.nullable()` on
  the concrete schema instead (e.g. `s.string().nullable()`), or `s.null()`
  when the value must be exactly `null`.
- **Expecting member-level `.nullable()` inside a union to matter.**
  `s.union([s.string().nullable(), s.number()])` is equivalent to
  `s.union([s.string(), s.number()])` — members are cloned and set to
  `nullable(false)` at construction. Put `.nullable()` on the union itself:
  `s.union([s.string(), s.number()]).nullable()`.
- **Calling `s.literal(null)`.** `literal` only accepts `string | number |
  boolean`; construction throws `TypeError`. Use `s.null()` for exact null, or
  `.nullable()` for "literal or null".
- **Treating default `s.object(...)` as permissive.** By default all declared
  keys are required and unknown keys are rejected. Use `.optionalProperties(...)`,
  `.allowUnknownProperties(true)`, or `.strict(false)` to loosen it.
- **Reading schema descriptions via `children.items` / `children.values`.**
  Those paths are gone. Use `element`, `value`, `properties`, `options`,
  `elements`. Stream markers use top-level `inner`.
- **Assuming `.validate(false)` still type-checks or coerces.** It only skips
  runtime validation; TypeScript types and the published description stay as
  declared. Use `s.unknown()` when the value truly has no schema.
- **Turning off validation on the return schema and expecting the server to
  enforce the handler result.** Return schemas are for description / WebUI;
  the server does not re-validate handler return values against them (except
  stream declaration checks for `AsyncGenerator`).
