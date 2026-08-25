#!/usr/bin/env node
import { homedir } from 'node:os';
import { run } from './run.js';

run(process.argv.slice(2), homedir())
  .then((output) => process.stdout.write(output + '\n'))
  .catch((error: unknown) => {
    process.stderr.write(
      `agent-wrapped failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
