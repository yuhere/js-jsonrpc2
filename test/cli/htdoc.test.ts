import path from 'node:path';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { htdocDir, resolveHtdocDir } from '../../src/cli/cli';

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
