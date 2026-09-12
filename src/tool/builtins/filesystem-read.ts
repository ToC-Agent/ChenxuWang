import {
  readFile,
  realpath,
  stat,
} from "node:fs/promises";

import {
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

import {
  z,
} from "zod";

import type {
  Tool,
} from "../types.js";

const MAX_FILE_BYTES =
  1024 * 1024;

const FilesystemReadInputSchema =
  z.object({
    path:
      z.string()
        .min(1)
        .refine(
          (value) =>
            !isAbsolute(
              value,
            ),
          {
            message:
              "path must be relative to the working directory",
          },
        ),
  }).strict();

type FilesystemReadInput =
  z.infer<
    typeof FilesystemReadInputSchema
  >;

export interface FilesystemReadOutput {
  path: string;
  content: string;
  bytes: number;
}

function isInsideWorkspace(
  workspacePath: string,
  candidatePath: string,
): boolean {
  const relativePath =
    relative(
      workspacePath,
      candidatePath,
    );

  return (
    relativePath ===
      "" ||
    (
      relativePath !==
        ".." &&
      !relativePath.startsWith(
        `..${sep}`,
      ) &&
      !isAbsolute(
        relativePath,
      )
    )
  );
}

export const filesystemReadTool:
  Tool<
    FilesystemReadInput,
    FilesystemReadOutput
  > = {
    name:
      "filesystem.read",

    description:
      "Read a UTF-8 text file inside the current working directory. The path must be relative to the workspace.",

    permission:
      "workspace.read",

    inputSchema:
      FilesystemReadInputSchema,

    async execute(
      input,
      context,
    ) {
      const workspacePath =
        await realpath(
          context.cwd,
        );

      const requestedPath =
        resolve(
          workspacePath,
          input.path,
        );

      const resolvedPath =
        await realpath(
          requestedPath,
        );

      if (
        !isInsideWorkspace(
          workspacePath,
          resolvedPath,
        )
      ) {
        throw new Error(
          `Refusing to read outside the workspace: ${input.path}`,
        );
      }

      const fileStat =
        await stat(
          resolvedPath,
        );

      if (
        !fileStat.isFile()
      ) {
        throw new Error(
          `Path is not a regular file: ${input.path}`,
        );
      }

      if (
        fileStat.size >
        MAX_FILE_BYTES
      ) {
        throw new Error(
          `File exceeds the ${MAX_FILE_BYTES} byte read limit: ${input.path}`,
        );
      }

      const content =
        await readFile(
          resolvedPath,
          "utf8",
        );

      return {
        path:
          relative(
            workspacePath,
            resolvedPath,
          ),

        content,

        bytes:
          fileStat.size,
      };
    },
  };
