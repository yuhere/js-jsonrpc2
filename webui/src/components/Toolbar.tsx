import type { TransportKind } from '../client';
import { useTheme, type ThemeMode } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nProvider';
import type { LocaleMode } from '../i18n/messages';

interface ToolbarProps {
    transport: TransportKind;
    onTransportChange: (t: TransportKind) => void;
    onRefresh: () => void;
    loading: boolean;
    error: string | null;
    onGenerateDocs: () => void;
    generatingDocs: boolean;
}

export function Toolbar({
    transport,
    onTransportChange,
    onRefresh,
    loading,
    error,
    onGenerateDocs,
    generatingDocs,
}: ToolbarProps) {
    const { mode, setMode } = useTheme();
    const { t, mode: localeMode, setMode: setLocaleMode } = useI18n();

    const themeOptions: { value: ThemeMode; label: string }[] = [
        { value: 'system', label: t('toolbar.themeSystem') },
        { value: 'light', label: t('toolbar.themeLight') },
        { value: 'dark', label: t('toolbar.themeDark') },
    ];

    const localeOptions: { value: LocaleMode; label: string }[] = [
        { value: 'system', label: t('toolbar.languageSystem') },
        { value: 'en', label: t('toolbar.languageEn') },
        { value: 'zh-CN', label: t('toolbar.languageZhCN') },
        { value: 'zh-TW', label: t('toolbar.languageZhTW') },
        { value: 'ja', label: t('toolbar.languageJa') },
    ];

    return (
        <header className="toolbar">
            <h1>{t('toolbar.title')}</h1>

            <div className="segmented" role="group" aria-label={t('toolbar.transport')}>
                <button
                    type="button"
                    className={transport === 'http' ? 'active' : ''}
                    onClick={() => onTransportChange('http')}
                >
                    {t('toolbar.http')}
                </button>
                <button
                    type="button"
                    className={transport === 'ws' ? 'active' : ''}
                    onClick={() => onTransportChange('ws')}
                >
                    {t('toolbar.ws')}
                </button>
            </div>

            <button onClick={onRefresh} disabled={loading}>
                {loading ? t('toolbar.refreshMethodsLoading') : t('toolbar.refreshMethods')}
            </button>

            <button
                onClick={onGenerateDocs}
                disabled={generatingDocs || loading}
                title={t('toolbar.generateDocsTitle')}
            >
                {generatingDocs ? t('toolbar.generateDocsLoading') : t('toolbar.generateDocs')}
            </button>

            {error && <span className="error">{error}</span>}

            <label className="theme-select" title={t('toolbar.language')}>
                <span className="theme-select-label">{t('toolbar.language')}</span>
                <select
                    value={localeMode}
                    onChange={(e) => setLocaleMode(e.target.value as LocaleMode)}
                >
                    {localeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </label>

            <label className="theme-select" title={t('toolbar.theme')}>
                <span className="theme-select-label">{t('toolbar.theme')}</span>
                <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as ThemeMode)}
                >
                    {themeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </label>
        </header>
    );
}