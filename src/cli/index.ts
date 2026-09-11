import {
  TONGYU_VERSION,
} from "../constants.js";

import {
  printBanner,
} from "./banner.js";

import {
  runDoctor,
} from "./commands/doctor.js";

import {
  printHelp,
} from "./help.js";

export function runCli(
  args: string[],
): void {
  if (args.length === 0) {
    printBanner();
    return;
  }

  const command =
    args[0];

  switch (command) {
    case "--help":
    case "-h":
    case "help":
      printHelp();
      return;

    case "--version":
    case "-v":
    case "version":
      console.log(
        TONGYU_VERSION,
      );
      return;

    case "doctor":
      runDoctor();
      return;

    default:
      console.error(
        `Unknown command: ${command}`,
      );

      console.error(
        "Run 'tongyu --help' for usage.",
      );

      process.exitCode = 1;
  }
}
