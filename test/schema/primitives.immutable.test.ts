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
    expect(base.toJSON().description).toBeUndefined();
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
    expect(base.parse({})).toEqual({});
    expect(() => strict.parse({})).toThrow(SchemaValidationError);
    expect(() => strict.parse({ name: "Ada", extra: true })).toThrow(
      SchemaValidationError,
    );
    expect(strict.toJSON().description).toBe("User");
    expect(base.toJSON().constraints?.strict).toBe(false);
    expect(strict.toJSON().constraints?.strict).toBe(true);
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
});

// Compile-time sanity check: strict() narrows the inferred object shape.
const strictTypeCheck: ObjectSchema<{ name: StringSchema }, true> =
  s.object({ name: s.string() }).strict();
void strictTypeCheck;
