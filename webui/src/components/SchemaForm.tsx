import { useState } from 'react';
import type { SchemaDescription } from '../api/schema';
import { isSchema, sampleFromSchema } from '../api/paramForm';

// ─────────────────────────────────────────────────────────────
// 视觉常量
// ─────────────────────────────────────────────────────────────

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
    nullable: 'var(--syn-muted)',
    unknown: 'var(--syn-muted)',
};

function colorOf(kind: string): string {
    return KIND_COLORS[kind] ?? 'var(--fg)';
}

function formatConstraints(c?: Record<string, unknown>): string {
    if (!c) return '';
    return Object.entries(c)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(', ');
}

// ─────────────────────────────────────────────────────────────
// 顶层：一组参数
// ─────────────────────────────────────────────────────────────

export interface SchemaFormProps {
    /** signature[1..]，每个元素对应一个客户端参数 */
    params: SchemaDescription[];
    /** 与 params 等长的值数组 */
    values: unknown[];
    onChange: (index: number, value: unknown) => void;
    disabled?: boolean;
}

export function SchemaForm({ params, values, onChange, disabled }: SchemaFormProps) {
    if (params.length === 0) {
        return <p className="hint">此方法无需参数。</p>;
    }
    return (
        <div className="schema-form">
            {params.map((schema, i) => (
                <SchemaField
                    key={i}
                    schema={schema}
                    value={values[i]}
                    onChange={(v) => onChange(i, v)}
                    label={`参数 [${i}]`}
                    depth={0}
                    disabled={disabled}
                />
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 通用节点
// ─────────────────────────────────────────────────────────────

interface SchemaFieldProps {
    schema: SchemaDescription;
    value: unknown;
    onChange: (v: unknown) => void;
    label?: string;
    depth?: number;
    defaultOpen?: boolean;
    disabled?: boolean;
}

function SchemaField({
    schema,
    value,
    onChange,
    label,
    depth = 0,
    defaultOpen = true,
    disabled,
}: SchemaFieldProps) {
    const [open, setOpen] = useState(defaultOpen);
    const kind = schema.kind;

    // ── nullable 包装：标题 + 控制按钮同行，下面递归或显示 null ──
    if (kind === 'nullable') {
        const inner =
            schema.children && isSchema(schema.children.inner)
                ? schema.children.inner
                : undefined;
        if (!inner) {
            return (
                <UnknownLeaf
                    schema={schema}
                    value={value}
                    onChange={onChange}
                    label={label}
                    depth={depth}
                    disabled={disabled}
                />
            );
        }

        const isNull = value === null || value === undefined;
        return (
            <div className="sf-node sf-row" style={{ paddingLeft: depth * 14 }}>
                <div className="sf-head sf-head-inline">
                    {label !== undefined && <span className="sf-label">{label}</span>}
                    <span className="sf-kind" style={{ color: colorOf('nullable') }}>
                        nullable
                    </span>
                    {!isNull && (
                        <button
                            type="button"
                            className="tiny"
                            disabled={disabled}
                            onClick={() => onChange(null)}
                        >
                            置 null
                        </button>
                    )}
                    {isNull && (
                        <button
                            type="button"
                            className="tiny"
                            disabled={disabled}
                            onClick={() => onChange(sampleFromSchema(inner))}
                        >
                            填值
                        </button>
                    )}
                </div>
                <div className="sf-input-cell">
                    {isNull ? (
                        <span className="sf-null-indicator">null</span>
                    ) : (
                        <SchemaField
                            schema={inner}
                            value={value}
                            onChange={onChange}
                            depth={0}
                            disabled={disabled}
                            defaultOpen
                        />
                    )}
                </div>
            </div>
        );
    }

    // ── 标量叶子：标题与输入框同一行 ──
    if (isScalarKind(kind)) {
        return (
            <div className="sf-node sf-row" style={{ paddingLeft: depth * 14 }}>
                <div className="sf-head sf-head-inline">
                    {label !== undefined && <span className="sf-label">{label}</span>}
                    <span className="sf-kind" style={{ color: colorOf(kind) }}>
                        {kind}
                    </span>
                    {schema.description && (
                        <span className="sf-desc">— {schema.description}</span>
                    )}
                    <Constraints schema={schema} />
                </div>
                <div className="sf-input-cell">
                    <ScalarInput
                        schema={schema}
                        value={value}
                        onChange={onChange}
                        disabled={disabled}
                    />
                </div>
            </div>
        );
    }

    // ── union：标题 + 分支选择同行 ──
    if (kind === 'union') {
        const options = Array.isArray(schema.children?.options)
            ? (schema.children!.options as unknown[]).filter(isSchema)
            : [];
        return (
            <div className="sf-node sf-row" style={{ paddingLeft: depth * 14 }}>
                <div className="sf-head sf-head-inline">
                    {label !== undefined && <span className="sf-label">{label}</span>}
                    <span className="sf-kind" style={{ color: colorOf('union') }}>
                        union
                    </span>
                    {schema.description && (
                        <span className="sf-desc">— {schema.description}</span>
                    )}
                </div>
                <div className="sf-input-cell">
                    <UnionField
                        options={options}
                        value={value}
                        onChange={onChange}
                        depth={0}
                        disabled={disabled}
                    />
                </div>
            </div>
        );
    }

    // ── 容器：标题行（展开/收起）+ 展开的子内容 ──
    if (
        kind === 'array' ||
        kind === 'tuple' ||
        kind === 'object' ||
        kind === 'record'
    ) {
        return (
            <div className="sf-node" style={{ paddingLeft: depth * 14 }}>
                <div
                    className="sf-head sf-head-clickable"
                    onClick={() => setOpen((o) => !o)}
                >
                    <span className="sf-expander">{open ? '▾' : '▸'}</span>
                    {label !== undefined && <span className="sf-label">{label}</span>}
                    <span className="sf-kind" style={{ color: colorOf(kind) }}>
                        {kind}
                    </span>
                    {schema.description && (
                        <span className="sf-desc">— {schema.description}</span>
                    )}
                    <Constraints schema={schema} />
                </div>
                {open && (
                    <div className="sf-children">
                        <ContainerChildren
                            schema={schema}
                            value={value}
                            onChange={onChange}
                            depth={depth + 1}
                            disabled={disabled}
                        />
                    </div>
                )}
            </div>
        );
    }

    // ── unknown / 其他兜底 ──
    return (
        <UnknownLeaf
            schema={schema}
            value={value}
            onChange={onChange}
            label={label}
            depth={depth}
            disabled={disabled}
        />
    );
}

// ─────────────────────────────────────────────────────────────
// 标量控件
// ─────────────────────────────────────────────────────────────

function isScalarKind(kind: string): boolean {
    return (
        kind === 'string' ||
        kind === 'number' ||
        kind === 'boolean' ||
        kind === 'enum' ||
        kind === 'literal'
    );
}

function ScalarInput({
    schema,
    value,
    onChange,
    disabled,
}: {
    schema: SchemaDescription;
    value: unknown;
    onChange: (v: unknown) => void;
    disabled?: boolean;
}) {
    switch (schema.kind) {
        case 'boolean':
            return (
                <label className="sf-scalar">
                    <input
                        type="checkbox"
                        checked={Boolean(value)}
                        disabled={disabled}
                        onChange={(e) => onChange(e.target.checked)}
                    />
                    <span>{value ? 'true' : 'false'}</span>
                </label>
            );
        case 'number':
            return (
                <input
                    className="sf-input"
                    type="number"
                    disabled={disabled}
                    value={value == null ? '' : String(value)}
                    onChange={(e) =>
                        onChange(e.target.value === '' ? null : Number(e.target.value))
                    }
                />
            );
        case 'enum': {
            const values = Array.isArray(schema.constraints?.values)
                ? (schema.constraints!.values as string[])
                : [];
            return (
                <select
                    className="sf-input"
                    disabled={disabled}
                    value={value == null ? '' : String(value)}
                    onChange={(e) => onChange(e.target.value)}
                >
                    {values.map((v) => (
                        <option key={v} value={v}>
                            {v}
                        </option>
                    ))}
                </select>
            );
        }
        case 'literal':
            return (
                <div className="sf-scalar">
                    <code className="literal-value">
                        {JSON.stringify(schema.constraints?.value ?? null)}
                    </code>
                    <span className="hint">（固定值）</span>
                </div>
            );
        default:
            // string
            return (
                <input
                    className="sf-input"
                    type="text"
                    disabled={disabled}
                    value={value == null ? '' : String(value)}
                    onChange={(e) => onChange(e.target.value)}
                />
            );
    }
}

// ─────────────────────────────────────────────────────────────
// union 分支选择
// ─────────────────────────────────────────────────────────────

function UnionField({
    options,
    value,
    onChange,
    depth,
    disabled,
}: {
    options: SchemaDescription[];
    value: unknown;
    onChange: (v: unknown) => void;
    depth: number;
    disabled?: boolean;
}) {
    const [selected, setSelected] = useState(0);
    const active = options[selected];
    if (!active) {
        return <p className="hint">（union 无分支）</p>;
    }
    return (
        <div style={{ paddingLeft: depth * 14 }}>
            <div className="sf-union-picker">
                <select
                    className="sf-input"
                    disabled={disabled}
                    value={selected}
                    onChange={(e) => {
                        const i = Number(e.target.value);
                        setSelected(i);
                        const next = options[i];
                        if (next) onChange(sampleFromSchema(next));
                    }}
                >
                    {options.map((opt, i) => (
                        <option key={i} value={i}>
                            option[{i}] — {opt.kind}
                        </option>
                    ))}
                </select>
            </div>
            <SchemaField
                schema={active}
                value={value}
                onChange={onChange}
                depth={depth + 1}
                disabled={disabled}
                defaultOpen
            />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 容器子节点
// ─────────────────────────────────────────────────────────────

function ContainerChildren({
    schema,
    value,
    onChange,
    depth,
    disabled,
}: {
    schema: SchemaDescription;
    value: unknown;
    onChange: (v: unknown) => void;
    depth: number;
    disabled?: boolean;
}) {
    const c = schema.children ?? {};

    // array
    if (schema.kind === 'array') {
        const itemSchema = isSchema(c.items) ? c.items : undefined;
        if (!itemSchema) return <p className="hint">（数组无 item schema）</p>;
        const arr = Array.isArray(value) ? value : [];
        return (
            <div>
                {arr.map((item, i) => (
                    <div key={i} className="sf-array-item">
                        <SchemaField
                            schema={itemSchema}
                            value={item}
                            onChange={(v) => {
                                const next = arr.slice();
                                next[i] = v;
                                onChange(next);
                            }}
                            label={`[${i}]`}
                            depth={depth}
                            disabled={disabled}
                            defaultOpen={false}
                        />
                        <button
                            type="button"
                            className="tiny"
                            disabled={disabled}
                            onClick={() => onChange(arr.filter((_, j) => j !== i))}
                        >
                            删除
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    className="tiny"
                    disabled={disabled}
                    onClick={() => onChange([...arr, sampleFromSchema(itemSchema)])}
                >
                    + 添加项
                </button>
            </div>
        );
    }

    // tuple
    if (schema.kind === 'tuple') {
        const items = Array.isArray(c.items)
            ? (c.items as unknown[]).filter(isSchema)
            : [];
        const arr = Array.isArray(value) ? value : [];
        return (
            <div>
                {items.map((itemSchema, i) => (
                    <SchemaField
                        key={i}
                        schema={itemSchema}
                        value={arr[i]}
                        onChange={(v) => {
                            const next = arr.slice();
                            next[i] = v;
                            onChange(next);
                        }}
                        label={`[${i}]`}
                        depth={depth}
                        disabled={disabled}
                        defaultOpen={false}
                    />
                ))}
            </div>
        );
    }

    // object
    if (schema.kind === 'object') {
        const props = (c.properties ?? {}) as Record<string, unknown>;
        const obj =
            value && typeof value === 'object' && !Array.isArray(value)
                ? (value as Record<string, unknown>)
                : {};
        const strict = Boolean(schema.constraints?.strict);
        return (
            <div>
                {Object.entries(props).map(([key, prop]) => {
                    if (!isSchema(prop)) return null;
                    return (
                        <SchemaField
                            key={key}
                            schema={prop}
                            value={obj[key]}
                            onChange={(v) => {
                                const next = { ...obj };
                                if (v === undefined) delete next[key];
                                else next[key] = v;
                                onChange(next);
                            }}
                            label={key}
                            depth={depth}
                            disabled={disabled}
                            defaultOpen={false}
                        />
                    );
                })}
                {!strict && (
                    <p
                        className="hint"
                        style={{ paddingLeft: depth * 14, margin: '4px 0' }}
                    >
                        （非 strict 模式，允许额外字段）
                    </p>
                )}
            </div>
        );
    }

    // record
    if (schema.kind === 'record') {
        const valueSchema = isSchema(c.values) ? c.values : undefined;
        if (!valueSchema) return <p className="hint">（record 无 value schema）</p>;
        const obj =
            value && typeof value === 'object' && !Array.isArray(value)
                ? (value as Record<string, unknown>)
                : {};
        return (
            <div>
                {Object.entries(obj).map(([key, v]) => (
                    <div key={key} className="sf-record-item">
                        <SchemaField
                            schema={valueSchema}
                            value={v}
                            onChange={(nv) => onChange({ ...obj, [key]: nv })}
                            label={key}
                            depth={depth}
                            disabled={disabled}
                            defaultOpen={false}
                        />
                        <button
                            type="button"
                            className="tiny"
                            disabled={disabled}
                            onClick={() => {
                                const next = { ...obj };
                                delete next[key];
                                onChange(next);
                            }}
                        >
                            删除
                        </button>
                    </div>
                ))}
                <AddRecordKey
                    onAdd={(key, v) => onChange({ ...obj, [key]: v })}
                    sample={() => sampleFromSchema(valueSchema)}
                    disabled={disabled}
                />
            </div>
        );
    }

    return null;
}

function AddRecordKey({
    onAdd,
    sample,
    disabled,
}: {
    onAdd: (key: string, value: unknown) => void;
    sample: () => unknown;
    disabled?: boolean;
}) {
    const [key, setKey] = useState('');
    return (
        <div className="sf-record-add">
            <input
                className="sf-input"
                placeholder="新键名"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                disabled={disabled}
            />
            <button
                type="button"
                className="tiny"
                disabled={disabled || !key}
                onClick={() => {
                    onAdd(key, sample());
                    setKey('');
                }}
            >
                + 添加键
            </button>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// unknown：JSON textarea（标题 + textarea 同一行）
// ─────────────────────────────────────────────────────────────

function UnknownLeaf({
    schema,
    value,
    onChange,
    label,
    depth,
    disabled,
}: {
    schema: SchemaDescription;
    value: unknown;
    onChange: (v: unknown) => void;
    label?: string;
    depth: number;
    disabled?: boolean;
}) {
    const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2));
    const [error, setError] = useState<string | null>(null);

    const commit = (next: string) => {
        setText(next);
        try {
            const parsed = JSON.parse(next);
            setError(null);
            onChange(parsed);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };

    return (
        <div className="sf-node sf-row" style={{ paddingLeft: depth * 14 }}>
            <div className="sf-head sf-head-inline">
                {label !== undefined && <span className="sf-label">{label}</span>}
                <span className="sf-kind" style={{ color: colorOf(schema.kind) }}>
                    {schema.kind}
                </span>
                {schema.description && (
                    <span className="sf-desc">— {schema.description}</span>
                )}
            </div>
            <div className="sf-input-cell">
                <textarea
                    className="sf-textarea"
                    rows={3}
                    spellCheck={false}
                    value={text}
                    disabled={disabled}
                    onChange={(e) => commit(e.target.value)}
                />
                {error && <span className="error small">JSON 错误：{error}</span>}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 小工具
// ─────────────────────────────────────────────────────────────

function Constraints({ schema }: { schema: SchemaDescription }) {
    const text = formatConstraints(schema.constraints);
    return text ? <span className="sf-constraints">{`{ ${text} }`}</span> : null;
}