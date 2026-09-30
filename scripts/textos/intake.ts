#!/usr/bin/env tsx
/**
 * `npm run textos:intake -- <request | receive | replay | check> [options]` — ShortsOS's door
 * for content released by the TextOS API. The command is the generic package's
 * (packages/textos-intake/src/cli.ts); ShortsOS supplies its configuration and its rules.
 * See textos/README.md, "Receiving from the TextOS API".
 */
import { resolve } from "node:path";

import { runIntakeCli } from "../../packages/textos-intake/src/index";
import { SHORTSOS_INTAKE_CONFIG, shortsosRules } from "../../src/lib/textos/api-intake";

const root = resolve(import.meta.dirname, "..", "..");
process.exitCode = await runIntakeCli(process.argv.slice(2), { root, configPath: SHORTSOS_INTAKE_CONFIG, rules: shortsosRules(root) });
