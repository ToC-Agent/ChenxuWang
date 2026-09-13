import {
  createHash,
} from "node:crypto";

export interface TextReplacementChange {
  sequence: number;

  startLine: number;

  oldLineCount: number;

  newLineCount: number;

  oldText: string;

  newText: string;
}

export interface TextFileChangeSet {
  path: string;

  beforeSha256: string;

  afterSha256: string;

  beforeBytes: number;

  afterBytes: number;

  changes:
    readonly TextReplacementChange[];
}

function sha256Text(
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

    beforeContent: string;

    afterContent: string;

    changes:
      readonly TextReplacementChange[];
  },
): TextFileChangeSet {
  return {
    path:
      input.path,

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
