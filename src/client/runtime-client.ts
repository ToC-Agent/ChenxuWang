import {
  randomUUID,
} from "node:crypto";

import {
  TONGYU_VERSION,
} from "../constants.js";

import {
  TONGYU_PROTOCOL_VERSION,
  type ClientMessage,
  type ServerEvent,
} from "../protocol/index.js";

import {
  StdioRuntimeClient,
  type StdioRuntimeClientOptions,
} from "./stdio-runtime-client.js";

import type {
  RuntimeClientErrorListener,
  RuntimeClientEventListener,
  RuntimeClientExit,
  RuntimeClientStderrListener,
} from "./types.js";

type ServerEventOf<
  Type extends
    ServerEvent["type"],
> =
  Extract<
    ServerEvent,
    {
      type: Type;
    }
  >;

type ClientMessageOf<
  Type extends
    ClientMessage["type"],
> =
  Extract<
    ClientMessage,
    {
      type: Type;
    }
  >;

type RuntimeErrorEvent =
  ServerEventOf<
    "runtime.error"
  >;

export interface TongyuRuntimeClientSpawnOptions
  extends StdioRuntimeClientOptions {
  clientName?:
    string;

  clientVersion?:
    string;
}

export interface WorkspaceReviewListOptions {
  requestId?:
    string;

  sourceRequestId?:
    string;

  path?:
    string;
}

export interface WorkspaceReviewListResult {
  items:
    ServerEventOf<
      "workspace.review.item"
    >[];

  end:
    ServerEventOf<
      "workspace.review.list.end"
    >;
}

export interface SessionListResult {
  items:
    ServerEventOf<
      "session.list.item"
    >[];

  end:
    ServerEventOf<
      "session.list.end"
    >;
}

export class TongyuRuntimeRequestError
  extends Error {
  readonly event:
    RuntimeErrorEvent;

  constructor(
    event:
      RuntimeErrorEvent,
  ) {
    super(
      `[${event.code}] ${event.message}`,
    );

    this.name =
      "TongyuRuntimeRequestError";

    this.event =
      event;
  }
}

function createRequestId(
  prefix:
    string,
): string {
  return `${prefix}-${randomUUID()}`;
}

function eventRequestId(
  event:
    ServerEvent,
): string | undefined {
  if (
    !(
      "requestId"
      in event
    )
  ) {
    return undefined;
  }

  return typeof event.requestId ===
    "string"
    ? event.requestId
    : undefined;
}

export class TongyuRuntimeClient {
  readonly #transport:
    StdioRuntimeClient;

  private constructor(
    transport:
      StdioRuntimeClient,
  ) {
    this.#transport =
      transport;
  }

  static async spawn(
    options:
      TongyuRuntimeClientSpawnOptions,
  ): Promise<
    TongyuRuntimeClient
  > {
    const {
      clientName =
        "tongyu-client",

      clientVersion =
        TONGYU_VERSION,

      ...transportOptions
    } =
      options;

    const transport =
      StdioRuntimeClient.spawn(
        transportOptions,
      );

    const client =
      new TongyuRuntimeClient(
        transport,
      );

    try {
      await client.#initialize(
        clientName,
        clientVersion,
      );

      return client;
    } catch (error) {
      try {
        await transport.close();
      } catch {
        // Preserve the initialization error.
      }

      throw error;
    }
  }

  get closed(): boolean {
    return this.#transport.closed;
  }

  onEvent(
    listener:
      RuntimeClientEventListener,
  ): () => void {
    return this.#transport.onEvent(
      listener,
    );
  }

  onError(
    listener:
      RuntimeClientErrorListener,
  ): () => void {
    return this.#transport.onError(
      listener,
    );
  }

  onStderr(
    listener:
      RuntimeClientStderrListener,
  ): () => void {
    return this.#transport.onStderr(
      listener,
    );
  }

  events():
    AsyncIterable<
      ServerEvent
    > {
    return this.#transport.events();
  }

  waitForExit():
    Promise<
      RuntimeClientExit
    > {
    return this.#transport.waitForExit();
  }

  shutdown():
    Promise<
      RuntimeClientExit
    > {
    return this.#transport.close();
  }

  async createSession(
    cwd:
      string,
    requestId =
      createRequestId(
        "req-session-create",
      ),
  ): Promise<
    ServerEventOf<
      "session.created"
    >
  > {
    const message:
      ClientMessageOf<
        "session.create"
      > = {
        id:
          requestId,

        type:
          "session.create",

        cwd,
      };

    return this.#sendAndWait(
      message,
      "session.created",
    );
  }

  async resumeSession(
    sessionId:
      string,
    requestId =
      createRequestId(
        "req-session-resume",
      ),
  ): Promise<
    ServerEventOf<
      "session.resumed"
    >
  > {
    const message:
      ClientMessageOf<
        "session.resume"
      > = {
        id:
          requestId,

        type:
          "session.resume",

        sessionId,
      };

    return this.#sendAndWait(
      message,
      "session.resumed",
    );
  }

  async listSessions(
    requestId =
      createRequestId(
        "req-session-list",
      ),
  ): Promise<
    SessionListResult
  > {
    const message:
      ClientMessageOf<
        "session.list"
      > = {
        id:
          requestId,

        type:
          "session.list",
      };

    return this.#collectUntil(
      message,
      "session.list.item",
      "session.list.end",
    );
  }

  async closeSession(
    sessionId:
      string,
    requestId =
      createRequestId(
        "req-session-close",
      ),
  ): Promise<
    ServerEventOf<
      "session.end"
    >
  > {
    const message:
      ClientMessageOf<
        "session.close"
      > = {
        id:
          requestId,

        type:
          "session.close",

        sessionId,
      };

    return this.#sendAndWait(
      message,
      "session.end",
    );
  }

  sendMessage(
    sessionId:
      string,
    content:
      string,
    requestId =
      createRequestId(
        "req-user-message",
      ),
  ): string {
    const message:
      ClientMessageOf<
        "user.message"
      > = {
        id:
          requestId,

        type:
          "user.message",

        sessionId,

        content,
      };

    this.#transport.send(
      message,
    );

    return requestId;
  }

  respondPermission(
    sessionId:
      string,
    permissionRequestId:
      string,
    decision:
      ClientMessageOf<
        "permission.response"
      >["decision"],
    requestId =
      createRequestId(
        "req-permission",
      ),
  ): string {
    const message:
      ClientMessageOf<
        "permission.response"
      > = {
        id:
          requestId,

        type:
          "permission.response",

        sessionId,

        permissionRequestId,

        decision,
      };

    this.#transport.send(
      message,
    );

    return requestId;
  }

  async interrupt(
    sessionId:
      string,
    requestId =
      createRequestId(
        "req-interrupt",
      ),
  ): Promise<
    ServerEventOf<
      "control.interrupted"
    >
  > {
    const message:
      ClientMessageOf<
        "control.interrupt"
      > = {
        id:
          requestId,

        type:
          "control.interrupt",

        sessionId,
      };

    return this.#sendAndWait(
      message,
      "control.interrupted",
    );
  }

  async listWorkspaceReviews(
    sessionId:
      string,
    options:
      WorkspaceReviewListOptions = {},
  ): Promise<
    WorkspaceReviewListResult
  > {
    const {
      requestId =
        createRequestId(
          "req-workspace-review",
        ),

      sourceRequestId,

      path,
    } =
      options;

    const message:
      ClientMessageOf<
        "workspace.review.list"
      > = {
        id:
          requestId,

        type:
          "workspace.review.list",

        sessionId,

        ...(
          sourceRequestId
            ? {
                sourceRequestId,
              }
            : {}
        ),

        ...(
          path
            ? {
                path,
              }
            : {}
        ),
      };

    return this.#collectUntil(
      message,
      "workspace.review.item",
      "workspace.review.list.end",
    );
  }

  async acceptWorkspaceChange(
    sessionId:
      string,
    path:
      string,
    requestId =
      createRequestId(
        "req-workspace-accept",
      ),
  ): Promise<
    ServerEventOf<
      "workspace.change.reviewed"
    >
  > {
    const message:
      ClientMessageOf<
        "workspace.changes.accept"
      > = {
        id:
          requestId,

        type:
          "workspace.changes.accept",

        sessionId,

        path,
      };

    return this.#sendAndWait(
      message,
      "workspace.change.reviewed",
    );
  }

  async revertWorkspaceChange(
    sessionId:
      string,
    path:
      string,
    requestId =
      createRequestId(
        "req-workspace-revert",
      ),
  ): Promise<
    ServerEventOf<
      "workspace.change.reviewed"
    >
  > {
    const message:
      ClientMessageOf<
        "workspace.changes.revert"
      > = {
        id:
          requestId,

        type:
          "workspace.changes.revert",

        sessionId,

        path,
      };

    return this.#sendAndWait(
      message,
      "workspace.change.reviewed",
    );
  }

  async #initialize(
    clientName:
      string,
    clientVersion:
      string,
  ): Promise<
    ServerEventOf<
      "control.initialized"
    >
  > {
    const message:
      ClientMessageOf<
        "control.initialize"
      > = {
        id:
          createRequestId(
            "req-control-init",
          ),

        type:
          "control.initialize",

        protocolVersion:
          TONGYU_PROTOCOL_VERSION,

        client: {
          name:
            clientName,

          version:
            clientVersion,
        },
      };

    return this.#sendAndWait(
      message,
      "control.initialized",
    );
  }

  #sendAndWait<
    ExpectedType extends
      ServerEvent["type"],
  >(
    message:
      ClientMessage,
    expectedType:
      ExpectedType,
  ): Promise<
    ServerEventOf<
      ExpectedType
    >
  > {
    return new Promise(
      (
        resolve,
        reject,
      ) => {
        let settled =
          false;

        let unsubscribeEvent =
          () => {};

        let unsubscribeError =
          () => {};

        const cleanup =
          () => {
            unsubscribeEvent();
            unsubscribeError();
          };

        const fail =
          (
            error:
              Error,
          ) => {
            if (
              settled
            ) {
              return;
            }

            settled =
              true;

            cleanup();

            reject(
              error,
            );
          };

        unsubscribeEvent =
          this.#transport.onEvent(
            (
              event,
            ) => {
              if (
                eventRequestId(
                  event,
                ) !==
                  message.id
              ) {
                return;
              }

              if (
                event.type ===
                  "runtime.error"
              ) {
                fail(
                  new TongyuRuntimeRequestError(
                    event,
                  ),
                );

                return;
              }

              if (
                event.type !==
                  expectedType
              ) {
                return;
              }

              if (
                settled
              ) {
                return;
              }

              settled =
                true;

              cleanup();

              resolve(
                event as
                  ServerEventOf<
                    ExpectedType
                  >,
              );
            },
          );

        unsubscribeError =
          this.#transport.onError(
            (
              error,
            ) => {
              fail(
                error,
              );
            },
          );

        void this.#transport
          .waitForExit()
          .then(
            (
              exit,
            ) => {
              if (
                settled
              ) {
                return;
              }

              fail(
                new Error(
                  `Tongyu runtime exited before request ${message.id} completed: code=${String(
                    exit.code,
                  )}, signal=${String(
                    exit.signal,
                  )}`,
                ),
              );
            },
            (
              error,
            ) => {
              fail(
                error instanceof
                  Error
                  ? error
                  : new Error(
                      String(
                        error,
                      ),
                    ),
              );
            },
          );

        try {
          this.#transport.send(
            message,
          );
        } catch (error) {
          fail(
            error instanceof
              Error
              ? error
              : new Error(
                  String(
                    error,
                  ),
                ),
          );
        }
      },
    );
  }

  #collectUntil<
    ItemType extends
      ServerEvent["type"],
    EndType extends
      ServerEvent["type"],
  >(
    message:
      ClientMessage,
    itemType:
      ItemType,
    endType:
      EndType,
  ): Promise<{
    items:
      ServerEventOf<
        ItemType
      >[];

    end:
      ServerEventOf<
        EndType
      >;
  }> {
    return new Promise(
      (
        resolve,
        reject,
      ) => {
        const items:
          ServerEventOf<
            ItemType
          >[] =
            [];

        let settled =
          false;

        let unsubscribeEvent =
          () => {};

        let unsubscribeError =
          () => {};

        const cleanup =
          () => {
            unsubscribeEvent();
            unsubscribeError();
          };

        const fail =
          (
            error:
              Error,
          ) => {
            if (
              settled
            ) {
              return;
            }

            settled =
              true;

            cleanup();

            reject(
              error,
            );
          };

        unsubscribeEvent =
          this.#transport.onEvent(
            (
              event,
            ) => {
              if (
                eventRequestId(
                  event,
                ) !==
                  message.id
              ) {
                return;
              }

              if (
                event.type ===
                  "runtime.error"
              ) {
                fail(
                  new TongyuRuntimeRequestError(
                    event,
                  ),
                );

                return;
              }

              if (
                event.type ===
                  itemType
              ) {
                items.push(
                  event as
                    ServerEventOf<
                      ItemType
                    >,
                );

                return;
              }

              if (
                event.type !==
                  endType
              ) {
                return;
              }

              if (
                settled
              ) {
                return;
              }

              settled =
                true;

              cleanup();

              resolve({
                items,

                end:
                  event as
                    ServerEventOf<
                      EndType
                    >,
              });
            },
          );

        unsubscribeError =
          this.#transport.onError(
            (
              error,
            ) => {
              fail(
                error,
              );
            },
          );

        void this.#transport
          .waitForExit()
          .then(
            (
              exit,
            ) => {
              if (
                settled
              ) {
                return;
              }

              fail(
                new Error(
                  `Tongyu runtime exited before request ${message.id} completed: code=${String(
                    exit.code,
                  )}, signal=${String(
                    exit.signal,
                  )}`,
                ),
              );
            },
            (
              error,
            ) => {
              fail(
                error instanceof
                  Error
                  ? error
                  : new Error(
                      String(
                        error,
                      ),
                    ),
              );
            },
          );

        try {
          this.#transport.send(
            message,
          );
        } catch (error) {
          fail(
            error instanceof
              Error
              ? error
              : new Error(
                  String(
                    error,
                  ),
                ),
          );
        }
      },
    );
  }
}
