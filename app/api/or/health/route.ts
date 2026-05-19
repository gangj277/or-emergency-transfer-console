import { ok } from "@/lib/or/api";
import { loadHospitalData } from "@/lib/or/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = loadHospitalData();
  return ok({
    status: "ok",
    runtime: "nextjs-node-route-handler",
    env: {
      openrouterConfigured: Boolean(process.env.OPENROUTER_API_KEY),
      openrouterModel: process.env.OPENROUTER_MODEL || "openai/gpt-5.4-mini",
      nemcConfigured: Boolean(process.env.NEMC_SERVICE_KEY),
    },
    data: data.summary,
  });
}
