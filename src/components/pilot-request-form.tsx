"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "failed" };

/** Query parameters kept with a request, so the team knows which page or campaign it came from. */
const ATTRIBUTION_PARAMS = ["from", "utm_source", "utm_medium", "utm_campaign", "utm_content"] as const;

/** The form's wording, passed in by the page from the site's copy registry (copy-safety checked). */
export interface PilotRequestFormCopy {
  footageLabel: string;
  footagePlaceholder: string;
  publishLabel: string;
  publishPlaceholder: string;
  sent: string;
  failed: string;
  privacy: string;
}

/**
 * The pilot request form. It posts to the ShortsOS Formspree form; with JavaScript it stays on the
 * page and reports the outcome, without it the browser posts directly and Formspree shows its own
 * confirmation. It only renders when the capability is configured (see pilot-request-config.ts).
 */
export function PilotRequestForm({
  endpoint,
  controllerName,
  contactEmail,
  copy,
}: {
  endpoint: string;
  controllerName: string;
  contactEmail: string;
  copy: PilotRequestFormCopy;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const params = new URLSearchParams(window.location.search);
    for (const key of ATTRIBUTION_PARAMS) {
      const value = params.get(key);
      if (value) data.set(key, value.slice(0, 200));
    }
    setStatus({ kind: "sending" });
    try {
      const res = await fetch(endpoint, { method: "POST", body: data, headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`Formspree answered ${res.status}`);
      form.reset();
      setStatus({ kind: "sent" });
    } catch {
      setStatus({ kind: "failed" });
    }
  }

  return (
    <>
      <form ref={formRef} className="pilot-form" action={endpoint} method="POST" onSubmit={onSubmit} aria-describedby="pilot-request-privacy">
        <input type="hidden" name="_subject" value="ShortsOS pilot request" />
        <label className="pilot-form__trap" aria-hidden="true">
          Leave this field empty
          <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" />
        </label>
        <label>
          <span>
            Work email <span className="pilot-form__required">required</span>
          </span>
          <input id="pilot-email" type="email" name="email" required autoComplete="email" />
        </label>
        <label>
          Your name
          <input id="pilot-name" type="text" name="name" autoComplete="name" />
        </label>
        <label>
          <span>
            Company or brand <span className="pilot-form__required">required</span>
          </span>
          <input id="pilot-company" type="text" name="company" required autoComplete="organization" />
        </label>
        <label>
          <span>
            {copy.footageLabel} <span className="pilot-form__required">required</span>
          </span>
          <textarea id="pilot-footage" name="footage" required placeholder={copy.footagePlaceholder} />
        </label>
        <label>
          {copy.publishLabel}
          <input id="pilot-publish" type="text" name="publishing" placeholder={copy.publishPlaceholder} />
        </label>
        <label>
          Anything else we should know?
          <textarea id="pilot-message" name="message" />
        </label>
        <button type="submit" className="btn btn-primary" disabled={status.kind === "sending"} style={{ justifySelf: "start" }}>
          {status.kind === "sending" ? "Sending…" : "Send the request"}
        </button>
        <p className="pilot-form__status" role="status" aria-live="polite">
          {status.kind === "sent" ? (
            <>
              {copy.sent} <Link href="/request-pilot/received">What happens next</Link>.
            </>
          ) : null}
          {status.kind === "failed" ? (
            <>
              {copy.failed} <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
            </>
          ) : null}
        </p>
      </form>
      <p id="pilot-request-privacy" className="pilot-form__privacy">
        {copy.privacy} {controllerName} is responsible for this data. To have it deleted, write to{" "}
        <a href={`mailto:${contactEmail}`}>{contactEmail}</a>. See the <Link href="/privacy">privacy notice</Link>.
      </p>
    </>
  );
}
