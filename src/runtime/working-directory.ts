import {
  accessSync,
  constants as fsConstants,
  realpathSync,
  statSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

export class WorkingDirectoryError extends Error {
  constructor(message: string) {
    super(message);

    this.name =
      "WorkingDirectoryError";
  }
}

export function validateWorkingDirectory(
  inputPath: string,
): string {
  const resolvedPath =
    resolve(inputPath);

  let realPath: string;

  try {
    realPath =
      realpathSync(resolvedPath);
  } catch {
    throw new WorkingDirectoryError(
      `Working directory does not exist: ${resolvedPath}`,
    );
  }

  let stats;

  try {
    stats =
      statSync(realPath);
  } catch {
    throw new WorkingDirectoryError(
      `Unable to inspect working directory: ${realPath}`,
    );
  }

  if (!stats.isDirectory()) {
    throw new WorkingDirectoryError(
      `Working directory is not a directory: ${realPath}`,
    );
  }

  try {
    accessSync(
      realPath,
      fsConstants.R_OK |
        fsConstants.W_OK |
        fsConstants.X_OK,
    );
  } catch {
    throw new WorkingDirectoryError(
      `Working directory is not readable, writable, and accessible: ${realPath}`,
    );
  }

  return realPath;
}
