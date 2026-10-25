import express from 'express';
import type { Express } from 'express';
import { createExpressRouter } from '../../../../src/transport/express/middleware';
import { Repository } from '../../../../src/core/Repository';
import { installDebugMethods } from './test';

export function createDebugApp(): { app: Express; repository: Repository } {
    const repository = new Repository();
    installDebugMethods(repository, { withGrant: true });
    const app = express();
    app.use('/', createExpressRouter(repository, {}));
    return { app, repository };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const { app } = createDebugApp();
    const port = Number(process.env['PORT'] ?? 5000);
    app.listen(port, () => {
        console.log(`js-jsonrpc2 debug server listening on http://localhost:${port}`);
    });
}
