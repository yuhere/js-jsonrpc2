import type { RPCMetrics } from '../types';

/**
 * 内存版 RPCMetrics。
 *
 * 按 method 聚合：调用次数、错误次数（按 code）、耗时直方图（固定桶）、
 * 流式生命周期计数、首帧延迟直方图。
 *
 * 适合开发、测试、单机小服务；不持久化、不跨进程。
 */

const DURATION_BUCKETS = [
    0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30,
] as const;

const STREAM_DURATION_BUCKETS = [
    0.1, 0.5, 1, 5, 10, 30, 60, 300, 1800,
] as const;

const TTFB_BUCKETS = [
    0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5,
] as const;

export interface HistogramSnapshot {
    count: number;
    sum: number;
    min: number;
    max: number;
    /** 上界（含）→ 累计计数；最后一个桶是 +Inf。 */
    buckets: Array<{ le: number; count: number }>;
}

export interface MethodStats {
    /** 调用总数（含成功与失败）。 */
    calls: number;
    /** 按 status 分组的调用数。 */
    callsByStatus: Record<string, number>;
    /** 按 error code 分组的错误数。 */
    errorsByCode: Record<string, number>;
    /** 普通（非流式）调用的耗时分布。 */
    duration: HistogramSnapshot;
    /** 流式调用计数。 */
    streams: {
        opened: number;
        completed: number;
        failed: number;
        failedByPhase: Record<string, number>;
        aborted: number;
    };
    /** 流式总时长分布。 */
    streamDuration: HistogramSnapshot;
    /** 首帧延迟分布。 */
    streamTimeToFirstChunk: HistogramSnapshot;
    /** 流式产出帧数总计（用于算均值）。 */
    streamChunksTotal: number;
}

export interface MetricsSnapshot {
    /** 进程启动到现在的毫秒数（用于计算速率）。 */
    uptimeMs: number;
    /** 按 method 聚合。 */
    methods: Record<string, MethodStats>;
    /** 无效请求（validateRequest 失败）的计数。 */
    invalidRequests: number;
}

interface HistogramState {
    count: number;
    sum: number;
    min: number;
    max: number;
    /** 每个桶的「落入该桶」的计数，长度 = buckets.length + 1（最后一个为 +Inf）。 */
    bucketCounts: number[];
    bounds: readonly number[];
}

function createHistogram(bounds: readonly number[]): HistogramState {
    return {
        count: 0,
        sum: 0,
        min: Number.POSITIVE_INFINITY,
        max: Number.NEGATIVE_INFINITY,
        bucketCounts: new Array(bounds.length + 1).fill(0),
        bounds,
    };
}

function observeHistogram(h: HistogramState, value: number): void {
    h.count += 1;
    h.sum += value;
    if (value < h.min) h.min = value;
    if (value > h.max) h.max = value;
    // 找到第一个 bounds[i] >= value 的桶；否则落入 +Inf 桶
    let idx = h.bounds.length;
    for (let i = 0; i < h.bounds.length; i++) {
        if (value <= h.bounds[i]!) {
            idx = i;
            break;
        }
    }
    h.bucketCounts[idx]! += 1;
}

function snapshotHistogram(h: HistogramState): HistogramSnapshot {
    const buckets: Array<{ le: number; count: number }> = [];
    let cumulative = 0;
    for (let i = 0; i < h.bounds.length; i++) {
        cumulative += h.bucketCounts[i]!;
        buckets.push({ le: h.bounds[i]!, count: cumulative });
    }
    cumulative += h.bucketCounts[h.bounds.length]!;
    buckets.push({ le: Number.POSITIVE_INFINITY, count: cumulative });
    return {
        count: h.count,
        sum: h.sum,
        min: h.count === 0 ? 0 : h.min,
        max: h.count === 0 ? 0 : h.max,
        buckets,
    };
}

interface MethodState {
    calls: number;
    callsByStatus: Map<string, number>;
    errorsByCode: Map<number, number>;
    duration: HistogramState;
    streams: {
        opened: number;
        completed: number;
        failed: number;
        failedByPhase: Map<string, number>;
        aborted: number;
        chunksTotal: number;
        duration: HistogramState;
        ttfb: HistogramState;
    };
}

function createMethodState(): MethodState {
    return {
        calls: 0,
        callsByStatus: new Map(),
        errorsByCode: new Map(),
        duration: createHistogram(DURATION_BUCKETS),
        streams: {
            opened: 0,
            completed: 0,
            failed: 0,
            failedByPhase: new Map(),
            aborted: 0,
            chunksTotal: 0,
            duration: createHistogram(STREAM_DURATION_BUCKETS),
            ttfb: createHistogram(TTFB_BUCKETS),
        },
    };
}

function bump<K>(map: Map<K, number>, key: K): void {
    map.set(key, (map.get(key) ?? 0) + 1);
}

export interface MemoryMetricsOptions {
    /**
     * 允许对 method 名做归一化，用于合并高基数的方法名
     * （例如 `user.get.42` → `user.get`）。默认原样返回。
     */
    normalizeMethod?: (method: string) => string;
}

export interface MemoryMetrics extends RPCMetrics {
    /** 当前聚合状态的深拷贝快照。 */
    snapshot(): MetricsSnapshot;
    /** 清空所有计数（保留正常使用）。 */
    reset(): void;
}

export function createMemoryMetrics(
    options: MemoryMetricsOptions = {},
): MemoryMetrics {
    const normalize = options.normalizeMethod ?? ((m: string) => m);
    const startedAt = Date.now();
    const methods = new Map<string, MethodState>();
    let invalidRequests = 0;

    function stateOf(method: string): MethodState {
        const key = normalize(method);
        let state = methods.get(key);
        if (!state) {
            state = createMethodState();
            methods.set(key, state);
        }
        return state;
    }

    return {
        onCallStart({ method }) {
            // 只用于未来扩展（如活跃调用数）；当前不聚合。
            // 显式空实现，保证和 Repository 的调用契约一致。
            void method;
        },

        onCallEnd({ method, status, code, durationSeconds }) {
            if (method === '<invalid>') {
                invalidRequests += 1;
                if (code !== undefined) {
                    // 无效请求的错误码仍记录在 invalidRequests 上，
                    // 不污染任何具体 method 的状态。
                }
                return;
            }

            const state = stateOf(method);
            state.calls += 1;
            bump(state.callsByStatus, status);
            if (code !== undefined) bump(state.errorsByCode, code);

            // stream_opened / stream_error 不计入普通耗时分布：
            // - stream_opened：这只是「流已打开」的耗时，不是调用耗时
            // - stream_error：首帧失败，耗时由 onStreamEvent(failed) 记录
            if (status === 'success' || status === 'error') {
                observeHistogram(state.duration, durationSeconds);
            }
        },

        onStreamEvent({
            method,
            event,
            phase,
            chunks,
            durationSeconds,
            timeToFirstChunkSeconds,
        }) {
            if (method === '<invalid>') return;
            const state = stateOf(method);

            switch (event) {
                case 'opened':
                    state.streams.opened += 1;
                    return;
                case 'completed':
                    state.streams.completed += 1;
                    state.streams.chunksTotal += chunks;
                    observeHistogram(state.streams.duration, durationSeconds);
                    if (timeToFirstChunkSeconds !== undefined) {
                        observeHistogram(state.streams.ttfb, timeToFirstChunkSeconds);
                    }
                    return;
                case 'failed':
                    state.streams.failed += 1;
                    bump(state.streams.failedByPhase, phase ?? 'unknown');
                    state.streams.chunksTotal += chunks;
                    observeHistogram(state.streams.duration, durationSeconds);
                    if (timeToFirstChunkSeconds !== undefined) {
                        observeHistogram(state.streams.ttfb, timeToFirstChunkSeconds);
                    }
                    return;
                case 'aborted':
                    state.streams.aborted += 1;
                    state.streams.chunksTotal += chunks;
                    observeHistogram(state.streams.duration, durationSeconds);
                    return;
            }
        },

        snapshot(): MetricsSnapshot {
            const out: Record<string, MethodStats> = {};
            for (const [method, state] of methods) {
                out[method] = {
                    calls: state.calls,
                    callsByStatus: Object.fromEntries(state.callsByStatus),
                    errorsByCode: Object.fromEntries(
                        [...state.errorsByCode].map(([code, n]) => [String(code), n]),
                    ),
                    duration: snapshotHistogram(state.duration),
                    streams: {
                        opened: state.streams.opened,
                        completed: state.streams.completed,
                        failed: state.streams.failed,
                        failedByPhase: Object.fromEntries(state.streams.failedByPhase),
                        aborted: state.streams.aborted,
                    },
                    streamDuration: snapshotHistogram(state.streams.duration),
                    streamTimeToFirstChunk: snapshotHistogram(state.streams.ttfb),
                    streamChunksTotal: state.streams.chunksTotal,
                };
            }
            return {
                uptimeMs: Date.now() - startedAt,
                methods: out,
                invalidRequests,
            };
        },

        reset() {
            methods.clear();
            invalidRequests = 0;
        },
    };
}