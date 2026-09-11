import {
  randomUUID,
} from "node:crypto";

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

export async function runStdioServer(): Promise<void> {
  initializeRuntime();

  const sessionManager =
    new SessionManager();

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

        writeEvent(
          createRuntimeError(
            "USER_MESSAGE_FAILED",
            "Failed to record user message.",
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
