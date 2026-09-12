export class InvalidSessionIdError extends Error {
  constructor(
    sessionId: string,
  ) {
    super(
      `Invalid Tongyu session id: ${sessionId}`,
    );

    this.name =
      "InvalidSessionIdError";
  }
}

export class SessionNotFoundError extends Error {
  constructor(
    sessionId: string,
  ) {
    super(
      `Tongyu session not found: ${sessionId}`,
    );

    this.name =
      "SessionNotFoundError";
  }
}

export class SessionCorruptError extends Error {
  constructor(
    sessionId: string,
    message: string,
  ) {
    super(
      `Tongyu session is corrupt: ${sessionId}: ${message}`,
    );

    this.name =
      "SessionCorruptError";
  }
}

export class SessionEventCorruptError extends Error {
  constructor(
    sessionId: string,
    lineNumber: number,
  ) {
    super(
      `Tongyu session event is corrupt: ${sessionId}, line ${lineNumber}`,
    );

    this.name =
      "SessionEventCorruptError";
  }
}

export class SessionNotActiveError extends Error {
  constructor(
    sessionId: string,
    status: string,
  ) {
    super(
      `Tongyu session is not active: ${sessionId}, status=${status}`,
    );

    this.name =
      "SessionNotActiveError";
  }
}

export class RequestIdConflictError extends Error {
  constructor(
    sessionId: string,
    requestId: string,
  ) {
    super(
      `Tongyu request id conflict: ${requestId}, session=${sessionId}`,
    );

    this.name =
      "RequestIdConflictError";
  }
}

export class ToolCallIdConflictError
  extends Error {

  constructor(
    sessionId: string,
    toolCallId: string,
  ) {
    super(
      `Tongyu tool call id conflict: ${toolCallId}, session=${sessionId}`,
    );

    this.name =
      "ToolCallIdConflictError";
  }
}

export class ToolResultConflictError
  extends Error {

  constructor(
    sessionId: string,
    toolCallId: string,
  ) {
    super(
      `Tongyu tool result conflict: ${toolCallId}, session=${sessionId}`,
    );

    this.name =
      "ToolResultConflictError";
  }
}

export class ToolResultWithoutCallError
  extends Error {

  constructor(
    sessionId: string,
    toolCallId: string,
  ) {
    super(
      `Tongyu tool result has no matching tool call: ${toolCallId}, session=${sessionId}`,
    );

    this.name =
      "ToolResultWithoutCallError";
  }
}
