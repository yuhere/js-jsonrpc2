// import { Counter, Histogram, Gauge } from 'prom-client';
// import type { RPCMetrics } from '../types';

// export function createPromMetrics(): RPCMetrics {
//     const calls = new Counter({
//         name: 'rpc_calls_total',
//         help: 'Total RPC calls',
//         labelNames: ['method', 'status'],
//     });
//     const errors = new Counter({
//         name: 'rpc_errors_total',
//         help: 'Total RPC errors by code',
//         labelNames: ['method', 'code'],
//     });
//     const duration = new Histogram({
//         name: 'rpc_duration_seconds',
//         help: 'RPC call duration',
//         labelNames: ['method', 'status'],
//         buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
//     });
//     const inflight = new Gauge({
//         name: 'rpc_inflight',
//         help: 'In-flight RPC calls',
//         labelNames: ['method'],
//     });
//     const streamOpened = new Counter({
//         name: 'rpc_stream_opened_total',
//         help: 'Streams opened',
//         labelNames: ['method'],
//     });
//     const streamCompleted = new Counter({
//         name: 'rpc_stream_completed_total',
//         help: 'Streams completed',
//         labelNames: ['method'],
//     });
//     const streamFailed = new Counter({
//         name: 'rpc_stream_failed_total',
//         help: 'Streams failed',
//         labelNames: ['method', 'phase'],
//     });
//     const streamAborted = new Counter({
//         name: 'rpc_stream_aborted_total',
//         help: 'Streams aborted by client',
//         labelNames: ['method'],
//     });
//     const ttfb = new Histogram({
//         name: 'rpc_stream_time_to_first_chunk_seconds',
//         help: 'Time to first stream chunk',
//         labelNames: ['method'],
//         buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
//     });
//     const streamDuration = new Histogram({
//         name: 'rpc_stream_duration_seconds',
//         help: 'Total stream duration',
//         labelNames: ['method'],
//         buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300, 1800],
//     });

//     return {
//         onCallStart({ method }) {
//             inflight.inc({ method });
//         },
//         onCallEnd({ method, status, code, durationSeconds }) {
//             if (status === 'stream_opened') {
//                 // 流已打开：只减 inflight；calls/duration 交给 onStreamEvent
//                 inflight.dec({ method });
//                 return;
//             }
//             if (status === 'stream_error') {
//                 // before_first_chunk 失败：不再减 inflight（stream_opened 已减）
//                 calls.inc({ method, status });
//                 if (code !== undefined) errors.inc({ method, code: String(code) });
//                 return;
//             }
//             inflight.dec({ method });
//             calls.inc({ method, status });
//             if (code !== undefined) errors.inc({ method, code: String(code) });
//             duration.observe({ method, status }, durationSeconds);
//         },
//         onStreamEvent({ method, event, phase, chunks, durationSeconds, timeToFirstChunkSeconds }) {
//             if (event === 'opened') {
//                 streamOpened.inc({ method });
//                 calls.inc({ method, status: 'stream' });
//                 return;
//             }
//             if (event === 'completed') {
//                 streamCompleted.inc({ method });
//                 streamDuration.observe({ method }, durationSeconds);
//                 if (timeToFirstChunkSeconds !== undefined) ttfb.observe({ method }, timeToFirstChunkSeconds);
//                 return;
//             }
//             if (event === 'failed') {
//                 streamFailed.inc({ method, phase: phase ?? 'unknown' });
//                 streamDuration.observe({ method }, durationSeconds);
//                 if (timeToFirstChunkSeconds !== undefined) ttfb.observe({ method }, timeToFirstChunkSeconds);
//                 return;
//             }
//             if (event === 'aborted') {
//                 streamAborted.inc({ method });
//                 streamDuration.observe({ method }, durationSeconds);
//                 return;
//             }
//         },
//     };
// }