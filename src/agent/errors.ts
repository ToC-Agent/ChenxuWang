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

export class AgentToolDefinitionError
  extends Error {

  constructor(
    toolName: string,
    message: string,
  ) {
    super(
      `Failed to create model definition for Tongyu tool ${toolName}: ${message}`,
    );

    this.name =
      "AgentToolDefinitionError";
  }
}

export class AgentTurnInterruptedError
  extends Error {
  constructor(
    sessionId:
      string,
    requestId:
      string,
  ) {
    super(
      `Tongyu agent turn was interrupted: request=${requestId}, session=${sessionId}`,
    );

    this.name =
      "AgentTurnInterruptedError";
  }
}
