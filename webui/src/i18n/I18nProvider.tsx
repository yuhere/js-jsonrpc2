import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Locale, LocaleMode, Messages } from './messages';
import { MESSAGES } from './messages';
import { detectSystemLocale, normalizeLocale } from './detect';

interface I18nContextValue {
    /** 用户选择的模式（system 或具体 locale） */
    mode: LocaleMode;
    /** 实际生效的 locale */
    locale: Locale;
    /** 当前 locale 的词条 */
    messages: Messages;
    setMode: (mode: LocaleMode) => void;
    /**
     * 取词条并插值。key 形如 'toolbar.title'。
     * 支持 {name} 占位符。
     */
    t: (key: string, vars?: Record<string, string | number>) => string;
}

const STORAGE_KEY = 'jsonrpc2.locale';

const I18nContext = createContext<I18nContextValue | null>(null);

const VALID_MODES: readonly LocaleMode[] = ['system', 'en', 'zh-CN', 'zh-TW', 'ja'];

function readStoredMode(): LocaleMode {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (v && (VALID_MODES as readonly string[]).includes(v)) {
            return v as LocaleMode;
        }
    } catch {
        /* ignore */
    }
    return 'system';
}

function getByPath(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let cur: unknown = obj;
    for (const p of parts) {
        if (cur == null || typeof cur !== 'object') return undefined;
        cur = (cur as Record<string, unknown>)[p];
    }
    return cur;
}

function interpolate(text: string, vars?: Record<string, string | number>): string {
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, (_, name: string) => {
        const v = vars[name];
        return v === undefined ? `{${name}}` : String(v);
    });
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
    const [mode, setModeState] = useState<LocaleMode>(readStoredMode);
    const [systemLocale, setSystemLocale] = useState<Locale>(detectSystemLocale);

    // 监听浏览器语言变化（Chrome 支持 languagechange）
    useEffect(() => {
        const onChange = () => setSystemLocale(detectSystemLocale());
        window.addEventListener('languagechange', onChange);
        return () => window.removeEventListener('languagechange', onChange);
    }, []);

    const locale: Locale = useMemo(() => {
        if (mode === 'system') return systemLocale;
        // 若外部传入非法值，回退 system 检测
        return normalizeLocale(mode) ?? systemLocale;
    }, [mode, systemLocale]);

    // 写 <html lang>，持久化 mode
    useEffect(() => {
        document.documentElement.setAttribute('lang', locale);
        try {
            localStorage.setItem(STORAGE_KEY, mode);
        } catch {
            /* ignore */
        }
    }, [locale, mode]);

    const messages = MESSAGES[locale];

    const t = useCallback(
        (key: string, vars?: Record<string, string | number>) => {
            const raw = getByPath(messages, key);
            if (typeof raw === 'string') return interpolate(raw, vars);
            // 回退到英文，再回退到 key 本身
            const fallback = getByPath(MESSAGES.en, key);
            if (typeof fallback === 'string') return interpolate(fallback, vars);
            return key;
        },
        [messages],
    );

    const setMode = useCallback((m: LocaleMode) => setModeState(m), []);

    const value = useMemo<I18nContextValue>(
        () => ({ mode, locale, messages, setMode, t }),
        [mode, locale, messages, setMode, t],
    );

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
    const ctx = useContext(I18nContext);
    if (!ctx) throw new Error('useI18n must be used within <I18nProvider>');
    return ctx;
}

/** 便捷 hook：只取 t */
export function useT() {
    return useI18n().t;
}