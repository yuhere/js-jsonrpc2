import { describe, expect, it } from "vitest";
import {
  ObjectSchema,
  SchemaValidationError,
  StringSchema,
  primitives as s,
} from "../../src/schema/json/primitives";

describe("immutable schema modifiers", () => {
  it("min/max return independent schemas", () => {
    const base = s.string();
    const short = base.max(5);
    const long = base.max(20);
    const atLeastThree = base.min(3);

    expect(short).not.toBe(base);
    expect(long).not.toBe(base);
    expect(short).not.toBe(long);
    expect(base.parse("a very long string")).toBe("a very long string");
    expect(() => short.parse("too long")).toThrow(SchemaValidationError);
    expect(long.parse("a longer string")).toBe("a longer string");
    expect(atLeastThree.parse("abc")).toBe("abc");
    expect(() => atLeastThree.parse("ab")).toThrow(SchemaValidationError);
  });

  it("describe returns an independent schema and preserves constraints", () => {
    const base = s.string().min(2);
    const described = base.describe("Name");

    expect(described).not.toBe(base);
    expect(base.toJSON()).not.toHaveProperty("description");
    expect(described.toJSON()).toMatchObject({
      kind: "string",
      description: "Name",
      constraints: { min: 2 },
    });
  });

  it("strict returns a new schema without changing the original", () => {
    const base = s.object({ name: s.string() }).describe("User");
    const strict = base.strict();

    expect(strict).not.toBe(base);
    expect(base.parse({ name: "a" })).toEqual({ name: "a" });
    expect(() => strict.parse({})).toThrow(SchemaValidationError);
    expect(() => strict.parse({ name: "Ada", extra: true })).toThrow(
      SchemaValidationError,
    );
    expect(strict.toJSON().description).toBe("User");

    // 默认已是「全必填 + 拒未知」，与 strict() 的 constraints 一致
    expect(base.toJSON().constraints).toEqual({
      optionalProps: [],
      allowUnknownProps: false,
    });

    expect(strict.toJSON().constraints).toEqual({
      optionalProps: [],
      allowUnknownProps: false,
    });
  });

  it("strict(false) restores the permissive configuration", () => {
    const base = s.object({ name: s.string() }).strict();
    const relaxed = base.strict(false);

    expect(relaxed).not.toBe(base);
    expect(relaxed.toJSON().constraints).toEqual({
      optionalProps: ["name"],
      allowUnknownProps: true,
    });
    expect(relaxed.parse({})).toEqual({});
    expect(relaxed.parse({ extra: true })).toEqual({ extra: true });
  });

  it("optionalProperties sets the missing-allowed whitelist", () => {
    const base = s.object({ a: s.string(), b: s.number() });
    const partial = base.optionalProperties(["a"]);

    expect(partial).not.toBe(base);
    expect(partial.toJSON().constraints).toEqual({
      optionalProps: ["a"],
      allowUnknownProps: false,
    });
    expect(partial.parse({ a: "x", b: 1 })).toEqual({ a: "x", b: 1 });
    expect(partial.parse({ b: 1 })).toEqual({ b: 1 });
    expect(() => partial.parse({ a: "x" })).toThrow(SchemaValidationError);
    expect(() => partial.parse({})).toThrow(SchemaValidationError);
  });

  it("optionalProperties rejects unknown property names", () => {
    const base = s.object({ name: s.string() });

    expect(() => base.optionalProperties(["nope"])).toThrow(TypeError);
  });

  it("allowUnknownProperties(false) keeps extras rejected (default is already false)", () => {
    const base = s.object({ name: s.string() });
    const closed = base.allowUnknownProperties(false);

    expect(closed).not.toBe(base);
    expect(closed.toJSON().constraints).toEqual({
      optionalProps: [],
      allowUnknownProps: false,
    });
    expect(() => closed.parse({})).toThrow(SchemaValidationError);
    expect(() => closed.parse({ name: "Ada", extra: true })).toThrow(
      SchemaValidationError,
    );
  });

  it("keeps custom subclass prototypes and state when cloning", () => {
    class EmailSchema extends StringSchema<"email"> {
      override readonly kind = "email";
    }

    const base = new EmailSchema();
    const constrained = base.min(5).describe("Email address");

    expect(constrained).toBeInstanceOf(EmailSchema);
    expect(base.toJSON().constraints?.min).toBeUndefined();
    expect(constrained.toJSON()).toMatchObject({
      kind: "email",
      description: "Email address",
      constraints: { min: 5 },
    });
  });

  it("supports immutable modifiers across number, array and record schemas", () => {
    const numberBase = s.number();
    const positive = numberBase.min(0);
    expect(numberBase.parse(-1)).toBe(-1);
    expect(() => positive.parse(-1)).toThrow(SchemaValidationError);

    const arrayBase = s.array(s.string());
    const nonEmpty = arrayBase.min(1);
    expect(arrayBase.parse([])).toEqual([]);
    expect(() => nonEmpty.parse([])).toThrow(SchemaValidationError);

    const recordBase = s.record(s.number());
    const oneKey = recordBase.min(1);
    expect(recordBase.parse({})).toEqual({});
    expect(() => oneKey.parse({})).toThrow(SchemaValidationError);
  });

  it("nullable combines immutably with describe and min", () => {
    const base = s.string().min(2);
    const nullable = base.nullable().describe("Name");
    expect(nullable).not.toBe(base);
    expect(base.toJSON()).toMatchObject({ kind: "string", constraints: { min: 2 } });
    expect(base.toJSON().nullable).toBeUndefined();
    expect(nullable.toJSON()).toMatchObject({
      kind: "string",
      nullable: true,
      description: "Name",
      constraints: { min: 2 },
    });
    expect(() => base.parse(null)).toThrow(SchemaValidationError);
    expect(nullable.parse(null)).toBe(null);
  });

  it("object with s.null() property", () => {
    const schema = s.object({ n: s.null() });
    expect(schema.parse({ n: null })).toEqual({ n: null });
    expect(() => schema.parse({ n: "x" })).toThrow();
  });

  it("nullable(false) applies uniformly to tuple and enum", () => {
    const tuple = s.tuple([s.string()]).nullable().nullable(false);
    expect(() => tuple.parse(null)).toThrow(SchemaValidationError);

    const en = s.enum(["a"]).nullable().nullable(false);
    expect(() => en.parse(null)).toThrow(SchemaValidationError);
  });
});

// Compile-time sanity check: strict() returns ObjectSchema<S> (no extra Strict type parameter).
const strictTypeCheck: ObjectSchema<{ name: StringSchema }> =
  s.object({ name: s.string() }).strict();
void strictTypeCheck;