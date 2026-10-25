import { RPCError } from '../errors/RPCError';
import { PERMISSION_DENIED } from '../errors/codes';
import type { MethodDescriptor } from './descriptor';
import type { Injectables } from '../types';


export async function checkPermission(descriptor: MethodDescriptor, injections: Injectables): Promise<void> {
  const grantTo = descriptor.grantTo;
  if (!grantTo || grantTo.length === 0) return;

  const permCheck = injections['perm_check'];
  if (typeof permCheck !== 'function') return;

  const result = await (permCheck as (grantTo: string[], descriptor: MethodDescriptor, injections: Injectables) => unknown)(
    grantTo,
    descriptor, 
    injections
  );

  if (result === true) return;

  if (result instanceof RPCError) {
    throw result;
  }

  throw new RPCError(PERMISSION_DENIED, 'Permission denied', `one of ${JSON.stringify(grantTo)} is necessary for [${descriptor.namespace}].`);
}