import {
  ToolNotFoundError,
} from "./errors.js";

import {
  ToolRegistry,
} from "./registry.js";

import type {
  ToolCall,
  ToolErrorCode,
  ToolErrorResult,
  ToolExecutionContext,
  ToolResult,
} from "./types.js";

function createToolErrorResult(
  toolCallId: string,
  code: ToolErrorCode,
  message: string,
): ToolResult {
  const result:
    ToolErrorResult = {
      code,
      message,
    };

  return {
    toolCallId,
    result,
    isError:
      true,
  };
}

function formatUnknownError(
  error: unknown,
): string {
  if (
    error instanceof
    Error
  ) {
    return error.message;
  }

  return String(
    error,
  );
}

export class ToolExecutor {
  constructor(
    private readonly registry:
      ToolRegistry,
  ) {}

  async execute(
    call: ToolCall,
    context:
      ToolExecutionContext,
  ): Promise<ToolResult> {
    let tool;

    try {
      tool =
        this.registry.get(
          call.name,
        );
    } catch (error) {
      if (
        error instanceof
        ToolNotFoundError
      ) {
        return createToolErrorResult(
          call.id,
          "TOOL_NOT_FOUND",
          error.message,
        );
      }

      throw error;
    }

    const parsed =
      tool.inputSchema.safeParse(
        call.arguments,
      );

    if (!parsed.success) {
      const details =
        parsed.error.issues
          .map(
            (issue) => {
              const path =
                issue.path.length >
                0
                  ? issue.path
                      .map(String)
                      .join(".")
                  : "<root>";

              return `${path}: ${issue.message}`;
            },
          )
          .join("; ");

      return createToolErrorResult(
        call.id,
        "TOOL_INVALID_ARGUMENTS",
        `Invalid arguments for Tongyu tool ${call.name}: ${details}`,
      );
    }

    try {
      const result =
        await tool.execute(
          parsed.data,
          context,
        );

      return {
        toolCallId:
          call.id,

        result,

        isError:
          false,
      };
    } catch (error) {
      return createToolErrorResult(
        call.id,
        "TOOL_EXECUTION_FAILED",
        `Tongyu tool execution failed: ${call.name}: ${formatUnknownError(error)}`,
      );
    }
  }
}
