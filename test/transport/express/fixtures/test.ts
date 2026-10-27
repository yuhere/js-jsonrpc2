import { Repository } from '../../../../src/core/Repository';
import { s } from '../../../../src/schema/json';

export interface DebugTestOptions {
    withGrant?: boolean;
}

export function installDebugMethods(repository: Repository, options: DebugTestOptions = {}): void {
    repository.register(
        {
            namespace: 'subtract',
            document: 'subtract b from a',
            signature: [s.number(), s.number(), s.number()],
        },
        (a: number, b: number) => a - b,
    );
    repository.register(
        {
            namespace: 'sum',
            document: 'sum of numbers',
            signature: [s.number(), s.number(), s.number(), s.number()],
        },
        (a: number, b: number, c: number) => a + b + c,
    );
    repository.register(
        {
            namespace: 'notify_hello',
            document: 'notification handler',
            signature: [s.string(), s.number()],
        },
        (_n: number) => 'hello',
    );
    repository.register(
        {
            namespace: 'notify_sum',
            document: 'notification handler',
            signature: [s.string(), s.number()],
        },
        (...args: number[]) => args.reduce((acc, cur) => acc + cur, 0),
    );
    repository.register(
        {
            namespace: 'get_data',
            document: 'returns ["hello", 5]',
            signature: [s.array(s.unknown())],
        },
        () => ['hello', 5],
    );
    repository.register(
        {
            namespace: 'update',
            document: 'notification target',
            signature: [s.void(), s.array(s.number())],
        },
        () => undefined,
    );
    repository.register(
        {
            namespace: 'union.nullable',
            signature: [s.union([s.string().nullable(), s.number()]).nullable()],
        },
        () => null,
    );
    if (options.withGrant) {
        repository.register(
            {
                namespace: 'grant',
                document: 'echoes the first argument',
                grantTo: ['grant'],
                signature: [s.string(), s.string()],
            },
            (value: string) => value,
        );
    }
}

export default installDebugMethods;