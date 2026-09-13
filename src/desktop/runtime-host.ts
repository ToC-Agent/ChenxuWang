import {
  TongyuRuntimeClient,
  type TongyuRuntimeClientSpawnOptions,
  type RuntimeClientExit,
} from "../client/index.js";

export type DesktopRuntimeHostState =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "failed";

export interface DesktopRuntimeHostSnapshot {
  state:
    DesktopRuntimeHostState;

  lastExit:
    RuntimeClientExit | null;

  lastError:
    Error | null;
}

export type DesktopRuntimeHostListener =
  (
    snapshot:
      DesktopRuntimeHostSnapshot,
  ) => void;

function normalizeError(
  error:
    unknown,
): Error {
  return error instanceof
    Error
    ? error
    : new Error(
        String(
          error,
        ),
      );
}

export class TongyuDesktopRuntimeHost {
  readonly #options:
    TongyuRuntimeClientSpawnOptions;

  readonly #listeners =
    new Set<
      DesktopRuntimeHostListener
    >();

  #state:
    DesktopRuntimeHostState =
      "stopped";

  #client:
    TongyuRuntimeClient |
    undefined;

  #startPromise:
    Promise<
      TongyuRuntimeClient
    > |
    undefined;

  #stopPromise:
    Promise<
      RuntimeClientExit | null
    > |
    undefined;

  #lastExit:
    RuntimeClientExit | null =
      null;

  #lastError:
    Error | null =
      null;

  #generation =
    0;

  constructor(
    options:
      TongyuRuntimeClientSpawnOptions,
  ) {
    this.#options =
      options;
  }

  get state():
    DesktopRuntimeHostState {
    return this.#state;
  }

  get client():
    TongyuRuntimeClient |
    undefined {
    return this.#client;
  }

  get snapshot():
    DesktopRuntimeHostSnapshot {
    return {
      state:
        this.#state,

      lastExit:
        this.#lastExit,

      lastError:
        this.#lastError,
    };
  }

  requireClient():
    TongyuRuntimeClient {
    if (
      this.#state !==
        "running" ||
      !this.#client
    ) {
      throw new Error(
        `Tongyu desktop runtime is not running: ${this.#state}`,
      );
    }

    return this.#client;
  }

  onStatus(
    listener:
      DesktopRuntimeHostListener,
  ): () => void {
    this.#listeners.add(
      listener,
    );

    return () => {
      this.#listeners.delete(
        listener,
      );
    };
  }

  start():
    Promise<
      TongyuRuntimeClient
    > {
    if (
      this.#state ===
        "running" &&
      this.#client
    ) {
      return Promise.resolve(
        this.#client,
      );
    }

    if (
      this.#startPromise
    ) {
      return this.#startPromise;
    }

    if (
      this.#stopPromise
    ) {
      return this.#stopPromise
        .then(
          () =>
            this.start(),
        );
    }

    const generation =
      ++this.#generation;

    this.#lastExit =
      null;

    this.#lastError =
      null;

    this.#transition(
      "starting",
    );

    const startPromise =
      TongyuRuntimeClient.spawn(
        this.#options,
      )
        .then(
          (
            client,
          ) => {
            if (
              generation !==
                this.#generation
            ) {
              void client.shutdown();

              throw new Error(
                "Tongyu desktop runtime startup was superseded.",
              );
            }

            this.#client =
              client;

            this.#transition(
              "running",
            );

            this.#watchExit(
              client,
              generation,
            );

            return client;
          },
        )
        .catch(
          (
            error,
          ) => {
            const normalized =
              normalizeError(
                error,
              );

            if (
              generation ===
                this.#generation
            ) {
              this.#client =
                undefined;

              this.#lastError =
                normalized;

              this.#transition(
                "failed",
              );
            }

            throw normalized;
          },
        )
        .finally(
          () => {
            if (
              this.#startPromise ===
                startPromise
            ) {
              this.#startPromise =
                undefined;
            }
          },
        );

    this.#startPromise =
      startPromise;

    return startPromise;
  }

  async stop():
    Promise<
      RuntimeClientExit | null
    > {
    if (
      this.#stopPromise
    ) {
      return this.#stopPromise;
    }

    if (
      this.#state ===
        "starting" &&
      this.#startPromise
    ) {
      try {
        await this.#startPromise;
      } catch {
        /*
         * Failed startup already moved the host into
         * "failed". stop() below normalizes it to stopped.
         */
      }

      return this.stop();
    }

    const client =
      this.#client;

    if (
      !client
    ) {
      if (
        this.#state !==
          "stopped"
      ) {
        this.#transition(
          "stopped",
        );
      }

      return this.#lastExit;
    }

    this.#transition(
      "stopping",
    );

    const stopPromise =
      client.shutdown()
        .then(
          (
            exit,
          ) => {
            this.#lastExit =
              exit;

            if (
              this.#client ===
                client
            ) {
              this.#client =
                undefined;
            }

            this.#transition(
              "stopped",
            );

            return exit;
          },
        )
        .catch(
          (
            error,
          ) => {
            const normalized =
              normalizeError(
                error,
              );

            this.#lastError =
              normalized;

            if (
              this.#client ===
                client
            ) {
              this.#client =
                undefined;
            }

            this.#transition(
              "failed",
            );

            throw normalized;
          },
        )
        .finally(
          () => {
            if (
              this.#stopPromise ===
                stopPromise
            ) {
              this.#stopPromise =
                undefined;
            }
          },
        );

    this.#stopPromise =
      stopPromise;

    return stopPromise;
  }

  #watchExit(
    client:
      TongyuRuntimeClient,
    generation:
      number,
  ): void {
    void client
      .waitForExit()
      .then(
        (
          exit,
        ) => {
          if (
            generation !==
              this.#generation ||
            this.#client !==
              client
          ) {
            return;
          }

          this.#lastExit =
            exit;

          /*
           * stop() owns the normal stopping -> stopped
           * transition. Avoid racing it here.
           */
          if (
            this.#state ===
              "stopping"
          ) {
            return;
          }

          this.#client =
            undefined;

          if (
            exit.code ===
              0 &&
            exit.signal ===
              null
          ) {
            this.#transition(
              "stopped",
            );

            return;
          }

          const error =
            new Error(
              `Tongyu runtime exited unexpectedly: code=${String(
                exit.code,
              )}, signal=${String(
                exit.signal,
              )}`,
            );

          this.#lastError =
            error;

          this.#transition(
            "failed",
          );
        },
        (
          error,
        ) => {
          if (
            generation !==
              this.#generation ||
            this.#client !==
              client
          ) {
            return;
          }

          this.#client =
            undefined;

          this.#lastError =
            normalizeError(
              error,
            );

          this.#transition(
            "failed",
          );
        },
      );
  }

  #transition(
    state:
      DesktopRuntimeHostState,
  ): void {
    if (
      this.#state ===
        state
    ) {
      return;
    }

    this.#state =
      state;

    const snapshot =
      this.snapshot;

    for (
      const listener of
        this.#listeners
    ) {
      try {
        listener(
          snapshot,
        );
      } catch {
        /*
         * Desktop observers must never be able to break
         * Runtime lifecycle management.
         */
      }
    }
  }
}
