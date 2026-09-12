import {
  filesystemReadTool,
} from "./builtins/filesystem-read.js";

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
    filesystemWriteTool,
  );

  registry.register(
    shellExecTool,
  );

  return registry;
}
