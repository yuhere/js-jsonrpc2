import { useCallback, useEffect, useRef, useState } from 'react';
import type { RpcClient } from '../api/rpc';
import {
    fetchMetrics,
    type MetricsSnapshot,
} from '../api/metrics';

export interface UseMetricsState {
    snapshot: MetricsSnapshot | undefined;
    previous: { snapshot: MetricsSnapshot; fetchedAt: number } | undefined;
    fetchedAt: number | undefined;
    loading: boolean;
    error: string | null;
    /** 手动刷新。 */
    refresh: () => Promise<void>;
    /** 是否自动刷新。 */
    autoRefresh: boolean;
    setAutoRefresh: (v: boolean) => void;
    /** 轮询间隔（毫秒）。 */
    intervalMs: number;
    setIntervalMs: (v: number) => void;
    /** system.metrics 是否可用。 */
    available: boolean;
}

export function useMetrics(rpc: RpcClient, enabled: boolean): UseMetricsState {
    const [snapshot, setSnapshot] = useState<MetricsSnapshot | undefined>(undefined);
    const [previous, setPrevious] = useState<{ snapshot: MetricsSnapshot; fetchedAt: number } | undefined>(undefined);
    const [fetchedAt, setFetchedAt] = useState<number | undefined>(undefined);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [available, setAvailable] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [intervalMs, setIntervalMs] = useState(3000);
    const inFlight = useRef(false);

    const refresh = useCallback(async () => {
        if (inFlight.current) return;
        inFlight.current = true;
        setLoading(true);
        setError(null);
        try {
            const next = await fetchMetrics(rpc);
            if (!next) {
                setAvailable(false);
                return;
            }
            setAvailable(true);
            const now = Date.now();
            setSnapshot((curr) => {
                if (curr) setPrevious({ snapshot: curr, fetchedAt: fetchedAt ?? now });
                return next;
            });
            setFetchedAt(now);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
            inFlight.current = false;
        }
    }, [rpc, fetchedAt]);

    // 首次进入 / 切到 metrics 面板时拉一次
    useEffect(() => {
        if (!enabled) return;
        void refresh();
        // 只在 enabled 变化或 rpc 实例变化时重置
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, rpc]);

    // 自动刷新
    useEffect(() => {
        if (!enabled || !autoRefresh || !available) return;
        const t = setInterval(() => void refresh(), intervalMs);
        return () => clearInterval(t);
    }, [enabled, autoRefresh, available, intervalMs, refresh]);

    return {
        snapshot,
        previous,
        fetchedAt,
        loading,
        error,
        refresh,
        autoRefresh,
        setAutoRefresh,
        intervalMs,
        setIntervalMs,
        available,
    };
}