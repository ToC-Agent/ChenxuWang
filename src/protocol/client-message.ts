import {
  SessionIdSchema,
} from "../session/schema.js";

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

const SessionCloseMessageSchema =
  z.object({
    id:
      z.string()
        .min(1),

    type:
      z.literal(
        "session.close",
      ),

    sessionId:
      SessionIdSchema,
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

const PermissionResponseMessageSchema =
  z.object({
    id:
      z.string()
        .min(1),

    type:
      z.literal(
        "permission.response",
      ),

    sessionId:
      SessionIdSchema,

    permissionRequestId:
      z.string()
        .min(1),

    decision:
      z.enum([
        "allow_once",
        "deny",
      ]),
  }).strict();


const SessionListMessageSchema =
  z.object({
    id:
      z.string().min(1),

    type:
      z.literal(
        "session.list",
      ),
  }).strict();

const WorkspaceChangesListMessageSchema =
  z.object({
    id:
      MessageIdSchema,

    type:
      z.literal(
        "workspace.changes.list",
      ),

    sessionId:
      SessionIdSchema,

    sourceRequestId:
      MessageIdSchema
        .optional(),

    path:
      z.string()
        .min(1)
        .optional(),
  }).strict();

export const ClientMessageSchema =
  z.discriminatedUnion(
    "type",
    [
      ControlInitializeMessageSchema,
      SessionCreateMessageSchema,
      SessionResumeMessageSchema,
      SessionListMessageSchema,
      WorkspaceChangesListMessageSchema,
      SessionCloseMessageSchema,
      UserMessageSchema,
      PermissionResponseMessageSchema,
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
