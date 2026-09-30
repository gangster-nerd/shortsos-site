#!/usr/bin/env tsx
/**
 * TEMPLATE — the site's intake command. Copy into the site's scripts, change the imports to where
 * the package and the rules live, and run it from the repository root:
 *
 *   tsx scripts/textos-intake.ts <request | receive | replay | check> [options]
 *
 * `request` and `receive` read TEXTOS_API_BASE_URL and TEXTOS_API_TOKEN from the environment.
 */
import { runIntakeCli } from "../src/index";
import { siteRules } from "./site-rules";

process.exitCode = await runIntakeCli(process.argv.slice(2), {
  root: process.cwd(),
  configPath: "textos-intake.config.json",
  // Return the slugs the site already publishes.
  rules: siteRules({ takenSlugs: () => [] }),
});
