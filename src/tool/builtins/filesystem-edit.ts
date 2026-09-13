import {
  isAbsolute,
} from "node:path";

import {
  z,
} from "zod";

import type {
  Tool,
} from "../types.js";

import {
  countTextOccurrences,
  loadExistingWorkspaceTextFile,
  writeWorkspaceTextFileAtomic,
} from "./workspace-text-file.js";

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

export const filesystemEditTool:
  Tool<
    FilesystemEditInput,
    FilesystemEditOutput
  > = {
    name:
      "filesystem.edit",

    description:
      "Precisely replace exactly one occurrence of oldText with newText in an existing UTF-8 text file inside the current workspace. The edit fails without modifying the file if oldText is missing or matches more than once. Prefer this tool for one targeted edit.",

    permission:
      "workspace.write",

    inputSchema:
      FilesystemEditInputSchema,

    async execute(
      input,
      context,
    ) {
      const file =
        await loadExistingWorkspaceTextFile(
          context.cwd,
          input.path,
          "edit",
        );

      const matchCount =
        countTextOccurrences(
          file.content,
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
        file.content.indexOf(
          input.oldText,
        );

      const updatedContent =
        file.content.slice(
          0,
          matchIndex,
        ) +
        input.newText +
        file.content.slice(
          matchIndex +
            input.oldText.length,
        );

      const bytes =
        await writeWorkspaceTextFileAtomic(
          file,
          updatedContent,
        );

      return {
        path:
          file.relativePath,

        bytes,

        replacements:
          1,
      };
    },
  };
