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
        .map(([k, v]) => `${k}=${typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v)}`)
        .join(', ');
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

interface NodeProps {
    schema: SchemaDescription;
    depth: number;
    defaultOpen: boolean;
    label?: string;
}

function SchemaNode({ schema, depth, defaultOpen, label }: NodeProps) {
    const t = useT();
    const [open, setOpen] = useState(defaultOpen);
    const hasChildren = hasChildNodes(schema);
    const constraintsText = formatConstraints(schema.constraints);

    return (
        <div className="schema-node" style={{ paddingLeft: depth * 14 }}>
            <div className="schema-head" onClick={() => hasChildren && setOpen((o) => !o)}>
                {hasChildren ? (
                    <span className="schema-expander">{open ? '▾' : '▸'}</span>
                ) : (
                    <span className="schema-expander" />
                )}
                {label !== undefined && <span className="schema-label">{label}:</span>}
                <span className="schema-kind" style={{ color: colorOf(schema.kind) }}>
                    {schema.kind}
                </span>
                {schema.kind === 'stream' && <span className="schema-nullable">&lt;stream&gt;</span>}
                {schema.nullable && <span className="schema-nullable-badge">nullable</span>}
                {constraintsText && <span className="schema-constraints">{`{ ${constraintsText} }`}</span>}
                {schema.description && (
                    <span className="schema-description" title={schema.description}>
                        {' '}
                        // {schema.description}
                    </span>
                )}
            </div>
            {open && hasChildren && (
                <div className="schema-children">{renderChildren(schema, depth + 1, t)}</div>
            )}
        </div>
    );
}

function isSchemaDescription(v: unknown): v is SchemaDescription {
    return !!v && typeof v === 'object' && typeof (v as SchemaDescription).kind === 'string';
}

/** 是否存在可展开的子节点（新结构 + stream 的兼容路径） */
function hasChildNodes(schema: SchemaDescription): boolean {
    switch (schema.kind) {
        case 'array':
            return isSchemaDescription((schema as { element?: unknown }).element);
        case 'record':
            return isSchemaDescription((schema as { value?: unknown }).value);
        case 'tuple': {
            const els = (schema as { elements?: unknown }).elements;
            return Array.isArray(els) && els.some(isSchemaDescription);
        }
        case 'union': {
            const opts = (schema as { options?: unknown }).options;
            return Array.isArray(opts) && opts.some(isSchemaDescription);
        }
        case 'object': {
            const props = (schema as { properties?: unknown }).properties;
            return !!props && typeof props === 'object' && !Array.isArray(props) && Object.keys(props).length > 0;
        }
        case 'stream': {
            // signatureOf 仍可能输出 { kind:'stream', children:{ inner } }
            const any = schema as { inner?: unknown; children?: { inner?: unknown } };
            return isSchemaDescription(any.inner) || isSchemaDescription(any.children?.inner);
        }
        default:
            return false;
    }
}

function renderChildren(
    schema: SchemaDescription,
    depth: number,
    t: Translate,
): React.ReactNode {
    const out: React.ReactNode[] = [];

    switch (schema.kind) {
        case 'array': {
            const element = (schema as { element?: unknown }).element;
            if (isSchemaDescription(element)) {
                out.push(
                    <SchemaNode
                        key="element"
                        schema={element}
                        depth={depth}
                        defaultOpen
                    />,
                );
            }
            break;
        }
        case 'record': {
            const value = (schema as { value?: unknown }).value;
            if (isSchemaDescription(value)) {
                out.push(
                    <SchemaNode
                        key="value"
                        schema={value}
                        depth={depth}
                        defaultOpen
                    />,
                );
            }
            break;
        }
        case 'tuple': {
            const elements = (schema as { elements?: unknown }).elements;
            if (Array.isArray(elements)) {
                elements.forEach((item, i) => {
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
            const options = (schema as { options?: unknown }).options;
            if (Array.isArray(options)) {
                options.forEach((opt, i) => {
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
            const props = (schema as { properties?: unknown }).properties;
            if (props && typeof props === 'object' && !Array.isArray(props)) {
                for (const [key, prop] of Object.entries(props)) {
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
            const any = schema as { inner?: unknown; children?: { inner?: unknown } };
            const inner = isSchemaDescription(any.inner)
                ? any.inner
                : isSchemaDescription(any.children?.inner)
                    ? any.children!.inner
                    : undefined;
            if (inner) {
                out.push(
                    <SchemaNode
                        key="inner"
                        schema={inner}
                        depth={depth}
                        defaultOpen
                    />,
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