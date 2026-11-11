import { RPCError } from '../errors/RPCError';
import { METHOD_NOT_FOUND, PERMISSION_DENIED } from '../errors/codes';
import type { MethodDescriptor } from './descriptor';
import type { Injections } from '../types';

export async function checkPermission(descriptor: MethodDescriptor, injections: Injections): Promise<void> {
  const grantTo = descriptor.grantTo;
  if (!grantTo || grantTo.length === 0) return;

  const permCheck = injections['perm_check'];
  if (typeof permCheck !== 'function') return;

  const result = await permCheck(grantTo, descriptor, injections);

  if (result === true) return;

  if (result instanceof RPCError) {
    throw result;
  }

  throw new RPCError(PERMISSION_DENIED, 'Permission denied', `one of ${JSON.stringify(grantTo)} is necessary for [${descriptor.namespace}].`);
}

export async function assertAccessible(descriptor: MethodDescriptor, injections: Injections): Promise<void> {
  try {
    await checkPermission(descriptor, injections);
  } catch (error) {
    if (error instanceof RPCError && error.code === PERMISSION_DENIED) {
      throw new RPCError(METHOD_NOT_FOUND, 'Method not found', `Method not found.[${descriptor.namespace}]`);
    }
    throw error;
  }
}
