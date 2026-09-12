export interface AgentTurnInput {
  sessionId:
    string;

  requestId:
    string;

  signal?:
    AbortSignal;
}

export type AgentTurnEvent =
  | {
      type:
        "assistant.delta";

      sessionId:
        string;

      requestId:
        string;

      text:
        string;
    }
  | {
      type:
        "tool.call";

      sessionId:
        string;

      requestId:
        string;

      sessionEventId:
        string;

      toolCallId:
        string;

      name:
        string;

      arguments:
        Record<
          string,
          unknown
        >;

      replayed:
        boolean;
    }
  | {
      type:
        "tool.result";

      sessionId:
        string;

      requestId:
        string;

      sessionEventId:
        string;

      toolCallId:
        string;

      result:
        unknown;

      isError:
        boolean;

      replayed:
        boolean;
    }
  | {
      type:
        "assistant.message";

      sessionId:
        string;

      requestId:
        string;

      sessionEventId:
        string;

      content:
        string;

      replayed:
        boolean;
    };
