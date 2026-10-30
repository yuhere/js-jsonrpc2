import { useT } from '../i18n/I18nProvider';
import type { MethodDetail as MethodDetailData } from '../hooks/useMethodDetail';
import { SchemaView } from './SchemaView';

export function MethodDetail({
    method,
    detail,
}: {
    method: string;
    detail: MethodDetailData;
}) {
    const t = useT();

    if (!method) {
        return (
            <section className="detail">
                <p className="hint">{t('method.selectHint')}</p>
            </section>
        );
    }
    const [returnSchema] = detail.signature;
    return (
        <section className="detail">
            <h2>{method}</h2>
            {detail.loading && <p className="hint">{t('method.loading')}</p>}
            {detail.error && (
                <p className="error">{t('method.loadFailed', { error: detail.error })}</p>
            )}
            <h3>{t('method.help')}</h3>
            <pre className="help">{detail.help || t('method.noHelp')}</pre>
            <h3>
                {t('method.returnType')}{' '}
                <span className="hint">{t('method.returnTypeHint')}</span>
            </h3>
            {returnSchema ? (
                <SchemaView schema={returnSchema} depth={0} defaultOpen />
            ) : (
                <p className="hint">{t('method.none')}</p>
            )}
        </section>
    );
}