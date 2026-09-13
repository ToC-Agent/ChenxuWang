import {
  lstatSync,
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

export const WORKSPACE_INSTRUCTIONS_FILENAME =
  "TONGYU.md";

const MAX_WORKSPACE_INSTRUCTIONS_BYTES =
  64 * 1024;

/**
 * Load project-level Tongyu instructions from the workspace root.
 *
 * This is runtime configuration rather than a model tool call.
 * Symlinks are rejected so project instructions cannot silently
 * escape the current workspace.
 */
export function loadWorkspaceInstructions(
  cwd:
    string,
): string | undefined {
  const instructionsPath =
    resolve(
      cwd,
      WORKSPACE_INSTRUCTIONS_FILENAME,
    );

  let stats;

  try {
    stats =
      lstatSync(
        instructionsPath,
      );
  } catch (error) {
    if (
      (
        error as
          NodeJS.ErrnoException
      ).code ===
      "ENOENT"
    ) {
      return undefined;
    }

    throw error;
  }

  if (
    stats.isSymbolicLink()
  ) {
    throw new Error(
      `${WORKSPACE_INSTRUCTIONS_FILENAME} must not be a symbolic link`,
    );
  }

  if (
    !stats.isFile()
  ) {
    throw new Error(
      `${WORKSPACE_INSTRUCTIONS_FILENAME} must be a regular file`,
    );
  }

  if (
    stats.size >
    MAX_WORKSPACE_INSTRUCTIONS_BYTES
  ) {
    throw new Error(
      `${WORKSPACE_INSTRUCTIONS_FILENAME} exceeds the 64 KiB limit`,
    );
  }

  const content =
    readFileSync(
      instructionsPath,
      "utf8",
    ).trim();

  return content.length > 0
    ? content
    : undefined;
}
