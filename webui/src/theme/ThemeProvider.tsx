import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
    /** 用户选择的模式 */
    mode: ThemeMode;
    /** 实际生效的明/暗 */
    resolved: ResolvedTheme;
    setMode: (mode: ThemeMode) => void;
}

const STORAGE_KEY = 'jsonrpc2.theme';

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): ThemeMode {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (v === 'light' || v === 'dark' || v === 'system') return v;
    } catch {
        /* ignore */
    }
    return 'system';
}

function prefersDark(): boolean {
    return typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
    const [systemDark, setSystemDark] = useState<boolean>(prefersDark);

    // 监听系统偏好变化（仅在 mode === 'system' 时影响 resolved）
    useEffect(() => {
        const mql = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
        // 老浏览器 fallback
        if (mql.addEventListener) mql.addEventListener('change', onChange);
        else mql.addListener(onChange);
        return () => {
            if (mql.removeEventListener) mql.removeEventListener('change', onChange);
            else mql.removeListener(onChange);
        };
    }, []);

    const resolved: ResolvedTheme = useMemo(() => {
        if (mode === 'system') return systemDark ? 'dark' : 'light';
        return mode;
    }, [mode, systemDark]);

    // 写到 <html data-theme>，并持久化
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', resolved);
        try {
            localStorage.setItem(STORAGE_KEY, mode);
        } catch {
            /* ignore */
        }
    }, [resolved, mode]);

    const setMode = useCallback((m: ThemeMode) => setModeState(m), []);

    const value = useMemo<ThemeContextValue>(
        () => ({ mode, resolved, setMode }),
        [mode, resolved, setMode],
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
    return ctx;
}