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
  ToolExecutionContext,
  ToolPreparation,
} from "../types.js";

import {
  createTextFileChangeSet,
  createTextReplacementChange,
  type TextFileChangeSet,
} from "./text-change-set.js";

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

  changeSet:
    TextFileChangeSet;
}

interface FilesystemWriteTarget {
  workspacePath: string;

  path: string;

  relativePath: string;

  parentPath: string;

  exists: boolean;

  mode: number;

  content: string;
}

interface FilesystemWritePreparation {
  beforeExists: boolean;

  beforeContent: string;

  afterContent: string;

  changeSet:
    TextFileChangeSet;
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

async function resolveWriteTarget(
  cwd: string,
  inputPath: string,
): Promise<
  FilesystemWriteTarget
> {
  const workspacePath =
    await realpath(
      cwd,
    );

  const requestedPath =
    resolve(
      workspacePath,
      inputPath,
    );

  if (
    !isInsideWorkspace(
      workspacePath,
      requestedPath,
    )
  ) {
    throw new Error(
      `Refusing to write outside the workspace: ${inputPath}`,
    );
  }

  /*
   * Resolve the parent rather than following the final
   * target. This prevents a workspace symlink directory
   * from redirecting writes outside the workspace.
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
      `Refusing to write outside the workspace: ${inputPath}`,
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
      `Refusing to write outside the workspace: ${inputPath}`,
    );
  }

  try {
    const stats =
      await lstat(
        finalPath,
      );

    if (
      stats.isSymbolicLink()
    ) {
      throw new Error(
        `Refusing to write through a symbolic link: ${inputPath}`,
      );
    }

    if (
      !stats.isFile()
    ) {
      throw new Error(
        `Path is not a regular file: ${inputPath}`,
      );
    }

    /*
     * Reviewed whole-file replacement needs the complete
     * previous text so it can construct an exact ChangeSet.
     */
    if (
      stats.size >
        MAX_WRITE_BYTES
    ) {
      throw new Error(
        `Existing file exceeds the ${MAX_WRITE_BYTES} byte reviewed-write limit.`,
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
        `Refusing to write outside the workspace: ${inputPath}`,
      );
    }

    const content =
      await readFile(
        finalPath,
        "utf8",
      );

    return {
      workspacePath,

      path:
        finalPath,

      relativePath:
        relative(
          workspacePath,
          finalPath,
        ),

      parentPath:
        resolvedParent,

      exists:
        true,

      mode:
        stats.mode &
        0o777,

      content,
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
        workspacePath,

        path:
          finalPath,

        relativePath:
          relative(
            workspacePath,
            finalPath,
          ),

        parentPath:
          resolvedParent,

        exists:
          false,

        mode:
          0o600,

        content:
          "",
      };
    }

    throw error;
  }
}

async function writeTargetAtomic(
  target:
    FilesystemWriteTarget,
  content: string,
): Promise<number> {
  const bytes =
    Buffer.byteLength(
      content,
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

  const tempPath =
    resolve(
      target.parentPath,
      `.${basename(target.path)}.tongyu-${randomUUID()}.tmp`,
    );

  try {
    await writeFile(
      tempPath,
      content,
      {
        encoding:
          "utf8",

        flag:
          "wx",

        mode:
          target.mode,
      },
    );

    await rename(
      tempPath,
      target.path,
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

  return bytes;
}

async function prepareFilesystemWrite(
  input:
    FilesystemWriteInput,
  context:
    ToolExecutionContext,
): Promise<
  ToolPreparation<
    FilesystemWritePreparation
  >
> {
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

  const target =
    await resolveWriteTarget(
      context.cwd,
      input.path,
    );

  const change =
    createTextReplacementChange({
      sequence:
        1,

      startLine:
        1,

      oldText:
        target.content,

      newText:
        input.content,
    });

  const changeSet =
    createTextFileChangeSet({
      path:
        target.relativePath,

      beforeContent:
        target.content,

      afterContent:
        input.content,

      changes: [
        change,
      ],
    });

  return {
    data: {
      beforeExists:
        target.exists,

      beforeContent:
        target.content,

      afterContent:
        input.content,

      changeSet,
    },

    permissionArguments: {
      ...input,

      expectedBeforeSha256:
        changeSet.beforeSha256,

      beforeContent:
        target.content,

      willCreate:
        !target.exists,
    },
  };
}

export const filesystemWriteTool:
  Tool<
    FilesystemWriteInput,
    FilesystemWriteOutput,
    FilesystemWritePreparation
  > = {
    name:
      "filesystem.write",

    description:
      "Create or completely replace a UTF-8 text file inside the current workspace. The write is prepared before permission and executed atomically only if the target has not changed while the user reviews the preview.",

    permission:
      "workspace.write",

    inputSchema:
      FilesystemWriteInputSchema,

    prepare:
      prepareFilesystemWrite,

    async execute(
      input,
      context,
      preparation,
    ) {
      const prepared =
        preparation ??
        (
          await prepareFilesystemWrite(
            input,
            context,
          )
        ).data;

      /*
       * Re-resolve and re-read after permission.
       */
      const current =
        await resolveWriteTarget(
          context.cwd,
          input.path,
        );

      if (
        prepared.beforeExists
      ) {
        if (
          !current.exists ||
          current.content !==
            prepared.beforeContent
        ) {
          throw new Error(
            `File changed after permission preview; refusing stale write: ${input.path}`,
          );
        }
      } else if (
        current.exists
      ) {
        /*
         * The preview approved creation of a NEW file.
         * Never overwrite a file that appeared while waiting.
         */
        throw new Error(
          `File appeared after permission preview; refusing stale write: ${input.path}`,
        );
      }

      const bytes =
        await writeTargetAtomic(
          current,
          prepared.afterContent,
        );

      return {
        path:
          current.relativePath,

        bytes,

        created:
          !prepared.beforeExists,

        changeSet:
          prepared.changeSet,
      };
    },
  };
