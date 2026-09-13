import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";

import {
  createInterface,
  type Interface as ReadlineInterface,
} from "node:readline";

import {
  ClientMessageSchema,
  ServerEventSchema,
  type ClientMessage,
  type ServerEvent,
} from "../protocol/index.js";

import type {
  RuntimeClient,
  RuntimeClientErrorListener,
  RuntimeClientEventListener,
  RuntimeClientExit,
  RuntimeClientStderrListener,
} from "./types.js";

export interface StdioRuntimeClientOptions {
  command:
    string;

  args?:
    readonly string[];

  cwd?:
    string;

  env?:
    NodeJS.ProcessEnv;
}

export class RuntimeClientProtocolError
  extends Error {
  readonly line:
    string;

  constructor(
    message: string,
    line: string,
  ) {
    super(
      message,
    );

    this.name =
      "RuntimeClientProtocolError";

    this.line =
      line;
  }
}

export class StdioRuntimeClient
  implements RuntimeClient {
  readonly #child:
    ChildProcessWithoutNullStreams;

  readonly #serverLines:
    ReadlineInterface;

  readonly #eventListeners =
    new Set<
      RuntimeClientEventListener
    >();

  readonly #errorListeners =
    new Set<
      RuntimeClientErrorListener
    >();

  readonly #stderrListeners =
    new Set<
      RuntimeClientStderrListener
    >();

  readonly #eventQueue:
    ServerEvent[] =
      [];

  readonly #exitPromise:
    Promise<RuntimeClientExit>;

  readonly #readerTask:
    Promise<void>;

  #eventWaiter:
    (
      (
        event:
          ServerEvent | null,
      ) => void
    ) |
    undefined;

  #eventStreamClaimed =
    false;

  #eventStreamEnded =
    false;

  #closed =
    false;

  #inputEnded =
    false;

  #closePromise:
    Promise<RuntimeClientExit> |
    undefined;

  private constructor(
    options:
      StdioRuntimeClientOptions,
  ) {
    this.#child =
      spawn(
        options.command,
        [
          ...(
            options.args ??
            []
          ),
        ],
        {
          cwd:
            options.cwd,

          env:
            options.env ??
            process.env,

          stdio: [
            "pipe",
            "pipe",
            "pipe",
          ],
        },
      );

    this.#serverLines =
      createInterface({
        input:
          this.#child.stdout,

        crlfDelay:
          Infinity,
      });

    this.#child.stderr.on(
      "data",
      (
        chunk:
          Buffer,
      ) => {
        const text =
          chunk.toString(
            "utf8",
          );

        for (
          const listener of
            this.#stderrListeners
        ) {
          try {
            listener(
              text,
            );
          } catch (error) {
            this.#emitError(
              error,
            );
          }
        }
      },
    );

    this.#exitPromise =
      new Promise<
        RuntimeClientExit
      >(
        (
          resolve,
          reject,
        ) => {
          this.#child.once(
            "error",
            (
              error,
            ) => {
              this.#closed =
                true;

              this.#finishEventStream();

              this.#emitError(
                error,
              );

              reject(
                error,
              );
            },
          );

          this.#child.once(
            "exit",
            (
              code,
              signal,
            ) => {
              this.#closed =
                true;

              resolve({
                code,

                signal,
              });
            },
          );
        },
      );

    this.#readerTask =
      this.#readServerEvents();
  }

  static spawn(
    options:
      StdioRuntimeClientOptions,
  ): StdioRuntimeClient {
    return new StdioRuntimeClient(
      options,
    );
  }

  get closed(): boolean {
    return this.#closed;
  }

  send(
    message:
      ClientMessage,
  ): void {
    if (
      this.#closed ||
      this.#inputEnded ||
      this.#child.stdin.destroyed
    ) {
      throw new Error(
        "Tongyu runtime client input is closed.",
      );
    }

    const validated =
      ClientMessageSchema.parse(
        message,
      );

    this.#child.stdin.write(
      `${JSON.stringify(
        validated,
      )}\n`,
    );
  }

  onEvent(
    listener:
      RuntimeClientEventListener,
  ): () => void {
    this.#eventListeners.add(
      listener,
    );

    return () => {
      this.#eventListeners.delete(
        listener,
      );
    };
  }

  onError(
    listener:
      RuntimeClientErrorListener,
  ): () => void {
    this.#errorListeners.add(
      listener,
    );

    return () => {
      this.#errorListeners.delete(
        listener,
      );
    };
  }

  onStderr(
    listener:
      RuntimeClientStderrListener,
  ): () => void {
    this.#stderrListeners.add(
      listener,
    );

    return () => {
      this.#stderrListeners.delete(
        listener,
      );
    };
  }

  async *events():
    AsyncIterable<ServerEvent> {
    if (
      this.#eventStreamClaimed
    ) {
      throw new Error(
        "Tongyu runtime client event stream already has an active consumer.",
      );
    }

    this.#eventStreamClaimed =
      true;

    try {
      while (
        true
      ) {
        const event =
          await this.#nextStreamEvent();

        if (
          event ===
            null
        ) {
          return;
        }

        yield event;
      }
    } finally {
      this.#eventStreamClaimed =
        false;

      this.#eventQueue.length =
        0;

      if (
        this.#eventWaiter
      ) {
        const waiter =
          this.#eventWaiter;

        this.#eventWaiter =
          undefined;

        waiter(
          null,
        );
      }
    }
  }

  /*
   * Half-close the stdio transport without waiting for process exit.
   *
   * The Tongyu server treats stdin EOF as the signal to finish its
   * own cleanup and terminate. CLI event handlers need this form
   * because they may still be consuming stdout events at the time.
   */
  endInput(): void {
    if (
      this.#closed ||
      this.#inputEnded
    ) {
      return;
    }

    this.#inputEnded =
      true;

    if (
      !this.#child.stdin.destroyed
    ) {
      this.#child.stdin.end();
    }
  }

  waitForExit():
    Promise<RuntimeClientExit> {
    return this.#exitPromise;
  }

  close():
    Promise<RuntimeClientExit> {
    if (
      this.#closePromise
    ) {
      return this.#closePromise;
    }

    this.#closePromise =
      this.#closeInternal();

    return this.#closePromise;
  }

  async #closeInternal():
    Promise<RuntimeClientExit> {
    this.endInput();

    const [
      ,
      exit,
    ] =
      await Promise.all([
        this.#readerTask,
        this.#exitPromise,
      ]);

    return exit;
  }

  #nextStreamEvent():
    Promise<
      ServerEvent | null
    > {
    const queued =
      this.#eventQueue.shift();

    if (
      queued
    ) {
      return Promise.resolve(
        queued,
      );
    }

    if (
      this.#eventStreamEnded
    ) {
      return Promise.resolve(
        null,
      );
    }

    return new Promise(
      (
        resolve,
      ) => {
        this.#eventWaiter =
          resolve;
      },
    );
  }

  #finishEventStream(): void {
    if (
      this.#eventStreamEnded
    ) {
      return;
    }

    this.#eventStreamEnded =
      true;

    if (
      this.#eventWaiter
    ) {
      const waiter =
        this.#eventWaiter;

      this.#eventWaiter =
        undefined;

      waiter(
        null,
      );
    }
  }

  async #readServerEvents():
    Promise<void> {
    try {
      for await (
        const rawLine of
          this.#serverLines
      ) {
        const line =
          rawLine.trim();

        if (
          !line
        ) {
          continue;
        }

        let input:
          unknown;

        try {
          input =
            JSON.parse(
              line,
            );
        } catch {
          this.#emitError(
            new RuntimeClientProtocolError(
              "Tongyu server emitted invalid JSON.",
              rawLine,
            ),
          );

          continue;
        }

        const parsed =
          ServerEventSchema.safeParse(
            input,
          );

        if (
          !parsed.success
        ) {
          this.#emitError(
            new RuntimeClientProtocolError(
              "Tongyu server event does not match the protocol schema.",
              rawLine,
            ),
          );

          continue;
        }

        this.#emitEvent(
          parsed.data,
        );
      }
    } catch (error) {
      this.#emitError(
        error,
      );
    } finally {
      this.#finishEventStream();
    }
  }

  #emitEvent(
    event:
      ServerEvent,
  ): void {
    if (
      this.#eventStreamClaimed &&
      !this.#eventStreamEnded
    ) {
      if (
        this.#eventWaiter
      ) {
        const waiter =
          this.#eventWaiter;

        this.#eventWaiter =
          undefined;

        waiter(
          event,
        );
      } else {
        this.#eventQueue.push(
          event,
        );
      }
    }

    for (
      const listener of
        this.#eventListeners
    ) {
      try {
        listener(
          event,
        );
      } catch (error) {
        this.#emitError(
          error,
        );
      }
    }
  }

  #emitError(
    error:
      unknown,
  ): void {
    const normalized =
      error instanceof
        Error
        ? error
        : new Error(
            String(
              error,
            ),
          );

    /*
     * Listener failures must not kill the transport.
     *
     * Avoid recursively routing an error-listener failure
     * back through the same listener set.
     */
    for (
      const listener of
        this.#errorListeners
    ) {
      try {
        listener(
          normalized,
        );
      } catch {
        // Ignore client observer failure.
      }
    }
  }
}
