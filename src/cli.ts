#!/usr/bin/env node

const TONGYU_VERSION = "0.1.0";

function printBanner(): void {
  console.log("Tongyu Local Agent Runtime");
  console.log(`Version: ${TONGYU_VERSION}`);
  console.log(`Node.js: ${process.version}`);
  console.log(`Platform: ${process.platform}`);
  console.log(`Architecture: ${process.arch}`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--version") || args.includes("-v")) {
    console.log(TONGYU_VERSION);
    return;
  }

  printBanner();
}

main();
