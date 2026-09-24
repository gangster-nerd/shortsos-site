import type { Metadata } from "next";

import { PilotRequestForm } from "@/components/pilot-request-form";
import { PILOT_REQUEST_FORM_COPY, REQUEST_PILOT_COPY } from "@/content/copy-sources";
import { pilotRequestCapability } from "@/lib/config/pilot-request-config";

export const metadata: Metadata = { title: "Request a pilot" };

export default function RequestPilotPage() {
  const capability = pilotRequestCapability;
  return (
    <main>
      <section className="section">
        <div className="shell">
          <p className="eyebrow">Request a pilot</p>
          <h1>Talk to the team directly</h1>
          <p className="lede">{REQUEST_PILOT_COPY.intro}</p>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          {capability.state === "configured" ? (
            <>
              <div className="notice">
                <strong>How this actually works:</strong> {REQUEST_PILOT_COPY.mechanism}
              </div>
              <PilotRequestForm
                endpoint={capability.endpoint}
                controllerName={capability.controllerName}
                contactEmail={capability.contactEmail}
                copy={PILOT_REQUEST_FORM_COPY}
              />
            </>
          ) : (
            <div className="notice">{REQUEST_PILOT_COPY.unavailable}</div>
          )}
        </div>
      </section>
    </main>
  );
}
