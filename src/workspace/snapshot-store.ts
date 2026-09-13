import {
  lstat,
  readFile,
  writeFile,
} from "node:fs/promises";

import {
  join,
} from "node:path";

import {
  initializeRuntime,
} from "../runtime/initialize.js";

import {
  sha256Text,
} from "./change-set.js";

const SNAPSHOT_MODE =
  0o600;

const SHA256_PATTERN =
  /^[0-9a-f]{64}$/;

function hasCode(
  error: unknown,
  code: string,
): boolean {
  return (
    typeof error ===
      "object" &&
    error !==
      null &&
    "code" in error &&
    error.code ===
      code
  );
}

function snapshotPath(
  sha256: string,
): string {
  if (
    !SHA256_PATTERN.test(
      sha256,
    )
  ) {
    throw new Error(
      `Invalid workspace snapshot SHA-256: ${sha256}`,
    );
  }

  const paths =
    initializeRuntime();

  return join(
    paths.snapshots,
    sha256,
  );
}

export async function persistWorkspaceTextSnapshot(
  content: string,
  expectedSha256: string,
): Promise<string> {
  const actualSha256 =
    sha256Text(
      content,
    );

  if (
    actualSha256 !==
      expectedSha256
  ) {
    throw new Error(
      "Workspace snapshot content does not match the expected ChangeSet hash.",
    );
  }

  const path =
    snapshotPath(
      actualSha256,
    );

  try {
    await writeFile(
      path,
      content,
      {
        encoding:
          "utf8",

        flag:
          "wx",

        mode:
          SNAPSHOT_MODE,
      },
    );
  } catch (error) {
    if (
      !hasCode(
        error,
        "EEXIST",
      )
    ) {
      throw error;
    }

    /*
     * Content-addressing is only trustworthy if an existing
     * object with this hash actually contains those bytes.
     */
    const existing =
      await readWorkspaceTextSnapshot(
        actualSha256,
      );

    if (
      existing !==
        content
    ) {
      throw new Error(
        `Workspace snapshot collision or corruption detected: ${actualSha256}`,
      );
    }
  }

  return actualSha256;
}

export async function readWorkspaceTextSnapshot(
  sha256: string,
): Promise<string> {
  const path =
    snapshotPath(
      sha256,
    );

  const stats =
    await lstat(
      path,
    );

  if (
    stats.isSymbolicLink() ||
    !stats.isFile()
  ) {
    throw new Error(
      `Workspace snapshot is not a regular file: ${sha256}`,
    );
  }

  const content =
    await readFile(
      path,
      "utf8",
    );

  if (
    sha256Text(
      content,
    ) !==
    sha256
  ) {
    throw new Error(
      `Workspace snapshot failed SHA-256 verification: ${sha256}`,
    );
  }

  return content;
}
