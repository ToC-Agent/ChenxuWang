import {
  persistWorkspaceTextSnapshot,
} from "../../workspace/snapshot-store.js";

import {
  isAbsolute,
} from "node:path";

import {
  z,
} from "zod";

import type {
  Tool,
  ToolExecutionContext,
  ToolPreparation,
} from "../types.js";

import {
  createTextFileChangeSet,
  createTextReplacementChange,
  getTextStartLine,
  type TextFileChangeSet,
} from "./text-change-set.js";

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

  changeSet:
    TextFileChangeSet;
}

interface FilesystemEditPreparation {
  beforeContent:
    string;

  updatedContent:
    string;

  changeSet:
    TextFileChangeSet;
}

async function prepareFilesystemEdit(
  input:
    FilesystemEditInput,
  context:
    ToolExecutionContext,
): Promise<
  ToolPreparation<
    FilesystemEditPreparation
  >
> {
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

  const change =
    createTextReplacementChange({
      sequence:
        1,

      startLine:
        getTextStartLine(
          file.content,
          matchIndex,
        ),

      oldText:
        input.oldText,

      newText:
        input.newText,
    });

  const changeSet =
    createTextFileChangeSet({
      path:
        file.relativePath,

      beforeExists:
        true,

      afterExists:
        true,

      beforeContent:
        file.content,

      afterContent:
        updatedContent,

      changes: [
        change,
      ],
    });

  return {
    data: {
      beforeContent:
        file.content,

      updatedContent,

      changeSet,
    },

    /*
     * This is permission-display metadata only.
     * It is not passed back through the strict input schema.
     */
    permissionArguments: {
      ...input,

      expectedBeforeSha256:
        changeSet.beforeSha256,
    },
  };
}

export const filesystemEditTool:
  Tool<
    FilesystemEditInput,
    FilesystemEditOutput,
    FilesystemEditPreparation
  > = {
    name:
      "filesystem.edit",

    description:
      "Precisely replace exactly one occurrence of oldText with newText in an existing UTF-8 text file inside the current workspace. The edit fails without modifying the file if oldText is missing or matches more than once. Prefer this tool for one targeted edit.",

    permission:
      "workspace.write",

    inputSchema:
      FilesystemEditInputSchema,

    prepare:
      prepareFilesystemEdit,

    async execute(
      input,
      context,
      preparation,
    ) {
      /*
       * Keep direct tool.execute() backwards-compatible for
       * internal tests and non-ToolExecutor callers.
       */
      const prepared =
        preparation ??
        (
          await prepareFilesystemEdit(
            input,
            context,
          )
        ).data;

      /*
       * Re-read AFTER permission was granted.
       *
       * If anything changed while the user was reviewing the
       * preview, reject rather than applying a stale plan.
       */
      const currentFile =
        await loadExistingWorkspaceTextFile(
          context.cwd,
          input.path,
          "edit",
        );

      if (
        currentFile.content !==
        prepared.beforeContent
      ) {
        throw new Error(
          `File changed after permission preview; refusing stale edit: ${input.path}`,
        );
      }

      await persistWorkspaceTextSnapshot(
        prepared.beforeContent,
        prepared.changeSet.beforeSha256,
      );

      const bytes =
        await writeWorkspaceTextFileAtomic(
          currentFile,
          prepared.updatedContent,
        );

      return {
        path:
          currentFile.relativePath,

        bytes,

        replacements:
          1,

        changeSet:
          prepared.changeSet,
      };
    },
  };
