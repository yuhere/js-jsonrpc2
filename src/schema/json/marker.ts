import type { Schema } from "./primitives";

export abstract class Marker {
  abstract readonly kind: string;
}


export class VoidMarker extends Marker {
  readonly kind = "void" as const;
}

export class InjectableMarker<const K extends string = string> extends Marker {
  readonly kind = "injectable" as const;

  constructor(readonly key: K) {
    super();
  }
}

export class StreamMarker<T = unknown> extends Marker {
  readonly kind = "stream" as const;

  constructor(readonly inner: Schema<T>) {
    super();
  }
}

export const markers = {
  void: () => new VoidMarker(),
  injectable: <const K extends string>(key: K) => new InjectableMarker(key),
  stream: <T>(inner: Schema<T>) => new StreamMarker(inner),
};