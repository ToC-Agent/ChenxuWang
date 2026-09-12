export type ModelRole =
  | "system"
  | "user"
  | "assistant";

export interface ModelMessage {
  role: ModelRole;

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
