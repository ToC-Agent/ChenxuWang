import {
  homedir,
} from "node:os";

import {
  join,
} from "node:path";

export interface RuntimePaths {
  home: string;
  root: string;
  config: string;
  sessions: string;

  snapshots: string;
  logs: string;
  runtime: string;
}

export function getRuntimePaths(): RuntimePaths {
  const home =
    homedir();

  const root =
    join(home, ".tongyu");

  return {
    home,
    root,
    config: join(root, "config"),
    sessions: join(root, "sessions"),

    snapshots: join(root, "snapshots"),
    logs: join(root, "logs"),
    runtime: join(root, "runtime"),
  };
}
