import {
  randomUUID,
} from "node:crypto";

import {
  AgentModelStreamError,
  AgentTurn,
  AgentTurnInputError,
} from "../agent/index.js";

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

  const modelProvider =
    options.modelProvider ??
    new FakeModelProvider({
      prefix:
        "Tongyu: ",

      chunkSize:
        4,
    });

  const agentTurn =
    new AgentTurn(
      modelProvider,
      sessionManager,
    );

  let initialized =
    false;

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
          interrupt: false,
          tools: false,
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
      "user.message"
    ) {
      try {
        const {
          event: sessionEvent,
        } =
          sessionManager.recordUserMessage(
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

        for await (
          const agentEvent of
          agentTurn.stream({
            sessionId:
              message.sessionId,

            requestId:
              message.id,
          })
        ) {
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

            continue;
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

            continue;
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

            continue;
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
          RequestIdConflictError
        ) {
          writeEvent(
            createRuntimeError(
              "REQUEST_ID_CONFLICT",
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

        if (
          error instanceof
          SessionNotActiveError
        ) {
          writeEvent(
            createRuntimeError(
              "SESSION_NOT_ACTIVE",
              error.message,
              message.id,
              message.sessionId,
            ),
          );

          continue;
        }

        if (
          error instanceof
          AgentTurnInputError
        ) {
          writeEvent(
            createRuntimeError(
              "AGENT_TURN_INVALID",
              error.message,
              message.id,
              message.sessionId,
            ),
          );

          continue;
        }

        if (
          error instanceof
          AgentModelStreamError
        ) {
          writeEvent(
            createRuntimeError(
              "MODEL_STREAM_FAILED",
              error.message,
              message.id,
              message.sessionId,
            ),
          );

          continue;
        }

        writeEvent(
          createRuntimeError(
            "USER_MESSAGE_FAILED",
            "Failed to process user message.",
            message.id,
            message.sessionId,
          ),
        );
      }

      continue;
    }

    writeEvent(
      createRuntimeError(
        "NOT_IMPLEMENTED",
        `Message type is not implemented yet: ${message.type}`,
        message.id,
        getSessionId(message),
      ),
    );
  }

  writeLog(
    "stdin closed; server stopped",
  );
}
