#!/usr/bin/env tsx
/**
 * `npm run content:status` — reports the pinned product ref, manifest digest, last sync
 * time, and outstanding candidates. Pure I/O wrapper around `buildStatusReport`/
 * `formatStatusReport` (see `src/lib/commit-to-content/status-report.ts`), which carry the
 * actual "zero prior sync" vs "one prior sync" logic and are what the tests exercise
 * directly.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { buildStatusReport, formatStatusReport, type SyncStatusPin } from "../src/lib/commit-to-content/status-report";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const BUNDLES_DIR = join(REPO_ROOT, "content-bundles");
const CANDIDATES_DIR = join(REPO_ROOT, "content", "candidates");

function readPin(): SyncStatusPin | null {
  const pinPath = join(BUNDLES_DIR, "pin.json");
  if (!existsSync(pinPath)) return null;
  return JSON.parse(readFileSync(pinPath, "utf8")) as SyncStatusPin;
}

function readCandidateIds(): string[] {
  if (!existsSync(CANDIDATES_DIR)) return [];
  return readdirSync(CANDIDATES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

function main(): void {
  const report = buildStatusReport(readPin(), readCandidateIds());
  console.log(formatStatusReport(report));
}

main();
