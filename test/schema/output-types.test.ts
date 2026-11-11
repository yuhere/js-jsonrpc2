import { describe, expectTypeOf, it } from "vitest";
import {
  type Infer,
  type JSONValue,
  s,
} from "../../src/schema/json";

type Assert<T extends true> = T;
type IsAssignable<A, B> = [A] extends [B] ? true : false;

const user = s.object({ id: s.string(), name: s.string() });
const partial = s
  .object({ id: s.string(), nick: s.string() })
  .optionalProperties(["nick"]);
const requiredAgain = s
  .object({ id: s.string(), nick: s.string() })
  .optionalProperties(["nick"])
  .optionalProperties([]);
const nullableField = s.object({
  id: s.string().nullable(),
  name: s.string(),
});
const nullableUser = user.nullable();
const clearedUser = user.nullable().nullable(false);
const loose = s
  .object({ id: s.string(), name: s.string() })
  .strict(false);
const closed = loose.strict();

const pair = s.tuple([s.string(), s.number(), s.boolean()]);
const literals = s.tuple([s.literal("v1"), s.literal(2)]);
const nullablePair = pair.nullable();
const clearedPair = pair.nullable().nullable(false);

const label = s.string();
const nullableLabel = label.nullable().min(1);
const clearedLabel = label.nullable().min(1).nullable(false);

describe("schema output types", () => {
  it("keeps object fields required until optionalProperties or nullable", () => {
    expectTypeOf<Infer<typeof user>>().toEqualTypeOf<{
      id: string;
      name: string;
    }>();
    expectTypeOf<Infer<typeof partial>>().toEqualTypeOf<{
      id: string;
      nick?: string;
    }>();
    expectTypeOf<Infer<typeof requiredAgain>>().toEqualTypeOf<{
      id: string;
      nick: string;
    }>();
    expectTypeOf<Infer<typeof nullableField>>().toEqualTypeOf<{
      id: string | null;
      name: string;
    }>();
    expectTypeOf<Infer<typeof nullableUser>>().toEqualTypeOf<
      { id: string; name: string } | null
    >();
    expectTypeOf<Infer<typeof clearedUser>>().toEqualTypeOf<{
      id: string;
      name: string;
    }>();

    type _idRequired = Assert<
      IsAssignable<undefined, Infer<typeof user>["id"]> extends false
        ? true
        : false
    >;
    type _notNull = Assert<
      IsAssignable<null, Infer<typeof user>> extends false ? true : false
    >;
    void (null as unknown as _idRequired | _notNull);
  });

  it("follows strict(false): every field optional, extra keys are JSON", () => {
    expectTypeOf<Infer<typeof loose>["id"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<Infer<typeof loose>["name"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<Infer<typeof loose>["extra"]>().toEqualTypeOf<
      JSONValue | undefined
    >();
    expectTypeOf<Infer<typeof closed>>().toEqualTypeOf<{
      id: string;
      name: string;
    }>();
    const open = s
      .object({ id: s.string(), nick: s.string() })
      .optionalProperties(["nick"])
      .allowUnknownProperties(true);
    expectTypeOf<Infer<typeof open>["id"]>().toEqualTypeOf<string>();
    expectTypeOf<Infer<typeof open>["nick"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<Infer<typeof open>["extra"]>().toEqualTypeOf<
      JSONValue | undefined
    >();
  });

  it("preserves tuple positions, literals, and nullable", () => {
    expectTypeOf<Infer<typeof pair>>().toEqualTypeOf<
      [string, number, boolean]
    >();
    expectTypeOf<Infer<typeof literals>>().toEqualTypeOf<["v1", 2]>();
    expectTypeOf<Infer<typeof nullablePair>>().toEqualTypeOf<
      [string, number, boolean] | null
    >();
    expectTypeOf<Infer<typeof clearedPair>>().toEqualTypeOf<
      [string, number, boolean]
    >();

    type _noShort = Assert<
      IsAssignable<["only"], Infer<typeof pair>> extends false ? true : false
    >;
    type _noSwap = Assert<
      IsAssignable<[number, string, boolean], Infer<typeof pair>> extends false
        ? true
        : false
    >;
    void (null as unknown as _noShort | _noSwap);
  });

  it("adds null only after nullable()", () => {
    expectTypeOf<Infer<typeof label>>().toEqualTypeOf<string>();
    expectTypeOf<Infer<typeof nullableLabel>>().toEqualTypeOf<string | null>();
    expectTypeOf<Infer<typeof clearedLabel>>().toEqualTypeOf<string>();
    const names = s.array(s.string());
    const nums = s.array(s.number()).nullable();
    expectTypeOf<Infer<typeof names>>().toEqualTypeOf<string[]>();
    expectTypeOf<Infer<typeof nums>>().toEqualTypeOf<number[] | null>();
  });
});
