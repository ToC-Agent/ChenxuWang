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
  SessionManager,
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
