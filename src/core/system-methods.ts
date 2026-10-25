// src/core/system-methods.ts
import { RPCError } from '../errors/RPCError';
import { METHOD_NOT_FOUND, PERMISSION_DENIED } from '../errors/codes';
import { checkPermission } from './permission';
import { s } from '../schema/json';
import type { Repository } from './Repository';
import type { MethodDescriptor } from './descriptor';

function notFound(namespace: string): RPCError {
  return new RPCError(METHOD_NOT_FOUND, 'Method not found', `Method not found.[${namespace}]`);
}

async function assertAccessible(descriptor: MethodDescriptor, permCheck: unknown): Promise<void> {
  try {
    await checkPermission(descriptor, { perm_check: permCheck });
  } catch (error) {
    if (error instanceof RPCError && error.code === PERMISSION_DENIED) {
      throw notFound(descriptor.namespace);
    }
    throw error;
  }
}

export function registerSystemMethods(repository: Repository): void {
  repository.register(
    {
      namespace: 'system.listMethods',
      document: 'This method returns an array of strings, one for each method supported by the RPC server.',
      signature: [s.array(s.string()), s.injectable('perm_check')],
    },
    async function systemListMethods(permCheck?: unknown) {
      const visible: string[] = [];
      for (const name of repository.list()) {
        const descriptor = repository.get(name);
        if (!descriptor) continue;
        try {
          await assertAccessible(descriptor, permCheck);
          visible.push(name);
        } catch (error) {
          if (error instanceof RPCError && error.code === METHOD_NOT_FOUND) continue;
          throw error;
        }
      }
      return visible;
    },
  );

  repository.register(
    {
      namespace: 'system.methodSignature',
      document:
        'This method takes one parameter, the name of a method implemented by the RPC server.\n\n' +
        'It returns an array of possible signatures for this method.\n' +
        'A signature is an array of types.\n' +
        'The first of these types is the return type of the method, the rest are parameters.\n',
      signature: [s.array(s.unknown()), s.string(), s.injectable('perm_check')],
    },
    async function systemMethodSignature(namespace: string, permCheck?: unknown) {
      const descriptor = repository.get(namespace);
      if (!descriptor) throw notFound(namespace);
      await assertAccessible(descriptor, permCheck);
      return repository.signatureOf(descriptor);
    },
  );

  repository.register(
    {
      namespace: 'system.methodHelp',
      document:
        'This method takes one parameter, the name of a method implemented by the RPC server.\n\n' +
        'It returns a documentation string describing the use of that method.\n' +
        'If no such string is available, an empty string is returned.\n' +
        'The documentation string may contain HTML markup.\n',
      signature: [s.string(), s.string(), s.injectable('perm_check')],
    },
    async function systemMethodHelp(namespace: string, permCheck?: unknown) {
      const descriptor = repository.get(namespace);
      if (!descriptor) throw notFound(namespace);
      await assertAccessible(descriptor, permCheck);
      const document = descriptor.document;
      if (typeof document === 'function') {
        return (await document(descriptor as never)) ?? null;
      }
      return document === undefined ? null : document;
    },
  );
}