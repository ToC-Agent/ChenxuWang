import {
  z,
} from "zod";

import {
  InvalidToolCallError,
} from "./errors.js";

import type {
  ToolCall,
} from "./types.js";

export const ToolCallSchema:
  z.ZodType<ToolCall> =
  z.object({
    id:
      z.string()
        .min(1),

    name:
      z.string()
        .min(1),

    arguments:
      z.record(
        z.string(),
        z.unknown(),
      ),
  }).strict();

export function parseToolCall(
  input: unknown,
): ToolCall {
  const parsed =
    ToolCallSchema.safeParse(
      input,
    );

  if (parsed.success) {
    return parsed.data;
  }

  const details =
    parsed.error.issues
      .map(
        (issue) => {
          const path =
            issue.path.length >
            0
              ? issue.path
                  .map(String)
                  .join(".")
              : "<root>";

          return `${path}: ${issue.message}`;
        },
      )
      .join("; ");

  throw new InvalidToolCallError(
    details,
  );
}
