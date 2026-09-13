import type {
  ClientMessage,
  ServerEvent,
} from "../protocol/index.js";

export interface RuntimeClientExit {
  code:
    number | null;

  signal:
    NodeJS.Signals | null;
}

export type RuntimeClientEventListener =
  (
    event: ServerEvent,
  ) => void;

export type RuntimeClientErrorListener =
  (
    error: Error,
  ) => void;

export type RuntimeClientStderrListener =
  (
    chunk: string,
  ) => void;

export interface RuntimeClient {
  readonly closed:
    boolean;

  send(
    message: ClientMessage,
  ): void;

  onEvent(
    listener:
      RuntimeClientEventListener,
  ): () => void;

  onError(
    listener:
      RuntimeClientErrorListener,
  ): () => void;

  onStderr(
    listener:
      RuntimeClientStderrListener,
  ): () => void;

  waitForExit():
    Promise<RuntimeClientExit>;

  close():
    Promise<RuntimeClientExit>;
}
