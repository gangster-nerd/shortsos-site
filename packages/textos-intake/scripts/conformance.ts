#!/usr/bin/env tsx
/**
 * Writes the conformance cases (conformance/cases/*.json) from their definitions
 * (test/conformance-cases.ts), or checks that the committed files are exactly those.
 *
 *   tsx packages/textos-intake/scripts/conformance.ts [--write]
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { buildConformanceCases, serializeCase } from "../test/conformance-cases";

const CASES_DIR = resolve(import.meta.dirname, "..", "conformance", "cases");
const cases = buildConformanceCases();
const expected = new Map(cases.map((c) => [`${c.id}.json`, serializeCase(c)]));
const committed = existsSync(CASES_DIR) ? readdirSync(CASES_DIR).filter((f) => f.endsWith(".json")) : [];

if (process.argv.includes("--write")) {
  mkdirSync(CASES_DIR, { recursive: true });
  for (const file of committed) if (!expected.has(file)) rmSync(join(CASES_DIR, file));
  for (const [file, content] of expected) writeFileSync(join(CASES_DIR, file), content);
  console.log(`conformance: wrote ${expected.size} cases`);
} else {
  const problems = [
    ...[...expected.keys()].filter((f) => !committed.includes(f)).map((f) => `${f} is missing`),
    ...committed.filter((f) => !expected.has(f)).map((f) => `${f} has no definition`),
    ...committed.filter((f) => expected.has(f) && readFileSync(join(CASES_DIR, f), "utf8") !== expected.get(f)).map((f) => `${f} differs from its definition`),
  ];
  if (problems.length > 0) {
    console.error(`conformance: ${problems.join("; ")} — run with --write`);
    process.exit(1);
  }
  console.log(`conformance: OK — ${expected.size} cases`);
}
