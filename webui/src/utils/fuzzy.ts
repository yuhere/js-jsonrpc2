/**
 * 极简模糊搜索：不区分大小写、子串匹配。
 * - 空串 / 纯空白 → 不过滤
 * - 空格分隔多个词 → 全部命中才保留（AND）
 */
export interface FuzzyQuery {
    /** 已小写化的词，AND 语义 */
    terms: string[];
    /** 原始输入 */
    raw: string;
    /** 无词 → 不过滤 */
    passthrough: boolean;
}

export function compileFuzzyQuery(input: string): FuzzyQuery {
    const raw = input ?? '';
    const terms = raw
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0);
    return { terms, raw, passthrough: terms.length === 0 };
}

export function matchFuzzy(query: FuzzyQuery, method: string): boolean {
    if (query.passthrough) return true;
    const target = method.toLowerCase();
    return query.terms.every((t) => target.includes(t));
}

export function filterFuzzyMethods<T extends string>(
    query: FuzzyQuery,
    methods: T[],
): T[] {
    if (query.passthrough) return methods;
    return methods.filter((m) => matchFuzzy(query, m));
}

export function filterFuzzySnapshotMethods<T>(
    query: FuzzyQuery,
    methods: Record<string, T>,
): Record<string, T> {
    if (query.passthrough) return methods;
    const out: Record<string, T> = {};
    for (const [method, stats] of Object.entries(methods)) {
        if (matchFuzzy(query, method)) out[method] = stats;
    }
    return out;
}