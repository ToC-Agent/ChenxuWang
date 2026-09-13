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

interface PendingPermission {
  permissionRequestId:
    string;

  toolName:
    string;

  permission:
    string;

  arguments:
    unknown;
}

function createRequestId(
  prefix:
    string,
): string {
  return `${prefix}-${randomUUID()}`;
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

const MAX_PERMISSION_PREVIEW_CHARS =
  12_000;

function isJsonObject(
  value: unknown,
): value is JsonObject {
  return (
    typeof value ===
      "object" &&
    value !==
      null &&
    !Array.isArray(
      value,
    )
  );
}

function splitPreviewText(
  value: string,
): string[] {
  const normalized =
    value.replace(
      /\r\n/g,
      "\n",
    );

  const lines =
    normalized.split(
      "\n",
    );

  /*
   * Avoid drawing a meaningless final prefixed blank line
   * solely because the replacement ends with "\n".
   */
  if (
    lines.length >
      1 &&
    lines[
      lines.length - 1
    ] ===
      ""
  ) {
    lines.pop();
  }

  if (
    lines.length ===
      0 ||
    (
      lines.length ===
        1 &&
      lines[0] ===
        ""
    )
  ) {
    return [
      "<empty>",
    ];
  }

  return lines;
}

function appendReplacementPreview(
  lines: string[],
  sequence: number,
  oldText: string,
  newText: string,
): void {
  lines.push(
    `@@ change ${sequence} @@`,
  );

  for (
    const line of
    splitPreviewText(
      oldText,
    )
  ) {
    lines.push(
      `- ${line}`,
    );
  }

  for (
    const line of
    splitPreviewText(
      newText,
    )
  ) {
    lines.push(
      `+ ${line}`,
    );
  }
}

function sanitizePreviewLine(
  value: string,
): string {
  /*
   * Tool arguments may originate from model output or workspace
   * content. Never allow terminal control characters such as ESC
   * to manipulate the user's terminal while rendering a preview.
   *
   * Newlines are already split before reaching this function.
   */
  return value.replace(
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,
    (
      character,
    ) => {
      const code =
        character
          .charCodeAt(
            0,
          )
          .toString(
            16,
          )
          .padStart(
            4,
            "0",
          );

      return `\\u${code}`;
    },
  );
}

function limitPermissionPreview(
  lines:
    readonly string[],
): string[] {
  const output:
    string[] =
      [];

  let used =
    0;

  for (
    const rawLine of lines
  ) {
    const line =
      sanitizePreviewLine(
        rawLine,
      );

    const cost =
      line.length +
      1;

    if (
      used +
        cost >
      MAX_PERMISSION_PREVIEW_CHARS
    ) {
      const remaining =
        MAX_PERMISSION_PREVIEW_CHARS -
        used;

      if (
        remaining >
        1
      ) {
        output.push(
          `${line.slice(
            0,
            remaining - 1,
          )}…`,
        );
      }

      output.push(
        "[preview truncated]",
      );

      return output;
    }

    output.push(
      line,
    );

    used +=
      cost;
  }

  return output;
}

function createPermissionDetails(
  permission:
    PendingPermission,
): string[] {
  const fallback = () => [
    `arguments: ${JSON.stringify(
      permission.arguments,
    )}`,
  ];

  if (
    permission.toolName !==
      "filesystem.edit" &&
    permission.toolName !==
      "filesystem.patch" &&
    permission.toolName !==
      "filesystem.write"
  ) {
    return fallback();
  }

  if (
    !isJsonObject(
      permission.arguments,
    )
  ) {
    return fallback();
  }

  const path =
    readString(
      permission.arguments,
      "path",
    );

  if (
    path ===
    undefined
  ) {
    return fallback();
  }

  const expectedBeforeSha256 =
    readString(
      permission.arguments,
      "expectedBeforeSha256",
    );

  const preview:
    string[] = [
      `path: ${path}`,
      "",
      expectedBeforeSha256
        ? "Prepared change preview (not yet applied):"
        : "Requested change preview (not yet applied):",
  ];

  if (
    expectedBeforeSha256
  ) {
    preview.splice(
      1,
      0,
      `before sha256: ${expectedBeforeSha256}`,
    );
  }

  if (
    permission.toolName ===
    "filesystem.write"
  ) {
    const beforeContent =
      readString(
        permission.arguments,
        "beforeContent",
      );

    const content =
      readString(
        permission.arguments,
        "content",
      );

    if (
      beforeContent ===
        undefined ||
      content ===
        undefined
    ) {
      return fallback();
    }

    preview.push(
      `operation: ${
        permission.arguments[
          "willCreate"
        ] === true
          ? "create"
          : "replace"
      }`,
      "",
    );

    appendReplacementPreview(
      preview,
      1,
      beforeContent,
      content,
    );

    return limitPermissionPreview(
      preview,
    );
  }

  if (
    permission.toolName ===
    "filesystem.edit"
  ) {
    const oldText =
      readString(
        permission.arguments,
        "oldText",
      );

    const newText =
      readString(
        permission.arguments,
        "newText",
      );

    if (
      oldText ===
        undefined ||
      newText ===
        undefined
    ) {
      return fallback();
    }

    appendReplacementPreview(
      preview,
      1,
      oldText,
      newText,
    );

    return limitPermissionPreview(
      preview,
    );
  }

  const edits =
    permission.arguments[
      "edits"
    ];

  if (
    !Array.isArray(
      edits,
    ) ||
    edits.length ===
      0
  ) {
    return fallback();
  }

  for (
    let index = 0;
    index < edits.length;
    index += 1
  ) {
    const edit =
      edits[index];

    if (
      !isJsonObject(
        edit,
      )
    ) {
      return fallback();
    }

    const oldText =
      readString(
        edit,
        "oldText",
      );

    const newText =
      readString(
        edit,
        "newText",
      );

    if (
      oldText ===
        undefined ||
      newText ===
        undefined
    ) {
      return fallback();
    }

    if (
      index >
      0
    ) {
      preview.push(
        "",
      );
    }

    appendReplacementPreview(
      preview,
      index + 1,
      oldText,
      newText,
    );
  }

  return limitPermissionPreview(
    preview,
  );
}

function printHelp(): void {
  process.stdout.write(
    [
      "",
      "Tongyu Chat Commands",
      "====================",
      "/help   Show commands",
      "/stop   Stop the active turn",
      "/allow  Approve the pending tool permission once",
      "/deny   Deny the pending tool permission",
      "/exit   Disconnect and preserve the session",
      "/close  Permanently close the session and exit",
      "",
    ].join(
      "\n",
    ),
  );
}

interface ChatStartupOptions {
  resumeSessionId?:
    string;

  continueLatest:
    boolean;
}

function parseChatStartupOptions(
  args:
    readonly string[],
): ChatStartupOptions {
  if (
    args.length ===
      0
  ) {
    return {
      continueLatest:
        false,
    };
  }

  if (
    args.length ===
      1 &&
    (
      args[0] ===
        "--continue" ||
      args[0] ===
        "-c"
    )
  ) {
    return {
      continueLatest:
        true,
    };
  }

  if (
    args.length ===
      2 &&
    (
      args[0] ===
        "--resume" ||
      args[0] ===
        "-r"
    ) &&
    args[1]
  ) {
    return {
      resumeSessionId:
        args[1],

      continueLatest:
        false,
    };
  }

  throw new Error(
    "Usage: tongyu chat [--resume <sessionId> | --continue]",
  );
}

export async function runChatClient(
  args:
    readonly string[] = [],
): Promise<void> {
  const {
    resumeSessionId,
    continueLatest,
  } =
    parseChatStartupOptions(
      args,
    );

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

  const serverLines =
    createInterface({
      input:
        child.stdout,

      crlfDelay:
        Infinity,
    });

  const input =
    createInterface({
      input:
        process.stdin,

      output:
        process.stdout,

      terminal:
        Boolean(
          process.stdin.isTTY &&
          process.stdout.isTTY,
        ),
    });

  input.setPrompt(
    "you> ",
  );

  let sessionId:
    string |
    undefined;

  let resumedSessionStatus:
    string |
    undefined;

  let continueCandidate:
    {
      sessionId:
        string;

      updatedAt:
        number;
    } |
    undefined;

  let busy =
    false;

  let closing =
    false;

  let assistantStreaming =
    false;

  let pendingPermission:
    PendingPermission |
    undefined;

  const interruptedRequestIds =
    new Set<string>();

  let readyResolve:
    (() => void) |
    undefined;

  let readyReject:
    (
      (
        error:
          Error,
      ) => void
    ) |
    undefined;

  const ready =
    new Promise<void>(
      (
        resolve,
        reject,
      ) => {
        readyResolve =
          resolve;

        readyReject =
          reject;
      },
    );

  function send(
    message:
      JsonObject,
  ): void {
    if (
      child.stdin.destroyed
    ) {
      throw new Error(
        "Tongyu server stdin is closed.",
      );
    }

    child.stdin.write(
      `${JSON.stringify(message)}\n`,
    );
  }

  function prompt(): void {
    if (
      closing ||
      busy
    ) {
      return;
    }

    input.prompt();
  }

  function finishAssistantStream(): void {
    if (
      assistantStreaming
    ) {
      process.stdout.write(
        "\n",
      );

      assistantStreaming =
        false;
    }
  }

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
          (
            code,
          ) => {
            resolve(
              code,
            );
          },
        );
      },
    );

  const serverTask =
    (
      async () => {
        try {
          for await (
            const line
            of serverLines
          ) {
            if (
              !line.trim()
            ) {
              continue;
            }

            let event:
              JsonObject;

            try {
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
                throw new Error(
                  "server event is not an object",
                );
              }

              event =
                parsed as
                  JsonObject;
            } catch (error) {
              finishAssistantStream();

              process.stderr.write(
                `[tongyu-chat] invalid server event: ${String(error)}\n`,
              );

              continue;
            }

            const type =
              readString(
                event,
                "type",
              );

            if (
              type ===
                "control.initialized"
            ) {
              if (
                resumeSessionId
              ) {
                send({
                  id:
                    createRequestId(
                      "req-chat-resume",
                    ),

                  type:
                    "session.resume",

                  sessionId:
                    resumeSessionId,
                });
              } else if (
                continueLatest
              ) {
                send({
                  id:
                    createRequestId(
                      "req-chat-list",
                    ),

                  type:
                    "session.list",
                });
              } else {
                send({
                  id:
                    createRequestId(
                      "req-chat-create",
                    ),

                  type:
                    "session.create",

                  cwd:
                    process.cwd(),
                });
              }

              continue;
            }

            if (
              type ===
                "session.list.item" &&
              continueLatest &&
              !sessionId
            ) {
              const candidateSessionId =
                readString(
                  event,
                  "sessionId",
                );

              const candidateCwd =
                readString(
                  event,
                  "cwd",
                );

              const candidateStatus =
                readString(
                  event,
                  "status",
                );

              const updatedAtValue =
                event.updatedAt;

              if (
                candidateSessionId &&
                candidateCwd ===
                  process.cwd() &&
                candidateStatus ===
                  "active" &&
                typeof updatedAtValue ===
                  "number" &&
                (
                  !continueCandidate ||
                  updatedAtValue >
                    continueCandidate.updatedAt
                )
              ) {
                continueCandidate = {
                  sessionId:
                    candidateSessionId,

                  updatedAt:
                    updatedAtValue,
                };
              }

              continue;
            }

            if (
              type ===
                "session.list.end" &&
              continueLatest &&
              !sessionId
            ) {
              if (
                continueCandidate
              ) {
                process.stdout.write(
                  `Continuing session: ${continueCandidate.sessionId}\n`,
                );

                send({
                  id:
                    createRequestId(
                      "req-chat-continue",
                    ),

                  type:
                    "session.resume",

                  sessionId:
                    continueCandidate
                      .sessionId,
                });
              } else {
                process.stdout.write(
                  "No active session found for this workspace. Creating a new session.\n",
                );

                send({
                  id:
                    createRequestId(
                      "req-chat-create",
                    ),

                  type:
                    "session.create",

                  cwd:
                    process.cwd(),
                });
              }

              continue;
            }

            if (
              type ===
                "session.resumed"
            ) {
              sessionId =
                readString(
                  event,
                  "sessionId",
                );

              resumedSessionStatus =
                readString(
                  event,
                  "status",
                );

              const cwd =
                readString(
                  event,
                  "cwd",
                ) ??
                "unknown";

              if (
                !sessionId
              ) {
                throw new Error(
                  "session.resumed did not contain sessionId.",
                );
              }

              process.stdout.write(
                `\nTongyu session resumed: ${sessionId}\n`,
              );

              process.stdout.write(
                `Workspace: ${cwd}\n`,
              );

              process.stdout.write(
                `Status: ${resumedSessionStatus ?? "unknown"}\n`,
              );

              process.stdout.write(
                "\nHistory:\n",
              );

              continue;
            }

            if (
              type ===
                "session.history.event"
            ) {
              const historyValue =
                event.event;

              if (
                typeof historyValue !==
                  "object" ||
                historyValue ===
                  null ||
                Array.isArray(
                  historyValue,
                )
              ) {
                continue;
              }

              const historyEvent =
                historyValue as
                  JsonObject;

              const historyType =
                readString(
                  historyEvent,
                  "type",
                );

              const content =
                readString(
                  historyEvent,
                  "content",
                );

              if (
                historyType ===
                  "user.message" &&
                content !==
                  undefined
              ) {
                process.stdout.write(
                  `\nuser> ${content}\n`,
                );
              } else if (
                historyType ===
                  "assistant.message" &&
                content !==
                  undefined
              ) {
                process.stdout.write(
                  `\nassistant> ${content}\n`,
                );
              }

              continue;
            }

            if (
              type ===
                "session.history.end"
            ) {
              const eventCount =
                typeof event.eventCount ===
                  "number"
                  ? event.eventCount
                  : 0;

              process.stdout.write(
                `\nHistory loaded: ${eventCount} events.\n`,
              );

              if (
                resumedSessionStatus !==
                  "active"
              ) {
                process.stdout.write(
                  `Session is ${resumedSessionStatus ?? "not active"} and cannot accept new messages.\n`,
                );

                closing =
                  true;

                readyResolve?.();

                input.close();

                child.stdin.end();

                continue;
              }

              process.stdout.write(
                "Type /help for commands.\n\n",
              );

              readyResolve?.();

              continue;
            }

            if (
              type ===
                "session.created"
            ) {
              sessionId =
                readString(
                  event,
                  "sessionId",
                );

              if (
                !sessionId
              ) {
                throw new Error(
                  "session.created did not contain sessionId.",
                );
              }

              process.stdout.write(
                `\nTongyu session: ${sessionId}\n`,
              );

              process.stdout.write(
                `Workspace: ${process.cwd()}\n`,
              );

              process.stdout.write(
                "Type /help for commands.\n\n",
              );

              readyResolve?.();

              continue;
            }

            if (
              type ===
                "assistant.delta"
            ) {
              const delta =
                readString(
                  event,
                  "delta",
                ) ??
                readString(
                  event,
                  "text",
                ) ??
                readString(
                  event,
                  "content",
                ) ??
                "";

              if (
                !assistantStreaming
              ) {
                process.stdout.write(
                  "\nassistant> ",
                );

                assistantStreaming =
                  true;
              }

              process.stdout.write(
                delta,
              );

              continue;
            }

            if (
              type ===
                "assistant.message"
            ) {
              const content =
                readString(
                  event,
                  "content",
                ) ??
                "";

              if (
                assistantStreaming
              ) {
                process.stdout.write(
                  "\n",
                );

                assistantStreaming =
                  false;
              } else {
                process.stdout.write(
                  `\nassistant> ${content}\n`,
                );
              }

              continue;
            }

            if (
              type ===
                "tool.call"
            ) {
              finishAssistantStream();

              const name =
                readString(
                  event,
                  "name",
                ) ??
                readString(
                  event,
                  "toolName",
                ) ??
                "unknown";

              process.stdout.write(
                `\n[tool] ${name}\n`,
              );

              continue;
            }

            if (
              type ===
                "tool.result"
            ) {
              finishAssistantStream();

              const isError =
                event.isError ===
                  true;

              const requestId =
                readString(
                  event,
                  "requestId",
                );

              const result =
                event.result;

              const resultRecord =
                typeof result ===
                  "object" &&
                result !==
                  null &&
                !Array.isArray(
                  result,
                )
                  ? result as
                      JsonObject
                  : undefined;

              const errorCode =
                resultRecord
                  ? readString(
                      resultRecord,
                      "code",
                    )
                  : undefined;

              const aborted =
                errorCode ===
                  "TOOL_EXECUTION_ABORTED";

              /*
               * turn.status=interrupted may reach the CLI
               * immediately before the aborted tool.result.
               * In that ordering, "[stopped]" already tells
               * the user what happened, so do not redraw a
               * tool status over the fresh prompt.
               */
              if (
                aborted &&
                requestId &&
                interruptedRequestIds.has(
                  requestId,
                )
              ) {
                continue;
              }

              process.stdout.write(
                aborted
                  ? "[tool] aborted\n"
                  : isError
                    ? "[tool] failed\n"
                    : "[tool] completed\n",
              );

              continue;
            }

            if (
              type ===
                "permission.request"
            ) {
              finishAssistantStream();

              const permissionRequestId =
                readString(
                  event,
                  "permissionRequestId",
                );

              if (
                !permissionRequestId
              ) {
                throw new Error(
                  "permission.request is missing permissionRequestId.",
                );
              }

              pendingPermission = {
                permissionRequestId,

                toolName:
                  readString(
                    event,
                    "toolName",
                  ) ??
                  "unknown",

                permission:
                  readString(
                    event,
                    "permission",
                  ) ??
                  "unknown",

                arguments:
                  event.arguments,
              };

              const permissionDetails =
                createPermissionDetails(
                  pendingPermission,
                );

              process.stdout.write(
                [
                  "",
                  "[permission requested]",
                  `tool: ${pendingPermission.toolName}`,
                  `permission: ${pendingPermission.permission}`,
                  ...permissionDetails,
                  "Use /allow or /deny (bare allow/deny also work).",
                  "",
                ].join(
                  "\n",
                ),
              );

              input.prompt();

              continue;
            }

            if (
              type ===
                "turn.status"
            ) {
              const status =
                readString(
                  event,
                  "status",
                );

              busy =
                status ===
                  "running" ||
                status ===
                  "waiting_permission" ||
                status ===
                  "executing_tool";

              if (
                status ===
                  "interrupted"
              ) {
                const requestId =
                  readString(
                    event,
                    "requestId",
                  );

                if (
                  requestId
                ) {
                  interruptedRequestIds.add(
                    requestId,
                  );
                }

                finishAssistantStream();

                process.stdout.write(
                  "\n[stopped]\n",
                );
              }

              if (
                status ===
                  "failed"
              ) {
                finishAssistantStream();
              }

              if (
                status ===
                  "completed" ||
                status ===
                  "interrupted" ||
                status ===
                  "failed"
              ) {
                busy =
                  false;

                pendingPermission =
                  undefined;

                prompt();
              }

              continue;
            }

            if (
              type ===
                "control.interrupted"
            ) {
              continue;
            }

            if (
              type ===
                "runtime.error"
            ) {
              finishAssistantStream();

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

              process.stderr.write(
                `\n[${code}] ${message}\n`,
              );

              if (
                (
                  resumeSessionId ||
                  continueLatest
                ) &&
                !sessionId
              ) {
                closing =
                  true;

                readyReject?.(
                  new Error(
                    `[${code}] ${message}`,
                  ),
                );

                input.close();

                child.stdin.end();
              }

              continue;
            }

            if (
              type ===
                "session.end"
            ) {
              finishAssistantStream();

              process.stdout.write(
                "\nSession closed.\n",
              );

              closing =
                true;

              input.close();

              child.stdin.end();

              continue;
            }
          }
        } catch (error) {
          readyReject?.(
            error instanceof Error
              ? error
              : new Error(
                  String(
                    error,
                  ),
                ),
          );

          throw error;
        }
      }
    )();

  send({
    id:
      createRequestId(
        "req-chat-init",
      ),

    type:
      "control.initialize",

    protocolVersion:
      "1.0",

    client: {
      name:
        "tongyu-chat",

      version:
        "0.1.0",
    },
  });

  await ready;

  /*
   * A resumed session may already be completed.
   * In that case session.history.end closes the input
   * before the interactive stdin loop starts.
   *
   * Entering readline's async iterator after close has
   * already fired can leave the top-level CLI await
   * unsettled. Finish the child/server lifecycle here
   * instead of entering the chat loop.
   */
  if (
    closing
  ) {
    await serverTask;

    const exitCode =
      await exitPromise;

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

    return;
  }

  prompt();

  try {
    for await (
      const line
      of input
    ) {
      const rawInput =
        line.trim();

      let command =
        rawInput;

      /*
       * Slash commands remain canonical, but common
       * terminal-style aliases should work naturally.
       *
       * Permission aliases are context-aware so a normal
       * chat message containing "allow" is not stolen when
       * no permission is pending.
       */
      if (
        rawInput ===
          "help"
      ) {
        command =
          "/help";
      } else if (
        pendingPermission &&
        rawInput ===
          "allow"
      ) {
        command =
          "/allow";
      } else if (
        pendingPermission &&
        rawInput ===
          "deny"
      ) {
        command =
          "/deny";
      } else if (
        busy &&
        rawInput ===
          "stop"
      ) {
        command =
          "/stop";
      } else if (
        !busy &&
        rawInput ===
          "close"
      ) {
        command =
          "/close";
      } else if (
        !busy &&
        (
          rawInput ===
            "exit" ||
          rawInput ===
            "quit"
        )
      ) {
        command =
          "/exit";
      }

      if (
        command ===
          ""
      ) {
        prompt();

        continue;
      }

      if (
        command ===
          "/help"
      ) {
        printHelp();

        prompt();

        continue;
      }

      if (
        command ===
          "/allow" ||
        command ===
          "/deny"
      ) {
        if (
          !pendingPermission ||
          !sessionId
        ) {
          process.stdout.write(
            "No pending permission request.\n",
          );

          prompt();

          continue;
        }

        send({
          id:
            createRequestId(
              "req-chat-permission",
            ),

          type:
            "permission.response",

          sessionId,

          permissionRequestId:
            pendingPermission
              .permissionRequestId,

          decision:
            command ===
              "/allow"
              ? "allow_once"
              : "deny",
        });

        pendingPermission =
          undefined;

        continue;
      }

      if (
        command ===
          "/stop"
      ) {
        if (
          !busy ||
          !sessionId
        ) {
          process.stdout.write(
            "No active turn.\n",
          );

          prompt();

          continue;
        }

        send({
          id:
            createRequestId(
              "req-chat-stop",
            ),

          type:
            "control.interrupt",

          sessionId,
        });

        continue;
      }

      if (
        command ===
          "/exit"
      ) {
        if (
          busy
        ) {
          process.stdout.write(
            "A turn is still active. Use /stop first, then /exit.\n",
          );

          continue;
        }

        closing =
          true;

        if (
          sessionId
        ) {
          process.stdout.write(
            `Session preserved: ${sessionId}\n`,
          );

          process.stdout.write(
            `Resume with: tongyu chat --resume ${sessionId}\n`,
          );
        }

        input.close();

        child.stdin.end();

        break;
      }

      if (
        command ===
          "/close"
      ) {
        if (
          !sessionId
        ) {
          closing =
            true;

          input.close();

          child.stdin.end();

          break;
        }

        if (
          busy
        ) {
          process.stdout.write(
            "A turn is still active. Use /stop first, then /close.\n",
          );

          continue;
        }

        closing =
          true;

        send({
          id:
            createRequestId(
              "req-chat-close",
            ),

          type:
            "session.close",

          sessionId,
        });

        break;
      }

      if (
        pendingPermission
      ) {
        process.stdout.write(
          "A permission decision is pending. Use /allow, /deny, or /stop.\n",
        );

        input.prompt();

        continue;
      }

      if (
        busy
      ) {
        process.stdout.write(
          "Tongyu is still working. Use /stop to interrupt the current turn.\n",
        );

        continue;
      }

      if (
        !sessionId
      ) {
        process.stdout.write(
          "Session is not ready yet.\n",
        );

        continue;
      }

      busy =
        true;

      send({
        id:
          createRequestId(
            "req-chat-user",
          ),

        type:
          "user.message",

        sessionId,

        content:
          line,
      });
    }
  } finally {
    if (
      !closing &&
      !child.stdin.destroyed
    ) {
      /*
       * Ctrl-D / stdin close:
       * do not leave a child server behind.
       */
      child.stdin.end();
    }
  }

  await serverTask;

  const exitCode =
    await exitPromise;

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
}
