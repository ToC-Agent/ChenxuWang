import {
  createHash,
} from "node:crypto";

import {
  createReadStream,
} from "node:fs";

import {
  lstat,
  realpath,
} from "node:fs/promises";

import {
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

import type {
  SessionEvent,
} from "../session/index.js";

import {
  summarizeWorkspaceChanges,
  type WorkspaceChangeFileSummary,
  type WorkspaceChangeFilter,
} from "./changes.js";

export type WorkspaceChangeFileState =
  | "current"
  | "modified"
  | "missing"
  | "replaced"
  | "unreadable";

export interface WorkspaceChangeFileStatus
  extends WorkspaceChangeFileSummary {
  state:
    WorkspaceChangeFileState;

  currentSha256:
    string | null;

  currentBytes:
    number | null;
}

export interface WorkspaceChangeStatusSummary {
  fileCount:
    number;

  currentCount:
    number;

  modifiedCount:
    number;

  missingCount:
    number;

  replacedCount:
    number;

  unreadableCount:
    number;

  files:
    readonly WorkspaceChangeFileStatus[];
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
      !relativePath.startsWith(
        `..${sep}`,
      ) &&
      relativePath !==
        ".." &&
      !isAbsolute(
        relativePath,
      )
    )
  );
}

async function sha256File(
  path: string,
): Promise<string> {
  const hash =
    createHash(
      "sha256",
    );

  const stream =
    createReadStream(
      path,
    );

  for await (
    const chunk of stream
  ) {
    hash.update(
      chunk,
    );
  }

  return hash.digest(
    "hex",
  );
}

function createUnavailableStatus(
  summary:
    WorkspaceChangeFileSummary,
  state:
    Exclude<
      WorkspaceChangeFileState,
      "current" | "modified"
    >,
): WorkspaceChangeFileStatus {
  return {
    ...summary,

    state,

    currentSha256:
      null,

    currentBytes:
      null,
  };
}

async function inspectFileStatus(
  workspacePath: string,
  summary:
    WorkspaceChangeFileSummary,
): Promise<WorkspaceChangeFileStatus> {
  if (
    isAbsolute(
      summary.path,
    )
  ) {
    return createUnavailableStatus(
      summary,
      "replaced",
    );
  }

  const candidatePath =
    resolve(
      workspacePath,
      summary.path,
    );

  if (
    !isInsideWorkspace(
      workspacePath,
      candidatePath,
    )
  ) {
    return createUnavailableStatus(
      summary,
      "replaced",
    );
  }

  let stat;

  try {
    stat =
      await lstat(
        candidatePath,
      );
  } catch (error) {
    if (
      error instanceof
        Error &&
      "code" in error &&
      error.code ===
        "ENOENT"
    ) {
      return createUnavailableStatus(
        summary,
        "missing",
      );
    }

    return createUnavailableStatus(
      summary,
      "unreadable",
    );
  }

  /*
   * Never follow a final symlink while checking agent changes.
   */
  if (
    stat.isSymbolicLink() ||
    !stat.isFile()
  ) {
    return createUnavailableStatus(
      summary,
      "replaced",
    );
  }

  let resolvedPath:
    string;

  try {
    resolvedPath =
      await realpath(
        candidatePath,
      );
  } catch {
    return createUnavailableStatus(
      summary,
      "unreadable",
    );
  }

  /*
   * This also catches a parent-directory symlink that now
   * redirects the historical relative path outside workspace.
   */
  if (
    !isInsideWorkspace(
      workspacePath,
      resolvedPath,
    )
  ) {
    return createUnavailableStatus(
      summary,
      "replaced",
    );
  }

  let currentSha256:
    string;

  try {
    currentSha256 =
      await sha256File(
        resolvedPath,
      );
  } catch {
    return createUnavailableStatus(
      summary,
      "unreadable",
    );
  }

  return {
    ...summary,

    state:
      currentSha256 ===
        summary.latestAfterSha256
        ? "current"
        : "modified",

    currentSha256,

    currentBytes:
      stat.size,
  };
}

export async function inspectWorkspaceChangeStatus(
  cwd: string,
  events:
    readonly SessionEvent[],
  filter:
    WorkspaceChangeFilter = {},
): Promise<WorkspaceChangeStatusSummary> {
  const workspacePath =
    await realpath(
      cwd,
    );

  const summary =
    summarizeWorkspaceChanges(
      events,
      filter,
    );

  const files:
    WorkspaceChangeFileStatus[] =
      [];

  for (
    const fileSummary of
      summary.files
  ) {
    files.push(
      await inspectFileStatus(
        workspacePath,
        fileSummary,
      ),
    );
  }

  let currentCount =
    0;

  let modifiedCount =
    0;

  let missingCount =
    0;

  let replacedCount =
    0;

  let unreadableCount =
    0;

  for (
    const file of files
  ) {
    switch (
      file.state
    ) {
      case "current":
        currentCount +=
          1;
        break;

      case "modified":
        modifiedCount +=
          1;
        break;

      case "missing":
        missingCount +=
          1;
        break;

      case "replaced":
        replacedCount +=
          1;
        break;

      case "unreadable":
        unreadableCount +=
          1;
        break;
    }
  }

  return {
    fileCount:
      files.length,

    currentCount,

    modifiedCount,

    missingCount,

    replacedCount,

    unreadableCount,

    files,
  };
}
