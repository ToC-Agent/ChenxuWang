import type {
  ModelRequest,
  ModelStreamEvent,
} from "./types.js";

export interface ModelStreamOptions {
  signal?:
    AbortSignal;
}

export interface ModelProvider {
  readonly id:
    string;

  stream(
    request:
      ModelRequest,
    options?:
      ModelStreamOptions,
  ): AsyncIterable<
    ModelStreamEvent
  >;
}
