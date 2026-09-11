export type SessionStatus =
  | "active"
  | "completed"
  | "interrupted"
  | "error";

export interface Session {
  id: string;
  cwd: string;
  status: SessionStatus;
  createdAt: number;
  updatedAt: number;
}

export interface CreateSessionOptions {
  cwd?: string;
}
