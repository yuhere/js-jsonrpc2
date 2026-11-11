# js-jsonrpc2 Specification

Package: `@yuhere/js-jsonrpc2`

## Table of Contents

1. Overview
2. Conventions
3. Compatibility and Scope
4. Architecture
5. Method Registration
6. Schema System
7. Request Processing
8. Authorization and Dependency Injection
9. Response Objects
10. Errors
11. Streaming Responses
12. HTTP Transport
13. WebSocket Transport
14. stdio Transport
15. Built-in System Methods
16. Examples
17. Implementation Notes

## 1 Overview

`js-jsonrpc2` is a server-side JSON-RPC 2.0 implementation for Node.js, written in TypeScript. It provides a method repository, runtime validation of request and method data, permission checks, server-side injectable values, and HTTP, WebSocket, and stdio transports.

The library uses JSON-RPC 2.0 request and response objects. Its public API also defines a schema description layer for method signatures. This schema layer serves runtime validation and method introspection; it is distinct from TypeScript's compile-time types.

The implementation targets Node.js 18 or later.

## 2 Conventions

The terms **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, and **MAY** describe requirements within this document.

- **Protocol requirement** means a requirement inherited from JSON-RPC 2.0.
- **Library behavior** means behavior implemented by this project.
- **Application policy** means a decision the application integrating the library must make.

JSON member names and method namespaces are case-sensitive. A method's signature is positional: the first signature entry describes the return value, and subsequent entries describe handler parameters in order.

## 3 Compatibility and Scope

The library implements the JSON-RPC 2.0 server model. It does not claim compatibility with JSON-RPC 1.0.

The public package entry point exports:

- `Repository` and `createRepository`
- `RPCError` and `codes`
- `s`, the JSON data schema and marker constructor collection
- `createExpressRouter`
- `attachWebSocket` and `createWebSocketServer`
- `serveStdio`
- Public types exported by `src/types.ts`, plus transport option types

The package manifest identifies the package as `@yuhere/js-jsonrpc2`, version `2.1.x`, with Node.js `>=18`. It declares ESM package mode, an ESM module entry, a CommonJS `main` entry, and TypeScript declarations. The package export map shown in the inspected manifest does not include an explicit `require` condition; consumers SHOULD verify their module-resolution environment rather than assume all CommonJS loading patterns are supported.

This document specifies the behavior supported by the supplied source snapshot. It does not specify the separate `stringifyStream` utility as a public protocol feature.

## 4 Architecture

The library is organized around three concepts:

1. **Repository** — stores method descriptors and handlers, validates incoming requests, checks access, resolves injectable parameters, invokes handlers, and shapes responses.
2. **Schema** — describes JSON-compatible parameter and return data and validates values at runtime.
3. **Transport** — receives request data, calls the repository, and writes ordinary or streaming responses.

The same `Repository` may be used with an Express router, an attached WebSocket endpoint, or stdio. A transport can provide its own injectable values and error transformation callback.

## 5 Method Registration

### 5.1 Method descriptor

A method is registered with a descriptor and a handler.

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

The descriptor has the following fields:

| Field | Requirement and meaning |
|---|---|
| `namespace` | Required, non-empty string identifying the RPC method. |
| `signature` | Required tuple containing a return slot followed by parameter slots. |
| `document` | Optional string or callback used to provide method help/documentation. |
| `grantTo` | Optional array of grant identifiers accepted by the method's permission check. |

The callback form of `document` receives the descriptor itself and may return a string, a promise resolving to a string, or `void`.

### 5.2 Signature slots

The signature is declared in this order:

```ts
type RPCSignature = [RPCReturnSlot, ...RPCParamSlot[]];
type RPCReturnSlot =
  | Schema<unknown>
  | VoidMarker
  | StreamMarker<unknown>;
type RPCParamSlot = Schema<unknown> | InjectableMarker;
```

- Slot 0 is the return definition.
- Slots 1 onward define handler parameters in order.
- A regular schema validates a caller-provided JSON value.
- `s.injectable(key)` identifies a value supplied by the server.
- `s.void()` marks a method without a meaningful result.
- `s.stream(schema)` marks a streaming return and defines the schema for each yielded item.

A `VoidMarker`, `InjectableMarker`, or `StreamMarker` is a control marker, not an ordinary JSON data schema. Applications MUST use markers only in their supported signature positions.

### 5.3 Repository operations

`createRepository(options?)` constructs a `Repository`. The `RepositoryOptions` field `withSystemMethods` controls whether built-in system methods are installed; the implementation enables them by default.

The public repository operations include:

- `register(descriptor, handler)` — register a method under its namespace.
- `has(namespace)` — check whether a namespace exists.
- `list()` — list registered namespace names.
- `get(namespace)` — retrieve a registered method descriptor.
- `signatureOf(descriptor)` — obtain the normalized signature description.
- `invoke(input, options?)` — validate and invoke an incoming request and produce an RPC response or stream response.

Registering a namespace already present in the repository replaces that entry in the implementation.

## 6 Schema System

### 6.1 JSON data model

The schema system describes JSON-compatible values. Its JSON type model includes strings, numbers, booleans, `null`, arrays, and objects. JavaScript-only values such as `undefined`, `bigint`, `symbol`, functions, `NaN`, and infinities are not JSON values and SHOULD NOT be used as ordinary RPC data.

Constructors are accessed through `s`.

### 6.2 Constructors

| Constructor | Meaning |
|---|---|
| `s.string()` | String value. Extends `NullableSchema`. |
| `s.number()` | Number value. Extends `NullableSchema`. |
| `s.boolean()` | Boolean value. Extends `NullableSchema`. |
| `s.unknown()` | Any JSON value, including `null`. Does not extend `NullableSchema`; `.nullable()` is not exposed. |
| `s.null()` | Exactly `null`. Does not extend `NullableSchema`; `.nullable()` is not exposed. |
| `s.literal(value)` | One literal string, number, or boolean. `null` is rejected at construction. Extends `NullableSchema`. |
| `s.enum(values)` | One value from a string enumeration. Extends `NullableSchema`. |
| `s.array(itemSchema)` | Array whose items conform to `itemSchema`. Extends `NullableSchema`. |
| `s.object(shape)` | Object described by a property-to-schema map. Extends `NullableSchema`. |
| `s.record(valueSchema)` | Object whose values conform to a single schema. Extends `NullableSchema`. |
| `s.union(schemas)` | Value accepted by at least one supplied schema. Extends `NullableSchema`. Member schemas are cloned and set to `nullable(false)` at construction. |
| `s.tuple(schemas)` | Positional array validated against the supplied schemas. Extends `NullableSchema`. |

The marker constructors are `s.void()`, `s.injectable(key)`, and `s.stream(innerSchema)`.

### 6.3 Common schema methods

All schemas expose `.describe(text)` and `.toJSON()`. Schemas that extend `NullableSchema` additionally expose nullability control; schema kinds with numeric/structural bounds expose `.min(value)` / `.max(value)`; object schemas expose `.strict()`.

- `.describe(text)` — attach human-readable description metadata.
- `.nullable(value?: boolean)` — allow `null` (default `true`); `nullable(false)` clears it. Immutable. Not available on `s.unknown()` or `s.null()`.
- `.min(value)` and `.max(value)` — add bounds where the schema kind supports them.
- `.strict()` — available on object schemas; require declared properties and reject unknown properties (this is the default).

Object schemas are strict by default: every declared property is required and unknown properties are rejected. Use `.optionalProperties(keys)` to allow selected declared keys to be missing, `.allowUnknownProperties(true)` to keep unknown keys, or `.strict(false)` for a fully permissive object. `s.unknown()` already accepts `null`; `.nullable()` is neither exposed nor needed on it. `s.literal(v)` rejects `null` at construction; use `s.null()` for an exact `null` value, or `.nullable()` for "literal or null". `s.union([...])` strips member-level nullability at construction, so only the union's own `.nullable()` decides whether `null` is accepted.

Schemas provide parsing/validation and structured descriptions for introspection. TypeScript types describe compile-time expectations; they do not replace runtime validation of data received over the network.

## 7 Request Processing

### 7.1 Request object

The implementation validates request input using its JSON-RPC request schema. A request follows the JSON-RPC 2.0 shape:

```json
{
  "jsonrpc": "2.0",
  "method": "subtract",
  "params": [42, 23],
  "id": 1
}
```

- `jsonrpc` MUST be `"2.0"`.
- `method` identifies a registered namespace.
- `params`, when present, contains request parameters.
- `id` correlates the request with its response. The public request ID type is `string | number`.

The implementation's `RPCRequestInput` type represents `params` as an array. Although JSON-RPC 2.0 also describes named-object parameters, applications SHOULD use positional array parameters unless named-parameter support is verified for the particular library version and call path.

### 7.2 Processing sequence

For a normal invocation, the repository performs the following responsibilities:

1. Validate the incoming request structure.
2. Find the requested method.
3. Check the method's grant requirements against the available grants.
4. Validate caller-supplied parameters against the method signature.
5. Resolve server-injected parameters from the injection map.
6. Invoke the registered handler.
7. Validate ordinary return values or prepare a stream response according to the return slot.
8. Convert recognized failures into JSON-RPC error responses.

The exact transport can add parsing and transport-specific error handling before or after repository invocation.

### 7.3 Notifications and batches

JSON-RPC 2.0 defines a notification as a request without an `id`, for which the server does not return a response, and defines batch requests as arrays of request objects. Do not assume that every transport in this library implements every JSON-RPC notification or batch rule identically without checking its current implementation. The exposed `RPCRequestInput` type requires an `id`, and the source excerpts available for this specification do not establish complete batch semantics.

## 8 Authorization and Dependency Injection

### 8.1 Grants

A descriptor may specify `grantTo`, an array of grant identifiers. The repository checks this against the grants available to the invocation. A permission failure uses the library's `PERMISSION_DENIED` error code (`-32604`).

The application is responsible for deriving grants from a trusted authentication/authorization context. A client-supplied parameter MUST NOT be treated as proof of authorization.

### 8.2 Injectable parameters

An injectable parameter is declared with `s.injectable("key")`. The caller does not supply the value in the ordinary parameter list; the transport supplies a map of server-side values.

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

The injectable map is represented by `Injectables`, a record whose values may be direct values or functions returning values synchronously or asynchronously. `InjectableFactory` receives transport context and the repository and returns this map.

Default keys differ by transport:

- Express: `request`, `session`, `response`, `repository`.
- WebSocket: `socket`, `request`, `repository`.
- stdio: `repository`, `input`, `output`.

When `mkInjectable` is supplied, it defines the map for that transport. Applications SHOULD expose only the values required by handlers.

`perm_check`, when present, is `PermCheck`: `(grantTo: readonly string[], descriptor: MethodDescriptor, injections: Injections) => boolean | RPCError | Promise<boolean | RPCError>`. The repository calls it with those three arguments. `true` allows the call, an `RPCError` is rethrown, and any other result is permission denied.

## 9 Response Objects

### 9.1 Ordinary responses

A successful ordinary response has this shape:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": 19
}
```

A failed response has this shape:

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

A normal response includes either `result` or `error`, not both. The response ID is the request ID, or `null` when the request ID cannot be established. The public response types include `RPCSuccess`, `RPCFailure`, and `RPCResponse`.

A void return marker represents a method without a meaningful return value. Its transport-level representation should be checked for the selected transport and current version; callers MUST NOT assume that it behaves like a regular schema for `null`.

### 9.2 Error payload

An error payload has a numeric `code`, a string `message`, and optional `data`. The library's `RPCError` class provides `code`, optional `data`, `toPayload()`, and `toJSON()`.

## 10 Errors

The public `codes` export contains:

| Code | Constant | Meaning |
|---:|---|---|
| `-32700` | `PARSE_ERROR` | Parse error |
| `-32600` | `INVALID_REQUEST` | Invalid request structure |
| `-32601` | `METHOD_NOT_FOUND` | Requested method is unavailable |
| `-32602` | `INVALID_PARAMS` | Parameter validation failure |
| `-32603` | `INTERNAL_ERROR` | Internal error |
| `-32604` | `PERMISSION_DENIED` | Permission check failure |

Applications may throw `new RPCError(code, message, data?)` to return a deliberate protocol error. Error codes are numeric; application-defined codes may be used when they do not conflict with the library's conventions.

A transport's `errorTransform` callback receives an unknown error and returns either an `RPCError` or `undefined`. It can centralize error mapping. Applications SHOULD avoid exposing credentials, internal stack traces, or sensitive implementation details in error messages or `data`.

In the inspected transports, extra error data may be included outside production and suppressed in production for some failure paths. Do not rely on development-only `data` being present in production responses.

## 11 Streaming Responses

### 11.1 Declaring a stream

A method declares a stream by using `s.stream(itemSchema)` in its return slot and returning an async generator/async iterable compatible with the repository's implementation.

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

The inner schema describes each emitted value. A stream is not an ordinary `result` containing a fully materialized array.

### 11.2 Stream chunks

The public `RPCStreamChunk` shape contains:

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

A data frame has `done: false`, an index, and a value. The terminal success frame has `done: true` and the final index. If iteration fails, the terminal frame may contain an error object with a code and message. The implementation attempts to call the source generator's `return()` in cleanup paths.

Stream wire framing is transport-specific: WebSocket sends individual JSON messages, stdio writes newline-terminated JSON frames, and the Express responder writes stream output incrementally. Clients MUST follow the framing used by their selected transport rather than assume all transports encode streams identically.

## 12 HTTP Transport

### 12.1 `createExpressRouter`

```ts
createExpressRouter(repository: Repository, options?: ExpressOptions): Router
```

Options:

| Option | Default | Meaning |
|---|---|---|
| `mkInjectable` | built-in map | Function returning server-side injectable values. |
| `errorTransform` | `undefined` | Maps otherwise unhandled errors to `RPCError`. |
| `bodyLimit` | `"1mb"` | JSON request body limit. |
| `useHtdoc` | `NODE_ENV !== "production"` | Serves the bundled documentation UI when enabled. |

The router handles `POST /` for requests whose content type is JSON. If the request is not identified as `application/json`, it passes control to the next Express middleware. Mount the router at the desired path, for example `app.use("/rpc", createExpressRouter(repository))`.

The body parser stores the raw request body on `req.rawBody`. Parsing failures are mapped to `PARSE_ERROR`. The responder handles ordinary responses and stream responses separately.

## 13 WebSocket Transport

### 13.1 `attachWebSocket`

```ts
attachWebSocket(
  server: Server,
  repository: Repository,
  options: WSOptions,
): WebSocketServer
```

It attaches a JSON-RPC WebSocket endpoint to an existing Node HTTP server and returns the underlying `WebSocketServer`.

`WSOptions` includes:

| Option | Default / behavior |
|---|---|
| `mkInjectable` | Optional function creating injectable values for a connection. |
| `errorTransform` | Optional global error transform. |
| `path` | `"/"`; used by `attachWebSocket`. |
| `allowOrigin` | Optional upgrade callback receiving origin and request; returning `false` rejects the upgrade. |
| `maxPayload` | 1 MiB, forwarded to the `ws` server. |
| `onConnection` | Optional callback called after a connection is established. |

`allowOrigin` is an upgrade gate, not a complete authentication or authorization system.

### 13.2 `createWebSocketServer`

```ts
createWebSocketServer(options?: StandaloneWsOptions): Promise<StandaloneWsHandle>
```

`StandaloneWsOptions` extends `WSOptions` with:

- `server?: Server` — existing HTTP server to attach to.
- `port?: number` — default `8080` when creating a server.
- `host?: string` — default `"127.0.0.1"` when creating a server.

The returned handle contains `server`, `wss`, and `close(): Promise<void>`. If the helper creates the HTTP server, `close()` closes both the WebSocket server and that HTTP server. If a server was supplied, the helper does not own or close that HTTP server.

## 14 stdio Transport

### 14.1 `serveStdio`

```ts
serveStdio(options?: StdioOptions): Promise<void>
```

Options:

| Option | Default | Meaning |
|---|---|---|
| `repository` | new `Repository` | Repository to invoke. |
| `input` | `process.stdin` | Readable input stream. |
| `output` | `process.stdout` | Writable output stream. |
| `framing` | `"lines"` | `"lines"` or `"json"` frame extraction. |
| `mkInjectable` | built-in map | Function creating injectable values. |
| `errorTransform` | `undefined` | Global error transform. |
| `maxFrameBytes` | 1 MiB | Maximum buffered frame size. |
| `onResponse` | none | Called after a non-stream response is flushed. |

In `"lines"` mode, each non-empty line is parsed as one JSON value. In `"json"` mode, the implementation extracts concatenated JSON values separated by optional whitespace. Output writes are serialized to prevent response bytes from interleaving. The returned promise resolves when input ends and outstanding writes complete.

The `mkInjectable` callback is invoked without HTTP request/response objects for stdio; those arguments are `undefined`. The default map provides `repository`, `input`, and `output`.

## 15 Built-in System Methods

When `withSystemMethods` is enabled, the repository installs system methods for method discovery/help, including `system.methodSignature` and `system.methodHelp` in the inspected source.

System method behavior is part of the implementation rather than the base JSON-RPC 2.0 protocol. Applications SHOULD verify the exact accepted parameters and returned structure against the current source or declaration files before building clients around them.

## 16 Examples

### 16.1 Express server

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

### 16.2 Custom application error

```ts
import { RPCError } from "@yuhere/js-jsonrpc2";

throw new RPCError(10001, "The requested operation is not allowed");
```

The thrown error is intended to be mapped into a JSON-RPC error response by the repository/transport path.

### 16.3 WebSocket attached to an existing server

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

### 16.4 stdio service

```ts
import { createRepository, s, serveStdio } from "@yuhere/js-jsonrpc2";

const repository = createRepository();
repository.register(
  { namespace: "echo", signature: [s.unknown(), s.unknown()] },
  (value: unknown) => value,
);

await serveStdio({ repository, framing: "lines" });
```

## 17 Implementation Notes

1. This specification describes the library's server API and transport behavior, not a complete restatement of every JSON-RPC 2.0 requirement.
2. Do not infer full batch, notification, or named-parameter support solely from the JSON-RPC 2.0 standard; verify the current request schema and transport path.
3. Do not treat a TypeScript handler annotation as runtime validation. Use `s` schemas for remote input and output constraints.
4. Do not treat `grantTo` as authentication. The application must provide trusted grants and trusted injectable values.
5. Transport-specific streaming frames and cleanup behavior should be tested with the actual client and transport.
6. For API compatibility, prefer the package's generated declaration files when installed; this document was prepared from the supplied source snapshot.
