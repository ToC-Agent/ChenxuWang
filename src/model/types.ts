export type ModelRole =
  | "system"
  | "user"
  | "assistant"
  | "tool";

export interface ModelSystemMessage {
  role: "system";
  content: string;
}

export interface ModelUserMessage {
  role: "user";
  content: string;
}

export interface ModelAssistantTextMessage {
  role: "assistant";
  content: string;
}

export type ModelJsonSchema =
  Record<
    string,
    unknown
  >;

export interface ModelToolDefinition {
  name: string;
  description: string;
  inputSchema:
    ModelJsonSchema;
}

export interface ModelToolCall {
  id: string;
  name: string;
  arguments:
    Record<
      string,
      unknown
    >;
}

export interface ModelAssistantToolCallMessage {
  role: "assistant";
  toolCalls:
    readonly ModelToolCall[];
}

export interface ModelToolResultMessage {
  role: "tool";
  toolCallId: string;
  result: unknown;
  isError: boolean;
}

export type ModelMessage =
  | ModelSystemMessage
  | ModelUserMessage
  | ModelAssistantTextMessage
  | ModelAssistantToolCallMessage
  | ModelToolResultMessage;

export interface ModelRequest {
  messages:
    readonly ModelMessage[];
  tools?:
    readonly ModelToolDefinition[];
}

export type ModelFinishReason =
  | "stop"
  | "length"
  | "tool_call";

export type ModelStreamEvent =
  | {
      type:
        "text.delta";
      text:
        string;
    }
  | {
      type:
        "tool.call";
      call:
        ModelToolCall;
    }
  | {
      type:
        "response.completed";
      finishReason:
        ModelFinishReason;
    };
