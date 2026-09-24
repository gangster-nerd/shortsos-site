/**
 * Where "Request a pilot" sends a request: a Formspree form owned by the ShortsOS team (the form
 * service TextOS already uses for its own measurement requests).
 *
 * Public, non-secret configuration: a Formspree form is addressed by a shareable id, not a
 * credential, so the values live here. The form collects personal data (an email address), so the
 * page must also name who is responsible for it and how to reach them.
 *
 * Fail-closed: until the endpoint, the controller and a real contact address are all set, the
 * capability is "unconfigured", and no call to action on the site leads to a form that would
 * deliver nothing (the mailto to a placeholder domain this replaces lost every request).
 */
export type PilotRequestState = "configured" | "unconfigured";

export interface PilotRequestCapability {
  provider: "formspree";
  endpoint: string;
  state: PilotRequestState;
  /** Who is responsible for the data sent through the form (shown on the form and privacy page). */
  controllerName: string;
  /** Where a person asks for their request to be deleted, or writes if the form fails. */
  contactEmail: string;
}

/** The ShortsOS form's endpoint, e.g. "https://formspree.io/f/<form id>". Set by the site owner. */
const RAW_ENDPOINT = "";
const CONTROLLER_NAME = "";
const CONTACT_EMAIL = "";

export function isValidFormspreeEndpoint(raw: string): boolean {
  try {
    const url = new URL(raw);
    const parts = url.pathname.split("/").filter(Boolean);
    return (
      url.protocol === "https:" &&
      url.hostname === "formspree.io" &&
      url.search === "" &&
      url.hash === "" &&
      parts.length === 2 &&
      parts[0] === "f" &&
      /^[A-Za-z0-9]+$/.test(parts[1] ?? "")
    );
  } catch {
    return false;
  }
}

/** A deliverable-looking address: not empty, one "@", a dotted domain, never a reserved example domain. */
export function isRealContactEmail(raw: string): boolean {
  const match = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/.exec(raw.trim());
  if (!match) return false;
  const domain = match[1]!.toLowerCase();
  return !/(^|\.)(example|test|invalid|localhost)(\.[a-z]+)?$/.test(domain);
}

export function resolvePilotRequestCapability(
  input: { endpoint: string; controllerName: string; contactEmail: string } = {
    endpoint: RAW_ENDPOINT,
    controllerName: CONTROLLER_NAME,
    contactEmail: CONTACT_EMAIL,
  },
): PilotRequestCapability {
  const configured =
    isValidFormspreeEndpoint(input.endpoint) && input.controllerName.trim().length > 0 && isRealContactEmail(input.contactEmail);
  return {
    provider: "formspree",
    endpoint: configured ? input.endpoint : "",
    state: configured ? "configured" : "unconfigured",
    controllerName: input.controllerName.trim(),
    contactEmail: input.contactEmail.trim(),
  };
}

export const pilotRequestCapability: PilotRequestCapability = resolvePilotRequestCapability();
