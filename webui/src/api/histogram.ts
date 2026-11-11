export type HistogramBound = number | '+Inf';

export interface QuantileHistogram {
    count: number;
    max: number;
    buckets: Array<{ le: HistogramBound; count: number }>;
}

function isPositiveInf(le: HistogramBound): le is '+Inf' {
    return le === '+Inf' || le === Number.POSITIVE_INFINITY;
}

/** 在给定直方图上估算某个分位数（线性插值）。+Inf 桶用 max 作上界。 */
export function quantileFromHistogram(h: QuantileHistogram, q: number): number {
    if (h.count === 0) return 0;
    const target = q * h.count;
    let prevLe = 0;
    let prevCount = 0;
    for (const b of h.buckets) {
        if (isPositiveInf(b.le)) {
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
