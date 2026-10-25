import { createRepository, serveStdio, s } from '..';

const repository = createRepository();
repository.register(
    { namespace: 'echo', signature: [s.string(), s.string()] },
    (v: string) => v,
);

await serveStdio({ repository, framing: 'lines' });
