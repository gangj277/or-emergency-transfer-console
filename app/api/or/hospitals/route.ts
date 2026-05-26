import { ok } from "@/lib/or/api";
import { loadHospitalData } from "@/lib/or/data";
import { refreshSeoulCapacity } from "@/lib/or/nemc-capacity";
import type { HospitalCapacity } from "@/lib/or/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") || "live";
  const shouldRefresh = url.searchParams.get("refresh") === "true";
  const { data, capacityRefresh } = shouldRefresh ? await loadFreshData() : { data: loadHospitalData(), capacityRefresh: null };

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

async function loadFreshData() {
  const serviceKey = process.env.NEMC_SERVICE_KEY;
  if (!serviceKey) throw new Error("NEMC_SERVICE_KEY is required when refresh=true.");

  const baseData = loadHospitalData();
  const activeHospitalIds = new Set(baseData.hospitals.map((hospital) => hospital.hospital_id));
  const districts = [...new Set(baseData.hospitals.map((hospital) => hospital.district).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ko"),
  );
  const refreshed = await refreshSeoulCapacity({ serviceKey, districts, activeHospitalIds });
  const activeRows = refreshed.rows.filter((row): row is HospitalCapacity => row.active_in_hospital_master);

  return {
    data: loadHospitalData({
      capacitySnapshot: activeRows,
      candidatePolicy: "request_time_nemc_live_capacity",
    }),
    capacityRefresh: {
      enabled: true,
      fetchedAt: refreshed.fetchedAt,
      districtsRequested: districts.length,
      liveRows: refreshed.rows.length,
      activeRows: activeRows.length,
    },
  };
}
