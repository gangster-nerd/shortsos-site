/**
 * Pure status-report assembly for `content:status`. Separated from `scripts/content-status.ts`
 * (which only does filesystem I/O) so "zero prior sync" and "one prior sync" reporting is
 * directly unit-testable without touching disk.
 */
export interface SyncStatusPin {
  productRef: string;
  manifestChecksum: string;
  /** Wall-clock ISO timestamp of the sync that produced this pin. Lives here, not in the
   *  deterministic ContentBundle, because it legitimately varies run to run. */
  syncedAt: string;
  previousProductRef: string | null;
}

export interface StatusReport {
  hasPriorSync: boolean;
  pin: SyncStatusPin | null;
  outstandingCandidateIds: string[];
}

export function buildStatusReport(pin: SyncStatusPin | null, candidateIds: readonly string[]): StatusReport {
  return {
    hasPriorSync: pin !== null,
    pin,
    outstandingCandidateIds: [...candidateIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  };
}

export function formatStatusReport(report: StatusReport): string {
  if (!report.hasPriorSync || report.pin === null) {
    return [
      "content:status",
      "  No prior content:sync has been run. Run `npm run content:sync -- --product-ref <sha>` first.",
    ].join("\n");
  }
  const { pin } = report;
  return [
    "content:status",
    `  Pinned product ref:     ${pin.productRef}`,
    `  Previous product ref:   ${pin.previousProductRef ?? "(none — first sync)"}`,
    `  Manifest checksum:      ${pin.manifestChecksum}`,
    `  Last synced at:         ${pin.syncedAt}`,
    `  Outstanding candidates: ${report.outstandingCandidateIds.length}` +
      (report.outstandingCandidateIds.length > 0 ? ` (${report.outstandingCandidateIds.join(", ")})` : ""),
  ].join("\n");
}
