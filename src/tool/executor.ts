import {
  ToolNotFoundError,
} from "./errors.js";

import {
  DefaultToolPermissionPolicy,
  type ToolPermissionPolicy,
} from "./permission.js";

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

function errorMessage(
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

function createErrorResult(
  call: ToolCall,
  code: ToolErrorCode,
  message: string,
): ToolResult {
  const result:
    ToolErrorResult = {
      code,
      message,
    };

  return {
    toolCallId:
      call.id,

    result,

    isError:
      true,
  };
}

function createAbortedResult(
  call: ToolCall,
): ToolResult {
  return createErrorResult(
    call,
    "TOOL_EXECUTION_ABORTED",
    `Tongyu tool execution was aborted: ${call.name}`,
  );
}

export class ToolExecutor {
  constructor(
    private readonly registry:
      ToolRegistry,

    private readonly permissionPolicy:
      ToolPermissionPolicy =
        new DefaultToolPermissionPolicy(),
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
        return createErrorResult(
          call,
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
      const issues =
        parsed.error.issues
          .map(
            (issue) => {
              const path =
                issue.path.length >
                0
                  ? issue.path
                      .map(
                        String,
                      )
                      .join(
                        ".",
                      )
                  : "<root>";

              return `${path}: ${issue.message}`;
            },
          )
          .join(
            "; ",
          );

      return createErrorResult(
        call,
        "TOOL_INVALID_ARGUMENTS",
        `Invalid arguments for Tongyu tool ${call.name}: ${issues}`,
      );
    }

    if (
      context.signal?.aborted
    ) {
      return createAbortedResult(
        call,
      );
    }

    /*
     * --------------------------------------------------
     * Preparation phase
     * --------------------------------------------------
     *
     * A tool may inspect the current state and build a
     * mutation plan before the user grants permission.
     *
     * prepare() MUST NOT perform the requested mutation.
     */
    let preparedData:
      unknown;

    let permissionCall:
      ToolCall =
        call;

    if (
      tool.prepare
    ) {
      try {
        const preparation =
          await tool.prepare(
            parsed.data,
            context,
          );

        preparedData =
          preparation.data;

        if (
          preparation
            .permissionArguments
        ) {
          /*
           * Only the authorization request sees these enriched
           * arguments. The original ToolCall remains untouched.
           */
          permissionCall = {
            ...call,

            arguments:
              preparation
                .permissionArguments,
          };
        }
      } catch (error) {
        if (
          context.signal?.aborted
        ) {
          return createAbortedResult(
            call,
          );
        }

        return createErrorResult(
          call,
          "TOOL_EXECUTION_FAILED",
          `Tongyu tool preparation failed: ${call.name}: ${errorMessage(error)}`,
        );
      }
    }

    if (
      context.signal?.aborted
    ) {
      return createAbortedResult(
        call,
      );
    }

    const permissionDecision =
      await this.permissionPolicy
        .authorize({
          tool,
          call:
            permissionCall,
          context,
        });

    /*
     * control.interrupt may have happened while
     * authorize() was waiting for permission.response.
     */
    if (
      context.signal?.aborted
    ) {
      return createAbortedResult(
        call,
      );
    }

    if (
      !permissionDecision.allowed
    ) {
      return createErrorResult(
        call,
        "TOOL_PERMISSION_DENIED",
        permissionDecision.reason,
      );
    }

    try {
      if (
        context.signal?.aborted
      ) {
        return createAbortedResult(
          call,
        );
      }

      const result =
        await tool.execute(
          parsed.data,
          context,
          preparedData,
        );

      if (
        context.signal?.aborted
      ) {
        return createAbortedResult(
          call,
        );
      }

      return {
        toolCallId:
          call.id,

        result,

        isError:
          false,
      };
    } catch (error) {
      if (
        context.signal?.aborted
      ) {
        return createAbortedResult(
          call,
        );
      }

      return createErrorResult(
        call,
        "TOOL_EXECUTION_FAILED",
        `Tongyu tool execution failed: ${call.name}: ${errorMessage(error)}`,
      );
    }
  }
}
