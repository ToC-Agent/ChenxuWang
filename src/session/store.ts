import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";

import {
  join,
} from "node:path";

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
    return join(
      this.sessionsRoot,
      sessionId,
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
    const sessionFile =
      this.getSessionFile(
        sessionId,
      );

    const content =
      readFileSync(
        sessionFile,
        "utf8",
      );

    return JSON.parse(
      content,
    ) as Session;
  }
}
