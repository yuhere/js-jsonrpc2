import type { RPCClient } from './rpc';
import type { SchemaDescription } from './schema';

export interface MethodDoc {
    name: string;
    help: string;
    signature: SchemaDescription[];
    error?: string;
}

export interface ApiDoc {
    generatedAt: string;
    methods: MethodDoc[];
}

function isSchema(v: unknown): v is SchemaDescription {
    return !!v && typeof v === 'object' && typeof (v as SchemaDescription).kind === 'string';
}

/** 逐个方法拉取 help + signature */
export async function collectApiDoc(
    rpc: RPCClient,
    methods: string[],
    onProgress?: (done: number, total: number) => void,
): Promise<ApiDoc> {
    const out: MethodDoc[] = [];
    for (let i = 0; i < methods.length; i++) {
        const name = methods[i];
        try {
            const [help, sig] = await Promise.all([
                rpc.call<string>('system.methodHelp', name).catch(() => ''),
                rpc.call<unknown[]>('system.methodSignature', name).catch(() => []),
            ]);
            out.push({
                name,
                help: typeof help === 'string' ? help : '',
                signature: Array.isArray(sig) ? sig.filter(isSchema) : [],
            });
        } catch (e) {
            out.push({
                name,
                help: '',
                signature: [],
                error: e instanceof Error ? e.message : String(e),
            });
        }
        onProgress?.(i + 1, methods.length);
    }
    return { generatedAt: new Date().toISOString(), methods: out };
}

// ─────────────────────────────────────────────────────────────
// Markdown 渲染
// ─────────────────────────────────────────────────────────────

function renderSchema(schema: SchemaDescription): string {
    // 简单的单行描述：kind + constraints + nullable
    let s = schema.kind;
    if (schema.nullable) s += ' | null';
    const c = schema.constraints;
    if (c && Object.keys(c).length > 0) {
        const parts = Object.entries(c)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
        if (parts.length) s += ` { ${parts.join(', ')} }`;
    }
    return s;
}

function renderSchemaTree(schema: SchemaDescription, indent = 0): string[] {
    const pad = '  '.repeat(indent);
    const lines: string[] = [];
    let head = `${pad}- \`${schema.kind}\``;
    if (schema.nullable) head += ' _(nullable)_';
    if (schema.description) head += ` — ${schema.description}`;
    const c = schema.constraints;
    if (c && Object.keys(c).length > 0) {
        const parts = Object.entries(c)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
        if (parts.length) head += ` \`{ ${parts.join(', ')} }\``;
    }
    lines.push(head);

    const ch = schema.children ?? {};
    const pushChild = (label: string, child: SchemaDescription) => {
        const sub = renderSchemaTree(child, indent + 1);
        if (sub.length) {
            sub[0] = `${'  '.repeat(indent + 1)}- **${label}**: ${sub[0].trim().replace(/^- /, '')}`;
            lines.push(...sub);
        }
    };

    if (isSchema(ch.inner)) pushChild('inner', ch.inner);
    if (Array.isArray(ch.items)) {
        (ch.items as unknown[]).forEach((it, i) => {
            if (isSchema(it)) pushChild(`[${i}]`, it);
        });
    } else if (isSchema(ch.items)) {
        pushChild('items', ch.items);
    }
    if (Array.isArray(ch.options)) {
        (ch.options as unknown[]).forEach((opt, i) => {
            if (isSchema(opt)) pushChild(`option[${i}]`, opt);
        });
    }
    if (ch.properties && typeof ch.properties === 'object') {
        for (const [k, v] of Object.entries(ch.properties)) {
            if (isSchema(v)) pushChild(k, v);
        }
    }
    if (isSchema(ch.values)) pushChild('values', ch.values);

    return lines;
}

export function renderMarkdown(doc: ApiDoc): string {
    const lines: string[] = [];
    lines.push('# JSON-RPC API 文档');
    lines.push('');
    lines.push(`> 生成时间：${doc.generatedAt}`);
    lines.push(`> 方法总数：${doc.methods.length}`);
    lines.push('');
    lines.push('## 目录');
    lines.push('');
    for (const m of doc.methods) {
        const anchor = m.name.toLowerCase().replace(/[^\w]+/g, '-');
        lines.push(`- [\`${m.name}\`](#${anchor})`);
    }
    lines.push('');

    for (const m of doc.methods) {
        lines.push(`## \`${m.name}\``);
        lines.push('');
        if (m.error) {
            lines.push(`> ⚠️ 获取失败：${m.error}`);
            lines.push('');
            continue;
        }
        lines.push('**帮助**');
        lines.push('');
        lines.push(m.help ? m.help : '_（无帮助信息）_');
        lines.push('');

        if (m.signature.length === 0) {
            lines.push('**签名**：_（无）_');
            lines.push('');
            continue;
        }

        const [ret, ...params] = m.signature;
        lines.push('**返回类型**');
        lines.push('');
        lines.push(...renderSchemaTree(ret, 0));
        lines.push('');
        lines.push(`**参数**（${params.length} 个）`);
        lines.push('');
        if (params.length === 0) {
            lines.push('_（无参数）_');
        } else {
            params.forEach((p, i) => {
                const sub = renderSchemaTree(p, 0);
                if (sub.length) {
                    sub[0] = `- **参数 [${i}]**: ${sub[0].trim().replace(/^- /, '')}`;
                    lines.push(...sub);
                }
            });
        }
        lines.push('');
        lines.push('---');
        lines.push('');
    }

    return lines.join('\n');
}

/** 触发浏览器下载 */
export function downloadText(filename: string, text: string, mime = 'text/plain') {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}