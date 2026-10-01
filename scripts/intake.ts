#!/usr/bin/env tsx
/**
 * `npm run intake -- <request | receive | replay | check> --source <id> [options]` — ShortsOS's
 * door for content a source releases through its API. The command is the generic package's
 * (packages/source-intake/src/cli.ts); ShortsOS supplies a configuration per source
 * (sources/<id>.json) and its rules (src/lib/sources/intake.ts).
 */
import { resolve } from "node:path";

import { runIntakeCli } from "../packages/source-intake/src/index";
import { SOURCES_DIR, siteRules } from "../src/lib/sources/intake";

const root = resolve(import.meta.dirname, "..");
process.exitCode = await runIntakeCli(process.argv.slice(2), { root, sourcesDir: SOURCES_DIR, rules: siteRules });
