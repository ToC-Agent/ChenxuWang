import {
  randomUUID,
} from "node:crypto";

import type {
  ToolPermissionDecision,
  ToolPermissionPolicy,
  ToolPermissionRequest,
} from "../tool/index.js";

export type PermissionResponseDecision =
  | "allow_once"
  | "deny";

export interface InteractivePermissionRequest {
  permissionRequestId:
    string;

  sessionId:
    string;

  requestId:
    string;

  toolCallId:
    string;

  toolName:
    string;

  permission:
    "workspace.read"
    | "workspace.write"
    | "shell.execute";

  arguments:
    Record<
      string,
      unknown
    >;
}

interface PendingPermission {
  sessionId:
    string;

  resolve(
    decision:
      ToolPermissionDecision,
  ): void;
}

export class InteractiveToolPermissionPolicy
  implements ToolPermissionPolicy {
  private readonly pending =
    new Map<
      string,
      PendingPermission
    >();

  constructor(
    private readonly emitRequest:
      (
        request:
          InteractivePermissionRequest,
      ) => void,
  ) {}

  async authorize(
    request:
      ToolPermissionRequest,
  ): Promise<
    ToolPermissionDecision
  > {
    if (
      request.tool.permission ===
      "workspace.read"
    ) {
      return {
        allowed:
          true,
      };
    }

    const permissionRequestId =
      `perm-${randomUUID()}`;

    return new Promise(
      (
        resolve,
      ) => {
        this.pending.set(
          permissionRequestId,
          {
            sessionId:
              request.context
                .sessionId,

            resolve,
          },
        );

        try {
          this.emitRequest({
            permissionRequestId,

            sessionId:
              request.context
                .sessionId,

            requestId:
              request.context
                .requestId,

            toolCallId:
              request.call.id,

            toolName:
              request.tool.name,

            permission:
              request.tool
                .permission,

            arguments:
              request.call
                .arguments,
          });
        } catch (error) {
          this.pending.delete(
            permissionRequestId,
          );

          resolve({
            allowed:
              false,

            reason:
              error instanceof Error
                ? `Failed to request permission: ${error.message}`
                : "Failed to request permission.",
          });
        }
      },
    );
  }

  respond(
    sessionId: string,
    permissionRequestId:
      string,
    decision:
      PermissionResponseDecision,
  ): boolean {
    const pending =
      this.pending.get(
        permissionRequestId,
      );

    if (
      !pending ||
      pending.sessionId !==
        sessionId
    ) {
      return false;
    }

    this.pending.delete(
      permissionRequestId,
    );

    if (
      decision ===
      "allow_once"
    ) {
      pending.resolve({
        allowed:
          true,
      });

      return true;
    }

    pending.resolve({
      allowed:
        false,

      reason:
        "Tool execution was denied by the client.",
    });

    return true;
  }

  cancelSession(
    sessionId:
      string,
    reason:
      string,
  ): number {
    let cancelled =
      0;

    for (
      const [
        permissionRequestId,
        pending,
      ]
      of this.pending
    ) {
      if (
        pending.sessionId !==
          sessionId
      ) {
        continue;
      }

      this.pending.delete(
        permissionRequestId,
      );

      pending.resolve({
        allowed:
          false,

        reason,
      });

      cancelled +=
        1;
    }

    return cancelled;
  }

  rejectAll(
    reason:
      string,
  ): void {
    for (
      const [
        permissionRequestId,
        pending,
      ]
      of this.pending
    ) {
      this.pending.delete(
        permissionRequestId,
      );

      pending.resolve({
        allowed:
          false,

        reason,
      });
    }
  }
}
