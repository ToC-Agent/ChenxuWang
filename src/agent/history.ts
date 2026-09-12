import type {
  ModelMessage,
  ModelToolCall,
} from "../model/index.js";

import type {
  SessionEvent,
} from "../session/index.js";

export function sessionEventsToModelMessages(
  events:
    readonly SessionEvent[],
): ModelMessage[] {
  const messages:
    ModelMessage[] = [];

  for (
    let index = 0;
    index < events.length;
    index += 1
  ) {
    const event =
      events[index];

    if (
      event.type ===
      "user.message"
    ) {
      messages.push({
        role:
          "user",

        content:
          event.content,
      });

      continue;
    }

    if (
      event.type ===
      "assistant.message"
    ) {
      messages.push({
        role:
          "assistant",

        content:
          event.content,
      });

      continue;
    }

    if (
      event.type ===
      "tool.call"
    ) {
      const toolCalls:
        ModelToolCall[] = [];

      let cursor =
        index;

      while (
        cursor <
        events.length
      ) {
        const candidate =
          events[cursor];

        if (
          candidate.type !==
            "tool.call" ||
          candidate.requestId !==
            event.requestId
        ) {
          break;
        }

        toolCalls.push({
          id:
            candidate.toolCallId,

          name:
            candidate.name,

          arguments:
            candidate.arguments,
        });

        cursor +=
          1;
      }

      messages.push({
        role:
          "assistant",

        toolCalls,
      });

      index =
        cursor - 1;

      continue;
    }

    if (
      event.type ===
      "tool.result"
    ) {
      messages.push({
        role:
          "tool",

        toolCallId:
          event.toolCallId,

        result:
          event.result,

        isError:
          event.isError ??
          false,
      });
    }
  }

  return messages;
}
