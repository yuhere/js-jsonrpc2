import { describe, expect, it } from "vitest";
import {
    s,
    Schema,
    SchemaValidationError,
    StringSchema,
    UnknownSchema,
    JSONValue,
} from "../../src/schema/json";

describe("StringSchema", () => {
    it("accepts strings", () => {
        expect(s.string().parse("hello")).toBe("hello");
        expect(s.string().parse("")).toBe("");
    });

    it("rejects non-string values", () => {
        const schema = s.string();

        for (const value of [123, true, null, {}, []]) {
            expect(() => schema.parse(value)).toThrow(SchemaValidationError);
        }
    });

    it("supports min and max length", () => {
        const schema = s.string().min(2).max(4);

        expect(schema.parse("ab")).toBe("ab");
        expect(schema.parse("abcd")).toBe("abcd");

        expect(() => schema.parse("a")).toThrow();
        expect(() => schema.parse("abcde")).toThrow();
    });

    it("uses the latest min/max value", () => {
        const schema = s.string().min(1).min(3).max(10).max(5);

        expect(schema.parse("abc")).toBe("abc");
        expect(() => schema.parse("ab")).toThrow();
        expect(() => schema.parse("abcdef")).toThrow();
    });

    it("rejects invalid min/max configuration", () => {
        expect(() => s.string().min(-1)).toThrow(TypeError);
        expect(() => s.string().max(1.5)).toThrow(TypeError);
        expect(() => s.string().min(Number.NaN)).toThrow(TypeError);
    });

    it("supports describe()", () => {
        const schema = s.string().min(2).describe("User name");

        expect(schema.toJSON()).toMatchObject({
            kind: "string",
            description: "User name",
            constraints: { min: 2 },
        });
    });
});

describe("NumberSchema", () => {
    it("accepts finite numbers", () => {
        expect(s.number().parse(0)).toBe(0);
        expect(s.number().parse(-5)).toBe(-5);
        expect(s.number().parse(3.14)).toBe(3.14);
    });

    it("rejects non-numbers and non-finite numbers", () => {
        const schema = s.number();

        for (const value of [
            "1",
            true,
            null,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            Number.NEGATIVE_INFINITY,
        ]) {
            expect(() => schema.parse(value)).toThrow(SchemaValidationError);
        }
    });

    it("supports negative min/max bounds", () => {
        const schema = s.number().min(-10).max(-1);

        expect(schema.parse(-10)).toBe(-10);
        expect(schema.parse(-5)).toBe(-5);
        expect(schema.parse(-1)).toBe(-1);

        expect(() => schema.parse(-11)).toThrow();
        expect(() => schema.parse(0)).toThrow();
    });

    it("allows finite decimal bounds", () => {
        const schema = s.number().min(1.5).max(2.5);

        expect(schema.parse(1.5)).toBe(1.5);
        expect(schema.parse(2.5)).toBe(2.5);
        expect(() => schema.parse(1.4)).toThrow();
    });

    it("rejects non-finite configuration bounds", () => {
        expect(() => s.number().min(Number.NaN)).toThrow(TypeError);
        expect(() =>
            s.number().max(Number.POSITIVE_INFINITY),
        ).toThrow(TypeError);
    });
});

describe("BooleanSchema", () => {
    it("accepts true and false", () => {
        expect(s.boolean().parse(true)).toBe(true);
        expect(s.boolean().parse(false)).toBe(false);
    });

    it("rejects non-boolean values", () => {
        for (const value of [0, 1, "true", null, {}]) {
            expect(() => s.boolean().parse(value)).toThrow();
        }
    });
});

describe("LiteralSchema", () => {
    it("accepts only the specified literal", () => {
        expect(s.literal("hello").parse("hello")).toBe("hello");
        expect(s.literal(42).parse(42)).toBe(42);
        expect(s.literal(true).parse(true)).toBe(true);
        expect(s.null().parse(null)).toBe(null);

        expect(() => s.literal("hello").parse("world")).toThrow();
        expect(() => s.literal(42).parse("42")).toThrow();
        expect(() => s.literal(true).parse(1)).toThrow();
    });

    it("uses exact literal equality", () => {
        expect(() => s.literal(0).parse(-0)).not.toThrow();
        expect(() => s.literal(false).parse(0)).toThrow();
    });

    it("describes its literal value", () => {
        expect(s.literal("jsonrpc").toJSON()).toMatchObject({
            kind: "literal",
            constraints: { value: "jsonrpc" },
        });
    });

    it("rejects null at construction time", () => {
        // @ts-expect-error — LiteralValue 不含 null
        expect(() => s.literal(null)).toThrow(TypeError);
    });

});

describe("ArraySchema", () => {
    it("accepts arrays and validates each item", () => {
        expect(s.array(s.string()).parse(["a", "b"])).toEqual(["a", "b"]);
        expect(s.array(s.number()).parse([1, 2, 3])).toEqual([1, 2, 3]);
        expect(s.array(s.unknown()).parse([null, "x", 1])).toEqual([
            null,
            "x",
            1,
        ]);
    });

    it("rejects non-arrays and invalid items", () => {
        expect(() => s.array(s.string()).parse("abc")).toThrow();
        expect(() => s.array(s.string()).parse(["a", 1])).toThrow();
    });

    it("supports min/max item count", () => {
        const schema = s.array(s.number()).min(1).max(2);

        expect(schema.parse([1])).toEqual([1]);
        expect(schema.parse([1, 2])).toEqual([1, 2]);

        expect(() => schema.parse([])).toThrow();
        expect(() => schema.parse([1, 2, 3])).toThrow();
    });

    it("rejects invalid min/max configuration", () => {
        expect(() => s.array(s.string()).min(-1)).toThrow(TypeError);
        expect(() => s.array(s.string()).max(1.2)).toThrow(TypeError);
    });

    it("describes its element schema", () => {
        expect(s.array(s.string()).toJSON()).toMatchObject({
            kind: "array",
            element: { kind: "string" },
        });
    });

    it("omits empty constraints", () => {
        expect(s.array(s.string()).toJSON()).not.toHaveProperty("constraints");
    });

    it("preserves nested error paths from item schemas", () => {
        const schema = s.array(s.object({ id: s.number() }).strict());
        try {
            schema.parse([{ id: "x" }]);
            expect.fail("should throw");
        } catch (e) {
            expect(e).toBeInstanceOf(SchemaValidationError);
            expect((e as SchemaValidationError).path).toEqual(["0", "id"]);
        }
    });

});

describe("ObjectSchema", () => {
    const schema = s.object({
        name: s.string(),
        age: s.number(),
    });

    it("validates declared properties", () => {
        expect(schema.parse({ name: "Alice", age: 20 })).toEqual({
            name: "Alice",
            age: 20,
        });
    });

    it("requires all declared properties by default", () => {
        expect(schema.parse({ name: "Alice", age: 12 })).toEqual({
            name: "Alice", age: 12
        });

        expect(() => schema.parse({})).toThrow();
    });

    it("rejects extra properties by default", () => {
        expect(
            () => schema.parse({
                name: "Alice",
                extra: { enabled: true },
            })
        ).toThrow(SchemaValidationError);
    });

    it("rejects invalid declared properties", () => {
        expect(() => schema.parse({ name: 123 })).toThrow();
        expect(() => schema.parse({ age: "20" })).toThrow();
    });

    it("rejects arrays, null and primitives", () => {
        for (const value of [null, [], "text", 123, true]) {
            expect(() => schema.parse(value)).toThrow();
        }
    });

    it("strict mode requires all declared properties", () => {
        const strictSchema = s.object({
            name: s.string(),
            age: s.number(),
        }).strict();

        expect(strictSchema.parse({ name: "Alice", age: 20 })).toEqual({
            name: "Alice",
            age: 20,
        });

        expect(() => strictSchema.parse({ name: "Alice" })).toThrow();
        expect(() => strictSchema.parse({ age: 20 })).toThrow();
        expect(() => strictSchema.parse({})).toThrow();
    });

    it("strict mode rejects extra properties", () => {
        const strictSchema = s.object({
            name: s.string(),
        }).strict();

        expect(() => strictSchema.parse({
            name: "Alice",
            extra: true,
        })).toThrow();
    });

    it("optionalProperties whitelists missing keys", () => {
        const partial = s.object({
            name: s.string(),
            age: s.number(),
        }).optionalProperties(["age"]);

        // age 可缺失
        expect(partial.parse({ name: "Alice" })).toEqual({ name: "Alice" });
        // name 不在白名单 → 必填
        expect(() => partial.parse({ age: 20 })).toThrow();
        // 全部存在
        expect(partial.parse({ name: "Alice", age: 20 })).toEqual({
            name: "Alice",
            age: 20,
        });
    });

    it("optionalProperties([]) requires all declared properties", () => {
        const required = s.object({ name: s.string() }).optionalProperties([]);

        expect(required.parse({ name: "Alice" })).toEqual({ name: "Alice" });
        expect(() => required.parse({})).toThrow();
    });

    it("optionalProperties rejects unknown property names", () => {
        expect(() =>
            s.object({ name: s.string() }).optionalProperties(["nope"]),
        ).toThrow(TypeError);
    });

    it("allowUnknownProperties(false) rejects extra properties", () => {
        const closed = s.object({ name: s.string() }).allowUnknownProperties(false);

        expect(closed.parse({ name: "Alice" })).toEqual({ name: "Alice" });
        expect(() => closed.parse({ name: "Alice", extra: true })).toThrow();
    });

    it("allowUnknownProperties(true) keeps extra properties", () => {
        const open = s.object({ name: s.string() }).allowUnknownProperties(true);

        expect(open.parse({ name: "Alice", extra: 1 })).toEqual({
            name: "Alice",
            extra: 1,
        });
    });

    it("strict(false) restores permissive behavior (all optional + allow unknown)", () => {
        const schema = s.object({ name: s.string(), age: s.number() });
        const reopened = schema.strict().strict(false);

        // 缺失 age 仍被允许
        expect(reopened.parse({ name: "Alice" })).toEqual({ name: "Alice" });
        // 额外属性仍被保留
        expect(reopened.parse({ name: "Alice", extra: 1 })).toEqual({
            name: "Alice",
            extra: 1,
        });
    });

    it("supports nested objects and arrays", () => {
        const nested = s.object({
            user: s.object({
                name: s.string(),
            }).strict(),
            tags: s.array(s.string()),
        });

        expect(
            nested.parse({
                user: { name: "Alice" },
                tags: ["admin", "active"],
            }),
        ).toEqual({
            user: { name: "Alice" },
            tags: ["admin", "active"],
        });
    });

    it("describes object properties and strict mode", () => {
        expect(
            s.object({ name: s.string() }).strict().toJSON(),
        ).toMatchObject({
            kind: "object",
            constraints: {
                optionalProps: [],
                allowUnknownProps: false,
            },
            properties: {
                name: { kind: "string" },
            },
        });
    });

    it("describes default constraints as all required and no unknown props", () => {
        expect(
            s.object({ name: s.string(), age: s.number() }).toJSON(),
        ).toMatchObject({
            kind: "object",
            constraints: {
                optionalProps: [],
                allowUnknownProps: false,
            },
            properties: {
                name: { kind: "string" },
                age: { kind: "number" },
            },
        });
    });

    it("does not treat Object.prototype keys as declared properties", () => {
        const closed = s
            .object({ name: s.string() })
            .allowUnknownProperties(false);

        // toString / constructor 不在 shape 上 → 视为未知属性
        expect(() => closed.parse({ toString: "x" })).toThrow(
            SchemaValidationError,
        );
        expect(() => closed.parse({ constructor: 1 })).toThrow(
            SchemaValidationError,
        );

        const open = s.object({ name: s.string() }).optionalProperties(["name"]).allowUnknownProperties(true);
        expect(open.parse({ toString: "x" })).toEqual({ toString: "x" });
        expect(open.parse({ constructor: 1 })).toEqual({ constructor: 1 });
    });

    it("optionalProperties does not accept prototype property names unless in shape", () => {
        expect(() =>
            s.object({ name: s.string() }).optionalProperties(["toString"]),
        ).toThrow(TypeError);
    });

});

describe("RecordSchema", () => {
    it("validates all values using the value schema", () => {
        const schema = s.record(s.number());

        expect(schema.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
        expect(schema.parse({})).toEqual({});
        expect(() => schema.parse({ a: "1" })).toThrow();
    });

    it("rejects non-record inputs", () => {
        const schema = s.record(s.string());

        for (const value of [null, [], "text", 123, true]) {
            expect(() => schema.parse(value)).toThrow();
        }
    });

    it("supports min/max key counts", () => {
        const schema = s.record(s.string()).min(1).max(2);

        expect(schema.parse({ a: "x" })).toEqual({ a: "x" });
        expect(schema.parse({ a: "x", b: "y" })).toEqual({
            a: "x",
            b: "y",
        });

        expect(() => schema.parse({})).toThrow();
        expect(() => schema.parse({ a: "x", b: "y", c: "z" })).toThrow();
    });

    it("rejects invalid min/max configuration", () => {
        expect(() => s.record(s.string()).min(-1)).toThrow(TypeError);
        expect(() => s.record(s.string()).max(1.1)).toThrow(TypeError);
    });

    it("describes its value schema", () => {
        expect(s.record(s.number()).toJSON()).toMatchObject({
            kind: "record",
            value: { kind: "number" },
        });
    });

    it("supports union value schemas", () => {
        expect(
            s.record(s.union([s.string(), s.number()])).toJSON(),
        ).toMatchObject({
            kind: "record",
            value: {
                kind: "union",
                options: [{ kind: "string" }, { kind: "number" }],
            },
        });
    });
});

describe("UnionSchema", () => {
    it("accepts values matching any member", () => {
        const schema = s.union([s.string(), s.number()]);

        expect(schema.parse("hello")).toBe("hello");
        expect(schema.parse(123)).toBe(123);
    });

    it("rejects values matching no member", () => {
        const schema = s.union([s.string(), s.number()]);

        expect(() => schema.parse(true)).toThrow(SchemaValidationError);
        expect(() => schema.parse(null)).toThrow(SchemaValidationError);
    });

    it("supports literal and object members", () => {
        const schema = s.union([
            s.literal("none"),
            s.object({ id: s.number() }).strict(),
        ]);

        expect(schema.parse("none")).toBe("none");
        expect(schema.parse({ id: 1 })).toEqual({ id: 1 });
        expect(() => schema.parse({ id: "1" })).toThrow();
    });

    it("describes all union options", () => {
        expect(s.union([s.string(), s.number()]).toJSON()).toMatchObject({
            kind: "union",
            options: [{ kind: "string" }, { kind: "number" }],
        });
    });
});

describe("UnionSchema member nullability stripping", () => {
    it("strips member-level nullable at construction", () => {
        const schema = s.union([s.string().nullable(), s.number()]);
        expect(() => schema.parse(null)).toThrow(SchemaValidationError);
        expect(schema.parse("x")).toBe("x");
        expect(schema.parse(1)).toBe(1);
    });

    it("member nullable in toJSON is removed", () => {
        const desc = s.union([s.string().nullable(), s.number()]).toJSON();
        expect(desc.kind).toBe("union");
        if (desc.kind !== "union") throw new Error("expected union description");
        expect(desc.options[0]!.nullable).toBeUndefined();
        expect(desc.options[1]!.nullable).toBeUndefined();
    });

    it("union-level .nullable() still allows null", () => {
        const schema = s.union([s.string().nullable(), s.number()]).nullable();
        expect(schema.parse(null)).toBe(null);
    });

    it("does not mutate the passed-in member schema", () => {
        const member = s.string().nullable();
        s.union([member, s.number()]);
        // 原实例仍然允许 null
        expect(member.parse(null)).toBe(null);
    });
});


describe("TupleSchema", () => {
    it("validates length and each positional element", () => {
        const schema = s.tuple([
            s.string(),
            s.number(),
            s.boolean(),
        ]);
        console.log(schema.parse(["hello", 42, true]));     // 通过 
        expect(() => schema.parse(["hello", 42])).toThrow(SchemaValidationError);   // 长度不一致
        expect(() => schema.parse(["hello", "42", true])).toThrow(SchemaValidationError);   // 第二项类型不匹配
        expect(() => schema.parse("hello")).toThrow(SchemaValidationError);   // 不是数组
    });

    it("describes positional element schemas", () => {
        expect(s.tuple([s.string(), s.number()]).toJSON()).toMatchObject({
            kind: "tuple",
            elements: [{ kind: "string" }, { kind: "number" }],
        });
    });

    it("preserves nested error paths from element schemas", () => {
        const schema = s.tuple([
            s.string(),
            s.object({ id: s.number() }).strict(),
        ]);
        try {
            schema.parse(["ok", { id: "x" }]);
            expect.fail("should throw");
        } catch (e) {
            expect(e).toBeInstanceOf(SchemaValidationError);
            expect((e as SchemaValidationError).path).toEqual(["1", "id"]);
        }
    });

    it("preserves path for first-element failures", () => {
        const schema = s.tuple([s.string().min(3), s.number()]);
        try {
            schema.parse(["ab", 1]);
            expect.fail("should throw");
        } catch (e) {
            expect(e).toBeInstanceOf(SchemaValidationError);
            expect((e as SchemaValidationError).path).toEqual(["0"]);
        }
    });
});

describe("EnumSchema", () => {
    it("accepts declared enum values", () => {
        const schema = s.enum(["pending", "success", "failed"]);

        expect(schema.parse("pending")).toBe("pending");
        expect(schema.parse("success")).toBe("success");
        expect(schema.parse("failed")).toBe("failed");
    });

    it("rejects undeclared values and non-strings", () => {
        const schema = s.enum(["red", "green", "blue"]);

        expect(() => schema.parse("yellow")).toThrow();
        expect(() => schema.parse(1)).toThrow();
        expect(() => schema.parse(null)).toThrow();
    });

    it("describes enum values", () => {
        expect(s.enum(["a", "b"]).toJSON()).toMatchObject({
            kind: "enum",
            constraints: { values: ["a", "b"] },
        });
    });
});

describe("UnknownSchema", () => {
    it("accepts all JSON value categories", () => {
        const schema = s.unknown();

        const values: JSONValue[] = [
            null,
            "text",
            "",
            0,
            -10,
            1.25,
            true,
            false,
            [],
            [null, "text", 1, false],
            {},
            { nested: { value: null } },
        ];

        for (const value of values) {
            expect(schema.parse(value)).toEqual(value);
        }
    });

    it("rejects undefined and non-JSON primitive values", () => {
        const schema = s.unknown();

        for (const value of [
            undefined,
            1n,
            Symbol("x"),
            () => 1,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            Number.NEGATIVE_INFINITY,
        ]) {
            expect(() => schema.parse(value)).toThrow(SchemaValidationError);
        }
    });

    it("rejects circular references", () => {
        const value: Record<string, unknown> = {};
        value.self = value;

        expect(() => s.unknown().parse(value)).toThrow(/Circular references/);
    });

    it("rejects sparse arrays", () => {
        const value = new Array(2);
        value[1] = "present";

        expect(() => s.unknown().parse(value)).toThrow(/Sparse arrays/);
    });

    it("rejects non-plain objects", () => {
        expect(() => s.unknown().parse(new Date())).toThrow();
        expect(() => s.unknown().parse(new Map())).toThrow();
    });

    it("supports describe but not nullable", () => {
        const schema = s.unknown().describe("Any JSON value");

        expect(schema.toJSON()).toMatchObject({
            kind: "unknown",
            description: "Any JSON value",
        });

        expect(schema).toBeInstanceOf(UnknownSchema);

        // 编译期检查由下面的类型测试覆盖。
    });
});

describe("NullableSchema .nullable(bool)", () => {
    it("defaults to true", () => {
        expect(s.string().nullable().parse(null)).toBe(null);
        expect(s.string().nullable(true).parse(null)).toBe(null);
    });

    it("nullable(false) clears a previously-set flag", () => {
        const schema = s.string().nullable().nullable(false);
        expect(() => schema.parse(null)).toThrow(SchemaValidationError);
        expect(schema.toJSON().nullable).toBeUndefined();
    });

    it("nullable(false) on a fresh schema is a no-op", () => {
        const schema = s.string().nullable(false);
        expect(schema.toJSON().nullable).toBeUndefined();
        expect(() => schema.parse(null)).toThrow(SchemaValidationError);
    });

    it("is immutable: original instance unchanged", () => {
        const base = s.string();
        const nullable = base.nullable();
        expect(nullable).not.toBe(base);
        expect(() => base.parse(null)).toThrow(SchemaValidationError);
        expect(nullable.parse(null)).toBe(null);
    });
});

describe("Schema base behavior", () => {
    it("safeParse returns a success result for valid input", () => {
        expect(s.string().safeParse("ok")).toEqual({
            success: true,
            data: "ok",
        });
    });

    it("safeParse returns an error result for invalid input", () => {
        const result = s.string().safeParse(123);

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error).toBeInstanceOf(SchemaValidationError);
        }
    });

    it("parse throws SchemaValidationError for invalid input", () => {
        expect(() => s.string().parse(123)).toThrow(SchemaValidationError);
    });

    it("supports describe on multiple Schema kinds", () => {
        expect(s.number().describe("Age").toJSON().description).toBe("Age");
        expect(s.boolean().describe("Enabled").toJSON().description).toBe(
            "Enabled",
        );
    });

    it("rejects nullable calls on UnknownSchema at compile time", () => {
        const schema = s.unknown();
        schema.parse(null);
        schema.describe("Any JSON value");
        // @ts-ignore
        expect(() => schema.nullable()).toThrow(TypeError);
    });
});

describe("Schema extension", () => {

    class EmailSchema extends StringSchema<"email"> {

        override readonly kind = "email";

        constructor() {
            super();
        }

    }

    it("allows custom classes to extend concrete schemas", () => {
        const email = new EmailSchema().min(5).describe("Email address");

        expect(email.parse("a@b.c")).toBe("a@b.c");
        expect(email.toJSON()).toMatchObject({
            kind: "email",
            description: "Email address",
            constraints: { min: 5 },
        });
    });

    it("allows custom schemas to extend the abstract base", () => {
        class EvenNumberSchema extends Schema<number> {
            readonly kind = "even-number" as const;

            constructor() {
                super();
            }

            protected _parse(input: unknown): number {
                if (typeof input !== "number" || input % 2 !== 0) {
                    throw new SchemaValidationError("Expected an even number");
                }

                return input;
            }

            protected _describe() {
                return { kind: "even-number" as const, constraints: { even: true } };
            }
        }

        const even = new EvenNumberSchema();

        expect(even.parse(2)).toBe(2);
        expect(() => even.parse(3)).toThrow();
        expect(even.toJSON().constraints).toEqual({ even: true });
    });
});



describe("NullSchema", () => {
    it("accepts only null", () => {
        expect(s.null().parse(null)).toBe(null);
    });

    it("rejects every non-null value", () => {
        for (const value of [0, "", false, [], {}, "null", undefined]) {
            expect(() => s.null().parse(value)).toThrow(SchemaValidationError);
        }
    });

    it("describes itself as kind 'null' and has no nullable flag", () => {
        expect(s.null().toJSON()).toEqual({ kind: "null" });
    });

    it("does not expose .nullable()", () => {
        // @ts-expect-error — NullSchema 不继承 NullableSchema
        const _ = s.null().nullable;
        void _;
    });
});


describe("empty constraints omission", () => {
    it("omits empty constraints on leaf schemas", () => {
        expect(s.string().toJSON()).not.toHaveProperty("constraints");
        expect(s.number().toJSON()).not.toHaveProperty("constraints");
        expect(s.boolean().toJSON()).not.toHaveProperty("constraints");
        expect(s.record(s.string()).toJSON()).not.toHaveProperty(
            "constraints",
        );
    });

    it("omits description when unset or empty", () => {
        expect(s.string().toJSON()).not.toHaveProperty("description");
        expect(s.string().describe("").toJSON()).not.toHaveProperty(
            "description",
        );
    });

    it("describe without min/max still omits constraints", () => {
        expect(s.string().describe("x").toJSON()).toEqual({
            kind: "string",
            description: "x",
        });
        expect(s.number().describe("n").toJSON()).toEqual({
            kind: "number",
            description: "n",
        });
    });
});

// ═══════════════════════════════════════════════════════════════
// Schema.validate() — 可选关闭参数校验
// ═══════════════════════════════════════════════════════════════

describe("Schema.validate()", () => {
    it("defaults to validating (invalid input still fails)", () => {
        const schema = s.string().min(3);
        expect(() => schema.parse("ab")).toThrow(SchemaValidationError);
        const r = schema.safeParse("ab");
        expect(r.success).toBe(false);
    });

    it("validate(false) skips checks and returns the raw input", () => {
        const schema = s.string().min(3).validate(false);
        expect(schema.parse("ab")).toBe("ab");
        expect(schema.parse(123 as unknown as string)).toBe(123);
        const r = schema.safeParse({ not: "a string" });
        expect(r.success).toBe(true);
        if (r.success) expect(r.data).toEqual({ not: "a string" });
    });

    it("validate(true) restores validation after validate(false)", () => {
        const off = s.number().min(0).validate(false);
        expect(off.parse(-1)).toBe(-1);

        const on = off.validate(true);
        expect(() => on.parse(-1)).toThrow(SchemaValidationError);
        expect(on.parse(1)).toBe(1);
    });

    it("is immutable: original schema is unchanged", () => {
        const base = s.string().min(2);
        const off = base.validate(false);
        expect(() => base.parse("x")).toThrow(SchemaValidationError);
        expect(off.parse("x")).toBe("x");
        expect(base).not.toBe(off);
    });

    it("works on nested containers (array / object / union)", () => {
        const arr = s.array(s.number()).validate(false);
        expect(arr.parse(["not-a-number"])).toEqual(["not-a-number"]);

        const obj = s
            .object({ id: s.number() })
            .strict()
            .validate(false);
        expect(obj.parse({ id: "x", extra: true })).toEqual({
            id: "x",
            extra: true,
        });

        const uni = s.union([s.string(), s.number()]).validate(false);
        expect(uni.parse(true)).toBe(true);
    });

    it("toJSON omits validate when enabled (default)", () => {
        const desc = s.string().toJSON();
        expect(desc).not.toHaveProperty("validate");
    });

    it("toJSON includes validate: false when disabled", () => {
        const desc = s.string().min(1).validate(false).toJSON();
        expect(desc).toMatchObject({
            kind: "string",
            validate: false,
            constraints: { min: 1 },
        });
    });

    it("validate(false) then describe still carries validate: false", () => {
        const desc = s
            .number()
            .validate(false)
            .describe("trusted")
            .toJSON();
        expect(desc).toMatchObject({
            kind: "number",
            description: "trusted",
            validate: false,
        });
    });

    it("nullable + validate(false) still returns null as-is without checks", () => {
        const schema = s.string().min(5).nullable().validate(false);
        expect(schema.parse(null)).toBe(null);
        expect(schema.parse("short")).toBe("short");
    });
});