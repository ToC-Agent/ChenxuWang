import {
  mkdirSync,
} from "node:fs";

import {
  getRuntimePaths,
  type RuntimePaths,
} from "./paths.js";

const RUNTIME_DIRECTORY_MODE = 0o700;

export function initializeRuntime(): RuntimePaths {
  const paths =
    getRuntimePaths();

  const directories = [
    paths.root,
    paths.config,
    paths.sessions,
    paths.logs,
    paths.runtime,
  ];

  for (const directory of directories) {
    mkdirSync(
      directory,
      {
        recursive: true,
        mode: RUNTIME_DIRECTORY_MODE,
      },
    );
  }

  return paths;
}
