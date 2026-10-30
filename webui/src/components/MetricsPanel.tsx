import { useMemo } from 'react';
import {
    deriveMethod,
    type MethodDerived,
    type MetricsSnapshot,
} from '../api/metrics';
import { useT } from '../i18n/I18nProvider';

interface MetricsPanelProps {
    snapshot: MetricsSnapshot | undefined;
    previous: { snapshot: MetricsSnapshot; fetchedAt: number } | undefined;
    fetchedAt: number | undefined;
    loading: boolean;
    error: string | null;
    available: boolean;
    onRefresh: () => void;
    autoRefresh: boolean;
    onAutoRefreshChange: (v: boolean) => void;
    intervalMs: number;
    onIntervalChange: (v: number) => void;
}

function formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return '—';
    if (seconds < 0.001) return `${(seconds * 1e6).toFixed(0)} µs`;
    if (seconds < 1) return `${(seconds * 1000).toFixed(1)} ms`;
    if (seconds < 60) return `${seconds.toFixed(2)} s`;
    return `${(seconds / 60).toFixed(1)} min`;
}

function formatRate(v: number | undefined): string {
    if (v === undefined) return '—';
    if (v >= 100) return v.toFixed(0);
    if (v >= 10) return v.toFixed(1);
    return v.toFixed(2);
}

function formatPercent(v: number): string {
    if (!Number.isFinite(v)) return '—';
    return `${(v * 100).toFixed(1)}%`;
}

function rateClass(v: number | undefined): string {
    if (v === undefined) return '';
    if (v > 100) return 'rate-hot';
    if (v > 10) return 'rate-warm';
    return 'rate-cold';
}

export function MetricsPanel({
    snapshot,
    previous,
    fetchedAt,
    loading,
    error,
    available,
    onRefresh,
    autoRefresh,
    onAutoRefreshChange,
    intervalMs,
    onIntervalChange,
}: MetricsPanelProps) {
    const t = useT();

    const derived = useMemo<MethodDerived[]>(() => {
        if (!snapshot) return [];
        const dtSeconds =
            previous && fetchedAt
                ? (fetchedAt - previous.fetchedAt) / 1000
                : undefined;
        const rows: MethodDerived[] = [];
        for (const [method, stats] of Object.entries(snapshot.methods)) {
            const prev = previous?.snapshot.methods[method];
            rows.push(deriveMethod(method, stats, prev, dtSeconds));
        }
        rows.sort((a, b) => b.stats.calls - a.stats.calls);
        return rows;
    }, [snapshot, previous, fetchedAt]);

    // 只按「是否产生过流式调用」分组；一旦 opened>0 即视为 stream method。
    const streamMethods = derived.filter((r) => r.stats.streams.opened > 0);
    const nonStreamMethods = derived.filter((r) => r.stats.streams.opened === 0);

    const totals = useMemo(() => {
        if (!snapshot) return { calls: 0, errors: 0, methods: 0, streams: 0 };
        let calls = 0;
        let errors = 0;
        let streams = 0;
        for (const s of Object.values(snapshot.methods)) {
            calls += s.calls;
            errors += Object.values(s.errorsByCode).reduce((a, b) => a + b, 0);
            streams += s.streams.opened;
        }
        return { calls, errors, methods: Object.keys(snapshot.methods).length, streams };
    }, [snapshot]);

    if (!available) {
        return (
            <section className="metrics">
                <h2>{t('metrics.title')}</h2>
                <p className="hint">{t('metrics.unavailable')}</p>
            </section>
        );
    }

    return (
        <section className="metrics">
            <header className="metrics-header">
                <h2>{t('metrics.title')}</h2>
                <div className="metrics-controls">
                    <label className="metrics-auto">
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={(e) => onAutoRefreshChange(e.target.checked)}
                        />
                        {t('metrics.autoRefresh')}
                    </label>
                    <select
                        className="sf-input"
                        value={intervalMs}
                        onChange={(e) => onIntervalChange(Number(e.target.value))}
                        disabled={!autoRefresh}
                        title={t('metrics.interval')}
                    >
                        <option value={1000}>1s</option>
                        <option value={3000}>3s</option>
                        <option value={5000}>5s</option>
                        <option value={10000}>10s</option>
                    </select>
                    <button onClick={onRefresh} disabled={loading}>
                        {loading ? t('metrics.refreshing') : t('metrics.refreshNow')}
                    </button>
                    {snapshot && (
                        <span className="hint">
                            {t('metrics.uptime')} {formatDuration(snapshot.uptimeMs / 1000)}
                        </span>
                    )}
                </div>
            </header>

            {error && <p className="error">{error}</p>}
            {!snapshot && !error && <p className="hint">{t('metrics.loading')}</p>}

            {snapshot && (
                <>
                    <div className="metrics-cards">
                        <MetricCard label={t('metrics.methods')} value={String(totals.methods)} />
                        <MetricCard label={t('metrics.calls')} value={String(totals.calls)} />
                        <MetricCard label={t('metrics.streams')} value={String(totals.streams)} />
                        <MetricCard
                            label={t('metrics.errors')}
                            value={String(totals.errors)}
                            tone={totals.errors > 0 ? 'danger' : undefined}
                        />
                        <MetricCard
                            label={t('metrics.errorRate')}
                            value={totals.calls > 0 ? formatPercent(totals.errors / totals.calls) : '—'}
                            tone={totals.calls > 0 && totals.errors / totals.calls > 0.05 ? 'danger' : undefined}
                        />
                        <MetricCard
                            label={t('metrics.invalidRequests')}
                            value={String(snapshot.invalidRequests)}
                            tone={snapshot.invalidRequests > 0 ? 'warn' : undefined}
                        />
                    </div>

                    <h3>
                        {t('metrics.nonStreamTitle')}
                        <span className="hint"> {t('metrics.countHint', { count: nonStreamMethods.length })}</span>
                    </h3>
                    {nonStreamMethods.length === 0 ? (
                        <p className="hint">{t('metrics.noData')}</p>
                    ) : (
                        <NonStreamTable rows={nonStreamMethods} />
                    )}

                    <h3>
                        {t('metrics.streamTitle')}
                        <span className="hint"> {t('metrics.countHint', { count: streamMethods.length })}</span>
                    </h3>
                    {streamMethods.length === 0 ? (
                        <p className="hint">{t('metrics.noStreams')}</p>
                    ) : (
                        <StreamTable rows={streamMethods} />
                    )}
                </>
            )}
        </section>
    );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'warn' }) {
    return (
        <div className={`metric-card${tone ? ` metric-card-${tone}` : ''}`}>
            <div className="metric-card-label">{label}</div>
            <div className="metric-card-value">{value}</div>
        </div>
    );
}

function NonStreamTable({ rows }: { rows: MethodDerived[] }) {
    const t = useT();
    return (
        <table className="metrics-table">
            <thead>
                <tr>
                    <th>{t('metrics.colMethod')}</th>
                    <th className="num">{t('metrics.colCalls')}</th>
                    <th className="num">{t('metrics.colRate')}</th>
                    <th className="num">{t('metrics.colErrors')}</th>
                    <th className="num">{t('metrics.colErrPct')}</th>
                    <th className="num">{t('metrics.colP50')}</th>
                    <th className="num">{t('metrics.colP95')}</th>
                    <th className="num">{t('metrics.colP99')}</th>
                    <th className="num">{t('metrics.colAvg')}</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((r) => {
                    const errorCount = Object.values(r.stats.errorsByCode).reduce((a, b) => a + b, 0);
                    const avg =
                        r.stats.duration.count > 0
                            ? r.stats.duration.sum / r.stats.duration.count
                            : 0;
                    return (
                        <tr key={r.method}>
                            <td className="method-name" title={r.method}>{r.method}</td>
                            <td className="num">{r.stats.calls}</td>
                            <td className={`num ${rateClass(r.callsPerSecond)}`}>{formatRate(r.callsPerSecond)}</td>
                            <td className={`num${errorCount > 0 ? ' error' : ''}`}>{errorCount}</td>
                            <td className={`num${r.errorRate > 0.05 ? ' error' : ''}`}>{formatPercent(r.errorRate)}</td>
                            <td className="num">{formatDuration(r.p50)}</td>
                            <td className="num">{formatDuration(r.p95)}</td>
                            <td className="num">{formatDuration(r.p99)}</td>
                            <td className="num">{formatDuration(avg)}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

function StreamTable({ rows }: { rows: MethodDerived[] }) {
    const t = useT();
    return (
        <table className="metrics-table">
            <thead>
                <tr>
                    <th>{t('metrics.colMethod')}</th>
                    <th className="num">{t('metrics.colOpened')}</th>
                    <th className="num">{t('metrics.colCompleted')}</th>
                    <th className="num">{t('metrics.colFailed')}</th>
                    <th className="num">{t('metrics.colAborted')}</th>
                    <th className="num">{t('metrics.colCompletePct')}</th>
                    <th className="num">{t('metrics.colAbortPct')}</th>
                    <th className="num">{t('metrics.colAvgChunks')}</th>
                    <th className="num">{t('metrics.colTtfbP50')}</th>
                    <th className="num">{t('metrics.colTtfbP95')}</th>
                    <th className="num">{t('metrics.colDurationAvg')}</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((r) => (
                    <tr key={r.method}>
                        <td className="method-name" title={r.method}>{r.method}</td>
                        <td className="num">{r.stats.streams.opened}</td>
                        <td className="num">{r.stats.streams.completed}</td>
                        <td className={`num${r.stats.streams.failed > 0 ? ' error' : ''}`}>
                            {r.stats.streams.failed}
                        </td>
                        <td className={`num${r.stats.streams.aborted > 0 ? ' warn' : ''}`}>
                            {r.stats.streams.aborted}
                        </td>
                        <td className="num">{formatPercent(r.streamCompletionRate)}</td>
                        <td className="num">{formatPercent(r.streamAbortRate)}</td>
                        <td className="num">{r.avgChunksPerStream.toFixed(1)}</td>
                        <td className="num">{formatDuration(r.ttfbP50)}</td>
                        <td className="num">{formatDuration(r.ttfbP95)}</td>
                        <td className="num">
                            {formatDuration(
                                r.stats.streamDuration.count > 0
                                    ? r.stats.streamDuration.sum / r.stats.streamDuration.count
                                    : 0,
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}