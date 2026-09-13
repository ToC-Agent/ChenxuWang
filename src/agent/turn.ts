import type {
  ModelFinishReason,
  ModelProvider,
  ModelRequest,
  ModelToolCall,
} from "../model/index.js";

import {
  SessionManager,
  SessionNotActiveError,
  type SessionEvent,
} from "../session/index.js";

import {
  DefaultToolPermissionPolicy,
  ToolExecutor,
  ToolRegistry,
  type ToolPermissionPolicy,
} from "../tool/index.js";

import {
  AgentModelStreamError,
  AgentTurnInputError,

  AgentTurnInterruptedError,} from "./errors.js";

import {
  sessionEventsToNativeModelMessages,
} from "./history.js";

import {
  toolsToModelDefinitions,
} from "./tool-definitions.js";

import type {
  AgentTurnEvent,
  AgentTurnInput,
} from "./types.js";

const MAX_TOOL_ROUNDS =
  16;

function findUnresolvedToolCall(
  events:
    readonly SessionEvent[],
  requestId: string,
): Extract<
  SessionEvent,
  {
    type: "tool.call";
  }
> | undefined {
  const requestEvents =
    events.filter(
      (event) =>
        event.requestId ===
        requestId,
    );

  for (
    const event of
      requestEvents
  ) {
    if (
      event.type !==
      "tool.call"
    ) {
      continue;
    }

    const hasResult =
      requestEvents.some(
        (candidate) =>
          candidate.type ===
            "tool.result" &&
          candidate.toolCallId ===
            event.toolCallId,
      );

    if (!hasResult) {
      return event;
    }
  }

  return undefined;
}

function throwIfTurnAborted(
  input:
    AgentTurnInput,
): void {
  if (
    input.signal?.aborted
  ) {
    throw new AgentTurnInterruptedError(
      input.sessionId,
      input.requestId,
    );
  }
}

async function* streamProviderEvents(
  provider:
    ModelProvider,
  request:
    ModelRequest,
  input:
    AgentTurnInput,
) {
  try {
    yield* provider.stream(
      request,
      {
        signal:
          input.signal,
      },
    );
  } catch (error) {
    /*
     * fetch / ReadableStream usually surfaces an AbortError.
     *
     * The important semantic signal is not the concrete
     * provider error type, but whether this Turn's
     * AbortSignal has already been cancelled.
     */
    if (
      input.signal?.aborted
    ) {
      throw new AgentTurnInterruptedError(
        input.sessionId,
        input.requestId,
      );
    }

    throw error;
  }
}

export class AgentTurn {
  constructor(
    private readonly provider:
      ModelProvider,

    private readonly sessionManager:
      SessionManager =
        new SessionManager(),

    private readonly toolRegistry:
      ToolRegistry =
        new ToolRegistry(),

    private readonly permissionPolicy:
      ToolPermissionPolicy =
        new DefaultToolPermissionPolicy(),
  ) {}

  async *stream(
    input: AgentTurnInput,
  ): AsyncIterable<AgentTurnEvent> {
    throwIfTurnAborted(
      input,
    );

    const snapshot =
      this.sessionManager.resume(
        input.sessionId,
      );

    const targetUserEvent =
      [...snapshot.events]
        .reverse()
        .find(
          (event) =>
            event.type ===
              "user.message" &&
            event.requestId ===
              input.requestId,
        );

    if (!targetUserEvent) {
      throw new AgentTurnInputError(
        snapshot.session.id,
        input.requestId,
        "matching user.message was not found",
      );
    }

    const existingAssistantEvent =
      [...snapshot.events]
        .reverse()
        .find(
          (
            event,
          ): event is Extract<
            SessionEvent,
            {
              type:
                "assistant.message";
            }
          > =>
            event.type ===
              "assistant.message" &&
            event.requestId ===
              input.requestId,
        );

    if (existingAssistantEvent) {
      yield {
        type:
          "assistant.message",

        sessionId:
          snapshot.session.id,

        requestId:
          input.requestId,

        sessionEventId:
          existingAssistantEvent.id,

        content:
          existingAssistantEvent.content,

        replayed:
          true,
      };

      return;
    }

    const latestConversationEvent =
      [...snapshot.events]
        .reverse()
        .find(
          (event) =>
            event.type ===
              "user.message" ||
            event.type ===
              "assistant.message",
        );

    if (
      !latestConversationEvent ||
      latestConversationEvent.type !==
        "user.message" ||
      latestConversationEvent.requestId !==
        input.requestId
    ) {
      throw new AgentTurnInputError(
        snapshot.session.id,
        input.requestId,
        "request is not the latest pending user message",
      );
    }

    if (
      snapshot.session.status !==
      "active"
    ) {
      throw new SessionNotActiveError(
        snapshot.session.id,
        snapshot.session.status,
      );
    }

    const toolDefinitions =
      toolsToModelDefinitions(
        this.toolRegistry.list(),
      );

    const toolExecutor =
      new ToolExecutor(
        this.toolRegistry,
        this.permissionPolicy,
      );

    let toolRoundCount =
      0;

    while (true) {
      throwIfTurnAborted(
        input,
      );
      const roundSnapshot =
        this.sessionManager.resume(
          snapshot.session.id,
        );

      const unresolvedToolCall =
        findUnresolvedToolCall(
          roundSnapshot.events,
          input.requestId,
        );

      if (unresolvedToolCall) {
        throw new AgentModelStreamError(
          `request contains unresolved tool call ${unresolvedToolCall.toolCallId}; automatic re-execution is disabled`,
        );
      }

      const messages =
        sessionEventsToNativeModelMessages(
          roundSnapshot.events,
        );

      const modelRequest:
        ModelRequest =
          toolDefinitions.length >
          0
            ? {
                messages,

                tools:
                  toolDefinitions,
              }
            : {
                messages,
              };

      let content =
        "";

      let completed =
        false;

      let finishReason:
        ModelFinishReason |
        undefined;

      const toolCalls:
        ModelToolCall[] = [];

      const toolCallIds =
        new Set<string>();

      for await (
        const event of
          streamProviderEvents(
          this.provider,
          modelRequest,
          input,
        )
      ) {
        if (completed) {
          throw new AgentModelStreamError(
            "model emitted an event after response.completed",
          );
        }

        if (
          event.type ===
          "text.delta"
        ) {
          if (
            toolCalls.length >
            0
          ) {
            throw new AgentModelStreamError(
              "model emitted text and tool calls in the same response",
            );
          }

          content +=
            event.text;

          yield {
            type:
              "assistant.delta",

            sessionId:
              roundSnapshot.session.id,

            requestId:
              input.requestId,

            text:
              event.text,
          };

          continue;
        }

        if (
          event.type ===
          "tool.call"
        ) {
          if (
            content.length >
            0
          ) {
            throw new AgentModelStreamError(
              "model emitted text and tool calls in the same response",
            );
          }

          if (
            toolCallIds.has(
              event.call.id,
            )
          ) {
            throw new AgentModelStreamError(
              `model emitted duplicate tool call id: ${event.call.id}`,
            );
          }

          toolCallIds.add(
            event.call.id,
          );

          toolCalls.push(
            event.call,
          );

          continue;
        }

        completed =
          true;

        finishReason =
          event.finishReason;
      }

      throwIfTurnAborted(
        input,
      );

      if (
        !completed ||
        finishReason ===
          undefined
      ) {
        throw new AgentModelStreamError(
          "model stream ended without response.completed",
        );
      }

      if (
        finishReason ===
        "tool_call"
      ) {
        if (
          toolCalls.length ===
          0
        ) {
          throw new AgentModelStreamError(
            "model completed with tool_call but emitted no tool calls",
          );
        }

        if (
          toolRoundCount >=
          MAX_TOOL_ROUNDS
        ) {
          throw new AgentModelStreamError(
            `model exceeded maximum tool rounds: ${MAX_TOOL_ROUNDS}`,
          );
        }

        toolRoundCount +=
          1;

        /*
         * Persist every tool.call first.
         *
         * This is intentionally separate from execution so the
         * durable history becomes:
         *
         * tool.call
         * tool.call
         * tool.result
         * tool.result
         *
         * That lets history.ts reconstruct a single assistant
         * message containing multiple tool calls.
         */
        for (
          const call of
            toolCalls
        ) {
          const recordedCall =
            this.sessionManager
              .recordToolCall(
                roundSnapshot.session.id,
                input.requestId,
                call.id,
                call.name,
                call.arguments,
              );

          yield {
            type:
              "tool.call",

            sessionId:
              roundSnapshot.session.id,

            requestId:
              input.requestId,

            sessionEventId:
              recordedCall.event.id,

            toolCallId:
              recordedCall.event.toolCallId,

            name:
              recordedCall.event.name,

            arguments:
              recordedCall.event.arguments,

            replayed:
              recordedCall.replayed,
          };
        }

        /*
         * Execute sequentially for now.
         *
         * Parallel execution can be added later once permission,
         * cancellation and sandbox semantics are defined.
         */
        for (
          const call of
            toolCalls
        ) {
          const latestSnapshot =
            this.sessionManager.resume(
              roundSnapshot.session.id,
            );

          const existingResult =
            latestSnapshot.events
              .find(
                (
                  event,
                ): event is Extract<
                  SessionEvent,
                  {
                    type:
                      "tool.result";
                  }
                > =>
                  event.type ===
                    "tool.result" &&
                  event.requestId ===
                    input.requestId &&
                  event.toolCallId ===
                    call.id,
              );

          if (existingResult) {
            yield {
              type:
                "tool.result",

              sessionId:
                roundSnapshot.session.id,

              requestId:
                input.requestId,

              sessionEventId:
                existingResult.id,

              toolCallId:
                existingResult.toolCallId,

              result:
                existingResult.result,

              isError:
                existingResult.isError ??
                false,

              replayed:
                true,
            };

            continue;
          }

          const executionResult =
            await toolExecutor.execute(
              call,
              {
                sessionId:
                  roundSnapshot.session.id,

                requestId:
                  input.requestId,

                cwd:
                  roundSnapshot.session.cwd,



                signal:
                  input.signal,
              },
            );

          const recordedResult =
            this.sessionManager
              .recordToolResult(
                roundSnapshot.session.id,
                input.requestId,
                call.id,
                executionResult.result,
                executionResult.isError,
              );

          yield {
            type:
              "tool.result",

            sessionId:
              roundSnapshot.session.id,

            requestId:
              input.requestId,

            sessionEventId:
              recordedResult.event.id,

            toolCallId:
              recordedResult.event.toolCallId,

            result:
              recordedResult.event.result,

            isError:
              recordedResult.event.isError ??
              false,

            replayed:
              recordedResult.replayed,
          };
        }

        /*
         * The next iteration reloads durable history and sends:
         *
         * user
         * assistant(toolCalls)
         * tool(result)
         *
         * back to the model.
         */
        continue;
      }

      if (
        toolCalls.length >
        0
      ) {
        throw new AgentModelStreamError(
          `model emitted tool calls with finish reason ${finishReason}`,
        );
      }

      const result =
        this.sessionManager
          .recordAssistantMessage(
            roundSnapshot.session.id,
            input.requestId,
            content,
          );

      yield {
        type:
          "assistant.message",

        sessionId:
          roundSnapshot.session.id,

        requestId:
          input.requestId,

        sessionEventId:
          result.event.id,

        content:
          result.event.content,

        replayed:
          result.replayed,
      };

      return;
    }
  }
}
