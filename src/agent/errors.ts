export class AgentTurnInputError extends Error {
  constructor(
    sessionId: string,
    requestId: string,
    message: string,
  ) {
    super(
      `Invalid Tongyu agent turn: session=${sessionId}, request=${requestId}: ${message}`,
    );

    this.name =
      "AgentTurnInputError";
  }
}

export class AgentModelStreamError extends Error {
  constructor(
    message: string,
  ) {
    super(
      `Tongyu model stream error: ${message}`,
    );

    this.name =
      "AgentModelStreamError";
  }
}
