import {
  TONGYU_NAME,
  TONGYU_VERSION,
} from "../constants.js";

export function printBanner(): void {
  console.log(`${TONGYU_NAME} Local Agent Runtime`);
  console.log(`Version: ${TONGYU_VERSION}`);
  console.log(`Node.js: ${process.version}`);
  console.log(`Platform: ${process.platform}`);
  console.log(`Architecture: ${process.arch}`);
}
