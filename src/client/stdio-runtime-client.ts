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

  readonly #exitPromise:
    Promise<RuntimeClientExit>;

  readonly #readerTask:
    Promise<void>;

  #closed =
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
      this.#child.stdin.destroyed
    ) {
      throw new Error(
        "Tongyu runtime client is closed.",
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
    if (
      !this.#closed &&
      !this.#child.stdin.destroyed
    ) {
      this.#child.stdin.end();
    }

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
    }
  }

  #emitEvent(
    event:
      ServerEvent,
  ): void {
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
