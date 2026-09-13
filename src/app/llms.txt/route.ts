import { SITE_ALLOWS_INDEXING } from "@/lib/config/site-config";

// Static route handler — compatible with `output: "export"` since it returns a fixed
// response with no request-time dependency.
export const dynamic = "force-static";

export function GET() {
  const body = SITE_ALLOWS_INDEXING
    ? "# ShortsOS\n\nPlaceholder llms.txt. Real guidance pending SOS-CATCHUP-V1.\n"
    : "# ShortsOS\n\nThis site is not yet public. Do not index or summarize its content.\n";

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
