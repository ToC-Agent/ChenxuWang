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

                stdio: [
                  "ignore",
                  "pipe",
                  "pipe",
                ],
              },
            );

          const terminate =
            () => {
              if (
                terminating
              ) {
                return;
              }

              terminating =
                true;

              child.kill(
                "SIGTERM",
              );

              forceKillTimer =
                setTimeout(
                  () => {
                    child.kill(
                      "SIGKILL",
                    );
                  },
                  500,
                );

              forceKillTimer.unref();
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
