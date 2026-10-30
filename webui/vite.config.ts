import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 读取包根目录的 package.json（vite.config.ts 在 webui/ 下，root 是 ./webui）
const pkgPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'package.json',
);
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };


export default defineConfig({
    plugins: [react()],
    root: "./webui",
    base: './',
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version ?? '2.1.0'),
    },
    build: {
        outDir: '../htdoc',
        emptyOutDir: true,
        sourcemap: true,
        minify: false,
        target: 'es2020',
    },
});