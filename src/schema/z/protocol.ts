import { s } from "../json";

export const RPCVersion = '2.0';
export type RPCVersion = '2.0';

export const RPCRequestSchema = s.object({
    jsonrpc: s.literal(RPCVersion),
    method: s.string().min(1),
    params: s.array(s.unknown()).nullable(),
    id: s.union([s.string().min(1), s.number()]),
}).strict();
