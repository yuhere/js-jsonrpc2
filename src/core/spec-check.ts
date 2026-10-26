import { RPCRequestSchema } from '../schema/z/protocol';
import { RPCError } from '../errors/RPCError';
import { INVALID_REQUEST } from '../errors/codes';
import type { RPCRequestInput } from '../types';

export function validateRequest(input: unknown): RPCRequestInput {
  const result = RPCRequestSchema.safeParse(input);
  if (!result.success) {
    throw new RPCError(INVALID_REQUEST, 'Invalid Request', result.error.message);
  }
  return result.data as unknown as RPCRequestInput;
}
