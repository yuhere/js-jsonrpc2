import { describe, expectTypeOf, it } from "vitest";
import { RPCError } from "../../src/errors/RPCError";
import type {
  Injections,
  MethodDescriptor,
  PermCheck,
} from "../../src/index";

type Assert<T extends true> = T;
type IsAssignable<A, B> = [A] extends [B] ? true : false;

type ThreeArgs = [
  readonly string[],
  MethodDescriptor,
  Injections,
];
type Result = boolean | RPCError | Promise<boolean | RPCError>;
type FewerParams = (grantTo: readonly string[]) => Promise<boolean>;
type Thunk = () => (grantTo: readonly string[]) => boolean;
type WrongReturn = (grantTo: readonly string[]) => string;

describe("PermCheck types", () => {
  it("exports the three-argument checker and keeps it on Injections", () => {
    expectTypeOf<PermCheck>().parameters.toEqualTypeOf<ThreeArgs>();
    expectTypeOf<PermCheck>().returns.toEqualTypeOf<Result>();
    expectTypeOf<Injections["perm_check"]>().toEqualTypeOf<
      PermCheck | undefined
    >();

    type _fewerOk = Assert<IsAssignable<FewerParams, PermCheck>>;
    type _thunkNo = Assert<
      IsAssignable<Thunk, PermCheck> extends false ? true : false
    >;
    type _returnNo = Assert<
      IsAssignable<WrongReturn, PermCheck> extends false ? true : false
    >;
    void (null as unknown as _fewerOk | _thunkNo | _returnNo);
  });
});
