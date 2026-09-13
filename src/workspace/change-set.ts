import {
  createHash,
} from "node:crypto";

import {
  z,
} from "zod";

export const TextReplacementChangeSchema =
  z.object({
    sequence:
      z.number()
        .int()
        .positive(),

    startLine:
      z.number()
        .int()
        .positive(),

    oldLineCount:
      z.number()
        .int()
        .nonnegative(),

    newLineCount:
      z.number()
        .int()
        .nonnegative(),

    oldText:
      z.string(),

    newText:
      z.string(),
  }).strict();

export type TextReplacementChange =
  z.infer<
    typeof TextReplacementChangeSchema
  >;

export const TextFileChangeSetSchema =
  z.object({
    path:
      z.string()
        .min(1),

    beforeExists:
      z.boolean()
        .optional(),

    beforeSha256:
      z.string()
        .regex(
          /^[0-9a-f]{64}$/,
        ),

    afterExists:
      z.boolean()
        .optional(),

    afterSha256:
      z.string()
        .regex(
          /^[0-9a-f]{64}$/,
        ),

    beforeBytes:
      z.number()
        .int()
        .nonnegative(),

    afterBytes:
      z.number()
        .int()
        .nonnegative(),

    changes:
      z.array(
        TextReplacementChangeSchema,
      ),
  }).strict();

export type TextFileChangeSet =
  z.infer<
    typeof TextFileChangeSetSchema
  >;

export function sha256Text(
  content: string,
): string {
  return createHash(
    "sha256",
  )
    .update(
      content,
      "utf8",
    )
    .digest(
      "hex",
    );
}

function countTouchedLines(
  text: string,
): number {
  if (
    text.length ===
    0
  ) {
    return 0;
  }

  let newlineCount =
    0;

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    if (
      text.charCodeAt(
        index,
      ) ===
      10
    ) {
      newlineCount +=
        1;
    }
  }

  return (
    newlineCount +
    (
      text.endsWith(
        "\n",
      )
        ? 0
        : 1
    )
  );
}

export function getTextStartLine(
  content: string,
  index: number,
): number {
  let line =
    1;

  for (
    let offset = 0;
    offset < index;
    offset += 1
  ) {
    if (
      content.charCodeAt(
        offset,
      ) ===
      10
    ) {
      line +=
        1;
    }
  }

  return line;
}

export function createTextReplacementChange(
  input: {
    sequence: number;

    startLine: number;

    oldText: string;

    newText: string;
  },
): TextReplacementChange {
  return {
    sequence:
      input.sequence,

    startLine:
      input.startLine,

    oldLineCount:
      countTouchedLines(
        input.oldText,
      ),

    newLineCount:
      countTouchedLines(
        input.newText,
      ),

    oldText:
      input.oldText,

    newText:
      input.newText,
  };
}

export function createTextFileChangeSet(
  input: {
    path: string;

    beforeExists: boolean;

    afterExists: boolean;

    beforeContent: string;

    afterContent: string;

    changes:
      readonly TextReplacementChange[];
  },
): TextFileChangeSet {
  return {
    path:
      input.path,

    beforeExists:
      input.beforeExists,

    afterExists:
      input.afterExists,

    beforeSha256:
      sha256Text(
        input.beforeContent,
      ),

    afterSha256:
      sha256Text(
        input.afterContent,
      ),

    beforeBytes:
      Buffer.byteLength(
        input.beforeContent,
        "utf8",
      ),

    afterBytes:
      Buffer.byteLength(
        input.afterContent,
        "utf8",
      ),

    changes: [
      ...input.changes,
    ],
  };
}

/**
 * Extract and validate a first-class workspace ChangeSet
 * from a generic tool result.
 *
 * Tool results remain intentionally generic. This helper
 * prevents Agent/Protocol layers from trusting an arbitrary
 * object merely because it has a "changeSet" property.
 */
export function extractTextFileChangeSet(
  result: unknown,
): TextFileChangeSet | undefined {
  if (
    typeof result !==
      "object" ||
    result ===
      null ||
    Array.isArray(
      result,
    )
  ) {
    return undefined;
  }

  const candidate =
    (
      result as
        Record<
          string,
          unknown
        >
    )["changeSet"];

  const parsed =
    TextFileChangeSetSchema.safeParse(
      candidate,
    );

  return parsed.success
    ? parsed.data
    : undefined;
}
