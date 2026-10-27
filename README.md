# @yuhere/js-jsonrpc2

A TypeScript JSON-RPC 2.0 server library with schema validation, authorization, dependency injection, and multiple transports.

## Features

### Deviations from the JSON-RPC 2.0 spec

- **No named parameters.** `params` must be a positional array (or `null`).
- **No notifications.** Every request must carry an `id`.
- **No batch requests.** A batch payload is rejected with `INVALID_REQUEST`.

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

`signature[0]` is the return schema (`s.Schema` or `s.void()`).
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

Schemas are built with the `s` factory. They validate at runtime and derive
TypeScript types.

```ts
s.string()                 // string
s.string().min(1).max(64)  // length-constrained string
s.number()                 // finite number
s.boolean()                // boolean
s.literal('2.0')           // exact literal (string | number | boolean only)
s.null()                   // exactly null
s.array(s.string())        // string[]
s.object({ id: s.number() })          // open object
s.object({ id: s.number() }).strict() // all props required, no extras
s.record(s.number())       // Record<string, number>
s.union([s.string(), s.number()])
s.tuple([s.string(), s.number()])
s.enum(['pending', 'success', 'failed'])
s.unknown()                // any JSON value (already includes null)
s.void()                   // RPC-only: no return value
s.injectable('request')    // RPC-only: server-injected parameter
```

Chainable modifiers: `.min()`, `.max()`, `.nullable()`, `.strict()`,
`.describe(text)`. Validation: `.parse(input)` (throws
`SchemaValidationError`) and `.safeParse(input)` (returns a result object).
Introspection: `.toJSON()` returns a `SchemaDescription`.

Nullability notes:

- `.nullable()` / `.nullable(true)` allow `null`; `.nullable(false)` clears it. All calls are immutable.
- `s.unknown()` and `s.null()` do not expose `.nullable()`; they already accept / are `null`.
- `s.literal(v)` accepts `string | number | boolean`. Use `s.null()` for exact null, or `.nullable()` for "literal or null".
- `s.union([...])` strips member-level nullability; only the union's own `.nullable()` decides whether `null` is accepted.

## Transports

### Express

```ts
import { createExpressRouter } from '@yuhere/js-jsonrpc2';

app.use('/', createExpressRouter(repository, {
  bodyLimit: '1mb',
  useHtdoc: true,
  mkInjectable: (req, res, repo) => ({ request: req, response: res, repository: repo }),
  errorTransform: (error) => /* return RPCError | undefined */ undefined,
}));
```

The router handles `POST /` only. `useHtdoc` serves the bundled web UI
(static assets under `htdoc/`).

### WebSocket

Attach to an existing HTTP server:

```ts
import { createServer } from 'node:http';
import { attachWebSocket } from '@yuhere/js-jsonrpc2';

const server = createServer(app);
attachWebSocket(server, repository, {
  path: '/',
  mkInjectable: (ws, req, repo) => ({ socket: ws, request: req, repository: repo }),
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

An injectable factory is passed to the transport as `mkInjectable`. The
resulting object is available to any signature slot declared as
`s.injectable(key)`. Built-in defaults:

| Transport | Default injectables |
| --- | --- |
| Express | `request`, `session`, `response`, `repository` |
| WebSocket | `socket`, `request`, `repository` |
| stdio | `repository`, `input`, `output` |

Values may be plain values or functions; functions are awaited before
injection.

## Permission checks

When a descriptor declares `grantTo`, the injected `perm_check(grantTo,
descriptor)` is called:

- returns `true` → allowed
- returns an `RPCError` → re-thrown as-is
- anything else → `PERMISSION_DENIED (-32604)`

```ts
app.use('/', createExpressRouter(repository, {
  mkInjectable: (req, res, repo) => ({
    request: req,
    repository: repo,
    perm_check: async (grantTo: string[]) => {
      const roles = (req as any).session?.user?.roles ?? [];
      return roles.some((r: string) => grantTo.includes(r));
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

## License

MIT
