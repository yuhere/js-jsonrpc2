import { useCallback, useEffect, useState } from 'react';
import type { RPCClient } from '../api/rpc';

export function useMethods(rpc: RPCClient) {
    const [methods, setMethods] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const list = await rpc.call<string[]>('system.listMethods');
            setMethods(Array.isArray(list) ? [...list].sort() : []);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [rpc]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return { methods, loading, error, refresh };
}