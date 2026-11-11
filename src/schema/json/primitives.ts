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
  validate?: boolean;
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
  /** 未拼接路径前缀的原文。外层包装时用它，不要用已经格式化过的 `message`。 */
  readonly detail: string;

  constructor(
    message: string,
    public readonly path: string[] = [],
  ) {
    super(path.length > 0 ? `${path.join(".")}: ${message}` : message);
    this.name = "SchemaValidationError";
    this.detail = message;
  }
}

function rethrowAt(error: SchemaValidationError, key: string): never {
  throw new SchemaValidationError(error.detail, [key, ...error.path]);
}

/**
 * 所有 Schema 的抽象基类。
 *
 * 只负责 description 与描述输出；nullability 由 `NullableSchema` 提供。
 * `UnknownSchema` / `NullSchema` 直接继承本类——它们天然接受 null，
 * 不需要 `.nullable()`。
 *
 * 运行时校验可通过 `.validate(false)` 关闭：关闭后 `parse` / `safeParse`
 * 直接返回输入，不再调用 `_parse`（仍可用于签名描述）。
 */
export abstract class Schema<T> {
  abstract readonly kind: SchemaKind;

  private description: string = "";

  private _validateEnabled: boolean = true;

  describe(description: string): this {
    return this.cloneWith({ description });
  }

  validate(value: boolean = true): this {
    return this.cloneWith({ _validateEnabled: value });
  }

  isValidateEnabled(): boolean {
    return this._validateEnabled;
  }

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
    if (!this._validateEnabled) {
      return input as T;
    }
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

  /**
   * Built-in schemas return a member of `SchemaDescription`. Custom schemas
   * may return any `BaseSchemaDescription` (their own `kind` included).
   * `toJSON()` still exposes the built-in union.
   */
  protected abstract _describe(): BaseSchemaDescription;

  toJSON(): SchemaDescription {
    const result = this._describe();
    const description = this.getDescription();

    // Omit unset/empty descriptions so descriptions stay small.
    if (description.length > 0) {
      result.description = description;
    }

    if (!this._validateEnabled) {
      result.validate = false;
    }

    return result as SchemaDescription;
  }

  protected fail(message: string, path: string[]): never {
    throw new SchemaValidationError(message, path);
  }
}

/** `N extends true` 时输出包含 null，否则不包含。 */
type Out<T, N extends boolean> = N extends true ? T | null : T;

type ApplyNullable<S, N extends boolean> =
  S extends StringSchema<infer K, infer _N> ? StringSchema<K, N> :
  S extends NumberSchema<infer _N> ? NumberSchema<N> :
  S extends BooleanSchema<infer _N> ? BooleanSchema<N> :
  S extends LiteralSchema<infer L, infer _N> ? LiteralSchema<L, N> :
  S extends ArraySchema<infer E, infer _N> ? ArraySchema<E, N> :
  S extends RecordSchema<infer E, infer _N> ? RecordSchema<E, N> :
  S extends EnumSchema<infer E, infer _N> ? EnumSchema<E, N> :
  S extends UnionSchema<infer U, infer _N> ? UnionSchema<U, N> :
  S extends TupleSchema<infer Items, infer _N> ? TupleSchema<Items, N> :
  S extends ObjectSchema<infer Shape, infer Opt, infer Unk, infer _N>
    ? ObjectSchema<Shape, Opt, Unk, N> :
  S extends NullableSchema<infer T>
    ? NullableSchema<N extends true ? T | null : Exclude<T, null>> :
  S;

/**
 * 支持 nullability 的 Schema 基类。
 *
 * 除 `UnknownSchema` / `NullSchema` 外的所有具体 Schema 都继承本类。
 *
 * - 默认输出类型不含 null
 * - `nullable()` / `nullable(true)`  → 允许 null，输出类型加上 `| null`
 * - `nullable(false)`                → 不允许 null，输出类型去掉 `| null`
 *
 * `_parse` 在调用子类 `_parseValue` 前统一做 null 短路；
 * `toJSON()` 在基类输出上附加 `nullable: true`。
 */
export abstract class NullableSchema<T> extends Schema<T> {
  private _nullable: boolean = false;

  nullable<This extends this>(this: This, value?: true): ApplyNullable<This, true>;
  nullable<This extends this>(this: This, value: false): ApplyNullable<This, false>;
  nullable<This extends this>(
    this: This,
    value: boolean,
  ): ApplyNullable<This, true> | ApplyNullable<This, false>;
  nullable(
    value: boolean = true,
  ): ApplyNullable<this, true> | ApplyNullable<this, false> {
    return this.cloneWith({ _nullable: value }) as
      | ApplyNullable<this, true>
      | ApplyNullable<this, false>;
  }

  isNullable(): boolean {
    return this._nullable;
  }

  protected _parse(input: unknown, path: string[]): T {
    if (this._nullable && input === null) {
      return null as T;
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

export class StringSchema<
  K extends string = "string",
  N extends boolean = false,
> extends NullableSchema<Out<string, N>> {
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

  protected _parseValue(input: unknown, path: string[]): Out<string, N> {
    if (typeof input !== "string") {
      return this.fail("Expected a string", path);
    }

    if (this.minimum !== undefined && input.length < this.minimum) {
      return this.fail(`Expected at least ${this.minimum} characters`, path);
    }

    if (this.maximum !== undefined && input.length > this.maximum) {
      return this.fail(`Expected at most ${this.maximum} characters`, path);
    }

    return input as Out<string, N>;
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

export class NumberSchema<
  N extends boolean = false,
> extends NullableSchema<Out<number, N>> {
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

  protected _parseValue(input: unknown, path: string[]): Out<number, N> {
    if (typeof input !== "number" || !globalThis.Number.isFinite(input)) {
      return this.fail("Expected a finite number", path);
    }

    if (this.minimum !== undefined && input < this.minimum) {
      return this.fail(`Expected a number >= ${this.minimum}`, path);
    }

    if (this.maximum !== undefined && input > this.maximum) {
      return this.fail(`Expected a number <= ${this.maximum}`, path);
    }

    return input as Out<number, N>;
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

export class BooleanSchema<
  N extends boolean = false,
> extends NullableSchema<Out<boolean, N>> {
  readonly kind = "boolean" as const;

  constructor() {
    super();
  }

  protected _parseValue(input: unknown, path: string[]): Out<boolean, N> {
    if (typeof input !== "boolean") {
      return this.fail("Expected a boolean", path);
    }

    return input as Out<boolean, N>;
  }

  protected _describe(): LeafSchemaDescription {
    return { kind: this.kind };
  }
}

export type LiteralValue = string | number | boolean;

export class LiteralSchema<
  const T extends LiteralValue,
  N extends boolean = false,
> extends NullableSchema<Out<T, N>> {
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

  protected _parseValue(input: unknown, path: string[]): Out<T, N> {
    if (input !== this.expected) {
      return this.fail(
        `Expected literal ${JSON.stringify(this.expected)}`,
        path,
      );
    }
    return this.expected as Out<T, N>;
  }

  protected _describe(): LeafSchemaDescription {
    return {
      kind: this.kind,
      constraints: { value: this.expected },
    };
  }
}

export class ArraySchema<
  T,
  N extends boolean = false,
> extends NullableSchema<Out<T[], N>> {
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

  protected _parseValue(input: unknown, path: string[]): Out<T[], N> {
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
          rethrowAt(error, String(index));
        }

        throw error;
      }
    }) as Out<T[], N>;
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

type ObjectFields<
  S extends ObjectShape,
  Optional extends PropertyKey,
> = [Optional] extends [never]
  ? { [K in keyof S]: SchemaValue<S[K]> }
  : {
      [K in keyof S as K extends Optional ? never : K]: SchemaValue<S[K]>;
    } & {
      [K in keyof S as K extends Optional ? K : never]?: SchemaValue<S[K]>;
    };

type JsonIndex = { [key: string]: JSONValue | undefined };

type Simplify<T> = { [K in keyof T]: T[K] };

export type ObjectOutput<
  S extends ObjectShape,
  Optional extends PropertyKey = never,
  Unknown extends boolean = false,
> = Unknown extends true
  ? Simplify<ObjectFields<S, Optional> & JsonIndex>
  : Simplify<ObjectFields<S, Optional>>;

export class ObjectSchema<
  S extends ObjectShape,
  Optional extends PropertyKey = never,
  Unknown extends boolean = false,
  N extends boolean = false,
> extends NullableSchema<Out<ObjectOutput<S, Optional, Unknown>, N>> {
  readonly kind = "object" as const;

  private optionalProps: string[] = [];

  private allowUnknownProps: boolean = false;

  constructor(private readonly shape: S) {
    super();
  }

  optionalProperties<const K extends readonly (keyof S & string)[]>(
    keys: K,
  ): ObjectSchema<S, K[number], Unknown, N>;
  optionalProperties(
    keys: readonly string[],
  ): ObjectSchema<S, keyof S & string, Unknown, N>;
  optionalProperties(keys: readonly string[]): any {
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(this.shape, key)) {
        throw new TypeError(
          `optionalProperties: unknown property "${key}"`,
        );
      }
    }
    return this.cloneWith({
      optionalProps: [...new Set(keys)],
    });
  }

  allowUnknownProperties(value?: true): ObjectSchema<S, Optional, true, N>;
  allowUnknownProperties(value: false): ObjectSchema<S, Optional, false, N>;
  allowUnknownProperties(
    value: boolean,
  ): ObjectSchema<S, Optional, boolean, N>;
  allowUnknownProperties(
    value: boolean = true,
  ): ObjectSchema<S, Optional, boolean, N> {
    return this.cloneWith({ allowUnknownProps: value }) as ObjectSchema<
      S,
      Optional,
      boolean,
      N
    >;
  }

  strict(value?: true): ObjectSchema<S, never, false, N>;
  strict(value: false): ObjectSchema<S, keyof S & string, true, N>;
  strict(value: boolean): ObjectSchema<S, keyof S & string, boolean, N>;
  strict(value: boolean = true): any {
    if (value) {
      return this.optionalProperties([]).allowUnknownProperties(false);
    }
    return this.optionalProperties(Object.keys(this.shape)).allowUnknownProperties(true);
  }

  protected _parseValue(
    input: unknown,
    path: string[],
  ): Out<ObjectOutput<S, Optional, Unknown>, N> {
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
        assignJsonKey(output, key, schema.parse(source[key]));
      } catch (error) {
        if (error instanceof SchemaValidationError) {
          rethrowAt(error, key);
        }

        throw error;
      }
    }

    if (this.allowUnknownProps) {
      for (const [key, value] of Object.entries(source)) {
        if (!Object.prototype.hasOwnProperty.call(this.shape, key)) {
          assertJSONValue(value, [...path, key]);
          assignJsonKey(output, key, value);
        }
      }
    }

    return output as Out<ObjectOutput<S, Optional, Unknown>, N>;
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

export class RecordSchema<
  T,
  N extends boolean = false,
> extends NullableSchema<Out<Record<string, T>, N>> {
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

  protected _parseValue(
    input: unknown,
    path: string[],
  ): Out<Record<string, T>, N> {
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
        assignJsonKey(output, key, this.valueSchema.parse(value));
      } catch (error) {
        if (error instanceof SchemaValidationError) {
          rethrowAt(error, key);
        }

        throw error;
      }
    }

    return output as Out<Record<string, T>, N>;
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

export class UnionSchema<
  const S extends readonly [Schema<unknown>, ...Schema<unknown>[]],
  N extends boolean = false,
> extends NullableSchema<Out<SchemaValue<S[number]>, N>> {
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

  protected _parseValue(
    input: unknown,
    path: string[],
  ): Out<SchemaValue<S[number]>, N> {
    const errors: string[] = [];

    for (const schema of this.options) {
      try {
        return schema.parse(input) as Out<SchemaValue<S[number]>, N>;
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

type TupleOutput<S extends readonly Schema<unknown>[]> = {
  -readonly [K in keyof S]: SchemaValue<S[K]>;
};

export class TupleSchema<
  const S extends readonly [Schema<unknown>, ...Schema<unknown>[]],
  N extends boolean = false,
> extends NullableSchema<Out<TupleOutput<S>, N>> {
  readonly kind = "tuple" as const;

  constructor(private readonly schemas: S) {
    super();
    if (schemas.length === 0) {
      throw new TypeError("TupleSchema requires at least one schema");
    }
  }

  protected _parseValue(input: unknown, path: string[]): Out<TupleOutput<S>, N> {
    if (!Array.isArray(input)) {
      return this.fail("Expected an array", path);
    }

    if (input.length !== this.schemas.length) {
      return this.fail(
        `Expected an array of length ${this.schemas.length}, received ${input.length}`,
        path,
      );
    }

    const result: unknown[] = [];
    for (let i = 0; i < this.schemas.length; i++) {
      const schema: Schema<unknown> = this.schemas[i]!;
      try {
        result.push(schema.parse(input[i]));
      } catch (error) {
        if (error instanceof SchemaValidationError) {
          rethrowAt(error, String(i));
        }
        throw error;
      }
    }
    return result as Out<TupleOutput<S>, N>;
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
  N extends boolean = false,
> extends NullableSchema<Out<T[number], N>> {
  readonly kind = "enum" as const;

  private readonly allowedValues: Set<string>;

  constructor(private readonly values: T) {
    super();
    this.allowedValues = new Set(values);
  }

  protected _parseValue(input: unknown, path: string[]): Out<T[number], N> {
    if (typeof input !== "string" || !this.allowedValues.has(input)) {
      return this.fail(
        `Expected one of: ${this.values.join(", ")}`,
        path,
      );
    }

    return input as Out<T[number], N>;
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

/**
 * Store `key` as an own data property.
 *
 * `target[key] = value` runs Object.prototype's `__proto__` setter and can
 * replace the output object's prototype. defineProperty keeps `__proto__`,
 * `constructor`, and `prototype` as ordinary enumerable fields, and the
 * result stays a normal object (`Object.prototype`).
 */
function assignJsonKey(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
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