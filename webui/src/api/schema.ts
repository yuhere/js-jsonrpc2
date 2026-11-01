/**
 * 与服务端 `schema/json/primitives.ts` 的 `SchemaDescription` 对齐。
 * 按 `kind` 区分的联合类型；无 `children` 包装层。
 *
 * 另含签名专用的 `stream` / `void`（由 `system.methodSignature` 返回，
 * 不是普通 Schema 的 toJSON 结果）。
 */

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
  kind: SchemaKind | string;
  description?: string;
  nullable?: boolean;
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
  kind: "object";
  properties: Record<string, SchemaDescription>;
}

export interface ArraySchemaDescription extends BaseSchemaDescription {
  kind: "array";
  element: SchemaDescription;
}

export interface RecordSchemaDescription extends BaseSchemaDescription {
  kind: "record";
  value: SchemaDescription;
}

export interface UnionSchemaDescription extends BaseSchemaDescription {
  kind: "union";
  options: SchemaDescription[];
}

export interface TupleSchemaDescription extends BaseSchemaDescription {
  kind: "tuple";
  elements: SchemaDescription[];
}

/** 签名返回槽：流式；子描述在 `inner`（与后端 marker 语义一致） */
export interface StreamSchemaDescription extends BaseSchemaDescription {
  kind: "stream";
  inner: SchemaDescription;
}

export type SchemaDescription =
  | LeafSchemaDescription
  | ObjectSchemaDescription
  | ArraySchemaDescription
  | RecordSchemaDescription
  | UnionSchemaDescription
  | TupleSchemaDescription
  | StreamSchemaDescription;

/** 类型守卫 */
export function isSchemaDescription(v: unknown): v is SchemaDescription {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as SchemaDescription).kind === "string"
  );
}