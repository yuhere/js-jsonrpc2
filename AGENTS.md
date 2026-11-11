# Agent notes for @yuhere/js-jsonrpc2

Read [SKILL.md](./SKILL.md) before editing or calling this library. [llms.txt](./llms.txt) is only an index. [README.md](./README.md) is the user guide.

Hard constraints:

- `params` is a positional array or `null`. Named parameters are rejected.
- Every request has a string or number `id`. Notifications and batches are rejected.
- Only the return value can stream. `s.stream()` is valid only at `signature[0]`.
- `signature[0]` is the return schema. `s.injectable(key)` is a server parameter, never the return.
- `perm_check(grantTo, descriptor, injections)` is a direct callback. It is not invoked with zero arguments.
- Do not treat `grantTo` as authentication by itself. Without `perm_check`, the method stays callable.
- Handler parameter types are not inferred from the schema. Annotate them, or use `Infer<typeof schema>`.
- `llm.tools` names positional arguments `param0`, `param1`, … Injectable slots are omitted.
