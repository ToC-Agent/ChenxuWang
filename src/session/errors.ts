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
