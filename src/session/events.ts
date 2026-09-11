import {
  randomUUID,
} from "node:crypto";

import {
  z,
} from "zod";

import {
  SessionIdSchema,
} from "./schema.js";

const EventIdSchema =
  z.string().min(1);

const RequestIdSchema =
  z.string().min(1);

const TimestampSchema =
  z.number()
    .int()
    .nonnegative();

const BaseEventFields = {
  id:
    EventIdSchema,

  timestamp:
    TimestampSchema,

  sessionId:
    SessionIdSchema,
};

const UserMessageEventSchema =
  z.object({
    ...BaseEventFields,

    type:
      z.literal(
        "user.message",
      ),

    requestId:
      RequestIdSchema,

    content:
      z.string().min(1),
  }).strict();

const AssistantMessageEventSchema =
  z.object({
    ...BaseEventFields,

    type:
      z.literal(
        "assistant.message",
      ),

    requestId:
      RequestIdSchema,

    content:
      z.string(),
  }).strict();

const ToolCallEventSchema =
  z.object({
    ...BaseEventFields,

    type:
      z.literal(
        "tool.call",
      ),

    requestId:
      RequestIdSchema,

    toolCallId:
      z.string().min(1),

    name:
      z.string().min(1),

    arguments:
      z.record(
        z.string(),
        z.unknown(),
      ),
  }).strict();

const ToolResultEventSchema =
  z.object({
    ...BaseEventFields,

    type:
      z.literal(
        "tool.result",
      ),

    requestId:
      RequestIdSchema,

    toolCallId:
      z.string().min(1),

    result:
      z.unknown(),

    isError:
      z.boolean()
        .optional(),
  }).strict();

const RuntimeErrorEventSchema =
  z.object({
    ...BaseEventFields,

    type:
      z.literal(
        "runtime.error",
      ),

    requestId:
      RequestIdSchema
        .optional(),

    code:
      z.string().min(1),

    message:
      z.string().min(1),
  }).strict();

export const SessionEventSchema =
  z.discriminatedUnion(
    "type",
    [
      UserMessageEventSchema,
      AssistantMessageEventSchema,
      ToolCallEventSchema,
      ToolResultEventSchema,
      RuntimeErrorEventSchema,
    ],
  );

export type SessionEvent =
  z.infer<
    typeof SessionEventSchema
  >;

export function createSessionEventId(): string {
  return `sevt-${randomUUID()}`;
}
