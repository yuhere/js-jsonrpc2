# js-jsonrpc2 API Reference

This reference covers the server-side public API exported by `src/index.ts` in the supplied source snapshot. Package: `@yuhere/js-jsonrpc2` version `3.0.0`; package description: “JSON-RPC 2.0 server-side middleware for express, written in TypeScript with zod validation.” Node engine: `>=18`; package is marked `"type": "module"`. The manifest lists `main: ./dist/index.cjs`, `module: ./dist/index.js`, and `types: ./dist/index.d.ts`. The root export map includes the declaration file and ESM import target; it does not show an explicit `require` condition.

## Public entry points

```ts
import {
  Repository,
  createRepository,
  RPCError,
  codes,
  s,
  createExpressRouter,
  attachWebSocket,
  createWebSocketServer,
  serveStdio,
} from "@yuhere/js-jsonrpc2";
```

`src/index.ts` also exports all types from `src/types.ts` and these transport types: `ExpressOptions`, `WSOptions`, `StandaloneWsOptions`, `StandaloneWsHandle`, and `StdioOptions`.

## Repository and method registration

### `createRepository(options?)`

Creates a `Repository`. `RepositoryOptions`:

```ts
interface RepositoryOptions {
  withSystemMethods?: boolean;
}
```

The `withSystemMethods` flag controls installation of built-in system methods. The inspected source demonstrates system methods such as `system.methodSignature` and `system.methodHelp`; confirm their exact behavior in the current implementation before relying on it.

### `new Repository(options?)`

The repository is the registry and invocation point for remote methods. Public method signatures observed in source include:

- `register(descriptor, handler)` — register a method.
- `get(namespace)` — retrieve a descriptor by namespace; observed in system-method implementation.
- `signatureOf(descriptor)` — obtain a method signature description; observed in system-method implementation.

Verified `Repository` methods from the source:

- `register(descriptor: RPCDescriptor, fn: RPCHandler): void` — validates the descriptor/handler registration shape, builds the internal descriptor, and stores it by namespace. Registering an existing namespace replaces that entry.
- `has(namespace: string): boolean` — whether a namespace is registered.
- `list(): string[]` — registered namespace names.
- `get(namespace: string): MethodDescriptor | undefined` — descriptor lookup.
- `signatureOf(descriptor: MethodDescriptor): unknown[]` — normalized signature description.
- `invoke(input: unknown, options?: InvokeOptions): Promise<RPCResponse>` — validates and invokes one JSON-RPC request, including permission checks, parameter conversion/injection, error mapping, and streaming response setup.

`Repository` installs system methods by default. Pass `{ withSystemMethods: false }` to disable them. `createRepository(options?)` is a convenience wrapper around `new Repository(options)`.

### `RPCDescriptor`

```ts
type RPCDescriptor = {
  namespace: string;
  document?: RPCDocument;
  grantTo?: string[];
  signature: RPCSignature;
};
```

- `namespace`: non-empty method name used in JSON-RPC `method`.
- `document`: optional help/documentation, either a string or callback.
- `grantTo`: optional list of grant identifiers used by the library's permission checks.
- `signature`: tuple whose first slot describes the return value and remaining slots describe parameters.

```ts
type RPCDocument =
  | string
  | ((descriptor: RPCDescriptor) => string | Promise<string> | void);
```

A document callback receives the descriptor itself. It may return a string synchronously or asynchronously, or return `void`.

### Registration example

```ts
repository.register(
  {
    namespace: "sum",
    document: "Add two numbers.",
    grantTo: ["math"],
    signature: [
      s.number().describe("result"),
      s.number().describe("left"),
      s.number().describe("right"),
    ],
  },
  (left: number, right: number) => left + right,
);
```

The handler parameters must correspond, in order, to signature entries after the return slot. TypeScript handler typing is not a substitute for runtime validation of remote JSON input.

## Schema API (`s`)

The root export `s` combines constructors from `schema/json/primitives` and `schema/json/marker`. These schemas describe JSON values and are used to validate remote parameters and method results.

### Base schema behavior

`Schema<T>` is the abstract base for all schemas; it carries only `description` and the common parse/introspection API. Nullability is provided by a dedicated intermediate base class `NullableSchema<T>` (which extends `Schema<T | null>`).

`Schema<T>` exposes:

- `parse(input: unknown): T` — validate and return the parsed value; throws `SchemaValidationError` on validation failure.
- `safeParse(input)` — returns `{ success: true, data }` or `{ success: false, error }` for `SchemaValidationError`; unrelated errors are rethrown.
- `describe(description: string): this` — return a schema clone with a human-readable description.
- `getDescription(): string | undefined`.
- `toJSON()` — serialize a structured `SchemaDescription` for introspection/UI use.

`NullableSchema<T>` additionally exposes:

- `nullable(value?: boolean): this` — return a clone with the nullability flag set (default `true`); `nullable(false)` clears it. Immutable.
- `isNullable(): boolean`.

Bounded schema types expose `.min(value)` and `.max(value)` where supported.

`SchemaDescription` has `kind`, optional `description`, optional `nullable`, optional `constraints`, and optional `children`. The `nullable` field is the single source of truth for nullability; `kind` always reflects the value's real shape.

`SchemaValidationError` extends `Error` and exposes `path: string[]`, identifying the failing nested path.

### Constructors

| Constructor | Meaning and constraints |
|---|---|
| `s.unknown()` | Accepts any JSON value, including `null`. Does not extend `NullableSchema`; `.nullable()` is not exposed (and would be redundant). |
| `s.null()` | Accepts only `null`. Does not extend `NullableSchema`; `.nullable()` is not exposed. |
| `s.literal(value)` | Accepts the specified literal value. `value` is restricted to `string \| number \| boolean`; `null` is rejected at construction time — use `s.null()` or `.nullable()`. |
| `s.string()` | Validates strings. Extends `NullableSchema`; supports `.min`, `.max`, `.nullable`, `.describe`. |
| `s.number()` | Validates numbers. Extends `NullableSchema`; supports `.min`, `.max`, `.nullable`, `.describe`. Confirm special-number policy from the implementation before depending on NaN/Infinity behavior. |
| `s.boolean()` | Validates booleans. Extends `NullableSchema`; supports `.nullable`, `.describe`. |
| `s.enum(values)` | Accepts one of a non-empty tuple of strings. Extends `NullableSchema`; supports `.nullable`, `.describe`. |
| `s.array(itemSchema)` | Validates an array whose items match the schema. Extends `NullableSchema`; supports `.min`, `.max`, `.nullable`, `.describe`. |
| `s.object(shape)` | Validates an object with the declared properties. Extends `NullableSchema`. By default, missing declared properties are omitted from the output and unknown keys are not rejected. |
| `s.object(shape).strict()` | Requires every declared property and rejects undeclared properties; returns a stricter inferred output type. |
| `s.record(valueSchema)` | Validates an object whose values all match the supplied schema. Extends `NullableSchema`; supports `.min`, `.max`, `.nullable`, `.describe`. |
| `s.union([schema, ...])` | Accepts a value matching at least one schema; requires a non-empty tuple. Extends `NullableSchema`. Member schemas are cloned and set to `nullable(false)` at construction — nullability is decided by the union itself via `.nullable()`. |
| `s.tuple([schema, ...])` | Validates a tuple against its positional schemas; requires a non-empty tuple. Extends `NullableSchema`; supports `.nullable`, `.describe`. |
| `s.void()` | Control marker for a method return slot with no meaningful result; not a JSON data schema. |
| `s.stream(innerSchema)` | Control marker for a streaming return slot, carrying the schema for each streamed value. |
| `s.injectable(key)` | Control marker for a server-injected parameter. `key` is a string and is resolved from server-side injectables. |

For bounded schemas, use `.min()` and `.max()` according to the schema kind. Array/string/record bounds are non-negative integers in the implementation excerpts; number bounds are numeric. Exact method return types are best checked in the package declarations.

### Nullability rules

- `.nullable()` / `.nullable(true)` allow `null`; `.nullable(false)` clears the flag. All calls are immutable and return a clone.
- `s.unknown()` and `s.null()` do not expose `.nullable()` — they already accept (or are) `null`.
- `s.literal(v)` rejects `null` at construction; use `s.null()` for exact null, or `.nullable()` for "literal or null".
- `s.union([...])` strips member-level nullability at construction; only the union's own `.nullable()` affects whether `null` is accepted.

### Signature slot types

```ts
type RPCReturnSlot =
  | s.Schema<unknown>
  | s.VoidMarker
  | s.StreamMarker<unknown>;

type RPCParamSlot = s.Schema<unknown> | s.InjectableMarker;
type RPCSignature = [RPCReturnSlot, ...RPCParamSlot[]];
```

A signature must contain at least one slot, because the first slot is the return definition. `VoidMarker` and `StreamMarker` are not regular data schemas and should not be nested inside ordinary schema constructors.

### Example: injected server context

```ts
repository.register(
  {
    namespace: "whoami",
    signature: [
      s.object({ id: s.string() }).strict(),
      s.injectable("currentUser"),
    ],
  },
  (currentUser: { id: string }) => currentUser,
);
```

The exact way to create `currentUser` depends on transport configuration: see `InjectableFactory`, `Injectables`, and transport options below.

## Errors and protocol codes

### `RPCError`

```ts
new RPCError(code: number, message: string, data?: unknown)
```

Properties: `code: number`, optional `data: unknown`. `toPayload()` and `toJSON()` return `{ code, message, data? }`, omitting `data` when it is `undefined`.

### `codes`

The `codes` namespace exports:

| Constant | Code | Meaning |
|---|---:|---|
| `PARSE_ERROR` | `-32700` | Parse error |
| `INVALID_REQUEST` | `-32600` | Invalid request |
| `METHOD_NOT_FOUND` | `-32601` | Method not found |
| `INVALID_PARAMS` | `-32602` | Invalid params |
| `INTERNAL_ERROR` | `-32603` | Internal error |
| `PERMISSION_DENIED` | `-32604` | Permission denied |

### Error transformation

```ts
type RPCErrorTransform = (error: unknown) => RPCError | undefined;
```

Return an `RPCError` to map an error to a controlled protocol error. Return `undefined` to indicate that this transform does not handle it. Do not leak secrets or internal stack traces in error messages/data.

## Transport APIs

### Express

```ts
createExpressRouter(repository: Repository, options?: ExpressOptions): Router
```

```ts
interface ExpressOptions {
  mkInjectable?: InjectableFactory;
  errorTransform?: RPCErrorTransform;
  bodyLimit?: string;
  useHtdoc?: boolean;
}
```

- `mkInjectable(req, res, repository)` returns a map of server-side injectable values.
- `errorTransform` maps unhandled errors to `RPCError`.
- `bodyLimit` controls the JSON body size; source default is `'1mb'`.
- `useHtdoc` enables/disables the bundled documentation UI. Source default is `process.env.NODE_ENV !== 'production'`.

Example:

```ts
const app = express();
app.use("/rpc", createExpressRouter(repository, {
  bodyLimit: "1mb",
  mkInjectable: (req, res) => ({ request: req, response: res }),
}));
```

### WebSocket

Public exports:

- `attachWebSocket(server, repository, options?)`
- `createWebSocketServer(options?)`

Public types exported from `src/transport/ws`: `WSOptions`, `StandaloneWsOptions`, and `StandaloneWsHandle`.

```ts
interface WSOptions {
  mkInjectable?: InjectableFactory;
  errorTransform?: RPCErrorTransform;
  path?: string; // default "/"; used by attachWebSocket
  allowOrigin?: (origin: string | undefined, req: IncomingMessage) => boolean;
  maxPayload?: number; // default 1 MiB
  onConnection?: (socket: WebSocket, req: IncomingMessage) => void;
}

interface StandaloneWsOptions extends WSOptions {
  server?: Server;
  port?: number; // default 8080 when creating a server
  host?: string; // default "127.0.0.1" when creating a server
}

interface StandaloneWsHandle {
  server: Server;
  wss: WebSocketServer;
  close(): Promise<void>;
}
```

- `attachWebSocket(server, repository, options)` attaches to an existing Node HTTP server and returns the underlying `WebSocketServer`. `options` is typed as `WSOptions` in the implementation; pass `{}` when no options are needed.
- `path` matches the URL path after removing the query string.
- `allowOrigin` is an optional upgrade gate. Return `false` to reject the upgrade; it receives the origin header (which can be `undefined`) and the incoming request. It is not a replacement for broader authentication/authorization.
- `maxPayload` is forwarded to the `ws` server; source default is `1024 * 1024`.
- `onConnection` runs after a WebSocket connection is established.
- `createWebSocketServer(options?)` returns `Promise<StandaloneWsHandle>`. It creates a new `Repository` internally and does not accept a repository parameter in its public signature. If an existing `server` is provided, it attaches to that server and does not start/close that server itself; otherwise it listens on the configured/default host and port and closes the created server in `close()`.

### stdio

```ts
serveStdio(options?: StdioOptions): Promise<void>
```

```ts
interface StdioOptions {
  repository?: Repository;
  input?: Readable;   // default process.stdin
  output?: Writable;  // default process.stdout
  framing?: "lines" | "json";
  mkInjectable?: InjectableFactory;
  errorTransform?: RPCErrorTransform;
  maxFrameBytes?: number;
  onResponse?: (response: RPCResponse) => void;
}
```

- `framing: "lines"` is the default and uses one newline-terminated JSON value per line.
- `framing: "json"` uses concatenated JSON values with whitespace-tolerant framing.
- `maxFrameBytes` is the maximum input frame size; source comment documents a default of 1 MB.
- `onResponse` runs after each response is flushed.
- The promise resolves when the input stream ends.

## Public types from `src/types.ts`

```ts
type RPCReturnSlot = Schema<unknown> | VoidMarker | StreamMarker<unknown>;
type RPCParamSlot = Schema<unknown> | InjectableMarker;
type RPCSignature = [RPCReturnSlot, ...RPCParamSlot[]];

type RPCDocument =
  | string
  | ((descriptor: RPCDescriptor) => string | Promise<string> | void);

type RPCHandler = (...args: any[]) => unknown;
type RPCRegisterArgs = [RPCDescriptor, RPCHandler];

type RPCReqId = string | number;
type RPCResId = RPCReqId | null;

interface RPCStreamChunk {
  jsonrpc: RPCVersion;
  id: RPCReqId;
  done: boolean;
  index?: number;
  value?: unknown;
  error?: { code: number; message: string };
}

interface RPCSuccess {
  jsonrpc: RPCVersion;
  id: RPCReqId;
  result: unknown;
}

interface RPCStreamSuccess {
  jsonrpc: RPCVersion;
  id: RPCReqId;
  chunks: AsyncGenerator<RPCStreamChunk, void, unknown>;
}

interface RPCErrorPayload {
  code: number;
  message: string;
  data?: unknown;
}

interface RPCFailure {
  jsonrpc: RPCVersion;
  id: RPCResId;
  error: RPCErrorPayload;
}

type RPCResponse = RPCSuccess | RPCStreamSuccess | RPCFailure;
type Injectables = Record<string, unknown | (() => unknown | Promise<unknown>)>;

interface InjectableFactory {
  (req: unknown, res: unknown, repository: Repository): Injectables;
}

interface RPCRequestInput {
  jsonrpc: RPCVersion;
  method: string;
  params: unknown[];
  id: RPCReqId;
}

interface InvokeOptions {
  injections?: Injectables;
  errorTransform?: RPCErrorTransform | undefined;
}

interface RepositoryOptions {
  withSystemMethods?: boolean;
}

type RPCErrorTransform = (error: unknown) => RPCError | undefined;
```

`RPCVersion` is the protocol version type used by the source (`"2.0"` in the protocol). `RPCHandler` is broad at the public type level; use explicit handler parameter/return annotations in application code.

## Streaming RPC responses

A streaming method declares `s.stream(itemSchema)` in the return slot. Stream frames use `RPCStreamChunk`:

- Data frame: `{ jsonrpc, id, done: false, index, value }`
- Terminal success frame: `{ jsonrpc, id, done: true, index }`
- Terminal error frame: `{ jsonrpc, id, done: true, index?, error: { code, message } }`

The stream's `index` identifies the frame sequence. Transport encodings differ; for HTTP/stdio, inspect the transport implementation for exact wire framing and backpressure details. This skill covers streaming RPC responses, not the standalone `stringifyStream` utility.

## Scope notes and verification limits

- The provided source bundle is a source dump, not a live installed package. The public export list above is taken from `src/index.ts`.
- The indexed dump did not surface a `*.test.ts`/`*.spec.ts` example set clearly enough to cite individual tests; run the repository's configured test command and inspect actual tests before treating a behavior as regression-tested.
- The WebSocket option interfaces and core `Repository` methods were checked against the supplied source excerpt. For compatibility-sensitive work, prefer the installed package's generated `.d.ts` files when available.
- `stringifyStream` is intentionally not documented as a separate API here; it is an internal implementation detail for the selected skill scope.
