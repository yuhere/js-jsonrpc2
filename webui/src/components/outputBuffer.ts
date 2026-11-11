/** 输出区最多保留的行数。更早的行会被丢掉，并计入 dropped。 */
export const MAX_OUTPUT_LINES = 500;

/** 流式输出合并进界面的间隔。 */
export const OUTPUT_FLUSH_MS = 80;

export interface OutputLine {
    id: number;
    text: string;
}

export interface OutputState {
    lines: OutputLine[];
    dropped: number;
    nextId: number;
}

export function createOutputState(): OutputState {
    return { lines: [], dropped: 0, nextId: 1 };
}

/** 追加文本行，超出 max 时从头部截掉，并累加 dropped。 */
export function appendOutputLines(
    state: OutputState,
    texts: readonly string[],
    max = MAX_OUTPUT_LINES,
): OutputState {
    if (texts.length === 0) return state;
    const added: OutputLine[] = texts.map((text, index) => ({
        id: state.nextId + index,
        text,
    }));
    const combined = state.lines.concat(added);
    const nextId = state.nextId + texts.length;
    if (combined.length <= max) {
        return { lines: combined, dropped: state.dropped, nextId };
    }
    const cut = combined.length - max;
    return {
        lines: combined.slice(cut),
        dropped: state.dropped + cut,
        nextId,
    };
}
