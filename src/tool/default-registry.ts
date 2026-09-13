import {
  filesystemReadTool,
} from "./builtins/filesystem-read.js";

import {
  filesystemEditTool,
} from "./builtins/filesystem-edit.js";

import {
  filesystemPatchTool,
} from "./builtins/filesystem-patch.js";

import {
  filesystemWriteTool,
} from "./builtins/filesystem-write.js";

import {
  shellExecTool,
} from "./builtins/shell-exec.js";

import {
  ToolRegistry,
} from "./registry.js";

export function createDefaultToolRegistry():
  ToolRegistry {
  const registry =
    new ToolRegistry();

  registry.register(
    filesystemReadTool,
  );

  registry.register(
    filesystemEditTool,
  );

  registry.register(
    filesystemPatchTool,
  );

  registry.register(
    filesystemWriteTool,
  );

  registry.register(
    shellExecTool,
  );

  return registry;
}
