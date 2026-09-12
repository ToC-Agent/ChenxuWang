import type {
  ModelFinishReason,
  ModelProvider,
  ModelRequest,
} from "../model/index.js";

import {
  SessionManager,
  SessionNotActiveError,
  type SessionEvent,
} from "../session/index.js";

import {
  ToolRegistry,
} from "../tool/index.js";

import {
  AgentModelStreamError,
  AgentTurnInputError,
} from "./errors.js";

import {
  sessionEventsToModelMessages,
} from "./history.js";

import {
  toolsToModelDefinitions,
} from "./tool-definitions.js";

import type {
  AgentTurnEvent,
  AgentTurnInput,
} from "./types.js";

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
  ) {}

  async *stream(
    input: AgentTurnInput,
  ): AsyncIterable<AgentTurnEvent> {
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

    const messages =
      sessionEventsToModelMessages(
        snapshot.events,
      );

    const toolDefinitions =
      toolsToModelDefinitions(
        this.toolRegistry.list(),
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

    for await (
      const event of
      this.provider.stream(
        modelRequest,
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
        content +=
          event.text;

        yield {
          type:
            "assistant.delta",

          sessionId:
            snapshot.session.id,

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
        throw new AgentModelStreamError(
          "tool calls are not implemented in AgentTurn yet",
        );
      }

      completed =
        true;

      finishReason =
        event.finishReason;
    }

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
      throw new AgentModelStreamError(
        "tool calls are not implemented in AgentTurn yet",
      );
    }

    const result =
      this.sessionManager
        .recordAssistantMessage(
          snapshot.session.id,
          input.requestId,
          content,
        );

    yield {
      type:
        "assistant.message",

      sessionId:
        snapshot.session.id,

      requestId:
        input.requestId,

      sessionEventId:
        result.event.id,

      content:
        result.event.content,

      replayed:
        result.replayed,
    };
  }
}
