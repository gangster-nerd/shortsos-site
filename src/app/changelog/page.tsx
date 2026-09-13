import type { Metadata } from "next";

import { CHANGELOG_INTRO, CHANGELOG_ENTRIES } from "@/content/copy-sources";

export const metadata: Metadata = { title: "Changelog" };

export default function ChangelogPage() {
  return (
    <main>
      <section className="section">
        <div className="shell">
          <p className="eyebrow">Changelog</p>
          <h1>Governance history, not a feature list</h1>
          <p className="lede">{CHANGELOG_INTRO}</p>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          {CHANGELOG_ENTRIES.map((entry) => (
            <div key={entry.title} className="faq-item">
              <p className="eyebrow" style={{ marginBottom: 6 }}>
                {entry.date} · {entry.repo}@{entry.sha}
              </p>
              <h3>{entry.title}</h3>
              <p>{entry.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
