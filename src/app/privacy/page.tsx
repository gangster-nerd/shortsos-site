import type { Metadata } from "next";

import { PRIVACY_COPY } from "@/content/copy-sources";
import { pilotRequestCapability } from "@/lib/config/pilot-request-config";

export const metadata: Metadata = { title: "Privacy notice" };

export default function PrivacyPage() {
  const capability = pilotRequestCapability;
  return (
    <main>
      <section className="section">
        <div className="shell">
          <p className="eyebrow">Privacy</p>
          <h1>Privacy notice</h1>
          <p className="lede">{capability.state === "configured" ? PRIVACY_COPY.cookies : PRIVACY_COPY.noForm}</p>
        </div>
      </section>

      {capability.state === "configured" ? (
        <section className="section">
          <div className="shell privacy">
            <h2>Who is responsible</h2>
            <p className="prose">
              {capability.controllerName} is responsible for personal data sent through this site. Contact:{" "}
              <a href={`mailto:${capability.contactEmail}`}>{capability.contactEmail}</a>.
            </p>
            <h2>What is collected</h2>
            <p className="prose">{PRIVACY_COPY.collected}</p>
            <h2>Why</h2>
            <p className="prose">{PRIVACY_COPY.purpose}</p>
            <h2>Legal basis</h2>
            <p className="prose">{PRIVACY_COPY.basis}</p>
            <h2>Who processes it</h2>
            <p className="prose">{PRIVACY_COPY.processors}</p>
            <h2>How long it is kept</h2>
            <p className="prose">{PRIVACY_COPY.retention}</p>
            <h2>Your rights</h2>
            <p className="prose">
              {PRIVACY_COPY.rights} Write to <a href={`mailto:${capability.contactEmail}`}>{capability.contactEmail}</a>.
            </p>
          </div>
        </section>
      ) : null}
    </main>
  );
}
