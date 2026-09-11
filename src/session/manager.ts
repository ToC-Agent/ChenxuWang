import {
  randomUUID,
} from "node:crypto";

import {
  createRuntimeContext,
} from "../runtime/context.js";

import {
  initializeRuntime,
} from "../runtime/initialize.js";

import {
  RequestIdConflictError,
  SessionNotActiveError,
} from "./errors.js";

import {
  SessionEventStore,
} from "./event-store.js";

import {
  createSessionEventId,
  type SessionEvent,
} from "./events.js";

import {
  SessionStore,
} from "./store.js";

import type {
  CreateSessionOptions,
  Session,
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

    return {
      event,

      replayed:
        false,
    };
  }
}
