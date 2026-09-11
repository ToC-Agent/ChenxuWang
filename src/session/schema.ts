import {
  z,
} from "zod";

export const SessionIdSchema =
  z.string().regex(
    /^sess-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

export const SessionStatusSchema =
  z.enum([
    "active",
    "completed",
    "interrupted",
    "error",
  ]);

export const SessionSchema =
  z.object({
    id:
      SessionIdSchema,

    cwd:
      z.string().min(1),

    status:
      SessionStatusSchema,

    createdAt:
      z.number()
        .int()
        .nonnegative(),

    updatedAt:
      z.number()
        .int()
        .nonnegative(),
  }).strict();
