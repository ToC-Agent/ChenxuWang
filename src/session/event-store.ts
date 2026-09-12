import {
  chmodSync,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";

import {
  join,
} from "node:path";

import {
  SessionEventCorruptError,
  SessionNotFoundError,
} from "./errors.js";

import {
  SessionEventSchema,
  type SessionEvent,
} from "./events.js";

import {
  validateSessionId,
} from "./session-id.js";

const SESSION_EVENT_FILE_MODE =
  0o600;

export class SessionEventStore {
  constructor(
    private readonly sessionsRoot: string,
  ) {}

  private getSessionDirectory(
    sessionId: string,
  ): string {
    const validatedSessionId =
      validateSessionId(
        sessionId,
      );

    const sessionDirectory =
      join(
        this.sessionsRoot,
        validatedSessionId,
      );

    if (
      !existsSync(
        sessionDirectory,
      ) ||
      !statSync(
        sessionDirectory,
      ).isDirectory()
    ) {
      throw new SessionNotFoundError(
        validatedSessionId,
      );
    }

    return sessionDirectory;
  }

  getEventsFile(
    sessionId: string,
  ): string {
    return join(
      this.getSessionDirectory(
        sessionId,
      ),
      "events.jsonl",
    );
  }

  initialize(
    sessionId: string,
  ): void {
    const eventsFile =
      this.getEventsFile(
        sessionId,
      );

    writeFileSync(
      eventsFile,
      "",
      {
        encoding:
          "utf8",

        flag:
          "a",

        mode:
          SESSION_EVENT_FILE_MODE,
      },
    );

    chmodSync(
      eventsFile,
      SESSION_EVENT_FILE_MODE,
    );
  }

  append(
    event: SessionEvent,
  ): void {
    const validatedEvent =
      SessionEventSchema.parse(
        event,
      );

    const eventsFile =
      this.getEventsFile(
        validatedEvent.sessionId,
      );

    writeFileSync(
      eventsFile,
      JSON.stringify(
        validatedEvent,
      ) + "\n",
      {
        encoding:
          "utf8",

        flag:
          "a",

        mode:
          SESSION_EVENT_FILE_MODE,
      },
    );
  }

  readAll(
    sessionId: string,
  ): SessionEvent[] {
    const validatedSessionId =
      validateSessionId(
        sessionId,
      );

    const sessionDirectory =
      this.getSessionDirectory(
        validatedSessionId,
      );

    const eventsFile =
      join(
        sessionDirectory,
        "events.jsonl",
      );

    if (
      !existsSync(
        eventsFile,
      )
    ) {
      return [];
    }

    const content =
      readFileSync(
        eventsFile,
        "utf8",
      );

    if (
      content.trim().length ===
      0
    ) {
      return [];
    }

    const lines =
      content.split("\n");

    const events:
      SessionEvent[] = [];

    for (
      let index = 0;
      index < lines.length;
      index += 1
    ) {
      const line =
        lines[index];

      if (
        line.length === 0
      ) {
        continue;
      }

      let input: unknown;

      try {
        input =
          JSON.parse(
            line,
          );
      } catch {
        throw new SessionEventCorruptError(
          validatedSessionId,
          index + 1,
        );
      }

      const result =
        SessionEventSchema.safeParse(
          input,
        );

      if (
        !result.success ||
        result.data.sessionId !==
          validatedSessionId
      ) {
        throw new SessionEventCorruptError(
          validatedSessionId,
          index + 1,
        );
      }

      events.push(
        result.data,
      );
    }

    return events;
  }

  findUserMessageByRequestId(
    sessionId: string,
    requestId: string,
  ): Extract<
    SessionEvent,
    {
      type: "user.message";
    }
  > | undefined {
    const events =
      this.readAll(
        sessionId,
      );

    for (
      let index =
        events.length - 1;
      index >= 0;
      index -= 1
    ) {
      const event =
        events[index];

      if (
        event.type ===
          "user.message" &&
        event.requestId ===
          requestId
      ) {
        return event;
      }
    }

    return undefined;
  }

  findAssistantMessageByRequestId(
    sessionId: string,
    requestId: string,
  ): Extract<
    SessionEvent,
    {
      type: "assistant.message";
    }
  > | undefined {
    const events =
      this.readAll(
        sessionId,
      );

    for (
      let index =
        events.length - 1;
      index >= 0;
      index -= 1
    ) {
      const event =
        events[index];

      if (
        event.type ===
          "assistant.message" &&
        event.requestId ===
          requestId
      ) {
        return event;
      }
    }

    return undefined;
  }


  findToolCallByToolCallId(
    sessionId: string,
    toolCallId: string,
  ): Extract<
    SessionEvent,
    {
      type: "tool.call";
    }
  > | undefined {
    const events =
      this.readAll(
        sessionId,
      );

    for (
      let index =
        events.length - 1;
      index >= 0;
      index -= 1
    ) {
      const event =
        events[index];

      if (
        event.type ===
          "tool.call" &&
        event.toolCallId ===
          toolCallId
      ) {
        return event;
      }
    }

    return undefined;
  }

  findToolResultByToolCallId(
    sessionId: string,
    toolCallId: string,
  ): Extract<
    SessionEvent,
    {
      type: "tool.result";
    }
  > | undefined {
    const events =
      this.readAll(
        sessionId,
      );

    for (
      let index =
        events.length - 1;
      index >= 0;
      index -= 1
    ) {
      const event =
        events[index];

      if (
        event.type ===
          "tool.result" &&
        event.toolCallId ===
          toolCallId
      ) {
        return event;
      }
    }

    return undefined;
  }

}
