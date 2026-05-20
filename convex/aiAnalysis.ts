import { internalAction } from "./_generated/server";

export const triggerWeeklyAnalysis = internalAction({
  args: {},
  handler: async () => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const secret = process.env.VEPIP_INTERNAL_SECRET;

    if (!secret) {
      console.error("[aiAnalysis] VEPIP_INTERNAL_SECRET not set; skipping");
      return;
    }

    try {
      const res = await fetch(`${siteUrl}/api/ai/analyze-projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": secret,
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("[aiAnalysis] Analysis failed:", text);
        return;
      }

      const data = await res.json();
      console.log("[aiAnalysis] Weekly direct analysis triggered:", data);
    } catch (err) {
      console.error("[aiAnalysis] Error triggering analysis:", err);
    }
  },
});
