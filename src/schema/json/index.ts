import { primitives } from "./primitives";
import { markers } from "./marker";

export * from "./primitives";
export * from "./marker";

export const s = { ...primitives, ...markers };
