#!/usr/bin/env tsx
/**
 * TEMPLATE — the site's intake command. Copy into the site's scripts, change the imports to where
 * the package and the rules live, and run it from the repository root:
 *
 *   tsx scripts/intake.ts <request | receive | replay | check> --source <id> [options]
 *
 * Source <id> is configured in sources/<id>.json. `request` and `receive` read its API from
 * <ID>_API_BASE_URL and <ID>_API_TOKEN (the id in upper case).
 */
import { runIntakeCli } from "../src/index";
import { siteRules } from "./site-rules";

process.exitCode = await runIntakeCli(process.argv.slice(2), {
  root: process.cwd(),
  sourcesDir: "sources",
  // Return the slugs the site already publishes.
  rules: () => siteRules({ takenSlugs: () => [] }),
});
