import type { TransportKind } from '../client';
import { useTheme, type ThemeMode } from '../theme/ThemeProvider';

interface ToolbarProps {
    transport: TransportKind;
    onTransportChange: (t: TransportKind) => void;
    onRefresh: () => void;
    loading: boolean;
    error: string | null;
    /** 新增：生成文档 */
    onGenerateDocs: () => void;
    generatingDocs: boolean;
}

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: '跟随系统' },
    { value: 'light', label: '亮' },
    { value: 'dark', label: '暗' },
];

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

    return (
        <header className="toolbar">
            <h1>JSON-RPC 2.0</h1>

            <div className="segmented" role="group" aria-label="传输方式">
                <button
                    type="button"
                    className={transport === 'http' ? 'active' : ''}
                    onClick={() => onTransportChange('http')}
                >
                    HTTP
                </button>
                <button
                    type="button"
                    className={transport === 'ws' ? 'active' : ''}
                    onClick={() => onTransportChange('ws')}
                >
                    WebSocket
                </button>
            </div>

            <button onClick={onRefresh} disabled={loading}>
                {loading ? '刷新中…' : '刷新方法列表'}
            </button>

            <button
                onClick={onGenerateDocs}
                disabled={generatingDocs || loading || loading /* methods 空时由 App 拦截 */}
                title="拉取所有方法的帮助与签名，生成 Markdown 文档并下载"
            >
                {generatingDocs ? '生成中…' : '生成文档 ⬇'}
            </button>

            {error && <span className="error">{error}</span>}

            <label className="theme-select" title="主题">
                <span className="theme-select-label">主题</span>
                <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as ThemeMode)}
                >
                    {THEME_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </label>
        </header>
    );
}