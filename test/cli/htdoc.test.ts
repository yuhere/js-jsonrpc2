import path from 'node:path';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { htdocDir, resolveHtdocDir, resolveListenHost } from '../../src/cli/cli';

describe('cli htdoc directory', () => {
    it('walks up two levels from both the source and the compiled layout', () => {
        const root = path.resolve('/pkg');
        const expected = path.join(root, 'htdoc');
        expect(resolveHtdocDir(path.join(root, 'src', 'cli'))).toBe(expected);
        expect(resolveHtdocDir(path.join(root, 'dist', 'cli'))).toBe(expected);
    });

    it('finds the package htdoc when the module is loaded from source', () => {
        const dir = htdocDir();
        expect(path.basename(dir)).toBe('htdoc');
        expect(existsSync(path.join(dir, 'index.html'))).toBe(true);
    });
});

describe('cli listen host', () => {
    it('defaults to loopback and lets --host override HOST', () => {
        expect(resolveListenHost(['node', 'cli.js'], {})).toBe('127.0.0.1');
        expect(resolveListenHost(['node', 'cli.js'], { HOST: '0.0.0.0' })).toBe('0.0.0.0');
        expect(resolveListenHost(['node', 'cli.js', '--host', '0.0.0.0'], { HOST: '127.0.0.1' })).toBe('0.0.0.0');
    });
});
