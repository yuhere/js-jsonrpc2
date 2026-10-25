import type { RPCErrorPayload } from '../types';

export class RPCError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'RPCError';
    this.code = code;
    if (data !== undefined) this.data = data;
    // Restore prototype chain in transpiled output.
    Object.setPrototypeOf(this, RPCError.prototype);
  }

  toPayload(): RPCErrorPayload {
    const payload: RPCErrorPayload = { code: this.code, message: this.message };
    if (this.data !== undefined) payload.data = this.data;
    return payload;
  }

  toJSON(): RPCErrorPayload {
    return this.toPayload();
  }
}