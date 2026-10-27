import type { RpcClient } from './rpc';

// ─── 与后端 memory.ts 对齐的类型（只读快照） ─────────────────

export interface HistogramSnapshot {
    count: number;
    sum: number;
    min: number;
    max: number;
    buckets: Array<{ le: number; count: number }>;
}

export interface StreamStats {
    opened: number;
    completed: number;
    failed: number;
    failedByPhase: Record<string, number>;
    aborted: number;
}

export interface MethodStats {
    calls: number;
    callsByStatus: Record<string, number>;
    errorsByCode: Record<string, number>;
    duration: HistogramSnapshot;
    streams: StreamStats;
    streamDuration: HistogramSnapshot;
    streamTimeToFirstChunk: HistogramSnapshot;
    streamChunksTotal: number;
}

export interface MetricsSnapshot {
    uptimeMs: number;
    methods: Record<string, MethodStats>;
    invalidRequests: number;
}

export interface MetricsFetchResult {
    /** 最近一次成功拉取的快照。 */
    snapshot: MetricsSnapshot;
    /** 拉取时刻（本地时钟，用于计算速率）。 */
    fetchedAt: number;
    /** 上一份快照，用于计算「间隔内的增量」。 */
    previous?: {
        snapshot: MetricsSnapshot;
        fetchedAt: number;
    };
}

/** 拉取 system.metrics；如果系统方法不可用（withSystemMethods=false），返回 undefined。 */
export async function fetchMetrics(rpc: RpcClient): Promise<MetricsSnapshot | undefined> {
    try {
        const raw = await rpc.call<MetricsSnapshot>('system.metrics');
        if (!raw || typeof raw !== 'object' || typeof raw.methods !== 'object') return undefined;
        return raw;
    } catch {
        return undefined;
    }
}

// ─── 派生计算 ───────────────────────────────────────────────

/** 在给定直方图上估算某个分位数（线性插值）。 */
export function quantileFromHistogram(h: HistogramSnapshot, q: number): number {
    if (h.count === 0) return 0;
    const target = q * h.count;
    let prevLe = 0;
    let prevCount = 0;
    for (const b of h.buckets) {
        if (b.le === Number.POSITIVE_INFINITY) {
            // +Inf 桶：用 max 作为上界估计
            const lo = prevLe;
            const hi = h.max;
            const span = b.count - prevCount || 1;
            const ratio = (target - prevCount) / span;
            return lo + (hi - lo) * ratio;
        }
        if (b.count >= target) {
            const lo = prevLe;
            const hi = b.le;
            const span = b.count - prevCount || 1;
            const ratio = (target - prevCount) / span;
            return lo + (hi - lo) * ratio;
        }
        prevLe = b.le;
        prevCount = b.count;
    }
    return h.max;
}

export interface MethodDerived {
    method: string;
    stats: MethodStats;
    /** 调用速率（次/秒），仅当有 previous 时有意义。 */
    callsPerSecond?: number;
    /** 错误率 = errors / calls（按 callsByStatus 汇总）。 */
    errorRate: number;
    /** 普通调用 p50/p95/p99（秒）。 */
    p50: number;
    p95: number;
    p99: number;
    /** 流式：完成率 = completed / opened；中止率 = aborted / opened。 */
    streamCompletionRate: number;
    streamAbortRate: number;
    /** 流式首帧 p50/p95（秒）。 */
    ttfbP50: number;
    ttfbP95: number;
    /** 流式平均帧数。 */
    avgChunksPerStream: number;
}

export function deriveMethod(method: string, stats: MethodStats, prev?: MethodStats, dtSeconds?: number): MethodDerived {
    const totalErrors = Object.values(stats.errorsByCode).reduce((a, b) => a + b, 0);
    const opened = stats.streams.opened || 0;
    const errorRate = stats.calls > 0 ? totalErrors / stats.calls : 0;
    const callsPerSecond =
        prev && dtSeconds && dtSeconds > 0
            ? Math.max(0, (stats.calls - prev.calls) / dtSeconds)
            : undefined;
    return {
        method,
        stats,
        ...(callsPerSecond !== undefined ? { callsPerSecond } : {}),
        errorRate,
        p50: quantileFromHistogram(stats.duration, 0.5),
        p95: quantileFromHistogram(stats.duration, 0.95),
        p99: quantileFromHistogram(stats.duration, 0.99),
        streamCompletionRate: opened > 0 ? stats.streams.completed / opened : 0,
        streamAbortRate: opened > 0 ? stats.streams.aborted / opened : 0,
        ttfbP50: quantileFromHistogram(stats.streamTimeToFirstChunk, 0.5),
        ttfbP95: quantileFromHistogram(stats.streamTimeToFirstChunk, 0.95),
        avgChunksPerStream:
            opened > 0 ? stats.streamChunksTotal / (stats.streams.completed + stats.streams.failed + stats.streams.aborted || 1) : 0,
    };
}