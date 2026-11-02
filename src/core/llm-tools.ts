import type { SchemaDescription } from '../schema/json/primitives';
import { RPCError } from '../errors/RPCError';
import { METHOD_NOT_FOUND } from '../errors/codes';
import { assertAccessible } from './permission';
import type { Repository } from './Repository';
import { InjectableMarker, VoidMarker, StreamMarker, Schema } from '../schema/json';
import { RPCVersion } from '../schema/z/protocol';
import type {
    RPCFailure, RPCSuccess,
    RPCStreamSuccess,
    LlmToolCall, LlmTools, Injections
} from '../types';

export interface JSONSchema {
    type?: string | string[];
    description?: string;
    enum?: unknown[];
    const?: unknown;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    minItems?: number;
    maxItems?: number;
    minProperties?: number;
    maxProperties?: number;
    items?: JSONSchema | JSONSchema[];
    properties?: Record<string, JSONSchema>;
    required?: string[];
    additionalProperties?: boolean | JSONSchema;
    anyOf?: JSONSchema[];
    nullable?: boolean;
}

function schemaToJSONSchema(schema: Schema<unknown>): JSONSchema {
    return convert(schema.toJSON());
}

function convert(desc: SchemaDescription): JSONSchema {
    const out: JSONSchema = {};
    if (desc.description) out.description = desc.description;

    switch (desc.kind) {
        case 'string': {
            out.type = 'string';
            const c = (desc.constraints ?? {}) as { min?: number; max?: number };
            if (c.min !== undefined) out.minLength = c.min;
            if (c.max !== undefined) out.maxLength = c.max;
            break;
        }
        case 'number': {
            out.type = 'number';
            const c = (desc.constraints ?? {}) as { min?: number; max?: number };
            if (c.min !== undefined) out.minimum = c.min;
            if (c.max !== undefined) out.maximum = c.max;
            break;
        }
        case 'boolean':
            out.type = 'boolean';
            break;
        case 'literal': {
            const value = (desc.constraints as { value: unknown }).value;
            out.const = value;
            out.type = typeof value; // string | number | boolean
            break;
        }
        case 'enum': {
            out.type = 'string';
            out.enum = (desc.constraints as { values: unknown[] }).values;
            break;
        }
        case 'array': {
            out.type = 'array';
            const c = (desc.constraints ?? {}) as { min?: number; max?: number };
            if (c.min !== undefined) out.minItems = c.min;
            if (c.max !== undefined) out.maxItems = c.max;
            out.items = convert(desc.element);
            break;
        }
        case 'tuple': {
            out.type = 'array';
            const items = desc.elements;
            out.items = items.map(convert);
            out.minItems = items.length;
            out.maxItems = items.length;
            break;
        }
        case 'object': {
            out.type = 'object';
            const optional = new Set(
                ((desc.constraints as { optionalProps?: string[] } | undefined)
                    ?.optionalProps) ?? [],
            );
            const allowUnknown =
                ((desc.constraints as { allowUnknownProps?: boolean } | undefined)
                    ?.allowUnknownProps) ?? false;

            const props = desc.properties;
            out.properties = {};
            for (const [k, v] of Object.entries(props)) out.properties[k] = convert(v);

            const required = Object.keys(props).filter((k) => !optional.has(k));
            if (required.length > 0) out.required = required;

            if (!allowUnknown) out.additionalProperties = false;
            break;
        }
        case 'record': {
            out.type = 'object';
            const c = (desc.constraints ?? {}) as { min?: number; max?: number };
            if (c.min !== undefined) out.minProperties = c.min;
            if (c.max !== undefined) out.maxProperties = c.max;
            out.additionalProperties = convert(desc.value);
            break;
        }
        case 'union': {
            out.anyOf = desc.options.map(convert);
            break;
        }
        case 'unknown': {
            out.type = ['object', 'array', 'string', 'number', 'boolean', 'null'];
            break;
        }
        case 'null': {
            out.type = 'null';
            break;
        }
        default: {
            const _exhaustive: never = desc;
            throw new Error(
                `Unsupported schema kind for JSON Schema: ${JSON.stringify(_exhaustive)}`,
            );
        }
    }

    if (desc.nullable) {
        if (desc.kind === 'unknown' || desc.kind === 'null') {
            // unknown 已包含 null；null 本身就是 null。不追加。
        } else if (typeof out.type === 'string') {
            out.type = [out.type, 'null'];
        } else if (Array.isArray(out.type)) {
            out.type = out.type.includes('null') ? out.type : [...out.type, 'null'];
        } else {
            out.nullable = true;
        }
    }

    return out;
}

// ─────────────────────────────────────────────────────────────
// 返回值的人类可读描述（拼进 function.description）
// ─────────────────────────────────────────────────────────────

function formatConstraints(constraints?: Record<string, unknown>): string {
    if (!constraints) return '';
    const parts = Object.entries(constraints)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
    return parts.length > 0 ? ` { ${parts.join(', ')} }` : '';
}

/**
 * 把 SchemaDescription 渲染成一行/多行文本，供 LLM 阅读。
 * 与 WebUI `docGen.ts` 的 `renderSchema` 风格一致：
 * - 读 `schema.nullable`（不再有 kind === 'nullable'）
 * - 容器类型递归
 * - 未知 kind 原样输出
 */
function renderSchema(schema: SchemaDescription, indent = 0): string[] {
    const pad = '  '.repeat(indent);
    const lines: string[] = [];

    let head = `${pad}- ${schema.kind}`;
    if (schema.nullable) head += ' (nullable)';
    if (schema.description) head += ` — ${schema.description}`;
    const c = formatConstraints(schema.constraints);
    if (c) head += ` \`${c}\``;
    lines.push(head);

    const pushChild = (label: string, child: SchemaDescription) => {
        const sub = renderSchema(child, indent + 1);
        if (sub.length) {
            sub[0] = `${'  '.repeat(indent + 1)}- **${label}**: ${sub[0]!.trim().replace(/^- /, '')}`;
            lines.push(...sub);
        }
    };

    switch (schema.kind) {
        case 'array': {
            pushChild('element', schema.element);
            break;
        }
        case 'record': {
            pushChild('value', schema.value);
            break;
        }
        case 'object': {
            for (const [k, v] of Object.entries(schema.properties)) {
                pushChild(k, v);
            }
            break;
        }
        case 'union': {
            schema.options.forEach((opt, i) => pushChild(`option[${i}]`, opt));
            break;
        }
        case 'tuple': {
            schema.elements.forEach((it, i) => pushChild(`[${i}]`, it));
            break;
        }
        default:
            // 叶子类型：无子节点。
            break;
    }

    return lines;
}

/** 渲染返回值槽位（Schema / VoidMarker / StreamMarker）。 */
function renderReturnSlot(slot: unknown): string {
    if (slot instanceof VoidMarker) return 'void';
    if (slot instanceof StreamMarker) {
        const inner = renderSchema(slot.inner.toJSON(), 0)
            .map((l) => l.replace(/^- /, ''))
            .join('\n');
        return `stream of:\n${inner}`;
    }
    if (slot instanceof Schema) {
        return renderSchema(slot.toJSON(), 0)
            .map((l) => l.replace(/^- /, ''))
            .join('\n');
    }
    return 'unknown';
}

export async function listLlmTools(
    repository: Repository,
    injections: Injections,
    rawOptions?: unknown,
): Promise<LlmTools> {
    const opts = (rawOptions ?? {}) as {
        includeStreaming?: boolean;
        prefix?: string;
    };
    const { includeStreaming = false, prefix } = opts;
    const tools: LlmTools = [];
    for (const name of repository.list()) {
        if (prefix && !name.startsWith(prefix)) continue;
        const descriptor = repository.get(name);
        if (!descriptor) continue;

        // 权限过滤：不可见的方法直接跳过（与 listMethods 语义一致）
        try {
            await assertAccessible(descriptor, injections);
        } catch (error) {
            if (error instanceof RPCError && error.code === METHOD_NOT_FOUND) continue;
            throw error;
        }

        const isStream = descriptor.shouldStreamReturn;
        if (isStream && !includeStreaming) continue;

        // 收集客户端参数，跳过 injectable
        const properties: Record<string, JSONSchema> = {};
        const required: string[] = [];
        let paramIndex = 0;
        for (let i = 1; i < descriptor.signature.length; i++) {
            const slot = descriptor.signature[i]!;
            if (slot instanceof InjectableMarker) continue;
            const key = `param${paramIndex}`;
            properties[key] = schemaToJSONSchema(slot as never);
            required.push(key);
            paramIndex++;
        }

        // description：document + 返回值 + 流式说明 + 无参说明
        const parts: string[] = [];
        const doc = descriptor.document;
        const docText =
            typeof doc === 'function' ? ((await doc(descriptor as never)) ?? '') : (doc ?? '');
        if (docText) parts.push(docText);

        const returnText = renderReturnSlot(descriptor.signature[0]);
        parts.push(`Returns:\n${returnText}\n\n`);

        if (isStream) {
            parts.push(
                '(Returns a stream of results; the host application consumes it incrementally and the LLM only receives the aggregated result.)',
            );
        }
        if (paramIndex === 0) parts.push('(This method takes no parameters.)');

        tools.push({
            type: 'function',
            function: {
                name: `${name.replaceAll(/\./g, '_')}`,
                description: parts.join('\n\n') || name,
                parameters: {
                    type: 'object',
                    properties,
                    required,
                    additionalProperties: false,
                },
            },
        });
    }

    return tools;
}

export async function invokeLlmTool(repository: Repository, call: LlmToolCall, injections: Injections): Promise<unknown> {
    const { name, arguments: args } = call;
    const args_len = Object.keys(args).length;
    const params: unknown[] = [];
    for (let i = 0; i < args_len; i++) {
        const key = `param${i}`;
        if (!(key in args)) throw new Error(`Missing tool argument: ${key}`);
        params.push(args[key]);
    }
    //
    const rpc_result = await repository.invoke(
        { jsonrpc: RPCVersion, method: name.replaceAll(/_/g, "."), params, id: `llm-${Date.now()}` },
        { injections }
    );

    const rpc_failure = rpc_result as unknown as RPCFailure;
    if ("error" in rpc_failure) {
        throw new Error(rpc_failure.error.code + ": " + rpc_failure.error.message);
    }

    const rpc_success = rpc_result as unknown as RPCSuccess;
    if ("result" in rpc_success) {
        return rpc_success.result;
    }
    // ############
    const rpc_stream_success = rpc_result as unknown as RPCStreamSuccess;
    if ("chunks" in rpc_stream_success) {
        return (async function* () {
            for await (const chunk of rpc_stream_success.chunks) {
                if ("error" in chunk) {
                    throw new Error(chunk.error.code + ": " + chunk.error.message);
                }
                const unpacked_chunk: Record<string, unknown> = {};
                if ("index" in chunk) {
                    unpacked_chunk.index = chunk.index;
                }
                if ("value" in chunk) {
                    unpacked_chunk.value = chunk.value;
                }
                yield unpacked_chunk;
            }
        })();
    }
}