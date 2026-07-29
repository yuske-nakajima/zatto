#!/usr/bin/env node

import "tsx/esm";

const { main } = await import("../src/cli/index.ts");
process.exitCode = await main(process.argv.slice(2));
