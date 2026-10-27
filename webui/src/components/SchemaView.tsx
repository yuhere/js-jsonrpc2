import { useState } from 'react';
import type { SchemaDescription } from '../api/schema';

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

interface NodeProps {
    schema: SchemaDescription;
    depth: number;
    defaultOpen: boolean;
    label?: string;
}

function SchemaNode({ schema, depth, defaultOpen, label }: NodeProps) {
    const [open, setOpen] = useState(defaultOpen);
    const hasChildren = schema.children && Object.keys(schema.children).length > 0;
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
                <div className="schema-children">{renderChildren(schema, depth + 1)}</div>
            )}
        </div>
    );
}

function renderChildren(schema: SchemaDescription, depth: number): React.ReactNode {
    const c = schema.children ?? {};
    const out: React.ReactNode[] = [];

    // stream 包装器
    if (c.inner && isSchemaDescription(c.inner)) {
        out.push(<SchemaNode key="inner" schema={c.inner} depth={depth} defaultOpen />);
    }

    // array / tuple
    if (Array.isArray(c.items)) {
        (c.items as unknown[]).forEach((item, i) => {
            if (isSchemaDescription(item)) {
                out.push(
                    <SchemaNode
                        key={`item-${i}`}
                        schema={item}
                        depth={depth}
                        defaultOpen
                        label={String(i)}
                    />
                );
            }
        });
    } else if (c.items && isSchemaDescription(c.items)) {
        out.push(<SchemaNode key="items" schema={c.items} depth={depth} defaultOpen label="items" />);
    }

    // union
    if (Array.isArray(c.options)) {
        (c.options as unknown[]).forEach((opt, i) => {
            if (isSchemaDescription(opt)) {
                out.push(
                    <SchemaNode
                        key={`opt-${i}`}
                        schema={opt}
                        depth={depth}
                        defaultOpen={false}
                        label={`option[${i}]`}
                    />
                );
            }
        });
    }

    // object
    if (c.properties && typeof c.properties === 'object' && !Array.isArray(c.properties)) {
        for (const [key, prop] of Object.entries(c.properties)) {
            if (isSchemaDescription(prop)) {
                out.push(<SchemaNode key={`prop-${key}`} schema={prop} depth={depth} defaultOpen label={key} />);
            }
        }
    }

    // record
    if (c.values && isSchemaDescription(c.values)) {
        out.push(<SchemaNode key="values" schema={c.values} depth={depth} defaultOpen label="values" />);
    }

    return out;
}

function isSchemaDescription(v: unknown): v is SchemaDescription {
    return !!v && typeof v === 'object' && typeof (v as SchemaDescription).kind === 'string';
}

export function SchemaView({ schema, defaultOpen = true, depth = 0 }: SchemaViewProps) {
    return <SchemaNode schema={schema} depth={depth} defaultOpen={defaultOpen} />;
}