import { describe, expect, it } from 'vitest';
import { appendOutputLines, createOutputState, MAX_OUTPUT_LINES } from './outputBuffer';

describe('appendOutputLines', () => {
    it('appends lines and keeps stable ids', () => {
        const first = appendOutputLines(createOutputState(), ['a', 'b']);
        const second = appendOutputLines(first, ['c']);
        expect(second.lines.map((line) => line.text)).toEqual(['a', 'b', 'c']);
        expect(second.lines.map((line) => line.id)).toEqual([1, 2, 3]);
        expect(second.dropped).toBe(0);
    });

    it('drops the oldest lines and counts them', () => {
        let state = createOutputState();
        state = appendOutputLines(state, ['0', '1', '2', '3', '4'], 3);
        expect(state.lines.map((line) => line.text)).toEqual(['2', '3', '4']);
        expect(state.lines.map((line) => line.id)).toEqual([3, 4, 5]);
        expect(state.dropped).toBe(2);

        state = appendOutputLines(state, ['5', '6'], 3);
        expect(state.lines.map((line) => line.text)).toEqual(['4', '5', '6']);
        expect(state.dropped).toBe(4);
        expect(state.nextId).toBe(8);
    });

    it('uses the default cap', () => {
        const texts = Array.from({ length: MAX_OUTPUT_LINES + 2 }, (_, i) => String(i));
        const state = appendOutputLines(createOutputState(), texts);
        expect(state.lines).toHaveLength(MAX_OUTPUT_LINES);
        expect(state.lines[0]?.text).toBe('2');
        expect(state.dropped).toBe(2);
    });

    it('leaves the state unchanged when there is nothing to add', () => {
        const state = createOutputState();
        expect(appendOutputLines(state, [])).toBe(state);
    });
});
