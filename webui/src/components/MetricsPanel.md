# Metrics 表格列说明

两张表都来自 `MetricsPanel.tsx`，数据源自服务端 `system.metrics` 返回的 `MetricsSnapshot`（`memory.ts` 聚合）。下表的「口径」指该列在 `memory.ts` / `deriveMethod` 中的计算方式。

---

## Non-stream methods

出现在该表的方法：`stats.streams.opened === 0`，即**从未产生过流式调用**的方法。列顺序：

| # | 列名 | 含义 | 口径 | 空/零值显示 |
|---|---|---|---|---|
| 1 | `method` | 方法 namespace | 直接来自 `snapshot.methods` 的 key | — |
| 2 | `calls` | 调用总次数 | `stats.calls`，每次 `onCallEnd` +1（含 `stream_opened` / `stream_error`，但本表只含 `opened === 0` 的方法，所以等价于 `success + error`） | `0` |
| 3 | `rate/s` | 调用速率（次/秒） | `(calls − previous.calls) / (fetchedAt − previous.fetchedAt)`，由两次快照差值得到 | 首次拉取 / 无 `previous` 时显示 `—` |
| 4 | `errors` | 错误总数 | `sum(errorsByCode)`，即 `RPCFailure` 的累计次数（含 `-32602` / `-32604` / `-32603` 等） | `0` |
| 5 | `err%` | 错误率 | `errors / calls`；`calls === 0` 时为 0 | `—`（`calls === 0` 时） |
| 6 | `p50` | 耗时中位数 | 对 `stats.duration` 直方图做线性插值，`quantileFromHistogram(h, 0.5)` | `—`（`duration.count === 0`） |
| 7 | `p95` | 耗时 p95 | `quantileFromHistogram(h, 0.95)` | `—` |
| 8 | `p99` | 耗时 p99 | `quantileFromHistogram(h, 0.99)` | `—` |
| 9 | `avg` | 平均耗时 | `duration.sum / duration.count`；`count === 0` 时为 0 | `—`（`count === 0`） |

补充：

- **`calls` 与 `errors` 的关系**：`errors` 是 `calls` 的子集。一次调用失败时 `onCallEnd(status: 'error', code)` 让 `calls +1` 且 `errorsByCode[code] +1`；一次成功调用只让 `calls +1`。所以 `calls ≥ errors`，`err% ≤ 100%`。
- **`calls` 与 `duration.count` 的关系**：`duration` 只在 `status ∈ {success, error}` 时 `observe`，而本表的方法 `opened === 0`，没有 `stream_opened` / `stream_error` 路径，所以理论上 `duration.count === calls`。若两者不等（例如未来 `memory.ts` 引入新的 status），`avg` 仍按 `duration.count` 计算，与 p50/p95/p99 同源。
- **`rate/s` 的 `—` 是暂时的**：第二次拉取后（`previous` 存在）立即显示数值。切换 glob 过滤器不会重置 `previous`，速率保持连续。
- **颜色**：`errors > 0` 与 `err% > 5%` 标红（`--danger`）；`rate/s > 100` 标红、`> 10` 标黄（`--syn-number`）、其余灰（`--fg-dim`），仅视觉提示。

---

## Stream methods

出现在该表的方法：`stats.streams.opened > 0`，即**至少被以流式方式调用过一次**的方法。列顺序：

| # | 列名 | 含义 | 口径 | 空/零值显示 |
|---|---|---|---|---|
| 1 | `method` | 方法 namespace | 直接来自 `snapshot.methods` 的 key | — |
| 2 | `opened` | 流打开次数 | `streams.opened`，每次 `onStreamEvent({ event: 'opened' })` +1；与 `onCallEnd(stream_opened)` 一一对应 | `0` |
| 3 | `completed` | 正常结束次数 | `streams.completed`，收到终止帧 `{ done: true }` 且无 error 时 +1 | `0` |
| 4 | `failed` | 失败次数 | `streams.failed`，`onStreamEvent({ event: 'failed' })`；含 `before_first_chunk` 与 `mid_stream` 两种 phase | `0`（> 0 时标红） |
| 5 | `aborted` | 客户端中止次数 | `streams.aborted`，`finally` 里既无 `completed` 也无 `failure` 时 +1（客户端断开触发 `chunks.return()`） | `0`（> 0 时标黄） |
| 6 | `complete%` | 完成率 | `streams.completed / streams.opened` | `—`（`opened === 0` 时，但本表不会出现） |
| 7 | `abort%` | 中止率 | `streams.aborted / streams.opened` | `—`（同上） |
| 8 | `avg chunks` | 平均帧数 | `streamChunksTotal / (completed + failed + aborted)`；分母为 0 时取 1 避免除零 | `0.0` |
| 9 | `ttfb p50` | 首帧延迟中位数 | `quantileFromHistogram(streamTimeToFirstChunk, 0.5)`；`ttfb` 只在首帧到达时记录 | `—`（`ttfb.count === 0`） |
| 10 | `ttfb p95` | 首帧延迟 p95 | `quantileFromHistogram(streamTimeToFirstChunk, 0.95)` | `—` |
| 11 | `duration avg` | 流总时长平均值 | `streamDuration.sum / streamDuration.count`；时长从 `onStreamEvent(opened)` 到 `completed`/`failed`/`aborted` | `—`（`count === 0`） |

补充：

- **`opened` 与 `completed + failed + aborted` 的关系**：正常情况下相等。若 UI 轮询恰好落在「已 opened 但尚未收到终止事件」的窗口内，会短暂出现 `opened > completed + failed + aborted`，下一次拉取即恢复。
- **`failed` 的两种 phase**：`before_first_chunk`（首帧前抛错，服务端会额外补一次 `onCallEnd(stream_error)`，因此也会让 Non-stream 表的 `calls` 增加——但该方法一旦进过 Stream 表就不会再回 Non-stream 表，所以不影响本表口径）；`mid_stream`（首帧后抛错，只通过终止帧表达，不计入 Non-stream 的 `calls`/`errors`）。
- **`ttfb` 与 `duration` 的口径差异**：`ttfb` 是「首帧到达相对 `opened` 的延迟」，`duration` 是「整个流的时长」。无限流（`stream.infinite`）的 `duration` 会很大，但 `ttfb` 仍很小；两者分开看才能判断是「启动慢」还是「流太长」。
- **`aborted` 的语义**：客户端主动断开（关闭页面、`fetch` abort、`break` 出 `for await`）会让 transport 调 `chunks.return()`，触发 handler 的 `finally`。此时 `onStreamEvent({ event: 'aborted' })` 记录一次。如果 `aborted` 持续增长而 `completed` 不增长，通常意味着客户端超时或 SPA 路由切换导致的中断，而不是服务端 bug。
- **颜色**：`failed > 0` 标红，`aborted > 0` 标黄，与 Non-stream 表的错误/警告配色一致。

---

## 两张表共享的约定

- **耗时单位**：`formatDuration` 自动选单位——`< 1ms` 用 µs，`< 1s` 用 ms，`< 60s` 用 s，≥ 60s 用 min。表格里不显示单位后缀以外的信息，排序仍按原始秒数。
- **分位数估算**：`quantileFromHistogram` 在固定桶边界上做线性插值，`+Inf` 桶用 `max` 作为上界。桶边界由 `memory.ts` 的 `DURATION_BUCKETS` / `STREAM_DURATION_BUCKETS` / `TTFB_BUCKETS` 定义，UI 不需要知道边界值。
- **过滤影响**：左侧 glob 过滤器只裁剪 `snapshot.methods`，两张表与顶部卡片（`Methods` / `Calls` / `Streams` / `Errors` / `Error rate`）都只反映匹配的方法；`Invalid requests` 是全局计数，不随过滤变化。
- **排序**：两张表都按 `calls` 降序（`deriveMethod` 之后统一 `sort`）；Stream 表的 `calls` 含 `stream_opened`，所以排序结果与 `opened` 趋势基本一致。
- **表格不区分 `system.` / `llm.`**：`system.metrics`、`system.listMethods` 等会出现在 Non-stream 表；如果它们曾经以流式被调用（目前不会），会出现在 Stream 表。分组只看 `streams.opened`。


## p95 / p99 是什么

**p95 / p99 是「百分位数（percentile）」**，用来描述延迟分布，而不是平均值。

### 定义

- **p50（中位数）**：50% 的请求耗时 ≤ 这个值。
- **p95**：95% 的请求耗时 ≤ 这个值，剩下 5% 更慢。
- **p99**：99% 的请求耗时 ≤ 这个值，剩下 1% 更慢。

举例：某方法 1000 次调用，耗时排序后：

| 指标 | 值 | 含义 |
|---|---|---|
| p50 | 12 ms | 一半请求在 12ms 内完成 |
| p95 | 180 ms | 95% 的请求在 180ms 内完成 |
| p99 | 950 ms | 99% 的请求在 950ms 内完成，最慢的 1% 超过 950ms |
| avg | 45 ms | 平均值 |

### 为什么不能只看 avg

平均值会被两头拉平：

- 少数极慢请求会把 avg 抬高，但看不出「到底有多慢」。
- 大量快请求会把 avg 压低，掩盖尾部延迟。

比如上面的例子，avg 只有 45ms，看起来很快；但 p99 是 950ms——每 100 个用户里就有 1 个要等将近 1 秒。这种「长尾」在平均值里几乎看不见，在 p99 里一目了然。

### 为什么是 p95 / p99，不是 p100

- **p100 = max**，完全由单个最慢请求决定，噪声极大（一次 GC、一次网络抖动就能把它打到几秒），不适合作为稳定指标。
- **p95** 用来衡量「大多数用户体验」。
- **p99** 用来衡量「尾部体验」——这正是用户抱怨、SLO 违约、告警最常触发的地方。

业界常见的 SLO 写法就是基于分位数，例如「p99 延迟 < 500ms」「p95 < 200ms」。

### 它们和 p50 一起看才有意义

| 组合 | 说明 |
|---|---|
| p50 低、p99 低 | 整体快且稳定 |
| p50 低、p99 高 | 大多数快，但有长尾（常见于锁竞争、GC、下游超时） |
| p50 高、p99 高 | 整体慢（容量不足、下游普遍慢） |
| p50 高、p99 接近 p50 | 慢但稳定（固定开销大，如冷启动、串行化） |

### 在这个 Metrics 面板里怎么来的

服务端 `memory.ts` 不保存每次调用的精确耗时，只维护一个**固定桶的直方图**（`DURATION_BUCKETS = [0.001, 0.005, 0.01, 0.025, ...]`）。前端 `quantileFromHistogram` 在桶边界之间做**线性插值**估算 p50/p95/p99。

这意味着：

- 数值是**近似值**，误差受桶密度影响（桶越密越准）。
- 与真实分位数的偏差通常在桶宽的同一量级内，足够判断「是否健康」，不适合做精确计费或 SLA 赔付。
- 如果需要精确分位数，后端应改用 t-digest / HDR Histogram 之类的结构，前端只需替换 `quantileFromHistogram` 的实现，表格列不变。

### 一句话

> p95 / p99 = 「95% / 99% 的请求比它快」的延迟阈值。它们回答的是「大多数用户等多久」和「最慢的那批用户等多久」，这是平均值回答不了的问题。