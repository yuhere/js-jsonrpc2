import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useT } from '../i18n/I18nProvider';
import {
    MAX_OUTPUT_LINES,
    OUTPUT_FLUSH_MS,
    appendOutputLines,
    createOutputState,
    type OutputState,
} from './outputBuffer';

export interface OutputHandle {
    reset(): void;
    push(text: string): void;
    flush(): void;
}

interface TestOutputProps {
    placeholder: string;
}

export const TestOutput = memo(forwardRef<OutputHandle, TestOutputProps>(function TestOutput(
    { placeholder },
    ref,
) {
    const t = useT();
    const [state, setState] = useState<OutputState>(createOutputState);
    const pending = useRef<string[]>([]);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const epoch = useRef(0);
    const preRef = useRef<HTMLPreElement>(null);

    const apply = (texts: string[]) => {
        if (texts.length === 0) return;
        setState((prev) => appendOutputLines(prev, texts));
    };

    const flushNow = () => {
        if (timer.current != null) {
            clearTimeout(timer.current);
            timer.current = null;
        }
        const texts = pending.current;
        pending.current = [];
        apply(texts);
    };

    useImperativeHandle(ref, () => ({
        reset() {
            epoch.current += 1;
            if (timer.current != null) {
                clearTimeout(timer.current);
                timer.current = null;
            }
            pending.current = [];
            setState(createOutputState());
        },
        push(text: string) {
            const ticket = epoch.current;
            pending.current.push(text);
            if (timer.current != null) return;
            timer.current = setTimeout(() => {
                timer.current = null;
                if (ticket !== epoch.current) return;
                const texts = pending.current;
                pending.current = [];
                apply(texts);
            }, OUTPUT_FLUSH_MS);
        },
        flush() {
            flushNow();
        },
    }), []);

    useEffect(() => {
        const node = preRef.current;
        if (!node) return;
        node.scrollTop = node.scrollHeight;
    }, [state.lines]);

    useEffect(() => () => {
        if (timer.current != null) clearTimeout(timer.current);
    }, []);

    return (
        <pre className="output" ref={preRef}>
            {state.dropped > 0 && (
                <p className="hint">
                    {t('test.outputTruncated', { count: state.dropped, max: MAX_OUTPUT_LINES })}
                </p>
            )}
            {state.lines.length === 0
                ? placeholder
                : state.lines.map((line) => (
                    <div className="output-line" key={line.id}>{line.text}</div>
                ))}
        </pre>
    );
}));
