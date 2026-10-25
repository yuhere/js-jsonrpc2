export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONValue[] | { [key: string]: JSONValue };

export type SchemaKind = string;

export interface SchemaDescription {
  kind: SchemaKind;
  description?: string;
  nullable?: boolean;
  constraints?: Record<string, unknown>;
  children?: Record<string, unknown>;
}