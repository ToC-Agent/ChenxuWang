import type {
  ModelRequest,
  ModelStreamEvent,
} from "./types.js";

export interface ModelProvider {
  readonly id: string;

  stream(
    request: ModelRequest,
  ): AsyncIterable<ModelStreamEvent>;
}
