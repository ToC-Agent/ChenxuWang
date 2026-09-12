import {
  filesystemReadTool,
} from "./builtins/filesystem-read.js";

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

  return registry;
}
