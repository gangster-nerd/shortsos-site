import { SITE_ALLOWS_INDEXING } from "@/lib/config/site-config";
import { llmsTxt } from "@/lib/seo/llms-txt";

// Static route handler — compatible with `output: "export"` since it returns a fixed
// response with no request-time dependency.
export const dynamic = "force-static";

export function GET() {
  return new Response(llmsTxt(SITE_ALLOWS_INDEXING), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
