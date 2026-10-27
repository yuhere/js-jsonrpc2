/**
 * 极简 glob 匹配 + 多模式过滤。
 *
 * 语法：
 * - `*` 任意字符（含 `.`）
 * - `?` 单个字符
 * - `**` 与 `*` 等价（兼容常见 glob 方言）
 * - `!pat` 取反；多个 `!` 之间是「且」
 * - 多个模式用 `,` 分隔；正向模式之间是「或」，取反模式与整体是「且」
 * - 空串或纯空白 → 不过滤
 */

export interface CompiledFilter {
    /** 正向模式（OR）；为空表示「全部」。 */
    includes: RegExp[];
    /** 取反模式（AND NOT）。 */
    excludes: RegExp[];
    /** 原始输入，便于回显。 */
    raw: string;
    /** 是否等价于「不过滤」。 */
    passthrough: boolean;
}

function globToRegExp(glob: string): RegExp {
    let re = '^';
    for (let i = 0; i < glob.length; i++) {
        const ch = glob[i]!;
        if (ch === '*') {
            // 吞掉连续 *（** 视为 *）
            while (i + 1 < glob.length && glob[i + 1] === '*') i++;
            re += '.*';
        } else if (ch === '?') {
            re += '.';
        } else if ('\\^$+{}()|[]'.includes(ch)) {
            re += '\\' + ch;
        } else {
            re += ch;
        }
    }
    re += '$';
    return new RegExp(re);
}

export function compileGlobFilter(input: string): CompiledFilter {
    const raw = input ?? '';
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
        return { includes: [], excludes: [], raw, passthrough: true };
    }
    const includes: RegExp[] = [];
    const excludes: RegExp[] = [];
    for (const part of trimmed.split(',')) {
        const pat = part.trim();
        if (pat.length === 0) continue;
        if (pat.startsWith('!')) {
            const body = pat.slice(1).trim();
            if (body.length > 0) excludes.push(globToRegExp(body));
        } else {
            includes.push(globToRegExp(pat));
        }
    }
    // 只有 !pat 时，includes 为空 → 视为「从全部里排除」
    return { includes, excludes, raw, passthrough: false };
}

export function matchMethod(filter: CompiledFilter, method: string): boolean {
    if (filter.passthrough) return true;
    if (filter.excludes.some((re) => re.test(method))) return false;
    if (filter.includes.length === 0) return true; // 只有 !pat 时，保留所有未排除的
    return filter.includes.some((re) => re.test(method));
}

/** 对一组 method 名做过滤；返回过滤后的列表（保持原顺序）。 */
export function filterMethods<T extends string>(filter: CompiledFilter, methods: T[]): T[] {
    if (filter.passthrough) return methods;
    return methods.filter((m) => matchMethod(filter, m));
}

/** 便捷：直接对 MetricsSnapshot 的 methods 做过滤，返回浅拷贝。 */
export function filterSnapshotMethods(
    filter: CompiledFilter,
    methods: Record<string, unknown>,
): Record<string, unknown> {
    if (filter.passthrough) return methods;
    const out: Record<string, unknown> = {};
    for (const [method, stats] of Object.entries(methods)) {
        if (matchMethod(filter, method)) out[method] = stats;
    }
    return out;
}