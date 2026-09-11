import {
  InvalidSessionIdError,
} from "./errors.js";

import {
  SessionIdSchema,
} from "./schema.js";

export function validateSessionId(
  sessionId: string,
): string {
  const result =
    SessionIdSchema.safeParse(
      sessionId,
    );

  if (!result.success) {
    throw new InvalidSessionIdError(
      sessionId,
    );
  }

  return result.data;
}
