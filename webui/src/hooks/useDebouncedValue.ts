import { useEffect, useState } from 'react';

/**
 * 返回 `value` 的防抖版本：`value` 停止变化 `delayMs` 毫秒后才更新返回值。
 * 初始值立即生效（首次渲染不会延迟）。
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
    const [debounced, setDebounced] = useState<T>(value);

    useEffect(() => {
        if (delayMs <= 0) {
            setDebounced(value);
            return;
        }
        const t = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(t);
    }, [value, delayMs]);

    return debounced;
}