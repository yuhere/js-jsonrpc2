import { useEffect, useMemo, useRef, useState } from 'react';
import { RPCError, isStreamResult, type RpcClient, type TransportKind } from '../api/rpc';
import type { MethodDetail } from '../hooks/useMethodDetail';
import { SchemaForm } from './SchemaForm';
import { sampleFromSchema } from '../api/paramForm';
import { absoluteEndpoint } from '../api/httpTransport';

interface TestPanelProps {
    method: string;
    detail: MethodDetail;
    rpc: RpcClient;
    transport: TransportKind;
    endpoint: string;
}

type CopyKind = 'curl' | 'fetch';

const COPY_OPTIONS: { value: CopyKind; label: string }[] = [
    { value: 'curl', label: '复制 curl' },
    { value: 'fetch', label: '复制 fetch' },
];

/** 格式化耗时：<1s 用 ms，否则用 s */
function formatElapsed(ms: number): string {
    if (ms < 1000) return `${ms.toFixed(0)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
}

export function TestPanel({
    method,
    detail,
    rpc,
    transport,
    endpoint,
}: TestPanelProps) {
    const paramSchemas = useMemo(() => detail.signature.slice(1), [detail.signature]);
    const isStreamReturn = detail.signature[0]?.kind === 'stream';

    const [values, setValues] = useState<unknown[]>([]);
    const [output, setOutput] = useState('');
    const [elapsed, setElapsed] = useState<{ total: number; firstFrame?: number } | null>(null);
    const [running, setRunning] = useState(false);
    const [copyKind, setCopyKind] = useState<CopyKind>('curl');
    const [copied, setCopied] = useState(false);
    const [copyError, setCopyError] = useState<string | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const outRef = useRef<HTMLPreElement>(null);

    useEffect(() => {
        if (!method) return;
        setValues(paramSchemas.map(sampleFromSchema));
        setOutput('');
        setElapsed(null);
    }, [method, paramSchemas]);

    useEffect(() => {
        setCopied(false);
        setCopyError(null);
        setMenuOpen(false);
    }, [method]);

    // 点击外部关闭菜单
    useEffect(() => {
        if (!menuOpen) return;
        const onDocClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [menuOpen]);

    const setValue = (i: number, v: unknown) => {
        setValues((prev) => {
            const next = prev.slice();
            next[i] = v;
            return next;
        });
    };

    const execute = async () => {
        if (!method) return;
        setRunning(true);
        setOutput('');
        setElapsed(null);

        const startedAt = performance.now();
        try {
            const result = await rpc.call(method, ...values);

            // 首帧/响应到达耗时
            const firstFrameAt = performance.now() - startedAt;

            if (isStreamResult(result)) {
                let idx = 0;
                const lines: string[] = [];

                // 每帧记录到达时间
                for await (const value of result) {
                    const now = performance.now() - startedAt;
                    lines.push(
                        `[${idx}] (+${formatElapsed(now)}) ${JSON.stringify(value, null, 2)}`,
                    );
                    idx++;
                    setOutput(lines.join('\n'));
                }

                const totalAt = performance.now() - startedAt;
                if (idx === 0) {
                    lines.push(`（流已结束，无数据，总耗时 ${formatElapsed(totalAt)}）`);
                } else {
                    lines.push(`（流已结束，共 ${idx} 帧，总耗时 ${formatElapsed(totalAt)}）`);
                }
                setOutput(lines.join('\n'));
                setElapsed({ total: totalAt, firstFrame: firstFrameAt });
            } else {
                const totalAt = performance.now() - startedAt;
                setOutput(JSON.stringify(result, null, 2));
                setElapsed({ total: totalAt });
            }
        } catch (e) {
            const totalAt = performance.now() - startedAt;
            setOutput(formatError(e));
            setElapsed({ total: totalAt });
        } finally {
            setRunning(false);
            requestAnimationFrame(() =>
                outRef.current?.scrollIntoView({ block: 'nearest' }),
            );
        }
    };

    const copyAs = async (kind: CopyKind) => {
        if (!method) return;
        setCopyError(null);
        let code: string;
        try {
            const body = {
                jsonrpc: '2.0' as const,
                method,
                params: values,
                id: 1,
            };
            const url = absoluteEndpoint(endpoint);
            code = kind === 'curl' ? buildCurl(url, body) : buildFetch(url, body);
        } catch (e) {
            setCopyError(e instanceof Error ? e.message : String(e));
            return;
        }
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (e) {
            setCopyError(
                `复制失败：${e instanceof Error ? e.message : String(e)}`,
            );
        }
    };

    const canCopy = transport === 'http';
    const currentLabel =
        COPY_OPTIONS.find((o) => o.value === copyKind)?.label ?? '复制';

    return (
        <section className="test">
            <h3>
                参数{' '}
                <span className="hint">
                    （{paramSchemas.length} 个，按签名自动生成）
                </span>
            </h3>

            <SchemaForm
                params={paramSchemas}
                values={values}
                onChange={setValue}
                disabled={running}
            />

            <div className="actions">
                <button onClick={execute} disabled={!method || running}>
                    {running ? (isStreamReturn ? '接收中…' : '执行中…') : (isStreamReturn ? '执行并接收流 ▶' : '执行 ▶')}
                </button>

                <div className="split-button" ref={menuRef}>
                    <button
                        type="button"
                        className="split-button-main"
                        onClick={() => void copyAs(copyKind)}
                        disabled={!method || !canCopy}
                        title={canCopy ? '复制当前调用的等价代码' : '仅 HTTP 传输可生成代码'}
                    >
                        {copied ? '已复制 ✓' : currentLabel}
                    </button>
                    <button
                        type="button"
                        className="split-button-caret"
                        onClick={() => setMenuOpen((o) => !o)}
                        disabled={!method || !canCopy}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        title="选择复制格式"
                    >
                        ▾
                    </button>
                    {menuOpen && (
                        <ul className="split-button-menu" role="menu">
                            {COPY_OPTIONS.map((opt) => (
                                <li
                                    key={opt.value}
                                    role="menuitem"
                                    onClick={() => {
                                        setCopyKind(opt.value);
                                        setMenuOpen(false);
                                        void copyAs(opt.value);
                                    }}
                                >
                                    {opt.label}
                                    {copyKind === opt.value && (
                                        <span className="check">✓</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {copyError && <span className="error small">{copyError}</span>}

                <button
                    onClick={() => setValues(paramSchemas.map(sampleFromSchema))}
                    disabled={!method}
                >
                    重置为示例
                </button>
                <button
                    onClick={() => {
                        setOutput('');
                        setElapsed(null);
                    }}
                    disabled={!output && !elapsed}
                >
                    清空输出
                </button>
            </div>

            <h3>
                结果{isStreamReturn && <span className="hint">（流式）</span>}
                {elapsed && (
                    <span className="elapsed-badge">
                        {' '}⏱ {formatElapsed(elapsed.total)}
                        {elapsed.firstFrame !== undefined && (
                            <span className="hint">
                                {' '}· 首帧 {formatElapsed(elapsed.firstFrame)}
                            </span>
                        )}
                    </span>
                )}
            </h3>
            <pre className="output" ref={outRef}>
                {output || '（尚未执行）'}
            </pre>
        </section>
    );
}

// ─────────────────────────────────────────────────────────────
// 代码片段生成
// ─────────────────────────────────────────────────────────────

interface RpcBody {
    jsonrpc: '2.0';
    method: string;
    params: unknown[];
    id: number;
}

function buildCurl(url: string, body: RpcBody): string {
    const bodyText = JSON.stringify(body, null, 2);
    const quotedBody = `'${bodyText.replace(/'/g, `'\\''`)}'`;
    return [
        `curl -X POST '${url}'`,
        `  -H 'Content-Type: application/json'`,
        `  -d ${quotedBody}`,
    ].join(' \\\n');
}

function buildFetch(url: string, body: RpcBody): string {
    const bodyText = JSON.stringify(body, null, 2);
    const indented = bodyText
        .split('\n')
        .map((line, i) => (i === 0 ? line : '    ' + line))
        .join('\n');
    return [
        'await fetch(' + JSON.stringify(url) + ', {',
        `  method: 'POST',`,
        `  headers: { 'Content-Type': 'application/json' },`,
        '  body: JSON.stringify(',
        '    ' + indented.split('\n').join('\n    '),
        '  ),',
        '});',
    ].join('\n');
}

function formatError(e: unknown): string {
    if (e instanceof RPCError) {
        const { code, message, data } = e.payload;
        const lines = [`Error ${code}: ${message}`];
        if (data !== undefined) {
            lines.push('');
            lines.push('data:');
            lines.push(
                typeof data === 'string' ? data : JSON.stringify(data, null, 2),
            );
        }
        return lines.join('\n');
    }
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
}