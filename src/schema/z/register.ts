import { z } from "zod";

import {
    Schema,
    VoidMarker,
    InjectableMarker,
    StreamMarker,
} from "../json";

const schemaInstance = z.instanceof(Schema);
const voidMarker = z.instanceof(VoidMarker);
const injectableMarker = z.instanceof(InjectableMarker);
const streamMarker = z.instanceof(StreamMarker);

const returnSchema = z.union([schemaInstance, voidMarker, streamMarker]);
const parameterSchema = z.union([schemaInstance, injectableMarker]);
const signatureSchema = z.tuple([returnSchema]).rest(parameterSchema);
const documentSchema = z.union([z.string(), z.function()]);

const descriptorSchema = z.object({
    namespace: z.string().min(1),
    document: documentSchema.optional(),
    grantTo: z.array(z.string()).optional(),
    signature: signatureSchema,
}).strict();

export const registerSchema = z.tuple([
    descriptorSchema,
    z.function(),
]);
