import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRPC, type TransportKind } from './api/rpc';
import { useMethods } from './hooks/useMethods';
import { useMethodDetail } from './hooks/useMethodDetail';
import { useMetrics } from './hooks/useMetrics';
import { Toolbar } from './components/Toolbar';
import { MethodTree } from './components/MethodTree';
import { MethodDetail } from './components/MethodDetail';
import { TestPanel } from './components/TestPanel';
import { MetricsPanel } from './components/MetricsPanel';
import { compileGlobFilter, filterSnapshotMethods } from './api/glob';
import type { MetricsSnapshot } from './api/metrics';
import {
    collectApiDoc,
    downloadText,
    renderMarkdown,
} from './api/docGen';

const ENDPOINT = '';
type View = 'methods' | 'metrics';

export default function App() {
    const [transport, setTransport] = useState<TransportKind>('http');
    const [selected, setSelected] = useState('');
    const [generatingDocs, setGeneratingDocs] = useState(false);
    const [view, setView] = useState<View>('methods');
    const [methodFilter, setMethodFilter] = useState('');

    const rpc = useMemo(() => createRPC({ transport, endpoint: ENDPOINT }), [transport]);

    useEffect(() => () => rpc.close(), [rpc]);

    const { methods, loading, error, refresh } = useMethods(rpc);
    const detail = useMethodDetail(rpc, selected);
    const metrics = useMetrics(rpc, view === 'metrics');

    const compiledFilter = useMemo(() => compileGlobFilter(methodFilter), [methodFilter]);

    // 过滤后的快照：不改变拉取范围，只裁剪 methods。
    const filteredSnapshot = useMemo<MetricsSnapshot | undefined>(() => {
        if (!metrics.snapshot) return undefined;
        if (compiledFilter.passthrough) return metrics.snapshot;
        return {
            ...metrics.snapshot,
            methods: filterSnapshotMethods(compiledFilter, metrics.snapshot.methods) as MetricsSnapshot['methods'],
        };
    }, [metrics.snapshot, compiledFilter]);

    const generateDocs = useCallback(async () => {
        if (methods.length === 0) {
            alert('方法列表为空，请先刷新方法列表。');
            return;
        }
        setGeneratingDocs(true);
        try {
            const doc = await collectApiDoc(rpc, methods);
            const md = renderMarkdown(doc);
            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            downloadText(`jsonrpc-api-doc-${ts}.md`, md, 'text/markdown');
        } catch (e) {
            alert(`生成文档失败：${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setGeneratingDocs(false);
        }
    }, [rpc, methods]);

    return (
        <div className="app">
            <Toolbar
                transport={transport}
                onTransportChange={setTransport}
                onRefresh={refresh}
                loading={loading}
                error={error}
                onGenerateDocs={generateDocs}
                generatingDocs={generatingDocs}
            />
            <main>
                <aside className="sidebar">
                    <div className="view-switch segmented" role="group" aria-label="视图">
                        <button
                            type="button"
                            className={view === 'methods' ? 'active' : ''}
                            onClick={() => setView('methods')}
                        >
                            Methods
                        </button>
                        <button
                            type="button"
                            className={view === 'metrics' ? 'active' : ''}
                            onClick={() => setView('metrics')}
                        >
                            Metrics
                        </button>
                    </div>

                    {view === 'methods' ? (
                        <>
                            <h2>Methods</h2>
                            <MethodTree methods={methods} selected={selected} onSelect={setSelected} />
                        </>
                    ) : (
                        <div className="metrics-sidebar">
                            <h2>Metrics</h2>
                            <p className="hint" style={{ margin: '0 0 8px' }}>
                                📊 服务端 RPC 调用统计。
                            </p>
                            <label className="metrics-filter">
                                <span className="metrics-filter-label">Filter</span>
                                <input
                                    className="sf-input"
                                    type="text"
                                    placeholder="user.*, !system.*"
                                    value={methodFilter}
                                    onChange={(e) => setMethodFilter(e.target.value)}
                                    spellCheck={false}
                                />
                            </label>
                            <p className="hint metrics-filter-help">
                                支持 <code>*</code> / <code>?</code> / <code>!</code>，多个模式用 <code>,</code> 分隔。
                                <br />
                                例：<code>user.*</code>、<code>*.get</code>、<code>!system.*</code>、<code>user.*,!user.secret</code>
                            </p>
                            {metrics.snapshot && (
                                <p className="hint metrics-filter-stat">
                                    匹配 {Object.keys(filteredSnapshot?.methods ?? {}).length} /{' '}
                                    {Object.keys(metrics.snapshot.methods).length} 个方法
                                </p>
                            )}
                        </div>
                    )}
                </aside>
                <div className="content">
                    {view === 'methods' ? (
                        <>
                            <MethodDetail method={selected} detail={detail} />
                            <TestPanel
                                method={selected}
                                detail={detail}
                                rpc={rpc}
                                transport={transport}
                                endpoint={ENDPOINT}
                            />
                        </>
                    ) : (
                        <MetricsPanel
                            snapshot={filteredSnapshot}
                            previous={metrics.previous}
                            fetchedAt={metrics.fetchedAt}
                            loading={metrics.loading}
                            error={metrics.error}
                            available={metrics.available}
                            onRefresh={() => void metrics.refresh()}
                            autoRefresh={metrics.autoRefresh}
                            onAutoRefreshChange={metrics.setAutoRefresh}
                            intervalMs={metrics.intervalMs}
                            onIntervalChange={metrics.setIntervalMs}
                        />
                    )}
                </div>
            </main>
        </div>
    );
}