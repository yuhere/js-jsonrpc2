import { describe, expect, it } from 'vitest';
import { createMemoryMetrics, HISTOGRAM_POSITIVE_INF } from '../../src/metrics/memory';
import { stringify } from '../../src/stream/stringify-stream';
import { quantileFromHistogram } from '../../webui/src/api/histogram';

describe('histogram +Inf bucket', () => {
    it('serializes the overflow bucket as the string +Inf', async () => {
        const metrics = createMemoryMetrics();
        metrics.onCallEnd({ method: 'slow', status: 'success', durationSeconds: 100 });
        const duration = metrics.snapshot().methods['slow']!.duration;
        expect(duration.buckets.at(-1)).toEqual({ le: HISTOGRAM_POSITIVE_INF, count: 1 });

        const text = await stringify(duration);
        expect(text).toContain('"le":"+Inf"');
        expect(text).not.toContain('"le":null');
    });

    it('estimates a quantile in the +Inf bucket from the observed max', () => {
        const metrics = createMemoryMetrics();
        metrics.onCallEnd({ method: 'slow', status: 'success', durationSeconds: 100 });
        const duration = metrics.snapshot().methods['slow']!.duration;
        const q = quantileFromHistogram(duration, 0.99);
        expect(q).toBeCloseTo(30 + (100 - 30) * 0.99, 5);
    });
});
