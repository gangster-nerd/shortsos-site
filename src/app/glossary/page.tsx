import type { Metadata } from "next";

import { GLOSSARY_ENTRIES } from "@/content/copy-sources";
import { pageMetadata } from "@/lib/seo/page-metadata";

export const metadata: Metadata = pageMetadata({ path: "/glossary/", title: "Glossary" });

export default function GlossaryPage() {
  return (
    <main>
      <section className="section">
        <div className="shell">
          <p className="eyebrow">Glossary</p>
          <h1>Terms used across this site</h1>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <dl className="glossary">
            {GLOSSARY_ENTRIES.map((entry) => (
              <div key={entry.term}>
                <dt>{entry.term}</dt>
                <dd>{entry.definition}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </main>
  );
}
