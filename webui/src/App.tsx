import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRPC, type TransportKind } from './client';
import { useMethods } from './hooks/useMethods';
import { useMethodDetail } from './hooks/useMethodDetail';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { useMetrics } from './hooks/useMetrics';
import { Toolbar } from './components/Toolbar';
import { MethodTree } from './components/MethodTree';
import { MethodDetail } from './components/MethodDetail';
import { TestPanel } from './components/TestPanel';
import { MetricsPanel } from './components/MetricsPanel';
import { Footer } from './components/Footer';
import { compileFuzzyQuery, filterFuzzyMethods, filterFuzzySnapshotMethods } from './utils/fuzzy';
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
    const [methodSearch, setMethodSearch] = useState('');
    const [metricsSearch, setMetricsSearch] = useState('');

    const debouncedMethodSearch = useDebouncedValue(methodSearch, 250);
    const debouncedMetricsSearch = useDebouncedValue(metricsSearch, 250);
    const methodPending = methodSearch !== debouncedMethodSearch;
    const metricsPending = metricsSearch !== debouncedMetricsSearch;


    const rpc = useMemo(() => createRPC({ transport, endpoint: ENDPOINT }), [transport]);

    useEffect(() => () => rpc.close(), [rpc]);

    const { methods, loading, error, refresh } = useMethods(rpc);
    const detail = useMethodDetail(rpc, selected);
    const metrics = useMetrics(rpc, view === 'metrics');

    const methodQuery = useMemo(() => compileFuzzyQuery(debouncedMethodSearch), [debouncedMethodSearch]);
    const metricsQuery = useMemo(() => compileFuzzyQuery(debouncedMetricsSearch), [debouncedMetricsSearch]);

    const filteredMethods = useMemo(
        () => filterFuzzyMethods(methodQuery, methods),
        [methodQuery, methods],
    );

    // 过滤后的快照：不改变拉取范围，只裁剪 methods。
    const filteredMetrics = useMemo<MetricsSnapshot | undefined>(() => {
        if (!metrics.snapshot) return undefined;
        if (metricsQuery.passthrough) return metrics.snapshot;
        return {
            ...metrics.snapshot,
            methods: filterFuzzySnapshotMethods(metricsQuery, metrics.snapshot.methods),
        };
    }, [metrics.snapshot, metricsQuery]);

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
                        <div className="metrics-sidebar">
                            <h2>Methods</h2>
                            <label className="metrics-filter">
                                <span className="metrics-filter-label">Search</span>
                                <input
                                    className="sf-input"
                                    type="text"
                                    placeholder="输入关键词，空格分隔"
                                    value={methodSearch}
                                    onChange={(e) => setMethodSearch(e.target.value)}
                                    spellCheck={false}
                                />
                            </label>
                            {!methodQuery.passthrough && (
                                <p className="hint metrics-filter-stat">
                                    匹配 {filteredMethods.length} / {methods.length} 个方法
                                </p>
                            )}
                            {filteredMethods.length === 0 && methods.length > 0 ? (
                                <p className="empty">没有匹配的方法。</p>
                            ) : (
                                <MethodTree
                                    methods={filteredMethods}
                                    selected={selected}
                                    onSelect={setSelected}
                                />
                            )}
                        </div>
                    ) : (
                        <div className="metrics-sidebar">
                            <h2>Metrics</h2>
                            <label className="metrics-filter">
                                <span className="metrics-filter-label">Search</span>
                                <input
                                    className="sf-input"
                                    type="text"
                                    placeholder="输入关键词，空格分隔"
                                    value={metricsSearch}
                                    onChange={(e) => setMetricsSearch(e.target.value)}
                                    spellCheck={false}
                                />
                            </label>
                            {metrics.snapshot && !metricsQuery.passthrough && (
                                <p className="hint metrics-filter-stat">
                                    匹配 {Object.keys(filteredMetrics?.methods ?? {}).length} /{' '}
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
                            snapshot={filteredMetrics}
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
            <Footer />
        </div>
    );
}