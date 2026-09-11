import {
  randomUUID,
} from "node:crypto";

import {
  createRuntimeContext,
} from "../runtime/context.js";

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

    store.save(
      session,
    );

    return session;
  }

  load(
    sessionId: string,
  ): Session {
    const context =
      createRuntimeContext();

    const store =
      new SessionStore(
        context.paths.sessions,
      );

    return store.load(
      sessionId,
    );
  }
}
