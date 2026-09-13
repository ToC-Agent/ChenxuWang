import {
  randomUUID,
} from "node:crypto";

import {
  lstat,
  readFile,
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

const MAX_EDIT_BYTES =
  1024 * 1024;

const FilesystemEditInputSchema =
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

    oldText:
      z.string()
        .min(
          1,
          "oldText must not be empty",
        ),

    newText:
      z.string(),
  }).strict();

type FilesystemEditInput =
  z.infer<
    typeof FilesystemEditInputSchema
  >;

export interface FilesystemEditOutput {
  path: string;

  bytes: number;

  replacements: 1;
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

function countOccurrences(
  content: string,
  search: string,
): number {
  let count =
    0;

  let offset =
    0;

  while (
    offset <=
    content.length -
      search.length
  ) {
    const index =
      content.indexOf(
        search,
        offset,
      );

    if (
      index <
      0
    ) {
      break;
    }

    count +=
      1;

    /*
     * Advance one character instead of search.length.
     *
     * This deliberately detects overlapping matches:
     *
     * content = "aaa"
     * oldText = "aa"
     *
     * is considered ambiguous and therefore rejected.
     */
    offset =
      index + 1;
  }

  return count;
}

export const filesystemEditTool:
  Tool<
    FilesystemEditInput,
    FilesystemEditOutput
  > = {
    name:
      "filesystem.edit",

    description:
      "Precisely replace exactly one occurrence of oldText with newText in an existing UTF-8 text file inside the current workspace. The edit fails without modifying the file if oldText is missing or matches more than once. Prefer this tool for targeted edits to existing files.",

    permission:
      "workspace.write",

    inputSchema:
      FilesystemEditInputSchema,

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

      /*
       * Reject lexical traversal before touching
       * the requested file.
       */
      if (
        !isInsideWorkspace(
          workspacePath,
          requestedPath,
        )
      ) {
        throw new Error(
          `Refusing to edit outside the workspace: ${input.path}`,
        );
      }

      /*
       * Resolve the parent directory so a workspace
       * symlink cannot redirect the edit outside.
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
          `Refusing to edit outside the workspace: ${input.path}`,
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
          `Refusing to edit outside the workspace: ${input.path}`,
        );
      }

      let stats;

      try {
        stats =
          await lstat(
            finalPath,
          );
      } catch (error) {
        if (
          error &&
          typeof error ===
            "object" &&
          "code" in error &&
          error.code ===
            "ENOENT"
        ) {
          throw new Error(
            `Cannot edit a file that does not exist: ${input.path}`,
          );
        }

        throw error;
      }

      if (
        stats.isSymbolicLink()
      ) {
        throw new Error(
          `Refusing to edit through a symbolic link: ${input.path}`,
        );
      }

      if (
        !stats.isFile()
      ) {
        throw new Error(
          `Path is not a regular file: ${input.path}`,
        );
      }

      if (
        stats.size >
        MAX_EDIT_BYTES
      ) {
        throw new Error(
          `File exceeds the ${MAX_EDIT_BYTES} byte edit limit.`,
        );
      }

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
          `Refusing to edit outside the workspace: ${input.path}`,
        );
      }

      const currentContent =
        await readFile(
          finalPath,
          "utf8",
        );

      const matchCount =
        countOccurrences(
          currentContent,
          input.oldText,
        );

      if (
        matchCount ===
        0
      ) {
        throw new Error(
          `oldText was not found in ${input.path}`,
        );
      }

      if (
        matchCount >
        1
      ) {
        throw new Error(
          `oldText matched ${matchCount} locations in ${input.path}; filesystem.edit requires exactly one match`,
        );
      }

      const matchIndex =
        currentContent.indexOf(
          input.oldText,
        );

      const updatedContent =
        currentContent.slice(
          0,
          matchIndex,
        ) +
        input.newText +
        currentContent.slice(
          matchIndex +
            input.oldText.length,
        );

      const bytes =
        Buffer.byteLength(
          updatedContent,
          "utf8",
        );

      if (
        bytes >
        MAX_EDIT_BYTES
      ) {
        throw new Error(
          `Edited content exceeds the ${MAX_EDIT_BYTES} byte edit limit.`,
        );
      }

      const tempPath =
        resolve(
          resolvedParent,
          `.${basename(finalPath)}.tongyu-${randomUUID()}.tmp`,
        );

      try {
        await writeFile(
          tempPath,
          updatedContent,
          {
            encoding:
              "utf8",

            flag:
              "wx",

            mode:
              stats.mode &
              0o777,
          },
        );

        await rename(
          tempPath,
          finalPath,
        );
      } finally {
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

        replacements:
          1,
      };
    },
  };
