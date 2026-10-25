import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    root: "./webui",
    base: './',
    build: {
        outDir: '../htdoc',
        emptyOutDir: true,
        sourcemap: true,
        minify: false,
        target: 'es2020',
    },
});