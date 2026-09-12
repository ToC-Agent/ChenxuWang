import {
  z,
} from "zod";

import {
  SessionEventSchema,
} from "../session/events.js";

import {
  TONGYU_PROTOCOL_VERSION,
} from "./constants.js";

const EventIdSchema =
  z.string().min(1);

const RequestIdSchema =
  z.string().min(1);

const SessionIdSchema =
  z.string().min(1);

const TimestampSchema =
  z.number()
    .int()
    .nonnegative();

const ControlInitializedEventSchema =
  z.object({
    id:
      EventIdSchema,

    type:
      z.literal(
        "control.initialized",
      ),

    timestamp:
      TimestampSchema,

    requestId:
      RequestIdSchema,

    protocolVersion:
      z.literal(
        TONGYU_PROTOCOL_VERSION,
      ),

    runtimeVersion:
      z.string().min(1),

    capabilities:
      z.object({
        sessions:
          z.boolean(),

        streaming:
          z.boolean(),

        interrupt:
          z.boolean(),

        tools:
          z.boolean(),
      }).strict(),
  }).strict();

const SessionCreatedEventSchema =
  z.object({
    id:
      EventIdSchema,

    type:
      z.literal(
        "session.created",
      ),

    timestamp:
      TimestampSchema,

    requestId:
      RequestIdSchema,

    sessionId:
      SessionIdSchema,

    cwd:
      z.string().min(1),
  }).strict();

const SessionResumedEventSchema =
  z.object({
    id:
      EventIdSchema,

    type:
      z.literal(
        "session.resumed",
      ),

    timestamp:
      TimestampSchema,

    requestId:
      RequestIdSchema,

    sessionId:
      SessionIdSchema,

    cwd:
      z.string().min(1),

    status:
      z.enum([
        "active",
        "completed",
        "interrupted",
        "error",
      ]),

    createdAt:
      TimestampSchema,

    updatedAt:
      TimestampSchema,

    eventCount:
      z.number()
        .int()
        .nonnegative(),
  }).strict();

const SessionHistoryEventSchema =
  z.object({
    id:
      EventIdSchema,

    type:
      z.literal(
        "session.history.event",
      ),

    timestamp:
      TimestampSchema,

    requestId:
      RequestIdSchema,

    sessionId:
      SessionIdSchema,

    event:
      SessionEventSchema,
  }).strict();

const SessionHistoryEndEventSchema =
  z.object({
    id:
      EventIdSchema,

    type:
      z.literal(
        "session.history.end",
      ),

    timestamp:
      TimestampSchema,

    requestId:
      RequestIdSchema,

    sessionId:
      SessionIdSchema,

    eventCount:
      z.number()
        .int()
        .nonnegative(),
  }).strict();

const UserMessageRecordedEventSchema =
  z.object({
    id:
      EventIdSchema,

    type:
      z.literal(
        "user.message.recorded",
      ),

    timestamp:
      TimestampSchema,

    requestId:
      RequestIdSchema,

    sessionId:
      SessionIdSchema,

    sessionEventId:
      z.string().min(1),
  }).strict();

const AssistantDeltaEventSchema =
  z.object({
    id:
      EventIdSchema,

    type:
      z.literal(
        "assistant.delta",
      ),

    timestamp:
      TimestampSchema,

    requestId:
      RequestIdSchema,

    sessionId:
      SessionIdSchema,

    text:
      z.string(),
  }).strict();

const AssistantMessageEventSchema =
  z.object({
    id:
      EventIdSchema,

    type:
      z.literal(
        "assistant.message",
      ),

    timestamp:
      TimestampSchema,

    requestId:
      RequestIdSchema,

    sessionId:
      SessionIdSchema,

    content:
      z.string(),
  }).strict();

const TurnStatusEventSchema =
  z.object({
    id:
      z.string()
        .min(1),

    type:
      z.literal(
        "turn.status",
      ),

    timestamp:
      z.number()
        .int()
        .nonnegative(),

    requestId:
      z.string()
        .min(1),

    sessionId:
      SessionIdSchema,

    status:
      z.enum([
        "running",
        "waiting_permission",
        "executing_tool",
        "interrupted",
        "completed",
        "failed",
      ]),
  }).strict();


const ControlInterruptedEventSchema =
  z.object({
    id:
      z.string()
        .min(1),

    type:
      z.literal(
        "control.interrupted",
      ),

    timestamp:
      z.number()
        .int()
        .nonnegative(),

    requestId:
      z.string()
        .min(1),

    sessionId:
      SessionIdSchema,

    interruptedRequestId:
      z.string()
        .min(1),
  }).strict();


const PermissionRequestEventSchema =
  z.object({
    id:
      z.string()
        .min(1),

    type:
      z.literal(
        "permission.request",
      ),

    timestamp:
      z.number()
        .int()
        .nonnegative(),

    requestId:
      z.string()
        .min(1),

    sessionId:
      SessionIdSchema,

    permissionRequestId:
      z.string()
        .min(1),

    toolCallId:
      z.string()
        .min(1),

    toolName:
      z.string()
        .min(1),

    permission:
      z.enum([
        "workspace.read",
        "workspace.write",
        "shell.execute",
      ]),

    arguments:
      z.record(
        z.string(),
        z.unknown(),
      ),
  }).strict();


const ToolCallEventSchema =
  z.object({
    id:
      EventIdSchema,

    type:
      z.literal(
        "tool.call",
      ),

    timestamp:
      TimestampSchema,

    requestId:
      RequestIdSchema,

    sessionId:
      SessionIdSchema,

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
    id:
      EventIdSchema,

    type:
      z.literal(
        "tool.result",
      ),

    timestamp:
      TimestampSchema,

    requestId:
      RequestIdSchema,

    sessionId:
      SessionIdSchema,

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
    id:
      EventIdSchema,

    type:
      z.literal(
        "runtime.error",
      ),

    timestamp:
      TimestampSchema,

    requestId:
      RequestIdSchema
        .optional(),

    sessionId:
      SessionIdSchema
        .optional(),

    code:
      z.string().min(1),

    message:
      z.string().min(1),
  }).strict();

const SessionEndEventSchema =
  z.object({
    id:
      EventIdSchema,

    type:
      z.literal(
        "session.end",
      ),

    timestamp:
      TimestampSchema,

    requestId:
      RequestIdSchema,

    sessionId:
      SessionIdSchema,

    reason:
      z.enum([
        "completed",
        "interrupted",
        "error",
      ]),
  }).strict();

export const ServerEventSchema =
  z.discriminatedUnion(
    "type",
    [
      ControlInitializedEventSchema,
      SessionCreatedEventSchema,
      SessionResumedEventSchema,
      SessionHistoryEventSchema,
      SessionHistoryEndEventSchema,
      UserMessageRecordedEventSchema,
      AssistantDeltaEventSchema,
      AssistantMessageEventSchema,
      TurnStatusEventSchema,
      ControlInterruptedEventSchema,
      PermissionRequestEventSchema,
      ToolCallEventSchema,
      ToolResultEventSchema,
      RuntimeErrorEventSchema,
      SessionEndEventSchema,
    ],
  );

export type ServerEvent =
  z.infer<
    typeof ServerEventSchema
  >;

export function parseServerEvent(
  input: unknown,
): ServerEvent {
  return ServerEventSchema.parse(
    input,
  );
}
