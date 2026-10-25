# Tests

The test-suite is split into three parts:

- `unit/` — unit tests that exercise the primitives and the compatibility layer.
- `spec/` — conformance tests for the JSON-RPC 2.0 specification.
- `exts/` — extension tests: injectables, `perm_check`, error transform, `system.*`.

Run with:

```shell
npm test
npm run test:coverage
```

Tests use `vitest` + `supertest` and should run on Node 18+.