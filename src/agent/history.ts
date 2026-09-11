import type {
  ModelMessage,
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
    const event of events
  ) {
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
    }
  }

  return messages;
}
