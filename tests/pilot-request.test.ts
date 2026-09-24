import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  isRealContactEmail,
  isValidFormspreeEndpoint,
  pilotRequestCapability,
  resolvePilotRequestCapability,
} from "../src/lib/config/pilot-request-config";
import { requestPilotLink } from "../src/lib/registries/cta-registry";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const CONFIGURED = { endpoint: "https://formspree.io/f/abcd1234", controllerName: "ShortsOS", contactEmail: "team@shortsos.com" };

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("pilot request form (Formspree, fail-closed)", () => {
  it("accepts only a Formspree form endpoint", () => {
    expect(isValidFormspreeEndpoint("https://formspree.io/f/abcd1234")).toBe(true);
    for (const bad of [
      "",
      "http://formspree.io/f/abcd1234",
      "https://formspree.io/abcd1234",
      "https://formspree.io/f/",
      "https://formspree.io/f/abcd1234/extra",
      "https://formspree.io/f/abcd1234?x=1",
      "https://evil.example/f/abcd1234",
      "mailto:pilots@shortsos.com",
    ]) {
      expect(isValidFormspreeEndpoint(bad), bad).toBe(false);
    }
  });

  it("never treats a reserved or malformed address as a real contact", () => {
    expect(isRealContactEmail("team@shortsos.com")).toBe(true);
    for (const bad of ["", "pilots@shortsos.example", "a@b.example.com", "x@y.test", "x@y.invalid", "no-at-sign", "a@localhost"]) {
      expect(isRealContactEmail(bad), bad).toBe(false);
    }
  });

  it("stays unconfigured unless the endpoint, the controller and a real contact are all set", () => {
    expect(resolvePilotRequestCapability(CONFIGURED).state).toBe("configured");
    expect(resolvePilotRequestCapability({ ...CONFIGURED, endpoint: "" }).state).toBe("unconfigured");
    expect(resolvePilotRequestCapability({ ...CONFIGURED, controllerName: " " }).state).toBe("unconfigured");
    expect(resolvePilotRequestCapability({ ...CONFIGURED, contactEmail: "pilots@shortsos.example" }).state).toBe("unconfigured");
    expect(resolvePilotRequestCapability({ ...CONFIGURED, endpoint: "https://formspree.io/x" }).endpoint).toBe("");
  });

  it("shows the pilot CTA only where the form can deliver, and tags where it was clicked", () => {
    expect(requestPilotLink("nav", resolvePilotRequestCapability({ ...CONFIGURED, endpoint: "" }))).toBeNull();
    expect(requestPilotLink("nav", resolvePilotRequestCapability(CONFIGURED))).toEqual({
      href: "/request-pilot/?from=nav",
      label: "Request a pilot",
    });
  });

  it("keeps the committed configuration consistent: a configured form has a valid endpoint and a real contact", () => {
    if (pilotRequestCapability.state === "configured") {
      expect(isValidFormspreeEndpoint(pilotRequestCapability.endpoint)).toBe(true);
      expect(isRealContactEmail(pilotRequestCapability.contactEmail)).toBe(true);
    } else {
      expect(pilotRequestCapability.endpoint).toBe("");
    }
  });

  it("carries no placeholder email address anywhere in the site's source", () => {
    const offenders = sourceFiles(join(REPO_ROOT, "src")).filter((file) =>
      /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(example|test|invalid)\b/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
