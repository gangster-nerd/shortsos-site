/**
 * The headless delivery — what a site expects a source to release to it: one ContentDocument@1
 * and the facts needed to check where it comes from.
 *
 * The body is built from what a content writer produces for a reviewed article: the document it
 * composed, the writer's structured-content hash and statement ledger, and the truth-check
 * verdict. Nothing in it is site-specific except the destination it is addressed to.
 *
 * The shape is fixed here. The names a source gives it — the release capability, the delivery
 * contract id, the destination kind — come from the site's configuration of that source
 * (`ReleaseContract`), never from the source itself.
 */
import { SHA256_HEX } from "./canonical";
import { isObject, ShapeReader, type Json } from "./shape";

export const CONTENT_DOCUMENT_CONTRACT = "content-document@1";

/** How one source names a release to a Git-published site. From the site's configuration. */
export interface ReleaseContract {
  /** The capability that releases a reviewed draft to a site, e.g. `acme.release_headless_delivery@1`. */
  capability: string;
  /** The contract id of the released artifact and of its body's `schemaVersion`. */
  deliveryContract: string;
  /** `envelope.target.kind` and `destination.kind` of a release to a Git-published site. */
  targetKind: string;
}

/** ContentDocument@1 semantic block vocabulary. */
export const CONTENT_BLOCK_KINDS = [
  "paragraph",
  "heading",
  "answer",
  "evidence",
  "quote",
  "figure",
  "comparison",
  "table",
  "steps",
  "callout",
  "definition",
  "statistic",
  "source",
  "cta_slot",
  "related_content_slot",
] as const;
export type ContentBlockKind = (typeof CONTENT_BLOCK_KINDS)[number];

export interface DeliveredBlock {
  id: string;
  kind: ContentBlockKind;
  slot?: string;
  level?: number;
  data: Json;
}

export interface DeliveredContentDocument {
  contentSchemaVersion: typeof CONTENT_DOCUMENT_CONTRACT;
  identity: { documentId: string; contentType: string; slug: string; language: string; title: string; description: string; [key: string]: unknown };
  truth: { sourceStatus: string; publicationStatus: string; claimIds: string[]; evidenceRefs: string[]; [key: string]: unknown };
  provenance: { sourceAuthority: string; sourceEvidenceDigest: string; [key: string]: unknown };
  body: DeliveredBlock[];
  seo: { indexingIntent: string; targetQuery?: string; searchIntent?: string; [key: string]: unknown };
  /** editorial, relationships, conversion, lifecycle… carried verbatim, never rewritten. */
  [key: string]: unknown;
}

export interface DeliveredStatement {
  id: string;
  text: string;
  kind: string;
  evidenceIds: string[];
}

export type TruthCheckVerdict = "pass" | "alert" | "block";

export interface HeadlessDelivery {
  /** = `ReleaseContract.deliveryContract`. */
  schemaVersion: string;
  /** The one site this release is addressed to; any other site must refuse it. */
  destination: { kind: string; siteId: string };
  workspaceId: string;
  /** BCP 47 tag; equals `contentDocument.identity.language`. */
  locale: string;
  source: {
    contentDraftId: string;
    briefId: string | null;
    writerMethodVersion: string;
    /** The writer's `structuredContentHash` = `contentDocument.provenance.sourceEvidenceDigest`. */
    structuredContentHash: string;
  };
  truthCheck: { verdict: TruthCheckVerdict; truthCheckId: string | null };
  /** The ContentDocument@1 JSON Schema the document was validated against, by fingerprint. */
  contentContract: { version: typeof CONTENT_DOCUMENT_CONTRACT; fingerprint: string };
  contentDocument: DeliveredContentDocument;
  /** The writer's statement ledger (recommended): lets a site check sentence-level lineage. */
  statementLedger?: DeliveredStatement[];
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCALE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

function parseDocument(r: ShapeReader, raw: unknown, path: string): DeliveredContentDocument {
  const doc = r.object(raw, path);
  r.literal(doc, "contentSchemaVersion", [CONTENT_DOCUMENT_CONTRACT] as const, path);
  const identity = r.object(doc.identity, `${path}.identity`);
  for (const key of ["documentId", "contentType", "language", "title", "description"]) r.string(identity, key, `${path}.identity`);
  r.match(identity, "slug", SLUG, "a lowercase kebab-case slug", `${path}.identity`);
  const truth = r.object(doc.truth, `${path}.truth`);
  r.string(truth, "sourceStatus", `${path}.truth`);
  r.string(truth, "publicationStatus", `${path}.truth`);
  r.stringArray(truth, "claimIds", `${path}.truth`);
  r.stringArray(truth, "evidenceRefs", `${path}.truth`);
  const provenance = r.object(doc.provenance, `${path}.provenance`);
  r.string(provenance, "sourceAuthority", `${path}.provenance`);
  r.match(provenance, "sourceEvidenceDigest", SHA256_HEX, "a sha256 hex digest", `${path}.provenance`);
  r.string(r.object(doc.seo, `${path}.seo`), "indexingIntent", `${path}.seo`);

  const body = r.array(doc, "body", path);
  if (body.length === 0) r.problems.push(`${path}.body: must hold at least one block`);
  const ids = new Set<string>();
  body.forEach((rawBlock, i) => {
    const at = `${path}.body[${i}]`;
    const block = r.object(rawBlock, at);
    const id = r.string(block, "id", at);
    if (id && ids.has(id)) r.problems.push(`${at}.id: duplicate block id ${JSON.stringify(id)}`);
    ids.add(id);
    r.literal(block, "kind", CONTENT_BLOCK_KINDS, at);
    if (block.level !== undefined && !(Number.isInteger(block.level) && (block.level as number) >= 1 && (block.level as number) <= 6)) {
      r.problems.push(`${at}.level: must be an integer from 1 to 6`);
    }
    r.object(block.data, `${at}.data`);
  });
  return doc as DeliveredContentDocument;
}

/** Structural check of an artifact body claimed to be a delivery. Collects every problem. */
export function parseHeadlessDelivery(raw: unknown, release: ReleaseContract): { delivery: HeadlessDelivery | null; problems: string[] } {
  const r = new ShapeReader();
  const root = r.object(raw, "delivery");
  r.literal(root, "schemaVersion", [release.deliveryContract], "delivery");
  const destination = r.object(root.destination, "delivery.destination");
  r.literal(destination, "kind", [release.targetKind], "delivery.destination");
  r.string(destination, "siteId", "delivery.destination");
  r.string(root, "workspaceId", "delivery");
  r.match(root, "locale", LOCALE, "a BCP 47 language tag", "delivery");
  const source = r.object(root.source, "delivery.source");
  r.string(source, "contentDraftId", "delivery.source");
  r.nullableString(source, "briefId", "delivery.source");
  r.string(source, "writerMethodVersion", "delivery.source");
  r.match(source, "structuredContentHash", SHA256_HEX, "a sha256 hex digest", "delivery.source");
  const truthCheck = r.object(root.truthCheck, "delivery.truthCheck");
  r.literal(truthCheck, "verdict", ["pass", "alert", "block"] as const, "delivery.truthCheck");
  r.nullableString(truthCheck, "truthCheckId", "delivery.truthCheck");
  const contract = r.object(root.contentContract, "delivery.contentContract");
  r.literal(contract, "version", [CONTENT_DOCUMENT_CONTRACT] as const, "delivery.contentContract");
  r.match(contract, "fingerprint", SHA256_HEX, "a sha256 hex digest", "delivery.contentContract");
  parseDocument(r, root.contentDocument, "delivery.contentDocument");
  if (root.statementLedger !== undefined) {
    r.array(root, "statementLedger", "delivery").forEach((raw, i) => {
      const at = `delivery.statementLedger[${i}]`;
      const statement = r.object(raw, at);
      r.string(statement, "id", at);
      r.string(statement, "text", at);
      r.string(statement, "kind", at);
      r.stringArray(statement, "evidenceIds", at);
    });
  }
  return r.problems.length === 0 ? { delivery: root as unknown as HeadlessDelivery, problems: [] } : { delivery: null, problems: r.problems };
}

/** Keys whose string values are identifiers or addresses, not words a reader sees. */
const NON_PROSE_KEYS = new Set(["id", "kind", "slot", "type", "ref", "href", "url", "src", "intent", "tone", "lang", "identifier"]);

function collectProse(value: unknown, out: string[], key: string | null): void {
  if (typeof value === "string") {
    if (key === null || !NON_PROSE_KEYS.has(key)) out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectProse(item, out, key);
  } else if (isObject(value)) {
    for (const [k, v] of Object.entries(value)) collectProse(v, out, k);
  }
}

/** Every piece of text a reader of the document would see: title, description, block prose. */
export function readableText(document: DeliveredContentDocument): string[] {
  const out = [document.identity.title, document.identity.description];
  for (const block of document.body) collectProse(block.data, out, null);
  return out.filter((text) => text.trim().length > 0);
}
