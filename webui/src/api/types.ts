export interface RPCErrorPayload {
  code: number;
  message: string;
  data?: unknown;
}

export interface RPCResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: T;
  error?: RPCErrorPayload;
}

export interface Signature {
  [index: number]: string | string[];
}