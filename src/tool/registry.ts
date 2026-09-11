import type {
  Tool,
} from "./types.js";

import {
  DuplicateToolError,
  ToolNotFoundError,
} from "./errors.js";

export class ToolRegistry {
  private readonly tools =
    new Map<
      string,
      Tool
    >();

  register(
    tool: Tool,
  ): void {
    if (
      this.tools.has(
        tool.name,
      )
    ) {
      throw new DuplicateToolError(
        tool.name,
      );
    }

    this.tools.set(
      tool.name,
      tool,
    );
  }

  get(
    name: string,
  ): Tool {
    const tool =
      this.tools.get(
        name,
      );

    if (!tool) {
      throw new ToolNotFoundError(
        name,
      );
    }

    return tool;
  }

  has(
    name: string,
  ): boolean {
    return this.tools.has(
      name,
    );
  }

  list(): readonly Tool[] {
    return [
      ...this.tools.values(),
    ];
  }
}
