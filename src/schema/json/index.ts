import { primitives } from "./primitives";
import { markers } from "./marker";

export * from "./primitives";
export * from "./marker";

/**
 * Schema factories. `signature[0]` is the return schema. Later slots are
 * parameters or `s.injectable(key)`.
 */
export const s = {
    /** A string. @example s.string().min(1) */
    string: primitives.string,
    /** A finite number. @example s.number().min(0).max(10) */
    number: primitives.number,
    /** A boolean. @example s.boolean() */
    boolean: primitives.boolean,
    /** An exact string, number, or boolean. @example s.literal('ok') */
    literal: primitives.literal,
    /** An array of one schema. @example s.array(s.string()) */
    array: primitives.array,
    /** An object. Declared keys are required and extra keys are rejected. @example s.object({ id: s.string() }) */
    object: primitives.object,
    /** A string-keyed object with one value schema. @example s.record(s.number()) */
    record: primitives.record,
    /** A value matching any member. Member nullability is stripped. @example s.union([s.string(), s.number()]) */
    union: primitives.union,
    /** A fixed-length array. @example s.tuple([s.string(), s.number()]) */
    tuple: primitives.tuple,
    /** One of the given strings. @example s.enum(['a', 'b']) */
    enum: primitives.enum,
    /** Any JSON value, including null. @example s.unknown() */
    unknown: primitives.unknown,
    /** Exactly null. @example s.null() */
    null: primitives.null,
    /** No meaningful return value. Only valid as signature[0]. @example s.void() */
    void: markers.void,
    /** A server-supplied parameter. Not valid as signature[0]. @example s.injectable('request') */
    injectable: markers.injectable,
    /** A streamed return. Only valid as signature[0]. @example s.stream(s.string()) */
    stream: markers.stream,
};
