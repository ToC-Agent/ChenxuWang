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

export type ToolErrorCode =
  | "TOOL_NOT_FOUND"
  | "TOOL_INVALID_ARGUMENTS"
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
}

export interface Tool<
  Input = unknown,
  Output = unknown,
> {
  readonly name:
    string;

  readonly description:
    string;

  readonly inputSchema:
    ZodType<Input>;

  execute(
    input: Input,
    context:
      ToolExecutionContext,
  ): Promise<Output>;
}
