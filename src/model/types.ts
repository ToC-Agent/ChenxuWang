export type ModelRole =
  | "system"
  | "user"
  | "assistant";

export interface ModelMessage {
  role: ModelRole;
  content: string;
}

export interface ModelRequest {
  messages: readonly ModelMessage[];
}

export type ModelFinishReason =
  | "stop"
  | "length"
  | "tool_call";

export type ModelStreamEvent =
  | {
      type: "text.delta";
      text: string;
    }
  | {
      type: "response.completed";
      finishReason: ModelFinishReason;
    };
