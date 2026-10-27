import type { SchemaDescription } from './schema';

/** 判断是否为合法 schema 描述（kind 为字符串） */
export function isSchema(v: unknown): v is SchemaDescription {
    return !!v && typeof v === 'object' && typeof (v as SchemaDescription).kind === 'string';
}

/**
 * 根据 schema 生成一个合理的示例值。
 * - nullable 优先返回 null
 * - null 直接返回 null
 * - 原始类型返回零值（''、0、false）
 * - literal 返回固定值
 * - enum 返回第一个枚举值
 * - 容器类型递归展开
 * - unknown 返回 null
 */
export function sampleFromSchema(schema: SchemaDescription): unknown {
    if (schema.nullable) return null;
    const c = schema.children ?? {};
    switch (schema.kind) {
        case 'string':
            return '';
        case 'number':
            return 0;
        case 'boolean':
            return false;
        case 'null':
            return null;
        case 'literal':
            return schema.constraints?.value ?? null;
        case 'enum': {
            const values = schema.constraints?.values;
            return Array.isArray(values) && values.length > 0 ? values[0] : '';
        }
        case 'array': {
            const item = isSchema(c.items) ? sampleFromSchema(c.items) : null;
            return [item];
        }
        case 'tuple': {
            const items = Array.isArray(c.items) ? c.items : [];
            return items.map((it) => (isSchema(it) ? sampleFromSchema(it) : null));
        }
        case 'union': {
            const options = Array.isArray(c.options) ? c.options : [];
            return options.length > 0 && isSchema(options[0])
                ? sampleFromSchema(options[0] as SchemaDescription)
                : null;
        }
        case 'object': {
            const props = (c.properties ?? {}) as Record<string, unknown>;
            const out: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(props)) {
                if (isSchema(v)) out[k] = sampleFromSchema(v);
            }
            return out;
        }
        case 'record': {
            const val = isSchema(c.values) ? sampleFromSchema(c.values) : null;
            return { key: val };
        }
        default:
            return null;
    }
}

/** 是否用原生 input 编辑（否则走 JSON textarea / 递归容器） */
export function isScalarSchema(schema: SchemaDescription): boolean {
    if (schema.nullable) return true;
    switch (schema.kind) {
        case 'string':
        case 'number':
        case 'boolean':
        case 'enum':
        case 'literal':
            return true;
        default:
            return false;
    }
}