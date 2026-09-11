import {
  z,
} from "zod";

import {
  TONGYU_PROTOCOL_VERSION,
} from "./constants.js";

const MessageIdSchema =
  z.string().min(1);

const ClientInfoSchema =
  z.object({
    name:
      z.string().min(1),

    version:
      z.string().min(1),
  }).strict();

const ControlInitializeMessageSchema =
  z.object({
    id:
      MessageIdSchema,

    type:
      z.literal(
        "control.initialize",
      ),

    protocolVersion:
      z.literal(
        TONGYU_PROTOCOL_VERSION,
      ),

    client:
      ClientInfoSchema,
  }).strict();

const SessionCreateMessageSchema =
  z.object({
    id:
      MessageIdSchema,

    type:
      z.literal(
        "session.create",
      ),

    cwd:
      z.string()
        .min(1)
        .optional(),
  }).strict();

const SessionResumeMessageSchema =
  z.object({
    id:
      MessageIdSchema,

    type:
      z.literal(
        "session.resume",
      ),

    sessionId:
      z.string().min(1),
  }).strict();

const UserMessageSchema =
  z.object({
    id:
      MessageIdSchema,

    type:
      z.literal(
        "user.message",
      ),

    sessionId:
      z.string().min(1),

    content:
      z.string().min(1),
  }).strict();

const ControlInterruptMessageSchema =
  z.object({
    id:
      MessageIdSchema,

    type:
      z.literal(
        "control.interrupt",
      ),

    sessionId:
      z.string().min(1),
  }).strict();

export const ClientMessageSchema =
  z.discriminatedUnion(
    "type",
    [
      ControlInitializeMessageSchema,
      SessionCreateMessageSchema,
      SessionResumeMessageSchema,
      UserMessageSchema,
      ControlInterruptMessageSchema,
    ],
  );

export type ClientMessage =
  z.infer<
    typeof ClientMessageSchema
  >;

export function parseClientMessage(
  input: unknown,
): ClientMessage {
  return ClientMessageSchema.parse(
    input,
  );
}
