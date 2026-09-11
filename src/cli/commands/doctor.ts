import {
  accessSync,
  constants as fsConstants,
  existsSync,
} from "node:fs";

import {
  homedir,
} from "node:os";

import {
  spawnSync,
} from "node:child_process";

import {
  TONGYU_VERSION,
} from "../../constants.js";

import {
  getRuntimePaths,
} from "../../runtime/paths.js";

type DoctorStatus =
  | "PASS"
  | "WARN"
  | "FAIL";

interface DoctorResult {
  name: string;
  status: DoctorStatus;
  detail: string;
}

function checkWritable(
  path: string,
): boolean {
  try {
    accessSync(
      path,
      fsConstants.W_OK,
    );

    return true;
  } catch {
    return false;
  }
}

function getNodeMajorVersion(): number {
  return Number(
    process.versions.node.split(".")[0],
  );
}

function checkGit(): DoctorResult {
  const result =
    spawnSync(
      "git",
      ["--version"],
      {
        encoding: "utf8",
      },
    );

  if (
    result.error ||
    result.status !== 0
  ) {
    return {
      name: "Git",
      status: "FAIL",
      detail:
        "git command is unavailable",
    };
  }

  return {
    name: "Git",
    status: "PASS",
    detail:
      result.stdout.trim(),
  };
}

function runChecks(): DoctorResult[] {
  const results: DoctorResult[] =
    [];

  results.push({
    name: "Tongyu Version",
    status: "PASS",
    detail: TONGYU_VERSION,
  });

  const nodeMajor =
    getNodeMajorVersion();

  results.push({
    name: "Node.js Version",
    status:
      nodeMajor >= 24
        ? "PASS"
        : "FAIL",
    detail: process.version,
  });

  results.push({
    name: "Platform",
    status:
      process.platform === "darwin"
        ? "PASS"
        : "WARN",
    detail: process.platform,
  });

  results.push({
    name: "Architecture",
    status:
      process.arch === "arm64"
        ? "PASS"
        : "WARN",
    detail: process.arch,
  });

  results.push(
    checkGit(),
  );

  const shell =
    process.env.SHELL;

  results.push({
    name: "Shell",
    status:
      shell
        ? "PASS"
        : "WARN",
    detail:
      shell ?? "unknown",
  });

  const cwd =
    process.cwd();

  results.push({
    name: "Working Directory",
    status:
      existsSync(cwd) &&
      checkWritable(cwd)
        ? "PASS"
        : "FAIL",
    detail: cwd,
  });

  const home =
    homedir();

  results.push({
    name: "Home Directory",
    status:
      existsSync(home) &&
      checkWritable(home)
        ? "PASS"
        : "FAIL",
    detail: home,
  });

  const runtimePaths =
    getRuntimePaths();

  results.push({
    name: "Runtime Directory",
    status: "PASS",
    detail:
      existsSync(runtimePaths.root)
        ? runtimePaths.root
        : `${runtimePaths.root} (not created yet)`,
  });

  return results;
}

function printResult(
  result: DoctorResult,
): void {
  const status =
    `[${result.status}]`.padEnd(8);

  const name =
    result.name.padEnd(20);

  console.log(
    `${status} ${name} ${result.detail}`,
  );
}

export function runDoctor(): void {
  console.log("Tongyu Doctor");
  console.log("=============");
  console.log("");

  const results =
    runChecks();

  for (
    const result of results
  ) {
    printResult(result);
  }

  console.log("");

  const failures =
    results.filter(
      (result) =>
        result.status === "FAIL",
    );

  const warnings =
    results.filter(
      (result) =>
        result.status === "WARN",
    );

  if (
    failures.length > 0
  ) {
    console.error(
      `Doctor found ${failures.length} failure(s) and ${warnings.length} warning(s).`,
    );

    process.exitCode = 1;
    return;
  }

  if (
    warnings.length > 0
  ) {
    console.log(
      `Doctor completed with ${warnings.length} warning(s).`,
    );

    return;
  }

  console.log(
    "All checks passed.",
  );
}
