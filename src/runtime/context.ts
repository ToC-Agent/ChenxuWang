import {
  initializeRuntime,
} from "./initialize.js";

import type {
  RuntimePaths,
} from "./paths.js";

import {
  validateWorkingDirectory,
} from "./working-directory.js";

export interface RuntimeContext {
  cwd: string;
  shell: string | null;
  platform: NodeJS.Platform;
  architecture: string;
  processId: number;
  nodeVersion: string;
  paths: RuntimePaths;
}

export interface CreateRuntimeContextOptions {
  cwd?: string;
}

export function createRuntimeContext(
  options: CreateRuntimeContextOptions = {},
): RuntimeContext {
  const paths =
    initializeRuntime();

  const cwd =
    validateWorkingDirectory(
      options.cwd ??
        process.cwd(),
    );

  return {
    cwd,
    shell:
      process.env.SHELL ??
      null,
    platform:
      process.platform,
    architecture:
      process.arch,
    processId:
      process.pid,
    nodeVersion:
      process.version,
    paths,
  };
}
