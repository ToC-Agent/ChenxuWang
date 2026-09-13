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

export const MAX_WORKSPACE_TEXT_BYTES =
  1024 * 1024;

export interface ExistingWorkspaceTextFile {
  workspacePath: string;

  path: string;

  relativePath: string;

  parentPath: string;

  mode: number;

  content: string;
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

export function countTextOccurrences(
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
     * Advance one character so overlapping matches
     * are also considered ambiguous.
     */
    offset =
      index + 1;
  }

  return count;
}

export async function loadExistingWorkspaceTextFile(
  cwd: string,
  inputPath: string,
  operation: string,
): Promise<ExistingWorkspaceTextFile> {
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
      `Refusing to ${operation} outside the workspace: ${inputPath}`,
    );
  }

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
      `Refusing to ${operation} outside the workspace: ${inputPath}`,
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
      `Refusing to ${operation} outside the workspace: ${inputPath}`,
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
        `Cannot ${operation} a file that does not exist: ${inputPath}`,
      );
    }

    throw error;
  }

  if (
    stats.isSymbolicLink()
  ) {
    throw new Error(
      `Refusing to ${operation} through a symbolic link: ${inputPath}`,
    );
  }

  if (
    !stats.isFile()
  ) {
    throw new Error(
      `Path is not a regular file: ${inputPath}`,
    );
  }

  if (
    stats.size >
    MAX_WORKSPACE_TEXT_BYTES
  ) {
    throw new Error(
      `File exceeds the ${MAX_WORKSPACE_TEXT_BYTES} byte limit.`,
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
      `Refusing to ${operation} outside the workspace: ${inputPath}`,
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

    mode:
      stats.mode &
      0o777,

    content,
  };
}

export async function writeWorkspaceTextFileAtomic(
  file: ExistingWorkspaceTextFile,
  content: string,
): Promise<number> {
  const bytes =
    Buffer.byteLength(
      content,
      "utf8",
    );

  if (
    bytes >
    MAX_WORKSPACE_TEXT_BYTES
  ) {
    throw new Error(
      `Edited content exceeds the ${MAX_WORKSPACE_TEXT_BYTES} byte limit.`,
    );
  }

  const tempPath =
    resolve(
      file.parentPath,
      `.${basename(file.path)}.tongyu-${randomUUID()}.tmp`,
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
          file.mode,
      },
    );

    await rename(
      tempPath,
      file.path,
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

export async function removeWorkspaceTextFile(
  file: ExistingWorkspaceTextFile,
): Promise<void> {
  await rm(
    file.path,
  );
}
