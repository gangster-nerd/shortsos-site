import { SITE_DESCRIPTION } from "@/content/copy-sources";
import { SITE_ORIGIN } from "@/lib/config/site-config";
import { loadInsightArticles } from "@/lib/textos/articles";

const PAGES: { path: string; title: string }[] = [
  { path: "/how-it-works/", title: "How it works" },
  { path: "/proof/", title: "Proof" },
  { path: "/faq/", title: "FAQ" },
  { path: "/methodology/", title: "Methodology" },
  { path: "/changelog/", title: "Changelog" },
  { path: "/glossary/", title: "Glossary" },
  { path: "/request-pilot/", title: "Request a pilot" },
];

/** llms.txt (llmstxt.org): what the site is, in its own public words, and where to read more. */
export function llmsTxt(allowsIndexing: boolean): string {
  if (!allowsIndexing) return "# ShortsOS\n\nThis site is not yet public. Do not index or summarize its content.\n";
  const link = (path: string, title: string) => `- [${title}](${new URL(path, SITE_ORIGIN).toString()})`;
  const articles = loadInsightArticles().map((a) => `${link(a.route, a.title)}: ${a.description}`);
  return [
    "# ShortsOS",
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    "## Pages",
    "",
    ...PAGES.map((p) => link(p.path, p.title)),
    "",
    "## Insights",
    "",
    ...articles,
    "",
  ].join("\n");
}
