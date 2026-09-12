import {
  runSessionsClient,
} from "./sessions.js";

import {
  runChatClient,
} from "./chat.js";

import {
  TONGYU_VERSION,
} from "../constants.js";

import {
  runStdioServer,
} from "../server/stdio-server.js";

import {
  printBanner,
} from "./banner.js";

import {
  runDoctor,
} from "./commands/doctor.js";

import {
  printHelp,
} from "./help.js";

export async function runCli(
  args: string[],
): Promise<void> {
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

    case "chat":
      await runChatClient(
        args.slice(1),
      );
      return;

    case "sessions":
      await runSessionsClient();
      return;

    case "server":
      await runStdioServer();
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
