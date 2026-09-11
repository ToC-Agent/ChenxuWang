import {
  TONGYU_DESCRIPTION,
  TONGYU_VERSION,
} from "../constants.js";

export function printHelp(): void {
  console.log(
    `Tongyu ${TONGYU_VERSION}`,
  );

  console.log(
    TONGYU_DESCRIPTION,
  );

  console.log("");

  console.log("Usage:");
  console.log(
    "  tongyu [command] [options]",
  );

  console.log("");

  console.log("Commands:");
  console.log(
    "  doctor        Check Tongyu environment",
  );

  console.log(
    "  version       Show Tongyu version",
  );

  console.log("");

  console.log("Options:");
  console.log(
    "  -h, --help    Show help",
  );

  console.log(
    "  -v, --version Show Tongyu version",
  );
}
