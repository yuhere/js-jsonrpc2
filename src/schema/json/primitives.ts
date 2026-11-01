/**
 * JSON 数据类型。
 *
 * 不包含 undefined、bigint、symbol、function、NaN、Infinity 等
 * 非法 JSON 值。
 */
export type JSONPrimitive = string | number | boolean | null;

export type JSONValue =
  | JSONPrimitive
  | JSONValue[]
  | { [key: string]: JSONValue };

export type SchemaKind = string;

export interface BaseSchemaDescription {
  kind: SchemaKind;
  description?: string;
  nullable?: boolean;
  constraints?: Record<string, unknown>;
}

export interface LeafSchemaDescription extends BaseSchemaDescription {
  kind: "string" | "number" | "boolean" | "literal" | "enum" | "unknown" | "null";
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

export type SchemaDescription =
  | LeafSchemaDescription
  | ObjectSchemaDescription
  | ArraySchemaDescription
  | RecordSchemaDescription
  | UnionSchemaDescription
  | TupleSchemaDescription;

export class SchemaValidationError extends Error {
  constructor(
    message: string,
    public readonly path: string[] = [],
  ) {
    super(path.length > 0 ? `${path.join(".")}: ${message}` : message);
    this.name = "SchemaValidationError";
  }
}

/**
 * 所有 Schema 的抽象基类。
 *
 * 只负责 description 与描述输出；nullability 由 `NullableSchema` 提供。
 * `UnknownSchema` / `NullSchema` 直接继承本类——它们天然接受 null，
 * 不需要 `.nullable()`。
 */
export abstract class Schema<T> {
  abstract readonly kind: SchemaKind;

  private description: string = "";

  describe(description: string): this {
    return this.cloneWith({ description });
  }

  /**
   * 创建保留原型和现有字段的新实例，供不可变链式方法使用。
   */
  protected cloneWith(updates: Record<string, unknown>): this {
    const clone = Object.assign(
      Object.create(Object.getPrototypeOf(this)) as object,
      this,
    );

    return Object.assign(clone, updates) as this;
  }

  getDescription(): string {
    return this.description;
  }

  parse(input: unknown): T {
    return this._parse(input, []);
  }

  safeParse(
    input: unknown,
  ):
    | { success: true; data: T }
    | { success: false; error: SchemaValidationError } {
    try {
      return { success: true, data: this.parse(input) };
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        return { success: false, error };
      }

      throw error;
    }
  }

  protected abstract _parse(input: unknown, path: string[]): T;

  protected abstract _describe(): SchemaDescription;

  toJSON(): SchemaDescription {
    const result = this._describe();
    const description = this.getDescription();

    if (description !== undefined) {
      result.description = description;
    }

    return result;
  }

  protected fail(message: string, path: string[]): never {
    throw new SchemaValidationError(message, path);
  }
}

/**
 * 支持 nullability 的 Schema 基类。
 *
 * 除 `UnknownSchema` / `NullSchema` 外的所有具体 Schema 都继承本类。
 *
 * - `nullable()` / `nullable(true)`  → 允许 null
 * - `nullable(false)`                → 不允许 null（撤销之前的标记）
 *
 * `_parse` 在调用子类 `_parseValue` 前统一做 null 短路；
 * `toJSON()` 在基类输出上附加 `nullable: true`。
 */
export abstract class NullableSchema<T> extends Schema<T | null> {
  private _nullable: boolean = false;

  nullable(value: boolean = true): this {
    return this.cloneWith({ _nullable: value });
  }

  isNullable(): boolean {
    return this._nullable;
  }

  protected _parse(input: unknown, path: string[]): T | null {
    if (this._nullable && input === null) {
      return null;
    }
    return this._parseValue(input, path);
  }

  protected abstract _parseValue(input: unknown, path: string[]): T;

  override toJSON(): SchemaDescription {
    const result = super.toJSON();
    if (this._nullable) {
      result.nullable = true;
    }
    return result;
  }
}

export class StringSchema<K extends string = "string"> extends NullableSchema<string> {
  readonly kind = "string" as K;

  constructor() {
    super();
  }

  private minimum?: number;
  private maximum?: number;

  min(value: number): this {
    this.validateBound(value);
    return this.cloneWith({ minimum: value });
  }

  max(value: number): this {
    this.validateBound(value);
    return this.cloneWith({ maximum: value });
  }

  protected _parseValue(input: unknown, path: string[]): string {
    if (typeof input !== "string") {
      return this.fail("Expected a string", path);
    }

    if (this.minimum !== undefined && input.length < this.minimum) {
      return this.fail(`Expected at least ${this.minimum} characters`, path);
    }

    if (this.maximum !== undefined && input.length > this.maximum) {
      return this.fail(`Expected at most ${this.maximum} characters`, path);
    }

    return input;
  }

  protected _describe(): LeafSchemaDescription {
    const constraints = buildConstraints({
      min: this.minimum,
      max: this.maximum,
    });

    return {
      kind: this.kind as LeafSchemaDescription["kind"],
      ...(constraints ? { constraints } : {}),
    };
  }

  protected validateBound(value: number): void {
    if (!globalThis.Number.isInteger(value) || value < 0) {
      throw new TypeError("String min/max must be non-negative integers");
    }
  }
}

export class NumberSchema extends NullableSchema<number> {
  readonly kind = "number" as const;

  constructor() {
    super();
  }

  private minimum?: number;
  private maximum?: number;

  min(value: number): this {
    this.validateBound(value);
    return this.cloneWith({ minimum: value });
  }

  max(value: number): this {
    this.validateBound(value);
    return this.cloneWith({ maximum: value });
  }

  protected _parseValue(input: unknown, path: string[]): number {
    if (typeof input !== "number" || !globalThis.Number.isFinite(input)) {
      return this.fail("Expected a finite number", path);
    }

    if (this.minimum !== undefined && input < this.minimum) {
      return this.fail(`Expected a number >= ${this.minimum}`, path);
    }

    if (this.maximum !== undefined && input > this.maximum) {
      return this.fail(`Expected a number <= ${this.maximum}`, path);
    }

    return input;
  }

  protected _describe(): LeafSchemaDescription {
    const constraints = buildConstraints({
      min: this.minimum,
      max: this.maximum,
    });

    return {
      kind: this.kind,
      ...(constraints ? { constraints } : {}),
    };
  }

  protected validateBound(value: number): void {
    if (!globalThis.Number.isFinite(value)) {
      throw new TypeError("Number min/max must be finite numbers");
    }
  }
}

export class BooleanSchema extends NullableSchema<boolean> {
  readonly kind = "boolean" as const;

  constructor() {
    super();
  }

  protected _parseValue(input: unknown, path: string[]): boolean {
    if (typeof input !== "boolean") {
      return this.fail("Expected a boolean", path);
    }

    return input;
  }

  protected _describe(): LeafSchemaDescription {
    return { kind: this.kind };
  }
}

export type LiteralValue = string | number | boolean;

export class LiteralSchema<
  const T extends LiteralValue,
> extends NullableSchema<T> {
  readonly kind = "literal" as const;

  constructor(private readonly expected: T) {
    super();

    if (typeof expected === "number" && !Number.isFinite(expected)) {
      throw new TypeError("LiteralSchema expected number must be finite");
    }

    if (expected === null || !["string", "number", "boolean"].includes(typeof expected)) {
      throw new TypeError(
        "LiteralSchema expected value must be a string, number, or boolean. " +
        "Use s.null() for null, or .nullable() to allow null alongside a literal.",
      );
    }
  }

  protected _parseValue(input: unknown, path: string[]): T {
    if (input !== this.expected) {
      return this.fail(
        `Expected literal ${JSON.stringify(this.expected)}`,
        path,
      );
    }
    return this.expected;
  }

  protected _describe(): LeafSchemaDescription {
    return {
      kind: this.kind,
      constraints: { value: this.expected },
    };
  }
}

export class ArraySchema<T> extends NullableSchema<T[]> {
  readonly kind = "array" as const;

  private minimum?: number;
  private maximum?: number;

  constructor(private readonly itemSchema: Schema<T>) {
    super();
  }

  min(value: number): this {
    this.validateBound(value);
    return this.cloneWith({ minimum: value });
  }

  max(value: number): this {
    this.validateBound(value);
    return this.cloneWith({ maximum: value });
  }

  protected _parseValue(input: unknown, path: string[]): T[] {
    if (!globalThis.Array.isArray(input)) {
      return this.fail("Expected an array", path);
    }

    if (this.minimum !== undefined && input.length < this.minimum) {
      return this.fail(`Expected at least ${this.minimum} items`, path);
    }

    if (this.maximum !== undefined && input.length > this.maximum) {
      return this.fail(`Expected at most ${this.maximum} items`, path);
    }

    return input.map((item, index): T => {
      try {
        return this.itemSchema.parse(item);
      } catch (error) {
        if (error instanceof SchemaValidationError) {
          throw new SchemaValidationError(error.message, [
            String(index),
            ...error.path,
          ]);
        }

        throw error;
      }
    });
  }

  protected _describe(): ArraySchemaDescription {
    const constraints = buildConstraints({
      min: this.minimum,
      max: this.maximum,
    });

    return {
      kind: this.kind,
      ...(constraints ? { constraints } : {}),
      element: this.itemSchema.toJSON(),
    };
  }

  protected validateBound(value: number): void {
    if (!globalThis.Number.isInteger(value) || value < 0) {
      throw new TypeError("Array min/max must be non-negative integers");
    }
  }
}

export type ObjectShape = Record<string, Schema<unknown>>;

type SchemaValue<S> = S extends Schema<infer T> ? T : never;

export type ObjectOutput<S extends ObjectShape> = {
  [K in keyof S]?: SchemaValue<S[K]>;
};

export class ObjectSchema<S extends ObjectShape> extends NullableSchema<ObjectOutput<S>> {
  readonly kind = "object" as const;

  private optionalProps: string[];

  private allowUnknownProps: boolean = true;

  constructor(private readonly shape: S) {
    super();
    this.optionalProps = Object.keys(shape);
  }

  optionalProperties(keys: string[]): this {
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(this.shape, key)) {
        throw new TypeError(
          `optionalProperties: unknown property "${key}"`,
        );
      }
    }
    return this.cloneWith({ optionalProps: [...new Set(keys)] });
  }

  allowUnknownProperties(value: boolean = true): this {
    return this.cloneWith({ allowUnknownProps: value });
  }

  strict(value: boolean = true): this {
    if (value) {
      return this.optionalProperties([]).allowUnknownProperties(false);
    }
    return this.optionalProperties(Object.keys(this.shape)).allowUnknownProperties(true);
  }

  protected _parseValue(input: unknown, path: string[]): ObjectOutput<S> {
    if (
      input === null ||
      typeof input !== "object" ||
      globalThis.Array.isArray(input)
    ) {
      return this.fail("Expected an object", path);
    }

    const source = input as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    const optional = new Set(this.optionalProps);

    if (!this.allowUnknownProps) {
      for (const key of Object.keys(source)) {
        if (!Object.prototype.hasOwnProperty.call(this.shape, key)) {
          this.fail(`Unknown property "${key}"`, [...path, key]);
        }
      }
    }

    for (const [key, schema] of Object.entries(this.shape)) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) {
        if (!optional.has(key)) {
          this.fail(`Missing required property "${key}"`, [...path, key]);
        }

        continue;
      }

      try {
        output[key] = schema.parse(source[key]);
      } catch (error) {
        if (error instanceof SchemaValidationError) {
          throw new SchemaValidationError(error.message, [
            key,
            ...error.path,
          ]);
        }

        throw error;
      }
    }

    if (this.allowUnknownProps) {
      for (const [key, value] of Object.entries(source)) {
        if (!Object.prototype.hasOwnProperty.call(this.shape, key)) {
          assertJSONValue(value, [...path, key]);
          output[key] = value;
        }
      }
    }

    return output as ObjectOutput<S>;
  }

  protected _describe(): ObjectSchemaDescription {
    return {
      kind: this.kind,
      constraints: {
        optionalProps: [...this.optionalProps],
        allowUnknownProps: this.allowUnknownProps,
      },
      properties: Object.fromEntries(
        Object.entries(this.shape).map(([key, schema]) => [
          key,
          schema.toJSON(),
        ]),
      ),
    };
  }
}

export class RecordSchema<T> extends NullableSchema<Record<string, T>> {
  readonly kind = "record" as const;

  private minimum?: number;
  private maximum?: number;

  constructor(private readonly valueSchema: Schema<T>) {
    super();
  }

  min(value: number): this {
    this.validateBound(value);
    return this.cloneWith({ minimum: value });
  }

  max(value: number): this {
    this.validateBound(value);
    return this.cloneWith({ maximum: value });
  }

  protected _parseValue(input: unknown, path: string[]): Record<string, T> {
    if (
      input === null ||
      typeof input !== "object" ||
      globalThis.Array.isArray(input)
    ) {
      return this.fail("Expected a record object", path);
    }

    const entries = Object.entries(input);

    if (this.minimum !== undefined && entries.length < this.minimum) {
      return this.fail(`Expected at least ${this.minimum} keys`, path);
    }

    if (this.maximum !== undefined && entries.length > this.maximum) {
      return this.fail(`Expected at most ${this.maximum} keys`, path);
    }

    const output: Record<string, T> = {};

    for (const [key, value] of entries) {
      try {
        output[key] = this.valueSchema.parse(value);
      } catch (error) {
        if (error instanceof SchemaValidationError) {
          throw new SchemaValidationError(error.message, [
            key,
            ...error.path,
          ]);
        }

        throw error;
      }
    }

    return output;
  }

  protected _describe(): RecordSchemaDescription {
    const constraints = buildConstraints({
      min: this.minimum,
      max: this.maximum,
    });

    return {
      kind: this.kind,
      ...(constraints ? { constraints } : {}),
      value: this.valueSchema.toJSON(),
    };
  }

  protected validateBound(value: number): void {
    if (!globalThis.Number.isInteger(value) || value < 0) {
      throw new TypeError("Record min/max must be non-negative integers");
    }
  }
}

export class UnionSchema<const S extends readonly [Schema<unknown>, ...Schema<unknown>[]]> extends NullableSchema<SchemaValue<S[number]>> {
  readonly kind = "union" as const;

  private readonly options: Schema<unknown>[];

  constructor(schemas: S) {
    super();

    if (schemas.length === 0) {
      throw new TypeError("UnionSchema requires at least one schema");
    }

    this.options = schemas.map((schema) => {
      if (schema instanceof NullableSchema) {
        return schema.nullable(false);
      }
      return schema;
    });
  }

  protected _parseValue(input: unknown, path: string[]): SchemaValue<S[number]> {
    const errors: string[] = [];

    for (const schema of this.options) {
      try {
        return schema.parse(input) as SchemaValue<S[number]>;
      } catch (error) {
        if (error instanceof SchemaValidationError) {
          errors.push(error.message);
          continue;
        }
        throw error;
      }
    }

    return this.fail(
      `Value did not match any union member: ${errors.join("; ")}`,
      path,
    );
  }

  protected _describe(): UnionSchemaDescription {
    return {
      kind: this.kind,
      options: this.options.map((schema) => schema.toJSON()),
    };
  }
}

export class TupleSchema<
  const S extends readonly [Schema<unknown>, ...Schema<unknown>[]],
> extends NullableSchema<SchemaValue<S[number]>[]> {
  readonly kind = "tuple" as const;

  constructor(private readonly schemas: S) {
    super();
    if (schemas.length === 0) {
      throw new TypeError("TupleSchema requires at least one schema");
    }
  }

  protected _parseValue(input: unknown, path: string[]): SchemaValue<S[number]>[] {
    if (!Array.isArray(input)) {
      return this.fail("Expected an array", path);
    }

    if (input.length !== this.schemas.length) {
      return this.fail(
        `Expected an array of length ${this.schemas.length}, received ${input.length}`,
        path,
      );
    }

    const result: SchemaValue<S[number]>[] = [];
    for (let i = 0; i < this.schemas.length; i++) {
      const schema: Schema<unknown> = this.schemas[i]!;
      try {
        result.push(schema.parse(input[i]) as SchemaValue<S[number]>);
      } catch (error) {
        if (error instanceof SchemaValidationError) {
          throw new SchemaValidationError(error.message, [
            String(i),
            ...error.path,
          ]);
        }
        throw error;
      }
    }
    return result;
  }

  protected _describe(): TupleSchemaDescription {
    return {
      kind: this.kind,
      elements: this.schemas.map((schema) => schema.toJSON()),
    };
  }
}

export class EnumSchema<
  const T extends readonly [string, ...string[]],
> extends NullableSchema<T[number]> {
  readonly kind = "enum" as const;

  private readonly allowedValues: Set<string>;

  constructor(private readonly values: T) {
    super();
    this.allowedValues = new Set(values);
  }

  protected _parseValue(input: unknown, path: string[]): T[number] {
    if (typeof input !== "string" || !this.allowedValues.has(input)) {
      return this.fail(
        `Expected one of: ${this.values.join(", ")}`,
        path,
      );
    }

    return input as T[number];
  }

  protected _describe(): LeafSchemaDescription {
    return {
      kind: this.kind,
      constraints: { values: [...this.values] },
    };
  }
}

export class UnknownSchema extends Schema<JSONValue> {
  readonly kind = "unknown" as const;

  constructor() {
    super();
  }

  protected _parse(input: unknown, path: string[]): JSONValue {
    assertJSONValue(input, path);
    return input;
  }

  protected _describe(): LeafSchemaDescription {
    return { kind: this.kind };
  }
}

export class NullSchema extends Schema<null> {
  readonly kind = "null" as const;

  constructor() {
    super();
  }

  protected _parse(input: unknown, path: string[]): null {
    if (input !== null) {
      return this.fail("Expected null", path);
    }
    return null;
  }

  protected _describe(): LeafSchemaDescription {
    return { kind: this.kind };
  }
}

function buildConstraints(
  values: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const entries = Object.entries(values).filter(
    ([, value]) => value !== undefined,
  );

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

function assertJSONValue(
  value: unknown,
  path: string[],
  ancestors = new Set<object>(),
): asserts value is JSONValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value === "number") {
    if (globalThis.Number.isFinite(value)) {
      return;
    }

    throw new SchemaValidationError(
      "Expected a finite JSON number",
      path,
    );
  }

  if (typeof value !== "object") {
    throw new SchemaValidationError("Expected a JSON value", path);
  }

  if (ancestors.has(value)) {
    throw new SchemaValidationError(
      "Circular references are not valid JSON",
      path,
    );
  }

  ancestors.add(value);

  try {
    if (globalThis.Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) {
        if (!(index in value)) {
          throw new SchemaValidationError(
            "Sparse arrays are not valid JSON",
            [...path, String(index)],
          );
        }

        assertJSONValue(value[index], [...path, String(index)], ancestors);
      }

      return;
    }

    const prototype = Object.getPrototypeOf(value);

    if (prototype !== Object.prototype && prototype !== null) {
      throw new SchemaValidationError(
        "Expected a plain JSON object",
        path,
      );
    }

    for (const [key, item] of Object.entries(value)) {
      assertJSONValue(item, [...path, key], ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

export type Infer<T extends Schema<unknown>> = T extends Schema<infer U> ? U : never;

export const primitives = {
  string: () => new StringSchema(),
  number: () => new NumberSchema(),
  boolean: () => new BooleanSchema(),
  literal: <const T extends LiteralValue>(value: T) =>
    new LiteralSchema(value),
  array: <T>(item: Schema<T>) => new ArraySchema<T>(item),
  object: <S extends ObjectShape>(shape: S) => new ObjectSchema(shape),
  record: <T>(value: Schema<T>) => new RecordSchema<T>(value),
  union: <const S extends readonly [Schema<unknown>, ...Schema<unknown>[]]>(
    schemas: S,
  ) => new UnionSchema(schemas),
  tuple: <const S extends readonly [Schema<unknown>, ...Schema<unknown>[]]>(
    schemas: S,
  ) => new TupleSchema(schemas),
  enum: <const T extends readonly [string, ...string[]]>(values: T) =>
    new EnumSchema(values),
  unknown: () => new UnknownSchema(),
  null: () => new NullSchema(),
};