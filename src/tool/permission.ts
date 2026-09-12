import type {
  Tool,
  ToolCall,
  ToolExecutionContext,
} from "./types.js";

export interface ToolPermissionRequest {
  tool: Tool;
  call: ToolCall;
  context:
    ToolExecutionContext;
}

export type ToolPermissionDecision =
  | {
      allowed:
        true;
    }
  | {
      allowed:
        false;

      reason:
        string;
    };

export interface ToolPermissionPolicy {
  authorize(
    request:
      ToolPermissionRequest,
  ): Promise<
    ToolPermissionDecision
  >;
}

export class DefaultToolPermissionPolicy
  implements ToolPermissionPolicy {
  async authorize(
    request:
      ToolPermissionRequest,
  ): Promise<
    ToolPermissionDecision
  > {
    if (
      request.tool.permission ===
      "workspace.read"
    ) {
      return {
        allowed:
          true,
      };
    }

    return {
      allowed:
        false,

      reason:
        `Tongyu tool requires explicit permission: ${request.tool.name} (${request.tool.permission})`,
    };
  }
}
