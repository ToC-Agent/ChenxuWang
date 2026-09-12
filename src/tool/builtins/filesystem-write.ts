import {
  randomUUID,
} from "node:crypto";

import {
  lstat,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  basename,
  dirname,
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

const MAX_WRITE_BYTES =
  1024 * 1024;

const FilesystemWriteInputSchema =
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

    content:
      z.string(),
  }).strict();

type FilesystemWriteInput =
  z.infer<
    typeof FilesystemWriteInputSchema
  >;

export interface FilesystemWriteOutput {
  path: string;
  bytes: number;
  created: boolean;
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

async function getExistingFile(
  path: string,
): Promise<
  {
    exists: boolean;
    mode?: number;
  }
> {
  try {
    const stats =
      await lstat(
        path,
      );

    if (
      stats.isSymbolicLink()
    ) {
      throw new Error(
        `Refusing to write through a symbolic link: ${path}`,
      );
    }

    if (
      !stats.isFile()
    ) {
      throw new Error(
        `Path is not a regular file: ${path}`,
      );
    }

    return {
      exists:
        true,

      mode:
        stats.mode &
        0o777,
    };
  } catch (error) {
    if (
      error &&
      typeof error ===
        "object" &&
      "code" in error &&
      error.code ===
        "ENOENT"
    ) {
      return {
        exists:
          false,
      };
    }

    throw error;
  }
}

export const filesystemWriteTool:
  Tool<
    FilesystemWriteInput,
    FilesystemWriteOutput
  > = {
    name:
      "filesystem.write",

    description:
      "Write UTF-8 text to a file inside the current working directory. The path must be relative to the workspace. Existing files are replaced atomically.",

    permission:
      "workspace.write",

    inputSchema:
      FilesystemWriteInputSchema,

    async execute(
      input,
      context,
    ) {
      const bytes =
        Buffer.byteLength(
          input.content,
          "utf8",
        );

      if (
        bytes >
        MAX_WRITE_BYTES
      ) {
        throw new Error(
          `Content exceeds the ${MAX_WRITE_BYTES} byte write limit.`,
        );
      }

      const workspacePath =
        await realpath(
          context.cwd,
        );

      const requestedPath =
        resolve(
          workspacePath,
          input.path,
        );

      /*
       * Reject lexical traversal before touching
       * the filesystem.
       */
      if (
        !isInsideWorkspace(
          workspacePath,
          requestedPath,
        )
      ) {
        throw new Error(
          `Refusing to write outside the workspace: ${input.path}`,
        );
      }

      /*
       * Resolve the parent directory. This prevents:
       *
       * workspace/link -> /outside
       * filesystem.write("link/file.txt")
       */
      const requestedParent =
        dirname(
          requestedPath,
        );

      const resolvedParent =
        await realpath(
          requestedParent,
        );

      if (
        !isInsideWorkspace(
          workspacePath,
          resolvedParent,
        )
      ) {
        throw new Error(
          `Refusing to write outside the workspace: ${input.path}`,
        );
      }

      const finalPath =
        resolve(
          resolvedParent,
          basename(
            requestedPath,
          ),
        );

      if (
        !isInsideWorkspace(
          workspacePath,
          finalPath,
        )
      ) {
        throw new Error(
          `Refusing to write outside the workspace: ${input.path}`,
        );
      }

      const existing =
        await getExistingFile(
          finalPath,
        );

      /*
       * If it already exists, verify that its real path
       * still resolves inside the workspace.
       */
      if (
        existing.exists
      ) {
        const resolvedExisting =
          await realpath(
            finalPath,
          );

        if (
          !isInsideWorkspace(
            workspacePath,
            resolvedExisting,
          )
        ) {
          throw new Error(
            `Refusing to write outside the workspace: ${input.path}`,
          );
        }
      }

      const tempPath =
        resolve(
          resolvedParent,
          `.${basename(finalPath)}.tongyu-${randomUUID()}.tmp`,
        );

      try {
        await writeFile(
          tempPath,
          input.content,
          {
            encoding:
              "utf8",

            flag:
              "wx",

            mode:
              existing.mode ??
              0o600,
          },
        );

        await rename(
          tempPath,
          finalPath,
        );
      } finally {
        /*
         * rename() removes tempPath on success.
         * rm(force=true) also makes failure cleanup safe.
         */
        await rm(
          tempPath,
          {
            force:
              true,
          },
        );
      }

      return {
        path:
          relative(
            workspacePath,
            finalPath,
          ),

        bytes,

        created:
          !existing.exists,
      };
    },
  };
