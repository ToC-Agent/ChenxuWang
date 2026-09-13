import {
  WorkspaceRevertError,
  deriveWorkspaceChanges,
  inspectWorkspaceChangeStatus,
  revertWorkspaceFile,
  summarizeWorkspaceChanges,
} from "../workspace/index.js";

import {
  createTongyuNativeRuntime,
} from "../agent-runtime/index.js";

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
  AgentTurnInputError,

  AgentTurnInterruptedError,} from "../agent/index.js";

import {
  
  type ModelProvider,

  createModelProviderFromEnvironment,
  ModelProviderError,
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
    createModelProviderFromEnvironment();

  const permissionPolicy =
    new InteractiveToolPermissionPolicy(
      (
        request,
      ) => {
        writeTurnStatus(
          request.sessionId,
          request.requestId,
          "waiting_permission",
        );

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

  const agentRuntime =
    createTongyuNativeRuntime(
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


  type TurnLifecycleStatus =
    | "running"
    | "waiting_permission"
    | "executing_tool"
    | "interrupted"
    | "completed"
    | "failed";

  const turnStatuses =
    new Map<
      string,
      TurnLifecycleStatus
    >();

  function turnStatusKey(
    sessionId:
      string,
    requestId:
      string,
  ): string {
    return `${sessionId}:${requestId}`;
  }

  function writeTurnStatus(
    sessionId:
      string,
    requestId:
      string,
    status:
      TurnLifecycleStatus,
  ): void {
    const key =
      turnStatusKey(
        sessionId,
        requestId,
      );

    const current =
      turnStatuses.get(
        key,
      );

    if (
      current ===
      status
    ) {
      return;
    }

    /*
     * Terminal states must never transition back to
     * running/executing after late asynchronous events.
     */
    if (
      current ===
        "interrupted" ||
      current ===
        "completed" ||
      current ===
        "failed"
    ) {
      return;
    }

    turnStatuses.set(
      key,
      status,
    );

    writeEvent({
      id:
        createEventId(),

      type:
        "turn.status",

      timestamp:
        Date.now(),

      requestId,

      sessionId,

      status,
    });
  }

  function isTerminalTurnStatus(
    status:
      TurnLifecycleStatus |
      undefined,
  ): boolean {
    return (
      status ===
        "interrupted" ||
      status ===
        "completed" ||
      status ===
        "failed"
    );
  }

  function getLiveActiveTurn(
    sessionId:
      string,
  ): ActiveTurn |
    undefined {
    const activeTurn =
      activeTurns.get(
        sessionId,
      );

    if (
      !activeTurn
    ) {
      return undefined;
    }

    const key =
      turnStatusKey(
        sessionId,
        activeTurn.requestId,
      );

    const status =
      turnStatuses.get(
        key,
      );

    if (
      isTerminalTurnStatus(
        status,
      )
    ) {
      /*
       * turn.status may reach the client a microtask
       * before Promise.finally removes ActiveTurn.
       *
       * From the protocol client's point of view the
       * turn is already finished, so prune it here.
       */
      activeTurns.delete(
        sessionId,
      );

      turnStatuses.delete(
        key,
      );

      return undefined;
    }

    return activeTurn;
  }

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

      /*
       * workspace.read is automatically authorized,
       * so tool.call transitions directly into execution.
       *
       * Unknown tools are deliberately ignored here;
       * ToolExecutor will produce TOOL_NOT_FOUND.
       */
      try {
        const tool =
          toolRegistry.get(
            agentEvent.name,
          );

        if (
          tool.permission ===
            "workspace.read"
        ) {
          writeTurnStatus(
            agentEvent.sessionId,
            agentEvent.requestId,
            "executing_tool",
          );
        }
      } catch {
        // ToolExecutor owns unknown-tool handling.
      }

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

      writeTurnStatus(
        agentEvent.sessionId,
        agentEvent.requestId,
        "running",
      );

      return;
    }

    if (
      agentEvent.type ===
      "workspace.change"
    ) {
      writeEvent({
        id:
          createEventId(),

        type:
          "workspace.change",

        timestamp:
          Date.now(),

        requestId:
          agentEvent.requestId,

        sourceRequestId:
          agentEvent.requestId,

        sessionId:
          agentEvent.sessionId,

        sessionEventId:
          agentEvent.sessionEventId,

        toolCallId:
          agentEvent.toolCallId,

        sourceToolName:
          agentEvent.sourceToolName,

        changeSet:
          agentEvent.changeSet,

        replayed:
          agentEvent.replayed,
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
      ModelProviderError
  ) {
    writeEvent(
      createRuntimeError(
        error.code,
        error.message,
        requestId,
        sessionId,
      ),
    );

    return;
  }

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
          agentRuntime.stream({
            sessionId,
            requestId,

            signal,
          })
      ) {
        writeAgentEvent(
          agentEvent,
        );
      }

      writeTurnStatus(
        sessionId,
        requestId,
        "completed",
      );
    } catch (error) {
      if (
        error instanceof
          AgentTurnInterruptedError
      ) {
        writeTurnStatus(
          sessionId,
          requestId,
          "interrupted",
        );

        return;
      }

      writeTurnStatus(
        sessionId,
        requestId,
        "failed",
      );

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
        "session.close"
    ) {
      const activeTurn =
        getLiveActiveTurn(
          message.sessionId,
        );

      if (
        activeTurn
      ) {
        writeEvent(
          createRuntimeError(
            "SESSION_BUSY",
            `Tongyu session already has an active turn: ${activeTurn.requestId}`,
            message.id,
            message.sessionId,
          ),
        );

        continue;
      }

      try {
        const result =
          sessionManager.close(
            message.sessionId,
          );

        writeEvent({
          id:
            createEventId(),

          type:
            "session.end",

          timestamp:
            Date.now(),

          requestId:
            message.id,

          sessionId:
            result.session.id,

          status:
            "completed",

          replayed:
            result.replayed,
        });
      } catch (error) {
        writeTurnError(
          error,
          message.id,
          message.sessionId,
        );
      }

      continue;
    }

    if (
      message.type ===
        "session.list"
    ) {
      try {
        const sessions =
          sessionManager.list();

        for (
          const session
          of sessions
        ) {
          writeEvent({
            id:
              createEventId(),

            type:
              "session.list.item",

            timestamp:
              Date.now(),

            requestId:
              message.id,

            sessionId:
              session.id,

            cwd:
              session.cwd,

            status:
              session.status,

            createdAt:
              session.createdAt,

            updatedAt:
              session.updatedAt,
          });
        }

        writeEvent({
          id:
            createEventId(),

          type:
            "session.list.end",

          timestamp:
            Date.now(),

          requestId:
            message.id,

          count:
            sessions.length,
        });
      } catch (error) {
        const code =
          error instanceof
            SessionCorruptError
            ? "SESSION_CORRUPT"
            : error instanceof
                SessionNotFoundError
              ? "SESSION_NOT_FOUND"
              : "INTERNAL_ERROR";

        const messageText =
          error instanceof
            Error
            ? error.message
            : "Unexpected session list error.";

        writeEvent(
          createRuntimeError(
            code,
            messageText,
            message.id,
          ),
        );
      }

      continue;
    }
    if (
      message.type ===
        "workspace.review.list"
    ) {
      try {
        const snapshot =
          sessionManager.resume(
            message.sessionId,
          );

        const status =
          await inspectWorkspaceChangeStatus(
            snapshot.session.cwd,
            snapshot.events,
            {
              ...(
                message.sourceRequestId
                  ? {
                      sourceRequestId:
                        message.sourceRequestId,
                    }
                  : {}
              ),

              ...(
                message.path
                  ? {
                      path:
                        message.path,
                    }
                  : {}
              ),
            },
          );

        let pendingCount =
          0;

        let acceptedCount =
          0;

        let revertedCount =
          0;

        for (
          const file of
            status.files
        ) {
          switch (
            file.reviewState
          ) {
            case "pending":
              pendingCount +=
                1;
              break;

            case "accepted":
              acceptedCount +=
                1;
              break;

            case "reverted":
              revertedCount +=
                1;
              break;
          }

          writeEvent({
            id:
              createEventId(),

            type:
              "workspace.review.item",

            timestamp:
              Date.now(),

            requestId:
              message.id,

            sessionId:
              snapshot.session.id,

            path:
              file.path,

            reviewState:
              file.reviewState,

            diskState:
              file.state,

            reviewSessionEventId:
              file.reviewSessionEventId,

            reviewRequestId:
              file.reviewRequestId,

            reviewedAt:
              file.reviewedAt,

            revertAction:
              file.revertAction,

            mutationCount:
              file.mutationCount,

            replacementCount:
              file.replacementCount,

            firstBeforeSha256:
              file.firstBeforeSha256,

            firstBeforeBytes:
              file.firstBeforeBytes,

            latestAfterSha256:
              file.latestAfterSha256,

            latestAfterBytes:
              file.latestAfterBytes,

            currentSha256:
              file.currentSha256,

            currentBytes:
              file.currentBytes,

            latestSessionEventId:
              file.latestSessionEventId,

            latestSourceRequestId:
              file.latestSourceRequestId,

            latestSourceToolName:
              file.latestSourceToolName,
          });
        }

        writeEvent({
          id:
            createEventId(),

          type:
            "workspace.review.list.end",

          timestamp:
            Date.now(),

          requestId:
            message.id,

          sessionId:
            snapshot.session.id,

          fileCount:
            status.fileCount,

          pendingCount,

          acceptedCount,

          revertedCount,

          currentCount:
            status.currentCount,

          modifiedCount:
            status.modifiedCount,

          missingCount:
            status.missingCount,

          replacedCount:
            status.replacedCount,

          unreadableCount:
            status.unreadableCount,
        });
      } catch (error) {
        writeTurnError(
          error,
          message.id,
          message.sessionId,
        );
      }

      continue;
    }

    if (
      message.type ===
        "workspace.changes.accept"
    ) {
      try {
        const snapshot =
          sessionManager.resume(
            message.sessionId,
          );

        const status =
          await inspectWorkspaceChangeStatus(
            snapshot.session.cwd,
            snapshot.events,
            {
              path:
                message.path,
            },
          );

        const fileStatus =
          status.files[0];

        if (
          !fileStatus
        ) {
          writeEvent(
            createRuntimeError(
              "WORKSPACE_CHANGE_NOT_FOUND",
              `No Tongyu workspace changes were found for: ${message.path}`,
              message.id,
              message.sessionId,
            ),
          );

          continue;
        }

        /*
         * Accept only the exact version currently on disk.
         *
         * If the user/editor/another agent changed it after
         * Tongyu's recorded mutation, accepting that historic
         * version would be misleading.
         */
        if (
          fileStatus.state !==
            "current"
        ) {
          writeEvent(
            createRuntimeError(
              "WORKSPACE_REVIEW_UNSAFE",
              `Workspace file is no longer in Tongyu's recorded after-state; refusing accept: ${message.path}`,
              message.id,
              message.sessionId,
            ),
          );

          continue;
        }

        const review =
          sessionManager.recordWorkspaceReview(
            snapshot.session.id,
            message.id,
            {
              path:
                fileStatus.path,

              decision:
                "accepted",

              reviewedSessionEventId:
                fileStatus.latestSessionEventId,

              reviewedAfterSha256:
                fileStatus.latestAfterSha256,
            },
          );

        writeEvent({
          id:
            createEventId(),

          type:
            "workspace.change.reviewed",

          timestamp:
            Date.now(),

          requestId:
            message.id,

          sessionId:
            snapshot.session.id,

          sessionEventId:
            review.event.id,

          path:
            review.event.path,

          decision:
            review.event.decision,

          reviewedSessionEventId:
            review.event
              .reviewedSessionEventId,

          reviewedAfterSha256:
            review.event
              .reviewedAfterSha256,

          replayed:
            review.replayed,
        });
      } catch (error) {
        writeTurnError(
          error,
          message.id,
          message.sessionId,
        );
      }

      continue;
    }

    if (
      message.type ===
        "workspace.changes.revert"
    ) {
      try {
        const snapshot =
          sessionManager.resume(
            message.sessionId,
          );

        const revertReviewSummary =
          summarizeWorkspaceChanges(
            snapshot.events,
            {
              path:
                message.path,
            },
          );

        const revertReviewTarget =
          revertReviewSummary.files[0];

        if (
          !revertReviewTarget
        ) {
          writeEvent(
            createRuntimeError(
              "WORKSPACE_CHANGE_NOT_FOUND",
              `No Tongyu workspace changes were found for: ${message.path}`,
              message.id,
              message.sessionId,
            ),
          );

          continue;
        }

        const result =
          await revertWorkspaceFile(
            snapshot.session.cwd,
            snapshot.events,
            message.path,
          );

        const review =
          sessionManager.recordWorkspaceReview(
            snapshot.session.id,
            message.id,
            {
              path:
                revertReviewTarget.path,

              decision:
                "reverted",

              reviewedSessionEventId:
                revertReviewTarget
                  .latestSessionEventId,

              reviewedAfterSha256:
                revertReviewTarget
                  .latestAfterSha256,

              revertAction:
                result.action,
            },
          );

        writeEvent({
          id:
            createEventId(),

          type:
            "workspace.change.reverted",

          timestamp:
            Date.now(),

          requestId:
            message.id,

          sessionId:
            snapshot.session.id,

          path:
            result.path,

          action:
            result.action,

          fromSha256:
            result.fromSha256,

          toSha256:
            result.toSha256,

          bytes:
            result.bytes,
        });
        writeEvent({
          id:
            createEventId(),

          type:
            "workspace.change.reviewed",

          timestamp:
            Date.now(),

          requestId:
            message.id,

          sessionId:
            snapshot.session.id,

          sessionEventId:
            review.event.id,

          path:
            review.event.path,

          decision:
            review.event.decision,

          reviewedSessionEventId:
            review.event
              .reviewedSessionEventId,

          reviewedAfterSha256:
            review.event
              .reviewedAfterSha256,

          revertAction:
            review.event.revertAction,

          replayed:
            review.replayed,
        });

      } catch (error) {
        if (
          error instanceof
            WorkspaceRevertError
        ) {
          writeEvent(
            createRuntimeError(
              error.code,
              error.message,
              message.id,
              message.sessionId,
            ),
          );
        } else {
          writeTurnError(
            error,
            message.id,
            message.sessionId,
          );
        }
      }

      continue;
    }

    if (
      message.type ===
        "workspace.changes.status"
    ) {
      try {
        const snapshot =
          sessionManager.resume(
            message.sessionId,
          );

        const status =
          await inspectWorkspaceChangeStatus(
            snapshot.session.cwd,
            snapshot.events,
            {
              ...(
                message.sourceRequestId
                  ? {
                      sourceRequestId:
                        message.sourceRequestId,
                    }
                  : {}
              ),

              ...(
                message.path
                  ? {
                      path:
                        message.path,
                    }
                  : {}
              ),
            },
          );

        for (
          const fileStatus of
            status.files
        ) {
          writeEvent({
            id:
              createEventId(),

            type:
              "workspace.change.status.item",

            timestamp:
              Date.now(),

            requestId:
              message.id,

            sessionId:
              snapshot.session.id,

            path:
              fileStatus.path,

            reviewState:
              fileStatus.reviewState,

            state:
              fileStatus.state,

            expectedAfterSha256:
              fileStatus.latestAfterSha256,

            currentSha256:
              fileStatus.currentSha256,

            expectedAfterBytes:
              fileStatus.latestAfterBytes,

            currentBytes:
              fileStatus.currentBytes,

            mutationCount:
              fileStatus.mutationCount,

            replacementCount:
              fileStatus.replacementCount,

            latestSessionEventId:
              fileStatus.latestSessionEventId,

            latestSourceRequestId:
              fileStatus.latestSourceRequestId,

            latestSourceToolName:
              fileStatus.latestSourceToolName,
          });
        }

        writeEvent({
          id:
            createEventId(),

          type:
            "workspace.change.status.end",

          timestamp:
            Date.now(),

          requestId:
            message.id,

          sessionId:
            snapshot.session.id,

          fileCount:
            status.fileCount,

          currentCount:
            status.currentCount,

          modifiedCount:
            status.modifiedCount,

          missingCount:
            status.missingCount,

          replacedCount:
            status.replacedCount,

          unreadableCount:
            status.unreadableCount,
        });
      } catch (error) {
        writeTurnError(
          error,
          message.id,
          message.sessionId,
        );
      }

      continue;
    }

    if (
      message.type ===
        "workspace.changes.summary"
    ) {
      try {
        const snapshot =
          sessionManager.resume(
            message.sessionId,
          );

        const summary =
          summarizeWorkspaceChanges(
            snapshot.events,
            {
              ...(
                message.sourceRequestId
                  ? {
                      sourceRequestId:
                        message.sourceRequestId,
                    }
                  : {}
              ),

              ...(
                message.path
                  ? {
                      path:
                        message.path,
                    }
                  : {}
              ),
            },
          );

        for (
          const fileSummary of
            summary.files
        ) {
          writeEvent({
            id:
              createEventId(),

            type:
              "workspace.change.summary.item",

            timestamp:
              Date.now(),

            requestId:
              message.id,

            sessionId:
              snapshot.session.id,

            path:
              fileSummary.path,

            reviewState:
              fileSummary.reviewState,

            mutationCount:
              fileSummary.mutationCount,

            replacementCount:
              fileSummary.replacementCount,

            firstBeforeSha256:
              fileSummary.firstBeforeSha256,

            firstBeforeBytes:
              fileSummary.firstBeforeBytes,

            latestAfterSha256:
              fileSummary.latestAfterSha256,

            latestAfterBytes:
              fileSummary.latestAfterBytes,

            latestSessionEventId:
              fileSummary.latestSessionEventId,

            latestSourceRequestId:
              fileSummary.latestSourceRequestId,

            latestSourceToolName:
              fileSummary.latestSourceToolName,
          });
        }

        writeEvent({
          id:
            createEventId(),

          type:
            "workspace.change.summary.end",

          timestamp:
            Date.now(),

          requestId:
            message.id,

          sessionId:
            snapshot.session.id,

          fileCount:
            summary.fileCount,

          mutationCount:
            summary.mutationCount,

          replacementCount:
            summary.replacementCount,
        });
      } catch (error) {
        writeTurnError(
          error,
          message.id,
          message.sessionId,
        );
      }

      continue;
    }


    if (
      message.type ===
        "workspace.changes.list"
    ) {
      try {
        const snapshot =
          sessionManager.resume(
            message.sessionId,
          );

        const workspaceChanges =
          deriveWorkspaceChanges(
            snapshot.events,
            {
              ...(
                message.sourceRequestId
                  ? {
                      sourceRequestId:
                        message.sourceRequestId,
                    }
                  : {}
              ),

              ...(
                message.path
                  ? {
                      path:
                        message.path,
                    }
                  : {}
              ),
            },
          );

        for (
          const workspaceChange of
            workspaceChanges
        ) {
          writeEvent({
            id:
              createEventId(),

            type:
              "workspace.change.item",

            timestamp:
              Date.now(),

            requestId:
              message.id,

            sourceRequestId:
              workspaceChange
                .sourceRequestId,

            sessionId:
              snapshot.session.id,

            sessionEventId:
              workspaceChange
                .sessionEventId,

            toolCallId:
              workspaceChange
                .toolCallId,

            sourceToolName:
              workspaceChange
                .sourceToolName,

            changeSet:
              workspaceChange
                .changeSet,
          });
        }

        writeEvent({
          id:
            createEventId(),

          type:
            "workspace.change.list.end",

          timestamp:
            Date.now(),

          requestId:
            message.id,

          sessionId:
            snapshot.session.id,

          count:
            workspaceChanges.length,
        });
      } catch (error) {
        writeTurnError(
          error,
          message.id,
          message.sessionId,
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

        /*
         * workspace.change is a derived Runtime/Protocol event.
         *
         * Resume and explicit queries share the same durable
         * tool.result -> Workspace Change projection.
         */
        const replayedWorkspaceChanges =
          deriveWorkspaceChanges(
            snapshot.events,
          );

        for (
          const workspaceChange of
            replayedWorkspaceChanges
        ) {
          writeEvent({
            id:
              createEventId(),

            type:
              "workspace.change",

            timestamp:
              Date.now(),

            requestId:
              message.id,

            sourceRequestId:
              workspaceChange
                .sourceRequestId,

            sessionId:
              snapshot.session.id,

            sessionEventId:
              workspaceChange
                .sessionEventId,

            toolCallId:
              workspaceChange
                .toolCallId,

            sourceToolName:
              workspaceChange
                .sourceToolName,

            changeSet:
              workspaceChange
                .changeSet,

            replayed:
              true,
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
        getLiveActiveTurn(
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

      writeTurnStatus(
        message.sessionId,
        activeTurn.requestId,
        "interrupted",
      );

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

      if (
        accepted
      ) {
        const activeTurn =
          activeTurns.get(
            message.sessionId,
          );

        if (
          activeTurn
        ) {
          writeTurnStatus(
            message.sessionId,
            activeTurn.requestId,
            message.decision ===
              "allow_once"
              ? "executing_tool"
              : "running",
          );
        }
      }

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
        getLiveActiveTurn(
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

        writeTurnStatus(
          message.sessionId,
          message.id,
          "running",
        );

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

              turnStatuses.delete(
                turnStatusKey(
                  message.sessionId,
                  message.id,
                ),
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
