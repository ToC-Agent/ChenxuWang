import type {
  SessionEvent,
} from "../session/index.js";

import {
  extractTextFileChangeSet,
  type TextFileChangeSet,
} from "./change-set.js";

export interface WorkspaceChangeRecord {
  sourceRequestId: string;

  sessionEventId: string;

  toolCallId: string;

  sourceToolName: string;

  changeSet:
    TextFileChangeSet;
}

export interface WorkspaceChangeFilter {
  sourceRequestId?:
    string;

  path?:
    string;
}

export type WorkspaceReviewState =
  | "pending"
  | "accepted"
  | "reverted";

export interface WorkspaceChangeFileSummary {
  path: string;

  reviewState:
    WorkspaceReviewState;

  /*
   * Number of successful workspace mutation events
   * affecting this file.
   */
  mutationCount: number;

  /*
   * Sum of TextReplacementChange entries across all
   * mutations affecting this file.
   */
  replacementCount: number;

  /*
   * State before the first mutation visible through
   * the selected filter.
   */
  firstBeforeSha256:
    string;

  firstBeforeBytes:
    number;

  /*
   * State after the latest mutation visible through
   * the selected filter.
   */
  latestAfterSha256:
    string;

  latestAfterBytes:
    number;

  latestSessionEventId:
    string;

  latestSourceRequestId:
    string;

  latestSourceToolName:
    string;
}

export interface WorkspaceChangeSummary {
  fileCount: number;

  mutationCount: number;

  replacementCount: number;

  files:
    readonly WorkspaceChangeFileSummary[];
}

function createToolCallKey(
  requestId: string,
  toolCallId: string,
): string {
  return `${requestId}\u0000${toolCallId}`;
}

export function deriveWorkspaceChanges(
  events:
    readonly SessionEvent[],
  filter:
    WorkspaceChangeFilter = {},
): WorkspaceChangeRecord[] {
  const toolCalls =
    new Map<
      string,
      Extract<
        SessionEvent,
        {
          type: "tool.call";
        }
      >
    >();

  for (
    const event of events
  ) {
    if (
      event.type !==
      "tool.call"
    ) {
      continue;
    }

    toolCalls.set(
      createToolCallKey(
        event.requestId,
        event.toolCallId,
      ),
      event,
    );
  }

  const changes:
    WorkspaceChangeRecord[] =
      [];

  for (
    const event of events
  ) {
    if (
      event.type !==
        "tool.result" ||
      (
        event.isError ??
        false
      )
    ) {
      continue;
    }

    if (
      filter.sourceRequestId !==
        undefined &&
      event.requestId !==
        filter.sourceRequestId
    ) {
      continue;
    }

    const changeSet =
      extractTextFileChangeSet(
        event.result,
      );

    if (
      !changeSet
    ) {
      continue;
    }

    if (
      filter.path !==
        undefined &&
      changeSet.path !==
        filter.path
    ) {
      continue;
    }

    const sourceToolCall =
      toolCalls.get(
        createToolCallKey(
          event.requestId,
          event.toolCallId,
        ),
      );

    /*
     * A valid durable tool.result should always have the
     * corresponding tool.call. Fail closed for old/corrupt
     * history instead of inventing provenance.
     */
    if (
      !sourceToolCall
    ) {
      continue;
    }

    changes.push({
      sourceRequestId:
        event.requestId,

      sessionEventId:
        event.id,

      toolCallId:
        event.toolCallId,

      sourceToolName:
        sourceToolCall.name,

      changeSet,
    });
  }

  return changes;
}

export function summarizeWorkspaceChanges(
  events:
    readonly SessionEvent[],
  filter:
    WorkspaceChangeFilter = {},
): WorkspaceChangeSummary {
  const changes =
    deriveWorkspaceChanges(
      events,
      filter,
    );

  const filesByPath =
    new Map<
      string,
      WorkspaceChangeFileSummary
    >();

  let replacementCount =
    0;

  for (
    const change of changes
  ) {
    const {
      changeSet,
    } =
      change;

    const currentReplacementCount =
      changeSet.changes.length;

    replacementCount +=
      currentReplacementCount;

    const existing =
      filesByPath.get(
        changeSet.path,
      );

    if (
      existing
    ) {
      existing.mutationCount +=
        1;

      existing.replacementCount +=
        currentReplacementCount;

      existing.latestAfterSha256 =
        changeSet.afterSha256;

      existing.latestAfterBytes =
        changeSet.afterBytes;

      existing.latestSessionEventId =
        change.sessionEventId;

      existing.latestSourceRequestId =
        change.sourceRequestId;

      existing.latestSourceToolName =
        change.sourceToolName;

      /*
       * Any newer mutation invalidates review of the
       * previous version until a matching review event
       * is encountered below.
       */
      existing.reviewState =
        "pending";

      continue;
    }

    filesByPath.set(
      changeSet.path,
      {
        path:
          changeSet.path,

        reviewState:
          "pending",

        mutationCount:
          1,

        replacementCount:
          currentReplacementCount,

        firstBeforeSha256:
          changeSet.beforeSha256,

        firstBeforeBytes:
          changeSet.beforeBytes,

        latestAfterSha256:
          changeSet.afterSha256,

        latestAfterBytes:
          changeSet.afterBytes,

        latestSessionEventId:
          change.sessionEventId,

        latestSourceRequestId:
          change.sourceRequestId,

        latestSourceToolName:
          change.sourceToolName,
      },
    );
  }

  /*
   * A review belongs to an exact ChangeSet version.
   *
   * If the same path receives another mutation later,
   * latestSessionEventId/latestAfterSha256 change and the
   * old review no longer matches, so the file naturally
   * becomes pending again.
   */
  for (
    const event of events
  ) {
    if (
      event.type !==
        "workspace.review"
    ) {
      continue;
    }

    const file =
      filesByPath.get(
        event.path,
      );

    if (
      !file
    ) {
      continue;
    }

    if (
      event.reviewedSessionEventId !==
        file.latestSessionEventId ||
      event.reviewedAfterSha256 !==
        file.latestAfterSha256
    ) {
      continue;
    }

    file.reviewState =
      event.decision;
  }

  const files =
    [
      ...filesByPath.values(),
    ];

  return {
    fileCount:
      files.length,

    mutationCount:
      changes.length,

    replacementCount,

    files,
  };
}
