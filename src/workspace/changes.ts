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
