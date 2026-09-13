import { describe, expect, it } from "vitest";

import { buildStatusReport, formatStatusReport, type SyncStatusPin } from "../src/lib/commit-to-content/status-report";

describe("buildStatusReport / formatStatusReport", () => {
  it("reports correctly with zero prior syncs", () => {
    const report = buildStatusReport(null, []);
    expect(report.hasPriorSync).toBe(false);
    expect(report.pin).toBeNull();
    expect(report.outstandingCandidateIds).toEqual([]);
    expect(formatStatusReport(report)).toMatch(/No prior content:sync has been run/);
  });

  it("reports correctly with one prior sync and outstanding candidates", () => {
    const pin: SyncStatusPin = {
      productRef: "abc123",
      manifestChecksum: "deadbeef",
      syncedAt: "2026-09-13T00:00:00.000Z",
      previousProductRef: null,
    };
    const report = buildStatusReport(pin, ["ZEBRA-CAP", "ALPHA-CAP"]);
    expect(report.hasPriorSync).toBe(true);
    expect(report.pin).toEqual(pin);
    // sorted, not insertion order
    expect(report.outstandingCandidateIds).toEqual(["ALPHA-CAP", "ZEBRA-CAP"]);

    const formatted = formatStatusReport(report);
    expect(formatted).toMatch(/abc123/);
    expect(formatted).toMatch(/deadbeef/);
    expect(formatted).toMatch(/none — first sync/);
    expect(formatted).toMatch(/ALPHA-CAP, ZEBRA-CAP/);
  });

  it("reports a previous product ref across a second sync", () => {
    const pin: SyncStatusPin = {
      productRef: "def456",
      manifestChecksum: "cafef00d",
      syncedAt: "2026-09-13T01:00:00.000Z",
      previousProductRef: "abc123",
    };
    const report = buildStatusReport(pin, []);
    expect(formatStatusReport(report)).toMatch(/abc123/);
    expect(formatStatusReport(report)).toMatch(/def456/);
  });
});
