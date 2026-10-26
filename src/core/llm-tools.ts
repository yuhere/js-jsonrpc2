import type { Schema, SchemaDescription } from '../schema/json/primitives';
import { RPCError } from '../errors/RPCError';
import { METHOD_NOT_FOUND } from '../errors/codes';
import { assertAccessible } from './permission';
import type { Repository } from './Repository';
import { InjectableMarker } from "../schema/json";

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

export function schemaToJSONSchema(schema: Schema<unknown>): JSONSchema {
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
            out.type = value === null ? 'null' : typeof value;
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
            out.items = convert((desc.children as { items: SchemaDescription }).items);
            break;
        }
        case 'tuple': {
            out.type = 'array';
            const items = (desc.children as { items: SchemaDescription[] }).items;
            out.items = items.map(convert);
            out.minItems = items.length;
            out.maxItems = items.length;
            break;
        }
        case 'object': {
            out.type = 'object';
            const strict = Boolean((desc.constraints as { strict?: boolean }).strict);
            const props = (desc.children as { properties: Record<string, SchemaDescription> })
                .properties;
            out.properties = {};
            for (const [k, v] of Object.entries(props)) out.properties[k] = convert(v);
            if (strict) {
                out.required = Object.keys(props);
                out.additionalProperties = false;
            } else {
                out.additionalProperties = true;
            }
            break;
        }
        case 'record': {
            out.type = 'object';
            const c = (desc.constraints ?? {}) as { min?: number; max?: number };
            if (c.min !== undefined) out.minProperties = c.min;
            if (c.max !== undefined) out.maxProperties = c.max;
            out.additionalProperties = convert(
                (desc.children as { values: SchemaDescription }).values,
            );
            break;
        }
        case 'union': {
            const options = (desc.children as { options: SchemaDescription[] }).options;
            out.anyOf = options.map(convert);
            break;
        }
        case 'nullable': {
            const inner = convert((desc.children as { inner: SchemaDescription }).inner);
            if (typeof inner.type === 'string') {
                inner.type = [inner.type, 'null'];
            } else if (Array.isArray(inner.type)) {
                inner.type = [...inner.type, 'null'];
            } else {
                inner.nullable = true;
            }
            return inner;
        }
        case 'unknown': {
            out.type = ['object', 'array', 'string', 'number', 'boolean', 'null'];
            break;
        }
        default:
            throw new Error(`Unsupported schema kind for JSON Schema: ${desc.kind}`);
    }
    return out;
}

type Tools = Array<{
    type: 'function';
    function: { name: string; description: string; parameters: Record<string, unknown> };
}>;

export async function generateLlmTools(
    repository: Repository,
    permCheck: unknown,
    rawOptions: unknown,
): Promise<Tools> {
    const opts = (rawOptions ?? {}) as {
        includeStreaming?: boolean;
        namePrefix?: string;
        prefix?: string;
    };
    const { includeStreaming = false, namePrefix = '', prefix } = opts;

    const tools: Array<{
        type: 'function';
        function: { name: string; description: string; parameters: Record<string, unknown> };
    }> = [];

    for (const name of repository.list()) {
        if (prefix && !name.startsWith(prefix)) continue;
        const descriptor = repository.get(name);
        if (!descriptor) continue;

        // 权限过滤：不可见的方法直接跳过（与 listMethods 语义一致）
        try {
            await assertAccessible(descriptor, permCheck);
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

        // description：document + 流式说明 + 无参说明
        const parts: string[] = [];
        const doc = descriptor.document;
        const docText =
            typeof doc === 'function' ? ((await doc(descriptor as never)) ?? '') : (doc ?? '');
        if (docText) parts.push(docText);
        if (isStream) {
            parts.push(
                '(Returns a stream of results; the host application consumes it incrementally and the LLM only receives the aggregated result.)',
            );
        }
        if (paramIndex === 0) parts.push('(This method takes no parameters.)');

        tools.push({
            type: 'function',
            function: {
                name: `${namePrefix}${name}`,
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
