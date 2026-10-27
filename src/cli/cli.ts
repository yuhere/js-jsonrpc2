#!/usr/bin/env node
// src/cli.ts
//
// `jsonrpc2-demo` 命令入口：启动带完整 demo 方法的 HTTP + WebSocket 服务，
// 并自动打开 WebUI（默认 http://localhost:5000/）。
//
// 环境变量：
//   PORT     监听端口（默认 5000；被占用时自动换随机端口）
//   NO_OPEN  设为 1 时不自动打开浏览器
//   HOST     监听地址（默认 0.0.0.0）
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createRepository } from '../core/Repository';
import { installDemoMethods } from './demo-methods';
import { createExpressRouter } from '../transport/express';
import { attachWebSocket } from '../transport/ws';

const here = path.dirname(fileURLToPath(import.meta.url));

function htdocDir(): string {
    // dist/cli.js → 包根/htdoc
    return path.resolve(here, '..', 'htdoc');
}

function openBrowser(url: string): void {
    let cmd: string;
    let args: string[];
    if (process.platform === 'darwin') {
        cmd = 'open';
        args = [url];
    } else if (process.platform === 'win32') {
        // start 的第一个参数会被当作窗口标题，传空字符串占位。
        cmd = 'cmd';
        args = ['/c', 'start', '""', url];
    } else {
        cmd = 'xdg-open';
        args = [url];
    }
    try {
        const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
        child.on('error', () => {
            console.log(`(无法自动打开浏览器，请手动访问 ${url})`);
        });
        child.unref();
    } catch {
        console.log(`(无法自动打开浏览器，请手动访问 ${url})`);
    }
}

function listen(
    server: ReturnType<typeof createServer>,
    host: string,
    port: number,
): Promise<number> {
    return new Promise((resolve, reject) => {
        const onError = (err: NodeJS.ErrnoException) => {
            server.off('listening', onListening);
            if (err.code === 'EADDRINUSE' && port !== 0) {
                console.warn(`端口 ${port} 已被占用，改用随机端口重试。`);
                server.once('error', reject);
                server.once('listening', onListening);
                server.listen(0, host);
                return;
            }
            reject(err);
        };
        const onListening = () => {
            server.off('error', onError);
            const addr = server.address();
            const actual = typeof addr === 'object' && addr ? addr.port : port;
            resolve(actual);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
    });
}

function shouldOpenBrowser(): boolean {
    if (process.env['NO_OPEN'] === '1') return false;
    if (process.argv.includes('--no-open')) return false;
    return true;
}

async function main(): Promise<void> {
    const repository = createRepository({ withSystemMethods: true });
    installDemoMethods(repository);

    const app = express();
    app.use('/', createExpressRouter(repository, { useHtdoc: true }));

    const server = createServer(app);
    attachWebSocket(server, repository, {
        path: '/',
        mkInjectable: ({ socket, request }, repo) => ({
            socket,
            request,
            repository: repo,
            requestId: `ws-${Math.random().toString(36).slice(2, 8)}`,
        }),
    });

    const host = process.env['HOST'] ?? '0.0.0.0';
    const requestedPort = Number(process.env['PORT'] ?? 5000);
    const port = await listen(server, host, requestedPort);

    const url = `http://localhost:${port}/`;
    const wsUrl = `ws://localhost:${port}/`;
    const hasWebUI = existsSync(path.join(htdocDir(), 'index.html'));

    console.log('');
    console.log('  js-jsonrpc2 demo');
    console.log('  ────────────────────────────────────────');
    console.log(`  HTTP  (POST /)     ${url}`);
    console.log(`  WebSocket          ${wsUrl}`);
    if (hasWebUI) {
        console.log(`  WebUI              ${url}`);
    } else {
        console.log('  WebUI              （未构建：请先运行 `npm run build:webui`）');
    }
    console.log('');
    console.log('  按 Ctrl+C 停止。');
    console.log('');

    // 只有 WebUI 存在且没有被显式禁用时才打开。
    if (hasWebUI && shouldOpenBrowser()) {
        openBrowser(url);
    }

    let shuttingDown = false;
    const shutdown = () => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log('\n正在关闭…');
        server.close(() => process.exit(0));
        // 兜底：3 秒内没关完就强退
        setTimeout(() => process.exit(0), 3000).unref();
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
}

main().catch((err) => {
    console.error('启动失败：', err);
    process.exit(1);
});