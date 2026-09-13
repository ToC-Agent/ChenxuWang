import {
  readdirSync,
} from "node:fs";
import {
  randomUUID,
} from "node:crypto";

import {
  isDeepStrictEqual,
} from "node:util";

import {
  createRuntimeContext,
} from "../runtime/context.js";

import {
  initializeRuntime,
} from "../runtime/initialize.js";

import {
  RequestIdConflictError,
  SessionNotActiveError,
  ToolCallIdConflictError,
  ToolResultConflictError,
  ToolResultWithoutCallError,
} from "./errors.js";

import {
  SessionEventStore,
} from "./event-store.js";

import {
  createSessionEventId,
  type SessionEvent,
} from "./events.js";

import {
  SessionIdSchema,
} from "./schema.js";

import {
  SessionStore,
} from "./store.js";

import type {
  CreateSessionOptions,
  Session,
  SessionSnapshot,
} from "./types.js";

function createSessionId(): string {
  return `sess-${randomUUID()}`;
}

export class SessionManager {
  create(
    options: CreateSessionOptions = {},
  ): Session {
    const context =
      createRuntimeContext({
        cwd: options.cwd,
      });

    const now =
      Date.now();

    const session: Session = {
      id:
        createSessionId(),

      cwd:
        context.cwd,

      status:
        "active",

      createdAt:
        now,

      updatedAt:
        now,
    };

    const store =
      new SessionStore(
        context.paths.sessions,
      );

    const eventStore =
      new SessionEventStore(
        context.paths.sessions,
      );

    store.save(
      session,
    );

    eventStore.initialize(
      session.id,
    );

    return session;
  }

  list(): Session[] {
    const paths =
      initializeRuntime();

    const store =
      new SessionStore(
        paths.sessions,
      );

    const sessions:
      Session[] = [];

    for (
      const entry
      of readdirSync(
        paths.sessions,
        {
          withFileTypes:
            true,
        },
      )
    ) {
      if (
        !entry.isDirectory()
      ) {
        continue;
      }

      const result =
        SessionIdSchema.safeParse(
          entry.name,
        );

      if (
        !result.success
      ) {
        continue;
      }

      sessions.push(
        store.load(
          result.data,
        ),
      );
    }

    sessions.sort(
      (
        left,
        right,
      ) =>
        (
          right.updatedAt -
            left.updatedAt
        ) ||
        (
          right.createdAt -
            left.createdAt
        ),
    );

    return sessions;
  }

  load(
    sessionId: string,
  ): Session {
    const paths =
      initializeRuntime();

    const store =
      new SessionStore(
        paths.sessions,
      );

    return store.load(
      sessionId,
    );
  }

  resume(
    sessionId: string,
  ): SessionSnapshot {
    const paths =
      initializeRuntime();

    const store =
      new SessionStore(
        paths.sessions,
      );

    const eventStore =
      new SessionEventStore(
        paths.sessions,
      );

    const session =
      store.load(
        sessionId,
      );

    const events =
      eventStore.readAll(
        session.id,
      );

    return {
      session,
      events,
    };
  }

  recordUserMessage(
    sessionId: string,
    requestId: string,
    content: string,
  ): {
    event: Extract<
      SessionEvent,
      {
        type: "user.message";
      }
    >;
    replayed: boolean;
  } {
    const paths =
      initializeRuntime();

    const store =
      new SessionStore(
        paths.sessions,
      );

    const session =
      store.load(
        sessionId,
      );

    const eventStore =
      new SessionEventStore(
        paths.sessions,
      );

    const existingEvent =
      eventStore
        .findUserMessageByRequestId(
          session.id,
          requestId,
        );

    if (existingEvent) {
      if (
        existingEvent.content !==
        content
      ) {
        throw new RequestIdConflictError(
          session.id,
          requestId,
        );
      }

      return {
        event:
          existingEvent,

        replayed:
          true,
      };
    }

    if (
      session.status !==
      "active"
    ) {
      throw new SessionNotActiveError(
        session.id,
        session.status,
      );
    }

    const event: Extract<
      SessionEvent,
      {
        type: "user.message";
      }
    > = {
      id:
        createSessionEventId(),

      type:
        "user.message",

      timestamp:
        Date.now(),

      sessionId:
        session.id,

      requestId,

      content,
    };

    eventStore.append(
      event,
    );

    session.updatedAt =
      event.timestamp;

    store.save(
      session,
    );

    return {
      event,

      replayed:
        false,
    };
  }

  recordAssistantMessage(
    sessionId: string,
    requestId: string,
    content: string,
  ): {
    event: Extract<
      SessionEvent,
      {
        type: "assistant.message";
      }
    >;
    replayed: boolean;
  } {
    const paths =
      initializeRuntime();

    const store =
      new SessionStore(
        paths.sessions,
      );

    const session =
      store.load(
        sessionId,
      );

    const eventStore =
      new SessionEventStore(
        paths.sessions,
      );

    const existingEvent =
      eventStore
        .findAssistantMessageByRequestId(
          session.id,
          requestId,
        );

    if (existingEvent) {
      if (
        existingEvent.content !==
        content
      ) {
        throw new RequestIdConflictError(
          session.id,
          requestId,
        );
      }

      return {
        event:
          existingEvent,

        replayed:
          true,
      };
    }

    if (
      session.status !==
      "active"
    ) {
      throw new SessionNotActiveError(
        session.id,
        session.status,
      );
    }

    const event: Extract<
      SessionEvent,
      {
        type: "assistant.message";
      }
    > = {
      id:
        createSessionEventId(),

      type:
        "assistant.message",

      timestamp:
        Date.now(),

      sessionId:
        session.id,

      requestId,

      content,
    };

    eventStore.append(
      event,
    );

    session.updatedAt =
      event.timestamp;

    store.save(
      session,
    );

    return {
      event,

      replayed:
        false,
    };
  }


  recordToolCall(
    sessionId: string,
    requestId: string,
    toolCallId: string,
    name: string,
    argumentsValue:
      Record<string, unknown>,
  ): {
    event: Extract<
      SessionEvent,
      {
        type: "tool.call";
      }
    >;
    replayed: boolean;
  } {
    const paths =
      initializeRuntime();

    const store =
      new SessionStore(
        paths.sessions,
      );

    const session =
      store.load(
        sessionId,
      );

    const eventStore =
      new SessionEventStore(
        paths.sessions,
      );

    const existingEvent =
      eventStore
        .findToolCallByToolCallId(
          session.id,
          toolCallId,
        );

    if (existingEvent) {
      if (
        existingEvent.requestId !==
          requestId ||
        existingEvent.name !==
          name ||
        !isDeepStrictEqual(
          existingEvent.arguments,
          argumentsValue,
        )
      ) {
        throw new ToolCallIdConflictError(
          session.id,
          toolCallId,
        );
      }

      return {
        event:
          existingEvent,

        replayed:
          true,
      };
    }

    if (
      session.status !==
        "active"
    ) {
      throw new SessionNotActiveError(
        session.id,
        session.status,
      );
    }

    const event: Extract<
      SessionEvent,
      {
        type: "tool.call";
      }
    > = {
      id:
        createSessionEventId(),

      type:
        "tool.call",

      timestamp:
        Date.now(),

      sessionId:
        session.id,

      requestId,

      toolCallId,

      name,

      arguments:
        argumentsValue,
    };

    eventStore.append(
      event,
    );

    session.updatedAt =
      event.timestamp;

    store.save(
      session,
    );

    return {
      event,

      replayed:
        false,
    };
  }


  recordToolResult(
    sessionId: string,
    requestId: string,
    toolCallId: string,
    resultValue: unknown,
    isError?: boolean,
  ): {
    event: Extract<
      SessionEvent,
      {
        type: "tool.result";
      }
    >;
    replayed: boolean;
  } {
    const paths =
      initializeRuntime();

    const store =
      new SessionStore(
        paths.sessions,
      );

    const session =
      store.load(
        sessionId,
      );

    const eventStore =
      new SessionEventStore(
        paths.sessions,
      );

    const toolCall =
      eventStore
        .findToolCallByToolCallId(
          session.id,
          toolCallId,
        );

    if (!toolCall) {
      throw new ToolResultWithoutCallError(
        session.id,
        toolCallId,
      );
    }

    if (
      toolCall.requestId !==
        requestId
    ) {
      throw new ToolResultConflictError(
        session.id,
        toolCallId,
      );
    }

    const existingEvent =
      eventStore
        .findToolResultByToolCallId(
          session.id,
          toolCallId,
        );

    if (existingEvent) {
      if (
        existingEvent.requestId !==
          requestId ||
        !isDeepStrictEqual(
          existingEvent.result,
          resultValue,
        ) ||
        (existingEvent.isError ??
          false) !==
          (isError ??
            false)
      ) {
        throw new ToolResultConflictError(
          session.id,
          toolCallId,
        );
      }

      return {
        event:
          existingEvent,

        replayed:
          true,
      };
    }

    if (
      session.status !==
        "active"
    ) {
      throw new SessionNotActiveError(
        session.id,
        session.status,
      );
    }

    const event: Extract<
      SessionEvent,
      {
        type: "tool.result";
      }
    > = {
      id:
        createSessionEventId(),

      type:
        "tool.result",

      timestamp:
        Date.now(),

      sessionId:
        session.id,

      requestId,

      toolCallId,

      result:
        resultValue,

      isError:
        isError ??
        false,
    };

    eventStore.append(
      event,
    );

    session.updatedAt =
      event.timestamp;

    store.save(
      session,
    );

    return {
      event,

      replayed:
        false,
    };
  }


  recordWorkspaceReview(
    sessionId: string,
    requestId: string,
    review: {
      path: string;

      decision:
        | "accepted"
        | "reverted";

      reviewedSessionEventId:
        string;

      reviewedAfterSha256:
        string;

      revertAction?:
        | "restored"
        | "deleted";
    },
  ): {
    event: Extract<
      SessionEvent,
      {
        type:
          "workspace.review";
      }
    >;

    replayed: boolean;
  } {
    if (
      review.decision ===
        "accepted" &&
      review.revertAction !==
        undefined
    ) {
      throw new Error(
        "Accepted workspace reviews cannot contain a revert action.",
      );
    }

    if (
      review.decision ===
        "reverted" &&
      review.revertAction ===
        undefined
    ) {
      throw new Error(
        "Reverted workspace reviews require a revert action.",
      );
    }

    const paths =
      initializeRuntime();

    const store =
      new SessionStore(
        paths.sessions,
      );

    const session =
      store.load(
        sessionId,
      );

    const eventStore =
      new SessionEventStore(
        paths.sessions,
      );

    const existingEvent =
      eventStore
        .readAll(
          session.id,
        )
        .find(
          (
            candidate,
          ): candidate is Extract<
            SessionEvent,
            {
              type:
                "workspace.review";
            }
          > =>
            candidate.type ===
              "workspace.review" &&
            candidate.requestId ===
              requestId,
        );

    if (
      existingEvent
    ) {
      if (
        existingEvent.path !==
          review.path ||
        existingEvent.decision !==
          review.decision ||
        existingEvent.reviewedSessionEventId !==
          review.reviewedSessionEventId ||
        existingEvent.reviewedAfterSha256 !==
          review.reviewedAfterSha256 ||
        existingEvent.revertAction !==
          review.revertAction
      ) {
        throw new RequestIdConflictError(
          session.id,
          requestId,
        );
      }

      return {
        event:
          existingEvent,

        replayed:
          true,
      };
    }

    const event: Extract<
      SessionEvent,
      {
        type:
          "workspace.review";
      }
    > = {
      id:
        createSessionEventId(),

      type:
        "workspace.review",

      timestamp:
        Date.now(),

      sessionId:
        session.id,

      requestId,

      path:
        review.path,

      decision:
        review.decision,

      reviewedSessionEventId:
        review.reviewedSessionEventId,

      reviewedAfterSha256:
        review.reviewedAfterSha256,

      ...(
        review.revertAction
          ? {
              revertAction:
                review.revertAction,
            }
          : {}
      ),
    };

    eventStore.append(
      event,
    );

    session.updatedAt =
      event.timestamp;

    store.save(
      session,
    );

    return {
      event,

      replayed:
        false,
    };
  }

  close(
    sessionId:
      string,
  ): {
    session:
      Session;

    replayed:
      boolean;
  } {
    const paths =
      initializeRuntime();

    const store =
      new SessionStore(
        paths.sessions,
      );

    const session =
      store.load(
        sessionId,
      );

    if (
      session.status ===
        "completed"
    ) {
      return {
        session,

        replayed:
          true,
      };
    }

    if (
      session.status !==
        "active"
    ) {
      throw new SessionNotActiveError(
        session.id,
        session.status,
      );
    }

    const completedSession:
      Session = {
        ...session,

        status:
          "completed",

        updatedAt:
          Date.now(),
      };

    store.save(
      completedSession,
    );

    return {
      session:
        completedSession,

      replayed:
        false,
    };
  }

}
