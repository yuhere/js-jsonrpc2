import { RPCError } from '../errors/RPCError';
import { METHOD_NOT_FOUND } from '../errors/codes';
import { assertAccessible } from './permission';
import { s } from '../schema/json';
import type { Repository } from './Repository';
import type { Injections, LlmTools } from '../types';

function notFound(namespace: string): RPCError {
  return new RPCError(METHOD_NOT_FOUND, 'Method not found', `Method not found.[${namespace}]`);
}

export function registerSystemMethods(repository: Repository): void {
  repository.register(
    {
      namespace: 'system.listMethods',
      document: 'This method returns an array of strings, one for each method supported by the RPC server.',
      signature: [s.array(s.string()), s.injectable('repository'), s.injectable('injections')],
    },
    async function systemListMethods(repository: Repository, injections: Injections) {
      const visible: string[] = [];
      for (const name of repository.list()) {
        const descriptor = repository.get(name);
        if (!descriptor) continue;
        try {
          await assertAccessible(descriptor, injections);
          visible.push(name);
        } catch (error) {
          if (error instanceof RPCError && error.code === METHOD_NOT_FOUND) continue;
          throw error;
        }
      }
      return visible;
    },
  );

  repository.register(
    {
      namespace: 'system.methodSignature',
      document:
        'This method takes one parameter, the name of a method implemented by the RPC server.\n\n' +
        'It returns an array of possible signatures for this method.\n' +
        'A signature is an array of types.\n' +
        'The first of these types is the return type of the method, the rest are parameters.\n',
      signature: [
        s.array(s.object({   // 返回值的完整类型需要在运行时返回，`s` 无法完整描述运行时结果。
          kind: s.enum(["string", "number", "boolean", "literal", "enum", "array", "tuple", "object", "record", "union", "unknown", "null", "stream", "void"]).describe('Schema类型'),
        })),
        s.string(), s.injectable('repository'), s.injectable('injections')],
    },
    async function systemMethodSignature(namespace: string, repository: Repository, injections: Injections) {
      const descriptor = repository.get(namespace);
      if (!descriptor) throw notFound(namespace);
      await assertAccessible(descriptor, injections);
      return repository.signatureOf(descriptor);
    },
  );

  repository.register(
    {
      namespace: 'system.methodHelp',
      document:
        'This method takes one parameter, the name of a method implemented by the RPC server.\n\n' +
        'It returns a documentation string describing the use of that method.\n' +
        'If no such string is available, an empty string is returned.\n' +
        'The documentation string may contain HTML markup.\n',
      signature: [s.string(), s.string(), s.injectable('repository'), s.injectable('injections')],
    },
    async function systemMethodHelp(namespace: string, repository: Repository, injections: Injections) {
      const descriptor = repository.get(namespace);
      if (!descriptor) throw notFound(namespace);
      await assertAccessible(descriptor, injections);
      const document = descriptor.document;
      if (typeof document === 'function') {
        return (await document(descriptor as never)) ?? null;
      }
      return document === undefined ? null : document;
    },
  );

  repository.register(
    {
      namespace: 'system.metrics',
      document:
        'Return the current RPC metrics snapshot, if the configured metrics implementation supports it.\n\n' +
        'Returns `null` when the active `RPCMetrics` implementation does not expose `snapshot()`.',
      signature: [s.unknown(), s.injectable('repository')],
    },
    async function systemMetrics(repository: Repository) {
      function hasSnapshot(m: unknown): m is { snapshot(): unknown } {
        return !!m && typeof (m as { snapshot?: unknown }).snapshot === 'function';
      }
      const metrics = repository.getMetrics()
      if (hasSnapshot(metrics)) {
        return metrics.snapshot();
      }
      return null;
    },
  );

  repository.register(
    {
      namespace: 'llm.tools',
      document:
        'Generate OpenAI-style tool/function definitions for all methods the caller can invoke.\n\n' +
        'Each entry is `{ type: "function", function: { name, description, parameters } }`.\n' +
        'Injectable parameters are omitted (they are provided by the server).\n' +
        'Streaming methods are excluded by default; pass `{ includeStreaming: true }` to include them\n' +
        '(their description will note that they return a stream).\n\n' +
        'Tool names encode the JSON-RPC method name, which is otherwise unchanged:\n' +
        'each "_" becomes "_x", then each "." becomes "__".\n' +
        'Decode by restoring "__" to "." first, then "_x" to "_".\n' +
        '`namePrefix` is prepended to that encoding. `prefix` only keeps methods whose namespace starts with it.\n' +
        'The generated name must match /^[a-zA-Z0-9_-]{1,64}$/.\n\n' +
        'Optional params: `{ includeStreaming?: boolean, namePrefix?: string, prefix?: string }`.\n' +
        'Every field may be omitted. `null` uses the defaults.',
      signature: [
        s.array(
          s.object({
            type: s.literal('function'),
            function: s.object({
              name: s.string(),
              description: s.string(),
              parameters: s.record(s.unknown()),
              required: s.array(s.string()),
              additionalProperties: s.boolean()
            }),
          }),
        ),
        s.injectable("repository"),
        s.injectable('injections'),
        s.object({
          includeStreaming: s.boolean().describe('Include stream-returning methods (default false)'),
          namePrefix: s.string().describe('Prefix added to every encoded tool name'),
          prefix: s.string().describe('Only include methods whose namespace starts with this'),
        }).optionalProperties(['includeStreaming', 'namePrefix', 'prefix']).describe('Options').nullable()
      ],
    },
    async function generateLlmTools(repository: Repository, injections: Injections, rawOptions?: unknown): Promise<LlmTools> {
      return repository.listLlmTools(injections, rawOptions);
    },
  );

}