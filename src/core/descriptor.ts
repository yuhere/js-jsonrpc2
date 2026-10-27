import { METHOD_NOT_FOUND, INVALID_PARAMS } from '../errors/codes';
import { RPCError } from '../errors/RPCError';
import { InjectableMarker, VoidMarker, StreamMarker, Schema } from '../schema/json';
import type { RPCDescriptor, RPCHandler, RPCSignature, RPCParamSlot } from '../types';

export interface IndexedParam {
  schema: Schema<unknown>;
  originalIndex: number;
}

export interface InjectableParam {
  name: string;
  originalIndex: number;
}

export interface MethodDescriptor {
  namespace: string;
  document?: RPCDescriptor['document'];
  grantTo?: string[];
  fn: RPCHandler;
  indexed: IndexedParam[];
  injectables: InjectableParam[];
  paramsCount: number;
  signature: RPCSignature;
  shouldStreamReturn: boolean;
}

function normalizeGrantTo(grantTo: RPCDescriptor['grantTo']): string[] | undefined {
  if (grantTo === undefined) return undefined;
  if (typeof grantTo === 'string') return [grantTo];
  if (!Array.isArray(grantTo)) {
    throw new Error('grantTo should be an array or string.');
  }
  for (const item of grantTo) {
    if (typeof item !== 'string') {
      throw new Error('grantTo should be an array of string.');
    }
  }
  return grantTo.slice();
}

export function buildDescriptor(descriptor: RPCDescriptor, fn: RPCHandler): MethodDescriptor {
  const signs = descriptor.signature;
  if (!Array.isArray(signs) || signs.length === 0) {
    throw new Error('the signature should contain a return type as its first item.');
  }
  const head = signs[0];
  if (head instanceof InjectableMarker) {
    throw new Error('Invalid signature[0], the first signature could not be an injectable.');
  }

  const shouldStreamReturn = head instanceof StreamMarker;
  const indexed: IndexedParam[] = [];
  const injectables: InjectableParam[] = [];

  for (let i = 1; i < signs.length; i++) {
    const slot = signs[i]!;
    if (slot instanceof InjectableMarker) {
      injectables.push({ name: slot.key, originalIndex: i - 1 });
    } else if (slot instanceof Schema) {
      indexed.push({ schema: slot, originalIndex: i - 1 });
    } else {
      throw new Error(`Invalid signature slot at index ${i}.`);
    }
  }

  const grantTo = normalizeGrantTo(descriptor.grantTo);
  const result: MethodDescriptor = {
    namespace: descriptor.namespace,
    fn,
    indexed,
    injectables,
    paramsCount: indexed.length + injectables.length,
    signature: signs,
    shouldStreamReturn
  };

  if (descriptor.document !== undefined) result.document = descriptor.document;
  if (grantTo !== undefined) result.grantTo = grantTo;

  return result;
}

export function signatureOf(descriptor: MethodDescriptor): unknown[] {
  return descriptor.signature
    .filter((slot): slot is Exclude<RPCParamSlot, InjectableMarker> => {
      return !(slot instanceof InjectableMarker)
    })
    .map((slot) => {
      if (slot instanceof VoidMarker) return { kind: 'void' };
      if (slot instanceof StreamMarker) {
        return { kind: 'stream', children: { inner: slot.inner.toJSON() } };
      }
      return slot.toJSON();
    });
}

export function lookup(methods: Map<string, MethodDescriptor>, method: string): MethodDescriptor {
  const found = methods.get(method);
  if (!found) {
    throw new RPCError(METHOD_NOT_FOUND, 'Method not found', JSON.stringify(method));
  }
  return found;
}

export function invalidParams(message: string, data?: unknown): RPCError {
  return new RPCError(INVALID_PARAMS, message, data);
}