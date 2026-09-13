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
  createTextFileChangeSet,
  createTextReplacementChange,
  getTextStartLine,
  type TextFileChangeSet,
  type TextReplacementChange,
} from "./text-change-set.js";

import {
  countTextOccurrences,
  loadExistingWorkspaceTextFile,
  writeWorkspaceTextFileAtomic,
} from "./workspace-text-file.js";

const FilesystemPatchEditSchema =
  z.object({
    oldText:
      z.string()
        .min(
          1,
          "oldText must not be empty",
        ),

    newText:
      z.string(),
  }).strict();

const FilesystemPatchInputSchema =
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

    edits:
      z.array(
        FilesystemPatchEditSchema,
      )
        .min(
          1,
          "at least one edit is required",
        )
        .max(
          64,
          "at most 64 edits are allowed",
        ),
  }).strict();

type FilesystemPatchInput =
  z.infer<
    typeof FilesystemPatchInputSchema
  >;

export interface FilesystemPatchOutput {
  path: string;

  bytes: number;

  editsApplied: number;

  changeSet:
    TextFileChangeSet;
}

export const filesystemPatchTool:
  Tool<
    FilesystemPatchInput,
    FilesystemPatchOutput
  > = {
    name:
      "filesystem.patch",

    description:
      "Apply multiple exact text replacements to one existing UTF-8 file inside the current workspace. Edits are validated and applied sequentially in memory, then written atomically once. Every oldText must match exactly once at the time its edit is applied; otherwise the entire patch fails without modifying the file.",

    permission:
      "workspace.write",

    inputSchema:
      FilesystemPatchInputSchema,

    async execute(
      input,
      context,
    ) {
      const file =
        await loadExistingWorkspaceTextFile(
          context.cwd,
          input.path,
          "patch",
        );

      let updatedContent =
        file.content;

      const changes:
        TextReplacementChange[] =
          [];

      for (
        let index = 0;
        index < input.edits.length;
        index += 1
      ) {
        const edit =
          input.edits[
            index
          ];

        if (!edit) {
          throw new Error(
            `Missing patch edit at index ${index}`,
          );
        }

        const matchCount =
          countTextOccurrences(
            updatedContent,
            edit.oldText,
          );

        if (
          matchCount ===
          0
        ) {
          throw new Error(
            `edits[${index}].oldText was not found in ${input.path}`,
          );
        }

        if (
          matchCount >
          1
        ) {
          throw new Error(
            `edits[${index}].oldText matched ${matchCount} locations in ${input.path}; filesystem.patch requires exactly one match per edit`,
          );
        }

        const matchIndex =
          updatedContent.indexOf(
            edit.oldText,
          );

        changes.push(
          createTextReplacementChange({
            sequence:
              index + 1,

            startLine:
              getTextStartLine(
                updatedContent,
                matchIndex,
              ),

            oldText:
              edit.oldText,

            newText:
              edit.newText,
          }),
        );

        updatedContent =
          updatedContent.slice(
            0,
            matchIndex,
          ) +
          edit.newText +
          updatedContent.slice(
            matchIndex +
              edit.oldText.length,
          );
      }

      const changeSet =
        createTextFileChangeSet({
          path:
            file.relativePath,

          beforeContent:
            file.content,

          afterContent:
            updatedContent,

          changes,
        });

      const bytes =
        await writeWorkspaceTextFileAtomic(
          file,
          updatedContent,
        );

      return {
        path:
          file.relativePath,

        bytes,

        editsApplied:
          input.edits.length,

        changeSet,
      };
    },
  };
