export {
  TextFileChangeSetSchema,
  TextReplacementChangeSchema,
  createTextFileChangeSet,
  createTextReplacementChange,
  extractTextFileChangeSet,
  getTextStartLine,
} from "./change-set.js";

export type {
  TextFileChangeSet,
  TextReplacementChange,
} from "./change-set.js";

export {
  deriveWorkspaceChanges,
} from "./changes.js";

export type {
  WorkspaceChangeFilter,
  WorkspaceChangeRecord,
} from "./changes.js";
