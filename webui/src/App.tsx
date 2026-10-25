import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRpc, type TransportKind } from './api/rpc';
import { useMethods } from './hooks/useMethods';
import { useMethodDetail } from './hooks/useMethodDetail';
import { Toolbar } from './components/Toolbar';
import { MethodTree } from './components/MethodTree';
import { MethodDetail } from './components/MethodDetail';
import { TestPanel } from './components/TestPanel';
import {
    collectApiDoc,
    downloadText,
    renderMarkdown,
} from './api/docGen';

const ENDPOINT = '';

export default function App() {
    const [transport, setTransport] = useState<TransportKind>('http');
    const [selected, setSelected] = useState('');
    const [generatingDocs, setGeneratingDocs] = useState(false);

    const rpc = useMemo(() => {
        return createRpc({ transport, endpoint: ENDPOINT });
    }, [transport]);

    useEffect(() => {
        return () => rpc.close();
    }, [rpc]);

    const { methods, loading, error, refresh } = useMethods(rpc);
    const detail = useMethodDetail(rpc, selected);

    const generateDocs = useCallback(async () => {
        if (methods.length === 0) {
            alert('方法列表为空，请先刷新方法列表。');
            return;
        }
        setGeneratingDocs(true);
        try {
            const doc = await collectApiDoc(rpc, methods);
            const md = renderMarkdown(doc);
            const ts = new Date()
                .toISOString()
                .replace(/[:.]/g, '-')
                .slice(0, 19);
            downloadText(`jsonrpc-api-doc-${ts}.md`, md, 'text/markdown');
        } catch (e) {
            alert(`生成文档失败：${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setGeneratingDocs(false);
        }
    }, [rpc, methods]);

    return (
        <div className="app">
            <Toolbar
                transport={transport}
                onTransportChange={setTransport}
                onRefresh={refresh}
                loading={loading}
                error={error}
                onGenerateDocs={generateDocs}
                generatingDocs={generatingDocs}
            />
            <main>
                <aside className="sidebar">
                    <h2>Methods</h2>
                    <MethodTree methods={methods} selected={selected} onSelect={setSelected} />
                </aside>
                <div className="content">
                    <MethodDetail method={selected} detail={detail} />
                    <TestPanel
                        method={selected}
                        detail={detail}
                        rpc={rpc}
                        transport={transport}
                        endpoint={ENDPOINT}
                    />
                </div>
            </main>
        </div>
    );
}