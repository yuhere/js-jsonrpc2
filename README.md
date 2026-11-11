# @yuhere/js-jsonrpc2

A TypeScript JSON-RPC 2.0 server library with schema validation, authorization, dependency injection, and multiple transports.

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
    signature: [s.number(), s.number(), s.number()],
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
      s.object({ userAgent: s.string().nullable() }),
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
s.string()                 // string
s.string().min(1).max(64)  // length-constrained string
s.number()                 // finite number
s.boolean()                // boolean
s.literal('2.0')           // exact literal (string | number | boolean only)
s.null()                   // exactly null
s.array(s.string())        // string[]
s.object({ id: s.number() })                        // all declared props required; extras rejected
s.object({ id: s.number() }).optionalProperties(['id']) // id may be omitted
s.record(s.number())       // Record<string, number>
s.union([s.string(), s.number()])
s.tuple([s.string(), s.number()])
s.enum(['pending', 'success', 'failed'])
s.unknown()                // any JSON value (already includes null)
s.void()                   // RPC-only: no return value
s.stream(s.string())       // RPC-only: streaming return (AsyncGenerator)
s.injectable('request')    // RPC-only: server-injected parameter
```

### Chainable modifiers

| Modifier | Applies to | Meaning |
| --- | --- | --- |
| `.min(n)` / `.max(n)` | string (length), number (bounds), array / record (size) | Inclusive bounds. |
| `.nullable()` / `.nullable(true)` | most schemas | Allow `null`. Immutable; returns a new schema. |
| `.nullable(false)` | same | Clear a previous nullable flag. |
| `.describe(text)` | all schemas | Human-readable description (shown in WebUI / docs). |
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
s.string().validate(false)

// Nested: only the inner schema skips checks
s.object({
  id: s.number(),
  payload: s.unknown().validate(false),
})
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
const closed = s.object({ name: s.string(), age: s.number() });
closed.parse({ name: 'Ada', age: 30 });             // ok
closed.parse({});                                   // error: missing name, age
closed.parse({ name: 'Ada', age: 30, extra: 1 });   // error: unknown property
// missing declared key → error; extra keys → error
```

Loosen each aspect independently:

```ts
// only `age` may be missing; extras are still rejected
s.object({ name: s.string(), age: s.number() }).optionalProperties(['age']);

// every declared key is still required, but unknown keys are kept
s.object({ name: s.string() }).allowUnknownProperties(true);

// fully permissive: all declared keys optional + unknown keys kept
s.object({ name: s.string() }).strict(false);
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

## Invoking directly

`Repository.invoke(input, options?)` returns an `RPCResponse`
(`RPCSuccess | RPCFailure`). Useful for tests or custom transports.

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

When a descriptor declares `grantTo`, the injected `perm_check(grantTo,
descriptor)` is called:

- returns `true` → allowed
- returns an `RPCError` → re-thrown as-is
- anything else → `PERMISSION_DENIED (-32604)`

`grantTo` is only enforced when a `perm_check` injectable is provided. Without
`perm_check`, methods that declare `grantTo` are callable by anyone.

```ts
app.use('/', createExpressRouter(repository, {
  mkInjectable: ({ request, session }) => ({
    request,
    perm_check: async (grantTo: string[]) => {
      const roles =
        (session as { user?: { roles?: string[] } } | undefined)?.user?.roles ??
        [];
      return roles.some((role) => grantTo.includes(role));
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
