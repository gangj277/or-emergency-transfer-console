import { apiError, ok } from "@/lib/or/api";
import { loadHospitalData } from "@/lib/or/data";
import { refreshSeoulCapacity } from "@/lib/or/nemc-capacity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const serviceKey = process.env.NEMC_SERVICE_KEY;
    if (!serviceKey) throw new Error("NEMC_SERVICE_KEY is required.");

    const body = await optionalJson(request);
    const data = loadHospitalData();
    const activeHospitalIds = new Set(data.hospitals.map((hospital) => hospital.hospital_id));
    const districts = body?.district
      ? [String(body.district)]
      : [...new Set(data.hospitals.map((hospital) => hospital.district).filter(Boolean))].sort((a, b) =>
          a.localeCompare(b, "ko"),
        );
    const requestedDistricts = new Set(districts);
    const scopedHospitals = data.hospitals.filter((hospital) => requestedDistricts.has(hospital.district));

    const refreshed = await refreshSeoulCapacity({
      serviceKey,
      districts,
      activeHospitalIds,
    });
    const liveIds = new Set(refreshed.rows.map((row) => row.hospital_id));
    const activeRows = refreshed.rows.filter((row) => row.active_in_hospital_master);
    const missingActiveCapacity = scopedHospitals
      .filter((hospital) => !liveIds.has(hospital.hospital_id))
      .map((hospital) => ({
        hospital_id: hospital.hospital_id,
        hpid: hospital.hpid,
        hospital_name: hospital.hospital_name,
        district: hospital.district,
        emergency_level_model: hospital.emergency_level_model,
        current_emergency_level_raw: hospital.current_emergency_level_raw,
        capacity_missing_reason: "absent_from_nemc_live_capacity_response",
      }));

    return ok({
      generated_at: refreshed.fetchedAt,
      counts: {
        districts_requested: districts.length,
        live_rows: refreshed.rows.length,
        active_joined_rows: activeRows.length,
        active_without_live_capacity: missingActiveCapacity.length,
      },
      rows: activeRows,
      missingActiveCapacity,
      fetchLog: refreshed.fetchLog,
    });
  } catch (error) {
    return apiError(error);
  }
}

async function optionalJson(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (!text.trim()) return null;
  const parsed = JSON.parse(text);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
}
