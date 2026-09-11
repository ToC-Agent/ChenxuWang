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
  ): SessionEvent {
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
      session.status !==
      "active"
    ) {
      throw new SessionNotActiveError(
        session.id,
        session.status,
      );
    }

    const eventStore =
      new SessionEventStore(
        paths.sessions,
      );

    const event: SessionEvent = {
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

    return event;
  }
}
