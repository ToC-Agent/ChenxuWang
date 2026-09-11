import {
  ClientMessageSchema,
  type ClientMessage,
} from "./client-message.js";

import {
  ServerEventSchema,
  type ServerEvent,
} from "./server-event.js";

export type ProtocolDecodeErrorCode =
  | "EMPTY_MESSAGE"
  | "INVALID_JSON"
  | "INVALID_MESSAGE";

export class ProtocolDecodeError extends Error {
  readonly code: ProtocolDecodeErrorCode;

  constructor(
    code: ProtocolDecodeErrorCode,
    message: string,
  ) {
    super(message);

    this.name =
      "ProtocolDecodeError";

    this.code =
      code;
  }
}

export function decodeClientMessage(
  line: string,
): ClientMessage {
  const trimmedLine =
    line.trim();

  if (trimmedLine.length === 0) {
    throw new ProtocolDecodeError(
      "EMPTY_MESSAGE",
      "Protocol message is empty.",
    );
  }

  let input: unknown;

  try {
    input =
      JSON.parse(trimmedLine);
  } catch {
    throw new ProtocolDecodeError(
      "INVALID_JSON",
      "Protocol message is not valid JSON.",
    );
  }

  const result =
    ClientMessageSchema.safeParse(
      input,
    );

  if (!result.success) {
    throw new ProtocolDecodeError(
      "INVALID_MESSAGE",
      "Protocol message does not match the Tongyu client message schema.",
    );
  }

  return result.data;
}

export function encodeServerEvent(
  event: ServerEvent,
): string {
  const validatedEvent =
    ServerEventSchema.parse(
      event,
    );

  return (
    JSON.stringify(
      validatedEvent,
    ) + "\n"
  );
}
