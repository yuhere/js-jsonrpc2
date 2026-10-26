import { RPCError } from '../errors/RPCError';
import { INVALID_PARAMS } from '../errors/codes';
import type { MethodDescriptor } from './descriptor';
import type { Injections } from '../types';

export async function convertParams(
  descriptor: MethodDescriptor,
  params: unknown,
  injections: Injections,
): Promise<unknown[]> {
  let raw = params;
  if (raw === undefined || raw === null) raw = [];
  if (!Array.isArray(raw)) {
    throw new RPCError(INVALID_PARAMS, 'Invalid params', 'The parameters must be an array.');
  }
  if (raw.length !== descriptor.indexed.length) {
    throw new RPCError(
      INVALID_PARAMS,
      'Invalid params',
      `Invalid parameters count. \`${raw.length}\` parameter(s) supplied to \`${descriptor.namespace}\`, expected \`${descriptor.indexed.length}\` parameter(s).`,
    );
  }

  const converted = new Array<unknown>(descriptor.paramsCount);
  for (const injectable of descriptor.injectables) {
    const rawValue = injections[injectable.name];
    const value = typeof rawValue === 'function' ? await (rawValue as () => unknown | Promise<unknown>)() : rawValue;
    converted[injectable.originalIndex] = value;
  }

  for (let j = 0; j < descriptor.indexed.length; j++) {
    const entry = descriptor.indexed[j]!;
    const result = entry.schema.safeParse(raw[j]);
    if (!result.success) {
      throw new RPCError(
        INVALID_PARAMS,
        'Invalid params',
        `Invalid parameter \`params[${j}]\` for \`${descriptor.namespace}\`: ${result.error.message}`,
      );
    }
    converted[entry.originalIndex] = result.data;
  }

  return converted;
}
