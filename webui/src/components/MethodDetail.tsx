import type { MethodDetail as MethodDetailData } from '../hooks/useMethodDetail';
import { SchemaView } from './SchemaView';

export function MethodDetail({
    method,
    detail,
}: {
    method: string;
    detail: MethodDetailData;
}) {
    if (!method) {
        return (
            <section className="detail">
                <p className="hint">← 从左侧选择一个方法查看帮助与签名。</p>
            </section>
        );
    }

    const [returnSchema] = detail.signature;

    return (
        <section className="detail">
            <h2>{method}</h2>
            {detail.loading && <p className="hint">加载中…</p>}
            {detail.error && <p className="error">加载失败：{detail.error}</p>}

            <h3>Help</h3>
            <pre className="help">{detail.help || '（无帮助信息）'}</pre>

            <h3>
                返回类型{' '}
                <span className="hint">
                    （服务端不会校验执行结果是否符合此类型，实际返回值可能会有所不同）
                </span>
            </h3>
            {returnSchema ? (
                <SchemaView schema={returnSchema} depth={0} defaultOpen />
            ) : (
                <p className="hint">（暂无）</p>
            )}
        </section>
    );
}