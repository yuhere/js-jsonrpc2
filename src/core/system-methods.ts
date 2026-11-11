import { RPCError } from '../errors/RPCError';
import { METHOD_NOT_FOUND } from '../errors/codes';
import { assertAccessible } from './permission';
import { s } from '../schema/json';
import type { Repository } from './Repository';
import type { Injections, LlmTools } from '../types';
import type { AnthropicTool } from './llm-tools';

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
        'It returns the same array `signatureOf` builds. Injectable slots are omitted.\n' +
        'The first element is the return slot. Each later element is one positional parameter.\n\n' +
        'Every element is an object whose `kind` is one of: string, number, boolean, literal, enum, array, tuple, object, record, union, unknown, null, stream, void.\n' +
        'Only `kind` is always present. The other fields appear when that kind uses them:\n' +
        '- `description`: human-readable text\n' +
        '- `nullable`: true when the value may be null\n' +
        '- `validate`: false when runtime validation is off\n' +
        '- `constraints`: bounds such as min, max, values, value, optionalProps, allowUnknownProps\n' +
        '- `element`: array element schema\n' +
        '- `value`: record value schema\n' +
        '- `properties`: object fields, name to schema\n' +
        '- `options`: union members\n' +
        '- `elements`: tuple members, in order\n' +
        '- `inner`: schema inside a stream return\n' +
        'Nested schemas use this same shape. `void` is `{ kind: "void" }`. A stream is `{ kind: "stream", inner }`.\n',
      signature: [
        s.array(s.object({
          kind: s.enum(["string", "number", "boolean", "literal", "enum", "array", "tuple", "object", "record", "union", "unknown", "null", "stream", "void"]).describe('Discriminator'),
          description: s.string().describe('Human-readable text. Omitted when empty'),
          nullable: s.boolean().describe('True when the value may be null'),
          validate: s.boolean().describe('False when runtime validation is disabled'),
          constraints: s.record(s.unknown()).describe('Bounds such as min, max, values, value, optionalProps, allowUnknownProps'),
          element: s.unknown().describe('array: element schema, same shape as this object'),
          value: s.unknown().describe('record: value schema, same shape as this object'),
          properties: s.record(s.unknown()).describe('object: property name to schema'),
          options: s.array(s.unknown()).describe('union: member schemas'),
          elements: s.array(s.unknown()).describe('tuple: schemas in order'),
          inner: s.unknown().describe('stream: inner schema'),
        }).optionalProperties([
          'description', 'nullable', 'validate', 'constraints',
          'element', 'value', 'properties', 'options', 'elements', 'inner',
        ]).describe('One signature slot from signatureOf')),
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
        return (await document(descriptor as never)) ?? '';
      }
      return document === undefined || document === null ? '' : document;
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
        'Parameters are positional and named param0, param1, … in order. Each description starts with “第 N 个位置参数”.\n' +
        'Optional params: `{ includeStreaming?: boolean, namePrefix?: string, prefix?: string, format?: "openai" | "anthropic" }`.\n' +
        'Every field may be omitted. `null` uses the defaults. `format` defaults to "openai". "anthropic" returns `{ name, description, input_schema }` instead.\n',
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
          format: s.enum(['openai', 'anthropic']).describe('openai (default) or anthropic tool objects'),
        }).optionalProperties(['includeStreaming', 'namePrefix', 'prefix', 'format']).describe('Options').nullable()
      ],
    },
    async function generateLlmTools(repository: Repository, injections: Injections, rawOptions?: unknown): Promise<LlmTools | AnthropicTool[]> {
      return repository.listLlmTools(injections, rawOptions);
    },
  );

}