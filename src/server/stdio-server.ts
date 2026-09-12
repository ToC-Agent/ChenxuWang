import {
  InteractiveToolPermissionPolicy,
} from "./interactive-permission-policy.js";
import type {
  AgentTurnEvent,
} from "../agent/types.js";
import {
  createDefaultToolRegistry,
} from "../tool/index.js";

import {
  randomUUID,
} from "node:crypto";

import {
  AgentModelStreamError,
  AgentTurn,
  AgentTurnInputError,

  AgentTurnInterruptedError,} from "../agent/index.js";

import {
  FakeModelProvider,
  type ModelProvider,
} from "../model/index.js";

import {
  createInterface,
} from "node:readline";

import {
  TONGYU_VERSION,
} from "../constants.js";

import {
  ProtocolDecodeError,
  TONGYU_PROTOCOL_VERSION,
  decodeClientMessage,
  encodeServerEvent,
  type ClientMessage,
  type ServerEvent,
} from "../protocol/index.js";

import {
  initializeRuntime,
} from "../runtime/initialize.js";

import {
  WorkingDirectoryError,
} from "../runtime/working-directory.js";

import {
  InvalidSessionIdError,
  RequestIdConflictError,
  SessionCorruptError,
  SessionEventCorruptError,
  SessionManager,
  SessionNotActiveError,
  SessionNotFoundError,
} from "../session/index.js";

function createEventId(): string {
  return `evt-${randomUUID()}`;
}

function writeEvent(
  event: ServerEvent,
): void {
  process.stdout.write(
    encodeServerEvent(event),
  );
}

function writeLog(
  message: string,
): void {
  process.stderr.write(
    `[tongyu-server] ${message}\n`,
  );
}

function createRuntimeError(
  code: string,
  message: string,
  requestId?: string,
  sessionId?: string,
): ServerEvent {
  return {
    id: createEventId(),
    type: "runtime.error",
    timestamp: Date.now(),
    requestId,
    sessionId,
    code,
    message,
  };
}

function getSessionId(
  message: ClientMessage,
): string | undefined {
  if ("sessionId" in message) {
    return message.sessionId;
  }

  return undefined;
}

export interface StdioServerOptions {
  modelProvider?:
    ModelProvider;
}

export async function runStdioServer(
  options:
    StdioServerOptions = {},
): Promise<void> {
  initializeRuntime();

  const sessionManager =
    new SessionManager();

  const toolRegistry =
    createDefaultToolRegistry();

  const modelProvider =
    options.modelProvider ??
    new FakeModelProvider({
      prefix:
        "Tongyu: ",

      chunkSize:
        4,
    });

  const permissionPolicy =
    new InteractiveToolPermissionPolicy(
      (
        request,
      ) => {
        writeEvent({
          id:
            createEventId(),

          type:
            "permission.request",

          timestamp:
            Date.now(),

          requestId:
            request.requestId,

          sessionId:
            request.sessionId,

          permissionRequestId:
            request.permissionRequestId,

          toolCallId:
            request.toolCallId,

          toolName:
            request.toolName,

          permission:
            request.permission,

          arguments:
            request.arguments,
        });
      },
    );

  const agentTurn =
    new AgentTurn(
      modelProvider,
      sessionManager,
      toolRegistry,
      permissionPolicy,
    );

  let initialized =
    false;

  interface ActiveTurn {
    requestId:
      string;

    promise:
      Promise<void>;

    controller:
      AbortController;
  }

  const activeTurns =
    new Map<
      string,
      ActiveTurn
    >();

  function writeAgentEvent(
    agentEvent:
      AgentTurnEvent,
  ): void {
    if (
      agentEvent.type ===
      "assistant.delta"
    ) {
      writeEvent({
        id:
          createEventId(),

        type:
          "assistant.delta",

        timestamp:
          Date.now(),

        requestId:
          agentEvent.requestId,

        sessionId:
          agentEvent.sessionId,

        text:
          agentEvent.text,
      });

      return;
    }

    if (
      agentEvent.type ===
      "tool.call"
    ) {
      writeEvent({
        id:
          createEventId(),

        type:
          "tool.call",

        timestamp:
          Date.now(),

        requestId:
          agentEvent.requestId,

        sessionId:
          agentEvent.sessionId,

        toolCallId:
          agentEvent.toolCallId,

        name:
          agentEvent.name,

        arguments:
          agentEvent.arguments,
      });

      return;
    }

    if (
      agentEvent.type ===
      "tool.result"
    ) {
      writeEvent({
        id:
          createEventId(),

        type:
          "tool.result",

        timestamp:
          Date.now(),

        requestId:
          agentEvent.requestId,

        sessionId:
          agentEvent.sessionId,

        toolCallId:
          agentEvent.toolCallId,

        result:
          agentEvent.result,

        isError:
          agentEvent.isError,
      });

      return;
    }

    writeEvent({
      id:
        createEventId(),

      type:
        "assistant.message",

      timestamp:
        Date.now(),

      requestId:
        agentEvent.requestId,

      sessionId:
        agentEvent.sessionId,

      content:
        agentEvent.content,
    });
  }

  function writeTurnError(
    error:
      unknown,
    requestId:
      string,
    sessionId:
      string,
  ): void {
    if (
      error instanceof
        AgentTurnInterruptedError
    ) {
      return;
    }


    if (
      error instanceof
        Error
    ) {
      switch (
        error.name
      ) {
        case "InvalidSessionIdError":
          writeEvent(
            createRuntimeError(
              "INVALID_SESSION_ID",
              error.message,
              requestId,
              sessionId,
            ),
          );
          return;

        case "SessionNotFoundError":
          writeEvent(
            createRuntimeError(
              "SESSION_NOT_FOUND",
              error.message,
              requestId,
              sessionId,
            ),
          );
          return;

        case "SessionCorruptError":
          writeEvent(
            createRuntimeError(
              "SESSION_CORRUPT",
              error.message,
              requestId,
              sessionId,
            ),
          );
          return;

        case "SessionEventCorruptError":
          writeEvent(
            createRuntimeError(
              "SESSION_EVENT_CORRUPT",
              error.message,
              requestId,
              sessionId,
            ),
          );
          return;

        case "SessionNotActiveError":
          writeEvent(
            createRuntimeError(
              "SESSION_NOT_ACTIVE",
              error.message,
              requestId,
              sessionId,
            ),
          );
          return;

        case "RequestIdConflictError":
          writeEvent(
            createRuntimeError(
              "REQUEST_ID_CONFLICT",
              error.message,
              requestId,
              sessionId,
            ),
          );
          return;

        case "ToolCallIdConflictError":
          writeEvent(
            createRuntimeError(
              "TOOL_CALL_ID_CONFLICT",
              error.message,
              requestId,
              sessionId,
            ),
          );
          return;

        case "ToolResultConflictError":
          writeEvent(
            createRuntimeError(
              "TOOL_RESULT_CONFLICT",
              error.message,
              requestId,
              sessionId,
            ),
          );
          return;

        case "ToolResultWithoutCallError":
          writeEvent(
            createRuntimeError(
              "TOOL_RESULT_WITHOUT_CALL",
              error.message,
              requestId,
              sessionId,
            ),
          );
          return;

        case "AgentTurnInputError":
          writeEvent(
            createRuntimeError(
              "AGENT_TURN_INPUT_ERROR",
              error.message,
              requestId,
              sessionId,
            ),
          );
          return;

        case "AgentModelStreamError":
          writeEvent(
            createRuntimeError(
              "AGENT_MODEL_STREAM_ERROR",
              error.message,
              requestId,
              sessionId,
            ),
          );
          return;
      }

      writeLog(
        `agent turn failed: ${error.stack ?? error.message}`,
      );
    } else {
      writeLog(
        `agent turn failed: ${String(error)}`,
      );
    }

    writeEvent(
      createRuntimeError(
        "INTERNAL_ERROR",
        "Unexpected Tongyu agent turn error.",
        requestId,
        sessionId,
      ),
    );
  }

  async function runAgentTurn(
    sessionId:
      string,
    requestId:
      string,
    signal:
      AbortSignal,
  ): Promise<void> {
    try {
      for await (
        const agentEvent of
          agentTurn.stream({
            sessionId,
            requestId,

            signal,
          })
      ) {
        writeAgentEvent(
          agentEvent,
        );
      }
    } catch (error) {
      writeTurnError(
        error,
        requestId,
        sessionId,
      );
    }
  }


  const readline =
    createInterface({
      input: process.stdin,
      crlfDelay: Infinity,
    });

  writeLog(
    `started protocol=${TONGYU_PROTOCOL_VERSION}`,
  );

  for await (const line of readline) {
    let message: ClientMessage;

    try {
      message =
        decodeClientMessage(line);
    } catch (error) {
      if (
        error instanceof
        ProtocolDecodeError
      ) {
        writeEvent(
          createRuntimeError(
            error.code,
            error.message,
          ),
        );

        continue;
      }

      writeEvent(
        createRuntimeError(
          "INTERNAL_ERROR",
          "Unexpected protocol decoding error.",
        ),
      );

      continue;
    }

    if (
      message.type ===
      "control.initialize"
    ) {
      if (initialized) {
        writeEvent(
          createRuntimeError(
            "ALREADY_INITIALIZED",
            "Tongyu server has already been initialized.",
            message.id,
          ),
        );

        continue;
      }

      initialized =
        true;

      writeEvent({
        id:
          createEventId(),

        type:
          "control.initialized",

        timestamp:
          Date.now(),

        requestId:
          message.id,

        protocolVersion:
          TONGYU_PROTOCOL_VERSION,

        runtimeVersion:
          TONGYU_VERSION,

        capabilities: {
          sessions: true,
          streaming: true,
          interrupt: true,
          tools: true,
        },
      });

      continue;
    }

    if (!initialized) {
      writeEvent(
        createRuntimeError(
          "NOT_INITIALIZED",
          "Initialize the Tongyu server before sending other messages.",
          message.id,
          getSessionId(message),
        ),
      );

      continue;
    }

    if (
      message.type ===
      "session.create"
    ) {
      try {
        const session =
          sessionManager.create({
            cwd:
              message.cwd,
          });

        writeEvent({
          id:
            createEventId(),

          type:
            "session.created",

          timestamp:
            Date.now(),

          requestId:
            message.id,

          sessionId:
            session.id,

          cwd:
            session.cwd,
        });
      } catch (error) {
        if (
          error instanceof
          WorkingDirectoryError
        ) {
          writeEvent(
            createRuntimeError(
              "INVALID_WORKING_DIRECTORY",
              error.message,
              message.id,
            ),
          );

          continue;
        }

        writeEvent(
          createRuntimeError(
            "SESSION_CREATE_FAILED",
            "Failed to create Tongyu session.",
            message.id,
          ),
        );
      }

      continue;
    }

    if (
      message.type ===
      "session.resume"
    ) {
      try {
        const snapshot =
          sessionManager.resume(
            message.sessionId,
          );

        const eventCount =
          snapshot.events.length;

        writeEvent({
          id:
            createEventId(),

          type:
            "session.resumed",

          timestamp:
            Date.now(),

          requestId:
            message.id,

          sessionId:
            snapshot.session.id,

          cwd:
            snapshot.session.cwd,

          status:
            snapshot.session.status,

          createdAt:
            snapshot.session.createdAt,

          updatedAt:
            snapshot.session.updatedAt,

          eventCount,
        });

        for (
          const event of
          snapshot.events
        ) {
          writeEvent({
            id:
              createEventId(),

            type:
              "session.history.event",

            timestamp:
              Date.now(),

            requestId:
              message.id,

            sessionId:
              snapshot.session.id,

            event,
          });
        }

        writeEvent({
          id:
            createEventId(),

          type:
            "session.history.end",

          timestamp:
            Date.now(),

          requestId:
            message.id,

          sessionId:
            snapshot.session.id,

          eventCount,
        });
      } catch (error) {
        if (
          error instanceof
          InvalidSessionIdError
        ) {
          writeEvent(
            createRuntimeError(
              "INVALID_SESSION_ID",
              error.message,
              message.id,
              message.sessionId,
            ),
          );

          continue;
        }

        if (
          error instanceof
          SessionNotFoundError
        ) {
          writeEvent(
            createRuntimeError(
              "SESSION_NOT_FOUND",
              error.message,
              message.id,
              message.sessionId,
            ),
          );

          continue;
        }

        if (
          error instanceof
          SessionCorruptError
        ) {
          writeEvent(
            createRuntimeError(
              "SESSION_CORRUPT",
              error.message,
              message.id,
              message.sessionId,
            ),
          );

          continue;
        }

        if (
          error instanceof
          SessionEventCorruptError
        ) {
          writeEvent(
            createRuntimeError(
              "SESSION_EVENT_CORRUPT",
              error.message,
              message.id,
              message.sessionId,
            ),
          );

          continue;
        }

        writeEvent(
          createRuntimeError(
            "SESSION_RESUME_FAILED",
            "Failed to resume Tongyu session.",
            message.id,
            message.sessionId,
          ),
        );
      }

      continue;
    }

    if (
      message.type ===
        "control.interrupt"
    ) {
      const activeTurn =
        activeTurns.get(
          message.sessionId,
        );

      if (
        !activeTurn
      ) {
        writeEvent(
          createRuntimeError(
            "TURN_NOT_ACTIVE",
            `Tongyu session has no active turn: ${message.sessionId}`,
            message.id,
            message.sessionId,
          ),
        );

        continue;
      }

      activeTurn.controller
        .abort();

      permissionPolicy
        .cancelSession(
          message.sessionId,
          "Tool execution was interrupted by the client.",
        );

      writeEvent({
        id:
          createEventId(),

        type:
          "control.interrupted",

        timestamp:
          Date.now(),

        requestId:
          message.id,

        sessionId:
          message.sessionId,

        interruptedRequestId:
          activeTurn.requestId,
      });

      continue;
    }

    if (
      message.type ===
        "permission.response"
    ) {
      const accepted =
        permissionPolicy.respond(
          message.sessionId,
          message.permissionRequestId,
          message.decision,
        );

      if (!accepted) {
        writeEvent(
          createRuntimeError(
            "PERMISSION_REQUEST_NOT_FOUND",
            `Tongyu permission request was not found: ${message.permissionRequestId}`,
            message.id,
            message.sessionId,
          ),
        );
      }

      continue;
    }

    if (
      message.type ===
        "user.message"
    ) {
      const activeTurn =
        activeTurns.get(
          message.sessionId,
        );

      if (
        activeTurn &&
        activeTurn.requestId !==
          message.id
      ) {
        writeEvent(
          createRuntimeError(
            "SESSION_BUSY",
            `Tongyu session already has an active turn: ${message.sessionId}`,
            message.id,
            message.sessionId,
          ),
        );

        continue;
      }

      try {
        const {
          event:
            sessionEvent,
        } =
          sessionManager
            .recordUserMessage(
              message.sessionId,
              message.id,
              message.content,
            );

        writeEvent({
          id:
            createEventId(),

          type:
            "user.message.recorded",

          timestamp:
            Date.now(),

          requestId:
            message.id,

          sessionId:
            message.sessionId,

          sessionEventId:
            sessionEvent.id,
        });

        /*
         * Duplicate delivery of the currently running
         * request receives the durable ACK above, but
         * must not start another AgentTurn.
         */
        if (activeTurn) {
          continue;
        }

        const controller =
          new AbortController();

        const turnPromise =
          runAgentTurn(
            message.sessionId,
            message.id,
            controller.signal,
          );

        const active:
          ActiveTurn = {
            requestId:
              message.id,

            promise:
              turnPromise,

            controller,
          };

        activeTurns.set(
          message.sessionId,
          active,
        );

        void turnPromise.finally(
          () => {
            const current =
              activeTurns.get(
                message.sessionId,
              );

            if (
              current ===
              active
            ) {
              activeTurns.delete(
                message.sessionId,
              );
            }
          },
        );
      } catch (error) {
        writeTurnError(
          error,
          message.id,
          message.sessionId,
        );
      }

      /*
       * Deliberately do NOT await the AgentTurn here.
       *
       * stdin must stay available for:
       * permission.response
       */
      continue;
    }

    /*
     * Exhaustive ClientMessage check.
     *
     * If a new protocol message type is added later
     * without a server handler, TypeScript will fail
     * here at compile time.
     */
    const exhaustiveMessage:
      never =
        message;

    void exhaustiveMessage;
  }

  for (
    const activeTurn
    of activeTurns.values()
  ) {
    activeTurn.controller
      .abort();
  }

  permissionPolicy.rejectAll(
    "Client disconnected before permission response.",
  );

  await Promise.allSettled(
    [...activeTurns.values()]
      .map(
        (
          activeTurn,
        ) =>
          activeTurn.promise,
      ),
  );

  writeLog(
    "stdin closed; server stopped",
  );
}
