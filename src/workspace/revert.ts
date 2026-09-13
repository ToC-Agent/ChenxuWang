import type {
  SessionEvent,
} from "../session/index.js";

import {
  sha256Text,
} from "./change-set.js";

import {
  deriveWorkspaceChanges,
} from "./changes.js";

import {
  readWorkspaceTextSnapshot,
} from "./snapshot-store.js";

import {
  loadExistingWorkspaceTextFile,
  removeWorkspaceTextFile,
  writeWorkspaceTextFileAtomic,
} from "./text-file.js";

export type WorkspaceRevertErrorCode =
  | "WORKSPACE_CHANGE_NOT_FOUND"
  | "WORKSPACE_REVERT_UNSAFE"
  | "WORKSPACE_SNAPSHOT_UNAVAILABLE";

export class WorkspaceRevertError
  extends Error {
  readonly code:
    WorkspaceRevertErrorCode;

  constructor(
    code:
      WorkspaceRevertErrorCode,
    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      "WorkspaceRevertError";

    this.code =
      code;
  }
}

export interface WorkspaceRevertResult {
  path:
    string;

  action:
    "restored" |
    "deleted";

  fromSha256:
    string;

  toSha256:
    string | null;

  bytes:
    number | null;
}

function requireExistenceMetadata(
  value:
    boolean | undefined,
  path:
    string,
): boolean {
  if (
    typeof value !==
    "boolean"
  ) {
    throw new WorkspaceRevertError(
      "WORKSPACE_REVERT_UNSAFE",
      `Workspace change history predates safe-revert existence metadata; refusing revert: ${path}`,
    );
  }

  return value;
}

export async function revertWorkspaceFile(
  cwd: string,
  events:
    readonly SessionEvent[],
  path: string,
): Promise<WorkspaceRevertResult> {
  const changes =
    deriveWorkspaceChanges(
      events,
      {
        path,
      },
    );

  if (
    changes.length ===
    0
  ) {
    throw new WorkspaceRevertError(
      "WORKSPACE_CHANGE_NOT_FOUND",
      `No Tongyu workspace changes were found for: ${path}`,
    );
  }

  /*
   * A whole-file Reject is only safe when Tongyu's recorded
   * mutations form one uninterrupted state chain.
   *
   * Example of an unsafe chain:
   *
   *   Tongyu: A -> B
   *   user:   B -> C
   *   Tongyu: C -> D
   *
   * Restoring A would erase the user's C edit, so refuse.
   */
  for (
    let index = 0;
    index < changes.length;
    index += 1
  ) {
    const current =
      changes[index];

    if (
      !current
    ) {
      throw new WorkspaceRevertError(
        "WORKSPACE_REVERT_UNSAFE",
        `Workspace change history is incomplete; refusing revert: ${path}`,
      );
    }

    requireExistenceMetadata(
      current.changeSet.beforeExists,
      path,
    );

    requireExistenceMetadata(
      current.changeSet.afterExists,
      path,
    );

    if (
      index ===
      0
    ) {
      continue;
    }

    const previous =
      changes[
        index - 1
      ];

    if (
      !previous
    ) {
      throw new WorkspaceRevertError(
        "WORKSPACE_REVERT_UNSAFE",
        `Workspace change history is incomplete; refusing revert: ${path}`,
      );
    }

    const previousAfterExists =
      requireExistenceMetadata(
        previous.changeSet.afterExists,
        path,
      );

    const currentBeforeExists =
      requireExistenceMetadata(
        current.changeSet.beforeExists,
        path,
      );

    if (
      previousAfterExists !==
        currentBeforeExists
    ) {
      throw new WorkspaceRevertError(
        "WORKSPACE_REVERT_UNSAFE",
        `Workspace change history is not contiguous; refusing revert: ${path}`,
      );
    }

    if (
      previousAfterExists &&
      previous.changeSet.afterSha256 !==
        current.changeSet.beforeSha256
    ) {
      throw new WorkspaceRevertError(
        "WORKSPACE_REVERT_UNSAFE",
        `Workspace change history contains an intervening external modification; refusing revert: ${path}`,
      );
    }
  }

  const first =
    changes[0];

  const latest =
    changes[
      changes.length - 1
    ];

  if (
    !first ||
    !latest
  ) {
    throw new WorkspaceRevertError(
      "WORKSPACE_CHANGE_NOT_FOUND",
      `No Tongyu workspace changes were found for: ${path}`,
    );
  }

  const beforeExists =
    requireExistenceMetadata(
      first.changeSet.beforeExists,
      path,
    );

  const latestAfterExists =
    requireExistenceMetadata(
      latest.changeSet.afterExists,
      path,
    );

  /*
   * Current Tongyu mutation tools all leave a regular file
   * behind. Future delete-style mutations can add their own
   * inverse semantics rather than being guessed here.
   */
  if (
    !latestAfterExists
  ) {
    throw new WorkspaceRevertError(
      "WORKSPACE_REVERT_UNSAFE",
      `Safe revert for a deleted final state is not supported yet: ${path}`,
    );
  }

  let currentFile;

  try {
    currentFile =
      await loadExistingWorkspaceTextFile(
        cwd,
        path,
        "revert",
      );
  } catch (error) {
    const message =
      error instanceof
        Error
        ? error.message
        : String(
            error,
          );

    throw new WorkspaceRevertError(
      "WORKSPACE_REVERT_UNSAFE",
      `Current workspace path is no longer safely revertible: ${path}: ${message}`,
    );
  }

  const currentSha256 =
    sha256Text(
      currentFile.content,
    );

  /*
   * This is the critical drift guard.
   *
   * Never overwrite/delete the path unless it still contains
   * exactly Tongyu's most recently recorded after-state.
   */
  if (
    currentSha256 !==
      latest.changeSet.afterSha256
  ) {
    throw new WorkspaceRevertError(
      "WORKSPACE_REVERT_UNSAFE",
      `File changed after Tongyu's recorded mutation; refusing revert: ${path}`,
    );
  }

  if (
    !beforeExists
  ) {
    await removeWorkspaceTextFile(
      currentFile,
    );

    return {
      path:
        latest.changeSet.path,

      action:
        "deleted",

      fromSha256:
        latest.changeSet.afterSha256,

      toSha256:
        null,

      bytes:
        null,
    };
  }

  let beforeContent:
    string;

  try {
    beforeContent =
      await readWorkspaceTextSnapshot(
        first.changeSet.beforeSha256,
      );
  } catch (error) {
    const message =
      error instanceof
        Error
        ? error.message
        : String(
            error,
          );

    throw new WorkspaceRevertError(
      "WORKSPACE_SNAPSHOT_UNAVAILABLE",
      `Original workspace snapshot is unavailable; refusing revert: ${path}: ${message}`,
    );
  }

  if (
    Buffer.byteLength(
      beforeContent,
      "utf8",
    ) !==
      first.changeSet.beforeBytes
  ) {
    throw new WorkspaceRevertError(
      "WORKSPACE_SNAPSHOT_UNAVAILABLE",
      `Original workspace snapshot size does not match the ChangeSet; refusing revert: ${path}`,
    );
  }

  const bytes =
    await writeWorkspaceTextFileAtomic(
      currentFile,
      beforeContent,
    );

  return {
    path:
      latest.changeSet.path,

    action:
      "restored",

    fromSha256:
      latest.changeSet.afterSha256,

    toSha256:
      first.changeSet.beforeSha256,

    bytes,
  };
}
