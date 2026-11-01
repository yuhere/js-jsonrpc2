import { useState } from 'react';
import type { SchemaDescription } from '../api/schema';
import { useT } from '../i18n/I18nProvider';

interface SchemaViewProps {
    schema: SchemaDescription;
    /** 顶层是否默认展开 */
    defaultOpen?: boolean;
    /** 缩进深度（内部递归使用） */
    depth?: number;
}

const KIND_COLORS: Record<string, string> = {
    string: 'var(--syn-string)',
    number: 'var(--syn-number)',
    boolean: 'var(--syn-boolean)',
    literal: 'var(--syn-literal)',
    array: 'var(--syn-container)',
    tuple: 'var(--syn-container)',
    object: 'var(--syn-object)',
    record: 'var(--syn-object)',
    union: 'var(--syn-union)',
    enum: 'var(--syn-union)',
    unknown: 'var(--syn-muted)',
    null: 'var(--syn-muted)',
    stream: 'var(--syn-container)',
    void: 'var(--syn-muted)',
};

function colorOf(kind: string): string {
    return KIND_COLORS[kind] ?? 'var(--fg)';
}

/** 把 constraints 渲染成紧凑的一行，如：min=1, max=10 */
function formatConstraints(constraints?: Record<string, unknown>): string {
    if (!constraints) return '';
    const entries = Object.entries(constraints).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '';
    return entries
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(', ');
}

function isSchemaDescription(v: unknown): v is SchemaDescription {
    return !!v && typeof v === 'object' && typeof (v as SchemaDescription).kind === 'string';
}

type SchemaAny = SchemaDescription & {
    element?: unknown;
    value?: unknown;
    properties?: unknown;
    options?: unknown;
    elements?: unknown;
    inner?: unknown;
    validate?: boolean;
};

interface NodeProps {
    schema: SchemaDescription;
    depth: number;
    defaultOpen: boolean;
    label?: string;
}

function hasChildNodes(schema: SchemaAny): boolean {
    switch (schema.kind) {
        case 'array':
            return isSchemaDescription(schema.element);
        case 'record':
            return isSchemaDescription(schema.value);
        case 'tuple':
            return Array.isArray(schema.elements) && schema.elements.some(isSchemaDescription);
        case 'union':
            return Array.isArray(schema.options) && schema.options.some(isSchemaDescription);
        case 'object':
            return (
                !!schema.properties &&
                typeof schema.properties === 'object' &&
                !Array.isArray(schema.properties) &&
                Object.values(schema.properties as Record<string, unknown>).some(isSchemaDescription)
            );
        case 'stream': {
            const inner = isSchemaDescription(schema.inner)
                ? schema.inner
                : undefined;
            return !!inner;
        }
        default:
            return false;
    }
}

function SchemaNode({ schema, depth, defaultOpen, label }: NodeProps) {
    const t = useT();
    const [open, setOpen] = useState(defaultOpen);
    const anySchema = schema as SchemaAny;
    const expandable = hasChildNodes(anySchema);
    const constraintsText = formatConstraints(schema.constraints);
    const validationOff = anySchema.validate === false;

    return (
        <div className="schema-node" style={{ paddingLeft: depth * 14 }}>
            <div
                className="schema-head"
                onClick={() => expandable && setOpen((o) => !o)}
            >
                {expandable ? (
                    <span className="schema-expander">{open ? '▾' : '▸'}</span>
                ) : (
                    <span className="schema-expander" />
                )}
                {label !== undefined && <span className="schema-label">{label}:</span>}
                <span className="schema-kind" style={{ color: colorOf(schema.kind) }}>
                    {schema.kind}
                </span>
                {schema.kind === 'stream' && (
                    <span className="schema-nullable">&lt;stream&gt;</span>
                )}
                {schema.nullable && (
                    <span className="schema-nullable-badge">nullable</span>
                )}
                {validationOff && (
                    <span className="schema-nullable-badge" title={t('schema.validationOff')}>
                        no-validate
                    </span>
                )}
                {constraintsText ? (
                    <span className="schema-constraints">{`{ ${constraintsText} }`}</span>
                ) : null}
                {schema.description ? (
                    <span className="schema-description">— {schema.description}</span>
                ) : null}
            </div>
            {expandable && open && (
                <div className="schema-children">{renderChildren(anySchema, depth + 1, t)}</div>
            )}
        </div>
    );
}

/**
 * 子节点渲染约定：
 * - array / record / stream：直接展开，不挂 element / value / inner 标签
 * - object：属性名作标签
 * - union：option[i]
 * - tuple：[i]
 */
function renderChildren(
    schema: SchemaAny,
    depth: number,
    t: (key: string, vars?: Record<string, string | number>) => string,
): React.ReactNode[] {
    const out: React.ReactNode[] = [];

    switch (schema.kind) {
        case 'array': {
            if (isSchemaDescription(schema.element)) {
                out.push(
                    <SchemaNode
                        key="element"
                        schema={schema.element}
                        depth={depth}
                        defaultOpen
                    />,
                );
            }
            break;
        }
        case 'record': {
            if (isSchemaDescription(schema.value)) {
                out.push(
                    <SchemaNode
                        key="value"
                        schema={schema.value}
                        depth={depth}
                        defaultOpen
                    />,
                );
            }
            break;
        }
        case 'tuple': {
            if (Array.isArray(schema.elements)) {
                schema.elements.forEach((item, i) => {
                    if (isSchemaDescription(item)) {
                        out.push(
                            <SchemaNode
                                key={`el-${i}`}
                                schema={item}
                                depth={depth}
                                defaultOpen
                                label={String(i)}
                            />,
                        );
                    }
                });
            }
            break;
        }
        case 'union': {
            if (Array.isArray(schema.options)) {
                schema.options.forEach((opt, i) => {
                    if (isSchemaDescription(opt)) {
                        out.push(
                            <SchemaNode
                                key={`opt-${i}`}
                                schema={opt}
                                depth={depth}
                                defaultOpen={false}
                                label={t('schema.optionIndex', { index: i })}
                            />,
                        );
                    }
                });
            }
            break;
        }
        case 'object': {
            const props = schema.properties;
            if (props && typeof props === 'object' && !Array.isArray(props)) {
                for (const [key, prop] of Object.entries(props as Record<string, unknown>)) {
                    if (isSchemaDescription(prop)) {
                        out.push(
                            <SchemaNode
                                key={`prop-${key}`}
                                schema={prop}
                                depth={depth}
                                defaultOpen
                                label={key}
                            />,
                        );
                    }
                }
            }
            break;
        }
        case 'stream': {
            const inner = isSchemaDescription(schema.inner)
                ? schema.inner
                : undefined;
            if (inner) {
                out.push(
                    <SchemaNode key="inner" schema={inner} depth={depth} defaultOpen />,
                );
            }
            break;
        }
        default:
            break;
    }

    return out;
}

export function SchemaView({ schema, defaultOpen = true, depth = 0 }: SchemaViewProps) {
    return <SchemaNode schema={schema} depth={depth} defaultOpen={defaultOpen} />;
}