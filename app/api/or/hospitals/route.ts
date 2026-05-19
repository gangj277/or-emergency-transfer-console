import { ok } from "@/lib/or/api";
import { loadHospitalData } from "@/lib/or/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") || "live";
  const data = loadHospitalData();

  if (mode === "active") {
    return ok({
      mode,
      summary: data.summary,
      candidates: data.activeCandidates,
      missingActiveCapacity: data.missingActiveCapacity,
    });
  }

  return ok({
    mode: "live",
    summary: data.summary,
    candidates: data.primaryCandidates,
    missingActiveCapacity: data.missingActiveCapacity,
    capacityMetadata: data.capacityMetadata,
  });
}
