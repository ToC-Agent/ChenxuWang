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
  summarizeWorkspaceChanges,
} from "./changes.js";

export type {
  WorkspaceChangeFileSummary,
  WorkspaceChangeFilter,
  WorkspaceChangeRecord,
  WorkspaceChangeSummary,
} from "./changes.js";
