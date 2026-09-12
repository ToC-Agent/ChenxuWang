import {
  spawn,
} from "node:child_process";

import {
  z,
} from "zod";

import type {
  Tool,
} from "../types.js";

const DEFAULT_TIMEOUT_MS =
  30_000;

const MAX_TIMEOUT_MS =
  60_000;

const MAX_OUTPUT_BYTES =
  256 * 1024;

const DEFAULT_PATH =
  "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

const ShellExecInputSchema =
  z.object({
    command:
      z.string()
        .min(1)
        .max(
          32 * 1024,
        ),

    timeoutMs:
      z.number()
        .int()
        .min(
          100,
        )
        .max(
          MAX_TIMEOUT_MS,
        )
        .optional(),
  }).strict();

type ShellExecInput =
  z.infer<
    typeof ShellExecInputSchema
  >;

export interface ShellExecOutput {
  exitCode:
    number | null;

  signal:
    NodeJS.Signals | null;

  stdout:
    string;

  stderr:
    string;

  timedOut:
    boolean;

  outputLimitExceeded:
    boolean;

  durationMs:
    number;
}

function createShellEnvironment(
  cwd:
    string,
): Record<
  string,
  string
> {
  const environment:
    Record<
      string,
      string
    > = {
      PATH:
        process.env.PATH ??
        DEFAULT_PATH,

      HOME:
        process.env.HOME ??
        cwd,

      TMPDIR:
        process.env.TMPDIR ??
        "/tmp",

      LANG:
        process.env.LANG ??
        "C",

      PWD:
        cwd,
    };

  if (
    process.env.LC_ALL
  ) {
    environment.LC_ALL =
      process.env.LC_ALL;
  }

  if (
    process.env.LC_CTYPE
  ) {
    environment.LC_CTYPE =
      process.env.LC_CTYPE;
  }

  if (
    process.env.TERM
  ) {
    environment.TERM =
      process.env.TERM;
  }

  return environment;
}

function appendLimited(
  buffers:
    Buffer[],
  chunk:
    Buffer,
  currentBytes:
    number,
): {
  bytes:
    number;

  exceeded:
    boolean;
} {
  const remaining =
    MAX_OUTPUT_BYTES -
    currentBytes;

  if (
    remaining <=
    0
  ) {
    return {
      bytes:
        currentBytes,

      exceeded:
        true,
    };
  }

  if (
    chunk.length >
    remaining
  ) {
    buffers.push(
      chunk.subarray(
        0,
        remaining,
      ),
    );

    return {
      bytes:
        MAX_OUTPUT_BYTES,

      exceeded:
        true,
    };
  }

  buffers.push(
    chunk,
  );

  return {
    bytes:
      currentBytes +
      chunk.length,

    exceeded:
      false,
  };
}

export const shellExecTool:
  Tool<
    ShellExecInput,
    ShellExecOutput
  > = {
    name:
      "shell.exec",

    description:
      "Execute a POSIX shell command in the current workspace using /bin/sh. Requires explicit permission. The working directory cannot be supplied by the model.",

    permission:
      "shell.execute",

    inputSchema:
      ShellExecInputSchema,

    async execute(
      input,
      context,
    ) {
      if (
        context.signal?.aborted
      ) {
        throw new Error(
          "Tongyu shell execution was aborted before start.",
        );
      }

      const timeoutMs =
        input.timeoutMs ??
        DEFAULT_TIMEOUT_MS;

      const startedAt =
        Date.now();

      return await new Promise<
        ShellExecOutput
      >(
        (
          resolve,
          reject,
        ) => {
          const stdoutBuffers:
            Buffer[] = [];

          const stderrBuffers:
            Buffer[] = [];

          let stdoutBytes =
            0;

          let stderrBytes =
            0;

          let timedOut =
            false;

          let outputLimitExceeded =
            false;

          let aborted =
            false;

          let terminating =
            false;

          let settled =
            false;

          let forceKillTimer:
            NodeJS.Timeout |
            undefined;

          const child =
            spawn(
              "/bin/sh",
              [
                "-c",
                input.command,
              ],
              {
                cwd:
                  context.cwd,

                env:
                  createShellEnvironment(
                    context.cwd,
                  ),

                /*
                 * On POSIX this creates a separate process
                 * group so interrupt can terminate the shell
                 * and descendants together.
                 */
                detached:
                  process.platform !==
                  "win32",

                stdio: [
                  "ignore",
                  "pipe",
                  "pipe",
                ],
              },
            );

          const killTree =
            (
              signal:
                NodeJS.Signals,
            ) => {
              if (
                process.platform !==
                  "win32" &&
                child.pid !==
                  undefined
              ) {
                try {
                  process.kill(
                    -child.pid,
                    signal,
                  );

                  return;
                } catch {
                  /*
                   * Fall back to the direct child.
                   */
                }
              }

              child.kill(
                signal,
              );
            };

          const terminate =
            () => {
              if (
                terminating
              ) {
                return;
              }

              terminating =
                true;

              killTree(
                "SIGTERM",
              );

              forceKillTimer =
                setTimeout(
                  () => {
                    killTree(
                      "SIGKILL",
                    );
                  },
                  500,
                );

              forceKillTimer.unref();
            };

          const abortHandler =
            () => {
              aborted =
                true;

              terminate();
            };

          if (
            context.signal
          ) {
            if (
              context.signal.aborted
            ) {
              abortHandler();
            } else {
              context.signal
                .addEventListener(
                  "abort",
                  abortHandler,
                  {
                    once:
                      true,
                  },
                );
            }
          }

          const cleanup =
            () => {
              if (
                context.signal
              ) {
                context.signal
                  .removeEventListener(
                    "abort",
                    abortHandler,
                  );
              }
            };

          const timeoutTimer =
            setTimeout(
              () => {
                timedOut =
                  true;

                terminate();
              },
              timeoutMs,
            );

          timeoutTimer.unref();

          child.stdout.on(
            "data",
            (
              chunk:
                Buffer,
            ) => {
              const appended =
                appendLimited(
                  stdoutBuffers,
                  chunk,
                  stdoutBytes,
                );

              stdoutBytes =
                appended.bytes;

              if (
                appended.exceeded
              ) {
                outputLimitExceeded =
                  true;

                terminate();
              }
            },
          );

          child.stderr.on(
            "data",
            (
              chunk:
                Buffer,
            ) => {
              const appended =
                appendLimited(
                  stderrBuffers,
                  chunk,
                  stderrBytes,
                );

              stderrBytes =
                appended.bytes;

              if (
                appended.exceeded
              ) {
                outputLimitExceeded =
                  true;

                terminate();
              }
            },
          );

          child.once(
            "error",
            (
              error,
            ) => {
              if (
                settled
              ) {
                return;
              }

              settled =
                true;

              cleanup();

              clearTimeout(
                timeoutTimer,
              );

              if (
                forceKillTimer
              ) {
                clearTimeout(
                  forceKillTimer,
                );
              }

              reject(
                error,
              );
            },
          );

          child.once(
            "close",
            (
              exitCode,
              signal,
            ) => {
              if (
                settled
              ) {
                return;
              }

              settled =
                true;

              cleanup();

              clearTimeout(
                timeoutTimer,
              );

              if (
                forceKillTimer
              ) {
                clearTimeout(
                  forceKillTimer,
                );
              }

              if (
                aborted
              ) {
                reject(
                  new Error(
                    "Tongyu shell execution was aborted.",
                  ),
                );

                return;
              }

              resolve({
                exitCode,

                signal,

                stdout:
                  Buffer.concat(
                    stdoutBuffers,
                  ).toString(
                    "utf8",
                  ),

                stderr:
                  Buffer.concat(
                    stderrBuffers,
                  ).toString(
                    "utf8",
                  ),

                timedOut,

                outputLimitExceeded,

                durationMs:
                  Date.now() -
                  startedAt,
              });
            },
          );
        },
      );
    },
  };
