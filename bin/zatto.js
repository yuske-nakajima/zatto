#!/usr/bin/env node

const { main } = await import("../dist/cli/index.js");
process.exitCode = await main(process.argv.slice(2));
