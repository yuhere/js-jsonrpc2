export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONValue[] | { [key: string]: JSONValue };

export type SchemaKind =
  | "string"
  | "number"
  | "boolean"
  | "literal"
  | "enum"
  | "unknown"
  | "null"
  | "void"
  | "object"
  | "array"
  | "record"
  | "union"
  | "tuple"
  | "stream";

export interface BaseSchemaDescription {
  kind: SchemaKind;
  description?: string;
  nullable?: boolean;
  validate?: boolean;
  constraints?: Record<string, unknown>;
}

/** 叶子：无子节点 */
export interface LeafSchemaDescription extends BaseSchemaDescription {
  kind:
    | "string"
    | "number"
    | "boolean"
    | "literal"
    | "enum"
    | "unknown"
    | "null"
    | "void";
}

export interface ObjectSchemaDescription extends BaseSchemaDescription {
  kind: 'object';
  properties?: Record<string, SchemaDescription>;
}

export interface ArraySchemaDescription extends BaseSchemaDescription {
  kind: 'array';
  element?: SchemaDescription;
}

export interface RecordSchemaDescription extends BaseSchemaDescription {
  kind: 'record';
  value?: SchemaDescription;
}

export interface UnionSchemaDescription extends BaseSchemaDescription {
  kind: 'union';
  options?: SchemaDescription[];
}

export interface TupleSchemaDescription extends BaseSchemaDescription {
  kind: 'tuple';
  elements?: SchemaDescription[];
}

export interface StreamSchemaDescription extends BaseSchemaDescription {
  kind: 'stream';
  inner?: SchemaDescription;
}

export type SchemaDescription =
  | LeafSchemaDescription
  | ObjectSchemaDescription
  | ArraySchemaDescription
  | RecordSchemaDescription
  | UnionSchemaDescription
  | TupleSchemaDescription
  | StreamSchemaDescription
  | BaseSchemaDescription;

export function isSchemaDescription(v: unknown): v is SchemaDescription {
  return !!v && typeof v === 'object' && typeof (v as SchemaDescription).kind === 'string';
}