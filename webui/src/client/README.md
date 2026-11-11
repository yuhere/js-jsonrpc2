# Web client

Browser and Node client for this JSON-RPC server. Import it from
`@yuhere/js-jsonrpc2/webclient`.

```ts
import {
  createRPC,
  httpCallOptions,
  HttpTimeoutError,
  isStreamResult,
} from '@yuhere/js-jsonrpc2/webclient';

const rpc = createRPC({
  transport: 'http',
  endpoint: '/rpc',
  timeout: 10_000,
});

const value = await rpc.call('add', 1, 2);
```

`call(method, ...params)` sends `params` as the JSON-RPC array. The return
value is either the ordinary `result` or an async generator when the first
response frame has `done`.

## HTTP timeout and cancellation

`timeout` on `createRPC({ transport: 'http' })` or `createHttpRPC` is the
default limit in milliseconds. Leave it unset, or use `0` or a negative
number, and the call waits until the network finishes.

Pass a per-call override as the last argument, wrapped with `httpCallOptions`.
That wrapper is not a JSON-RPC parameter. A plain object in that position is
sent to the method unchanged.

```ts
await rpc.call('add', 1, 2, httpCallOptions({
  timeout: 500,
  signal: controller.signal,
}));
```

- A positive `timeout` replaces the client default for that call.
- `timeout: 0` (or any non-positive value) disables the client timeout.
- `signal` aborts the request, including a streaming body.
- The timer and the signal can be used together. The first one to fire wins.
- The timer is cleared when the call finishes, is aborted, or times out.

Timeouts throw `HttpTimeoutError` (`name === 'HttpTimeoutError'`). Its
`timeout` field is the limit that elapsed. Aborting the caller's
`AbortSignal` rejects with an `AbortError` (`DOMException`), not
`HttpTimeoutError`. A network failure is the `TypeError` from `fetch`. An
HTTP status outside 2xx is `Error` with the status in the message.

WebSocket calls ignore `timeout` and `httpCallOptions`. Use
`connectTimeoutMs` and `callTimeoutMs` for that transport.
