import type { Locale } from './messages';

/** 把 BCP-47 语言标签映射到我们支持的 4 种 locale。 */
export function normalizeLocale(tag: string | undefined | null): Locale | undefined {
    if (!tag) return undefined;
    const t = tag.toLowerCase();
    if (t === 'ja' || t.startsWith('ja-')) return 'ja';
    if (t === 'zh' || t.startsWith('zh-')) {
        // 繁体：zh-TW / zh-HK / zh-MO / zh-Hant-*
        if (
            t.includes('hant') ||
            t.startsWith('zh-tw') ||
            t.startsWith('zh-hk') ||
            t.startsWith('zh-mo')
        ) {
            return 'zh-TW';
        }
        return 'zh-CN';
    }
    if (t === 'en' || t.startsWith('en-')) return 'en';
    return undefined;
}

/** 读取浏览器语言偏好，取第一个能映射的；否则回退 en。 */
export function detectSystemLocale(): Locale {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    const candidates: string[] = [];
    if (nav?.languages && nav.languages.length > 0) {
        candidates.push(...nav.languages);
    }
    if (nav?.language) candidates.push(nav.language);
    for (const c of candidates) {
        const loc = normalizeLocale(c);
        if (loc) return loc;
    }
    return 'en';
}