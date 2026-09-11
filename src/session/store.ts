import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";

import {
  join,
} from "node:path";

import {
  SessionCorruptError,
  SessionNotFoundError,
} from "./errors.js";

import {
  SessionSchema,
} from "./schema.js";

import {
  validateSessionId,
} from "./session-id.js";

import type {
  Session,
} from "./types.js";

const SESSION_DIRECTORY_MODE =
  0o700;

const SESSION_FILE_MODE =
  0o600;

export class SessionStore {
  constructor(
    private readonly sessionsRoot: string,
  ) {}

  getSessionDirectory(
    sessionId: string,
  ): string {
    const validatedSessionId =
      validateSessionId(
        sessionId,
      );

    return join(
      this.sessionsRoot,
      validatedSessionId,
    );
  }

  getSessionFile(
    sessionId: string,
  ): string {
    return join(
      this.getSessionDirectory(
        sessionId,
      ),
      "session.json",
    );
  }

  save(
    session: Session,
  ): void {
    validateSessionId(
      session.id,
    );

    const sessionDirectory =
      this.getSessionDirectory(
        session.id,
      );

    mkdirSync(
      sessionDirectory,
      {
        recursive: true,
        mode:
          SESSION_DIRECTORY_MODE,
      },
    );

    const sessionFile =
      this.getSessionFile(
        session.id,
      );

    const temporaryFile =
      `${sessionFile}.tmp`;

    const content =
      JSON.stringify(
        session,
        null,
        2,
      ) + "\n";

    writeFileSync(
      temporaryFile,
      content,
      {
        encoding: "utf8",
        mode:
          SESSION_FILE_MODE,
      },
    );

    renameSync(
      temporaryFile,
      sessionFile,
    );
  }

  load(
    sessionId: string,
  ): Session {
    const validatedSessionId =
      validateSessionId(
        sessionId,
      );

    const sessionFile =
      this.getSessionFile(
        validatedSessionId,
      );

    let content: string;

    try {
      content =
        readFileSync(
          sessionFile,
          "utf8",
        );
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        throw new SessionNotFoundError(
          validatedSessionId,
        );
      }

      throw error;
    }

    let input: unknown;

    try {
      input =
        JSON.parse(
          content,
        );
    } catch {
      throw new SessionCorruptError(
        validatedSessionId,
        "session.json is not valid JSON",
      );
    }

    const result =
      SessionSchema.safeParse(
        input,
      );

    if (!result.success) {
      throw new SessionCorruptError(
        validatedSessionId,
        "session.json does not match the Tongyu session schema",
      );
    }

    if (
      result.data.id !==
      validatedSessionId
    ) {
      throw new SessionCorruptError(
        validatedSessionId,
        "session id does not match its directory",
      );
    }

    return result.data;
  }
}
