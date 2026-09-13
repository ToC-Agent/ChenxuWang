import {
  randomUUID,
} from "node:crypto";

import {
  spawn,
} from "node:child_process";

import {
  createInterface,
} from "node:readline";

type JsonObject =
  Record<
    string,
    unknown
  >;

interface SessionListItem {
  id:
    string;

  cwd:
    string;

  status:
    string;

  createdAt:
    number;

  updatedAt:
    number;
}

function readString(
  value:
    JsonObject,
  key:
    string,
): string | undefined {
  const candidate =
    value[key];

  return typeof candidate ===
    "string"
      ? candidate
      : undefined;
}

function readNumber(
  value:
    JsonObject,
  key:
    string,
): number | undefined {
  const candidate =
    value[key];

  return typeof candidate ===
    "number"
      ? candidate
      : undefined;
}

function formatTime(
  timestamp:
    number,
): string {
  return new Date(
    timestamp,
  )
    .toISOString()
    .replace(
      "T",
      " ",
    )
    .slice(
      0,
      19,
    );
}

export async function runSessionsClient(): Promise<void> {
  const cliEntry =
    process.argv[1];

  if (
    !cliEntry
  ) {
    throw new Error(
      "Tongyu CLI entry path is unavailable.",
    );
  }

  const child =
    spawn(
      process.execPath,
      [
        cliEntry,
        "server",
      ],
      {
        env:
          process.env,

        stdio: [
          "pipe",
          "pipe",
          "pipe",
        ],
      },
    );

  child.stderr.on(
    "data",
    (
      chunk:
        Buffer,
    ) => {
      process.stderr.write(
        chunk,
      );
    },
  );

  const lines =
    createInterface({
      input:
        child.stdout,

      crlfDelay:
        Infinity,
    });

  const sessions:
    SessionListItem[] = [];

  let runtimeError:
    Error |
    undefined;

  const exitPromise =
    new Promise<
      number | null
    >(
      (
        resolve,
        reject,
      ) => {
        child.once(
          "error",
          reject,
        );

        child.once(
          "exit",
          resolve,
        );
      },
    );

  function send(
    message:
      JsonObject,
  ): void {
    child.stdin.write(
      `${JSON.stringify(message)}\n`,
    );
  }

  send({
    id:
      `req-sessions-init-${randomUUID()}`,

    type:
      "control.initialize",

    protocolVersion:
      "1.0",

    client: {
      name:
        "tongyu-sessions",

      version:
        "0.1.0",
    },
  });

  for await (
    const line
    of lines
  ) {
    if (
      !line.trim()
    ) {
      continue;
    }

    const parsed:
      unknown =
        JSON.parse(
          line,
        );

    if (
      typeof parsed !==
        "object" ||
      parsed ===
        null ||
      Array.isArray(
        parsed,
      )
    ) {
      continue;
    }

    const event =
      parsed as
        JsonObject;

    const type =
      readString(
        event,
        "type",
      );

    if (
      type ===
        "control.initialized"
    ) {
      send({
        id:
          `req-sessions-list-${randomUUID()}`,

        type:
          "session.list",
      });

      continue;
    }

    if (
      type ===
        "session.list.item"
    ) {
      const id =
        readString(
          event,
          "sessionId",
        );

      const cwd =
        readString(
          event,
          "cwd",
        );

      const status =
        readString(
          event,
          "status",
        );

      const createdAt =
        readNumber(
          event,
          "createdAt",
        );

      const updatedAt =
        readNumber(
          event,
          "updatedAt",
        );

      if (
        id &&
        cwd &&
        status &&
        createdAt !==
          undefined &&
        updatedAt !==
          undefined
      ) {
        sessions.push({
          id,
          cwd,
          status,
          createdAt,
          updatedAt,
        });
      }

      continue;
    }

    if (
      type ===
        "session.list.end"
    ) {
      child.stdin.end();

      break;
    }

    if (
      type ===
        "runtime.error"
    ) {
      const code =
        readString(
          event,
          "code",
        ) ??
        "UNKNOWN_ERROR";

      const message =
        readString(
          event,
          "message",
        ) ??
        "Unknown Tongyu runtime error.";

      runtimeError =
        new Error(
          `[${code}] ${message}`,
        );

      child.stdin.end();

      break;
    }
  }

  const exitCode =
    await exitPromise;

  if (
    runtimeError
  ) {
    throw runtimeError;
  }

  if (
    exitCode !==
      0 &&
    exitCode !==
      null
  ) {
    throw new Error(
      `Tongyu server exited with code ${exitCode}.`,
    );
  }

  process.stdout.write(
    "\nTongyu Sessions\n",
  );

  process.stdout.write(
    "===============\n\n",
  );

  if (
    sessions.length ===
      0
  ) {
    process.stdout.write(
      "No sessions found.\n",
    );

    return;
  }

  for (
    const session
    of sessions
  ) {
    process.stdout.write(
      [
        `${session.status.toUpperCase()}  ${session.id}`,
        `  Created: ${formatTime(session.createdAt)} UTC`,
        `  Updated: ${formatTime(session.updatedAt)} UTC`,
        `  Workspace: ${session.cwd}`,
        "",
      ].join(
        "\n",
      ),
    );
  }
}
