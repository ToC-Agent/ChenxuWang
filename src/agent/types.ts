export interface AgentTurnInput {
  sessionId: string;
  requestId: string;
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
