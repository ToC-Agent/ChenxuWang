import type {
  ZodType,
} from "zod";

export type ToolArguments =
  Record<
    string,
    unknown
  >;

export interface ToolCall {
  id: string;

  name: string;

  arguments:
    ToolArguments;
}

export interface ToolResult {
  toolCallId: string;

  result: unknown;

  isError?:
    boolean;
}

export type ToolPermission =
  | "workspace.read"
  | "workspace.write"
  | "shell.execute";

export type ToolErrorCode =
  | "TOOL_NOT_FOUND"
  | "TOOL_INVALID_ARGUMENTS"
  | "TOOL_PERMISSION_DENIED"
  | "TOOL_EXECUTION_ABORTED"
  | "TOOL_EXECUTION_FAILED";

export interface ToolErrorResult {
  code:
    ToolErrorCode;

  message:
    string;
}

export interface ToolExecutionContext {
  sessionId: string;

  requestId: string;

  cwd: string;

  signal?:
    AbortSignal;
}

/**
 * Result of the pre-permission preparation phase.
 *
 * data:
 *   Internal runtime-only state passed to execute().
 *
 * permissionArguments:
 *   Optional client-facing arguments used only for permission
 *   presentation. They do not replace the original durable
 *   model tool call.
 */
export interface ToolPreparation<
  Prepared = unknown,
> {
  data:
    Prepared;

  permissionArguments?:
    ToolArguments;
}

export interface Tool<
  Input = unknown,
  Output = unknown,
  Prepared = unknown,
> {
  readonly name:
    string;

  readonly description:
    string;

  readonly permission:
    ToolPermission;

  readonly inputSchema:
    ZodType<Input>;

  /**
   * Optional phase that runs after argument validation but before
   * permission authorization.
   *
   * It must not perform the requested mutation.
   */
  prepare?(
    input: Input,
    context:
      ToolExecutionContext,
  ): Promise<
    ToolPreparation<Prepared>
  >;

  execute(
    input: Input,
    context:
      ToolExecutionContext,
    prepared?:
      Prepared,
  ): Promise<Output>;
}
