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

export interface SchemaDescription {
  kind: SchemaKind;
  description?: string;
  nullable?: boolean;
  constraints?: Record<string, unknown>;
  children?: Record<string, unknown>;
}

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
 * 所有 Schema 的共同基类。
 *
 * 不包含 nullable()，因此 UnknownSchema 可以天然接受 null，
 * 同时不会暴露无意义的 nullable() 方法。
 */
export abstract class Schema<T> {
  abstract readonly kind: SchemaKind;

  private description?: string | undefined;

  constructor(description?: string) {
    this.description = description;
  }

  describe(description: string): this {
    return this.cloneWith({ description });
  }

  /**
   * 创建保留原型和现有字段的新实例，供不可变链式方法使用。
   * Schema 子类的状态字段会一并复制，因此扩展类仍保留自身原型和状态。
   */
  protected cloneWith(updates: Record<string, unknown>): this {
    const clone = Object.assign(
      Object.create(Object.getPrototypeOf(this)) as object,
      this,
    );

    return Object.assign(clone, updates) as this;
  }

  getDescription(): string | undefined {
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
 * 普通 JSON Schema 的基类。
 * 通过 nullable() 显式接受 null。
 */
export abstract class NullableCapableSchema<T> extends Schema<T> {
  nullable(): NullableSchema<T> {
    return new NullableSchema(this);
  }
}

/**
 * nullable 包装器。
 *
 * 注意：NullableSchema 不提供 nullable()，
 * 避免无意义的重复 nullable 调用。
 */
export class NullableSchema<T> extends Schema<T | null> {
  readonly kind = "nullable" as const;

  constructor(private readonly inner: Schema<T>) {
    super();
  }

  protected _parse(input: unknown, path: string[]): T | null {
    if (input === null) {
      return null;
    }

    try {
      return this.inner.parse(input);
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        throw new SchemaValidationError(error.message, [
          ...path,
          ...error.path,
        ]);
      }

      throw error;
    }
  }

  protected _describe(): SchemaDescription {
    return {
      kind: "nullable",
      nullable: true,
      children: { inner: this.inner.toJSON() },
    };
  }
}

export class StringSchema<K extends string = "string"> extends NullableCapableSchema<string> {
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

  protected _parse(input: unknown, path: string[]): string {
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

  protected _describe(): SchemaDescription {
    return {
      kind: this.kind,
      constraints: {
        ...(this.minimum !== undefined ? { min: this.minimum } : {}),
        ...(this.maximum !== undefined ? { max: this.maximum } : {}),
      },
    };
  }

  protected validateBound(value: number): void {
    if (!globalThis.Number.isInteger(value) || value < 0) {
      throw new TypeError("String min/max must be non-negative integers");
    }
  }
}

export class NumberSchema extends NullableCapableSchema<number> {
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

  protected _parse(input: unknown, path: string[]): number {
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

  protected _describe(): SchemaDescription {
    return {
      kind: this.kind,
      constraints: {
        ...(this.minimum !== undefined ? { min: this.minimum } : {}),
        ...(this.maximum !== undefined ? { max: this.maximum } : {}),
      },
    };
  }

  protected validateBound(value: number): void {
    if (!globalThis.Number.isFinite(value)) {
      throw new TypeError("Number min/max must be finite numbers");
    }
  }
}

export class BooleanSchema extends NullableCapableSchema<boolean> {
  readonly kind = "boolean" as const;

  constructor() {
    super();
  }

  protected _parse(input: unknown, path: string[]): boolean {
    if (typeof input !== "boolean") {
      return this.fail("Expected a boolean", path);
    }

    return input;
  }

  protected _describe(): SchemaDescription {
    return { kind: this.kind };
  }
}

export type LiteralValue = string | number | boolean | null;

export class LiteralSchema<
  const T extends LiteralValue,
> extends NullableCapableSchema<T> {
  readonly kind = "literal" as const;

  constructor(private readonly expected: T) {
    super();

    if (typeof expected === "number" && !Number.isFinite(expected)) {
      throw new TypeError("LiteralSchema expected number must be finite");
    }

    if (expected !== null && !["string", "number", "boolean"].includes(typeof expected)) {
      throw new TypeError("LiteralSchema expected value must be a string, number, boolean, or null");
    }
  }

  protected _parse(input: unknown, path: string[]): T {
    if (input !== this.expected) {
      return this.fail(
        `Expected literal ${JSON.stringify(this.expected)}`,
        path,
      );
    }
    return this.expected;
  }

  protected _describe(): SchemaDescription {
    return {
      kind: this.kind,
      constraints: { value: this.expected },
    };
  }
}

export class ArraySchema<T> extends NullableCapableSchema<T[]> {
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

  protected _parse(input: unknown, path: string[]): T[] {
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

  protected _describe(): SchemaDescription {
    return {
      kind: this.kind,
      constraints: {
        ...(this.minimum !== undefined ? { min: this.minimum } : {}),
        ...(this.maximum !== undefined ? { max: this.maximum } : {}),
      },
      children: { items: this.itemSchema.toJSON() },
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

type ShapeOutput<S extends ObjectShape> = {
  [K in keyof S]: SchemaValue<S[K]>;
};

type OptionalShapeOutput<S extends ObjectShape> = {
  [K in keyof S]?: SchemaValue<S[K]>;
};

export class ObjectSchema<
  S extends ObjectShape,
  Strict extends boolean = false,
> extends NullableCapableSchema<
  Strict extends true ? ShapeOutput<S> : OptionalShapeOutput<S>
> {
  readonly kind = "object" as const;

  private isStrict: boolean;

  constructor(
    private readonly shape: S,
    strict: Strict = false as Strict,
    description?: string,
  ) {
    super(description);
    this.isStrict = strict;
  }

  /**
   * strict() 要求所有声明属性存在，并拒绝未声明属性。
   */
  strict(): ObjectSchema<S, true> {
    return new ObjectSchema<S, true>(this.shape, true, this.getDescription());
  }

  protected _parse(
    input: unknown,
    path: string[],
  ): Strict extends true ? ShapeOutput<S> : OptionalShapeOutput<S> {
    if (
      input === null ||
      typeof input !== "object" ||
      globalThis.Array.isArray(input)
    ) {
      return this.fail("Expected an object", path);
    }

    const source = input as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    if (this.isStrict) {
      for (const key of Object.keys(source)) {
        if (!(key in this.shape)) {
          this.fail(`Unknown property "${key}"`, [...path, key]);
        }
      }
    }

    for (const [key, schema] of Object.entries(this.shape)) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) {
        if (this.isStrict) {
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

    // 非 strict 模式允许额外属性，并保留这些属性。
    if (!this.isStrict) {
      for (const [key, value] of Object.entries(source)) {
        if (!(key in this.shape)) {
          assertJSONValue(value, [...path, key]);
          output[key] = value;
        }
      }
    }

    return output as Strict extends true
      ? ShapeOutput<S>
      : OptionalShapeOutput<S>;
  }

  protected _describe(): SchemaDescription {
    return {
      kind: this.kind,
      constraints: { strict: this.isStrict },
      children: {
        properties: Object.fromEntries(
          Object.entries(this.shape).map(([key, schema]) => [
            key,
            schema.toJSON(),
          ]),
        ),
      },
    };
  }
}

export class RecordSchema<T> extends NullableCapableSchema<Record<string, T>> {
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

  protected _parse(input: unknown, path: string[]): Record<string, T> {
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

  protected _describe(): SchemaDescription {
    return {
      kind: this.kind,
      constraints: {
        ...(this.minimum !== undefined ? { min: this.minimum } : {}),
        ...(this.maximum !== undefined ? { max: this.maximum } : {}),
      },
      children: { values: this.valueSchema.toJSON() },
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
> extends NullableCapableSchema<SchemaValue<S[number]>> {
  readonly kind = "union" as const;

  constructor(private readonly schemas: S) {
    super();

    if (schemas.length === 0) {
      throw new TypeError("UnionSchema requires at least one schema");
    }
  }

  protected _parse(input: unknown, path: string[]): SchemaValue<S[number]> {
    const errors: string[] = [];

    for (const schema of this.schemas) {
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

  protected _describe(): SchemaDescription {
    return {
      kind: this.kind,
      children: {
        options: this.schemas.map((schema) => schema.toJSON()),
      },
    };
  }
}

export class TupleSchema<
  const S extends readonly [Schema<unknown>, ...Schema<unknown>[]],
> extends NullableCapableSchema<SchemaValue<S[number]>[]> {
  readonly kind = "tuple" as const;

  constructor(private readonly schemas: S) {
    super();
    if (schemas.length === 0) {
      throw new TypeError("TupleSchema requires at least one schema");
    }
  }

  protected _parse(input: unknown, path: string[]): SchemaValue<S[number]>[] {
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
          return this.fail(error.message, [...path, "" + i]);
        }
        throw error;
      }
    }
    return result;
  }

  protected _describe(): SchemaDescription {
    return {
      kind: this.kind,
      children: {
        items: this.schemas.map((schema) => schema.toJSON()),
      },
    };
  }
}

export class EnumSchema<
  const T extends readonly [string, ...string[]],
> extends NullableCapableSchema<T[number]> {
  readonly kind = "enum" as const;

  private readonly allowedValues: Set<string>;

  constructor(private readonly values: T) {
    super();
    this.allowedValues = new Set(values);
  }

  protected _parse(input: unknown, path: string[]): T[number] {
    if (typeof input !== "string" || !this.allowedValues.has(input)) {
      return this.fail(
        `Expected one of: ${this.values.join(", ")}`,
        path,
      );
    }

    return input as T[number];
  }

  protected _describe(): SchemaDescription {
    return {
      kind: this.kind,
      constraints: { values: [...this.values] },
    };
  }
}

/**
 * 校验任意 JSON 值。
 *
 * 不允许 undefined、非有限数字、循环引用等非 JSON 数据。
 * UnknownSchema 不提供 nullable()，因为 null 本身就是合法值。
 */
export class UnknownSchema extends Schema<JSONValue> {
  readonly kind = "unknown" as const;

  constructor() {
    super();
  }

  protected _parse(input: unknown, path: string[]): JSONValue {
    assertJSONValue(input, path);
    return input;
  }

  protected _describe(): SchemaDescription {
    return { kind: this.kind };
  }
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
};