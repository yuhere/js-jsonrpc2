import { useEffect, useState } from 'react';
import type { RpcClient } from '../api/rpc';
import type { SchemaDescription } from '../api/schema';

export interface MethodDetail {
    help: string;
    /** system.methodSignature 返回的 Schema 列表（每项对应一个参数） */
    signature: SchemaDescription[];
    error: string | null;
    loading: boolean;
}

const EMPTY: MethodDetail = { help: '', signature: [], error: null, loading: false };

function isSchemaDescription(v: unknown): v is SchemaDescription {
    return !!v && typeof v === 'object' && typeof (v as SchemaDescription).kind === 'string';
}

export function useMethodDetail(rpc: RpcClient, method: string): MethodDetail {
    const [detail, setDetail] = useState<MethodDetail>(EMPTY);

    useEffect(() => {
        if (!method) {
            setDetail(EMPTY);
            return;
        }
        let cancelled = false;
        setDetail({ help: '', signature: [], error: null, loading: true });

        (async () => {
            try {
                const [help, signature] = await Promise.all([
                    rpc.call<string>('system.methodHelp', method).catch(() => ''),
                    rpc.call<unknown[]>('system.methodSignature', method).catch(() => []),
                ]);
                if (cancelled) return;
                const sigArr = Array.isArray(signature) ? signature.filter(isSchemaDescription) : [];
                setDetail({
                    help: typeof help === 'string' ? help : '',
                    signature: sigArr,
                    error: null,
                    loading: false,
                });
            } catch (e) {
                if (cancelled) return;
                setDetail({
                    help: '',
                    signature: [],
                    error: e instanceof Error ? e.message : String(e),
                    loading: false,
                });
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [rpc, method]);

    return detail;
}