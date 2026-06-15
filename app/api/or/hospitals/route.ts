import { ok } from "@/lib/or/api";
import { loadHospitalData } from "@/lib/or/data";
import { loadLiveCapacityData } from "@/lib/or/live-capacity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") || "live";
  const shouldRefresh = url.searchParams.get("refresh") === "true";
  // Cached/stale-while-revalidate read — fast and self-refreshing. The dedicated
  // POST /api/or/capacity/refresh route is what forces a full live fetch.
  const { data, capacityRefresh } = shouldRefresh
    ? await loadLiveCapacityData()
    : { data: loadHospitalData(), capacityRefresh: null };

  if (mode === "active") {
    return ok({
      mode,
      summary: data.summary,
      candidates: data.activeCandidates,
      missingActiveCapacity: data.missingActiveCapacity,
      capacityRefresh,
    });
  }

  return ok({
    mode: "live",
    summary: data.summary,
    candidates: data.primaryCandidates,
    missingActiveCapacity: data.missingActiveCapacity,
    capacityMetadata: data.capacityMetadata,
    capacityRefresh,
  });
}
