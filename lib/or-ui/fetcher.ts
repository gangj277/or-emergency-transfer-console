import type {
  ApiError,
  HealthResponse,
  HospitalCapacity,
  HospitalsResponse,
  MissingActiveCapacity,
  OrParameters,
  RecommendationResponse,
} from "./types";

export type CapacityRefreshResponse = {
  generated_at: string;
  counts: {
    districts_requested: number;
    live_rows: number;
    active_joined_rows: number;
    active_without_live_capacity: number;
  };
  rows: HospitalCapacity[];
  missingActiveCapacity: MissingActiveCapacity[];
  fetchLog: Array<{
    requested_district: string;
    result_code: string;
    result_msg: string;
    total_count: number;
    returned_items: number;
  }>;
};

async function jsonFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as T | ApiError;
  if (!res.ok) {
    const message =
      typeof body === "object" && body && "error" in body && typeof (body as ApiError).error === "string"
        ? (body as ApiError).error
        : `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body as T;
}

export function fetchHealth(): Promise<HealthResponse> {
  return jsonFetch<HealthResponse>("/api/or/health", { method: "GET" });
}

export function fetchHospitals(mode: "live" | "active" = "live"): Promise<HospitalsResponse> {
  return jsonFetch<HospitalsResponse>(`/api/or/hospitals?mode=${mode}`, { method: "GET" });
}

export type TranscriptPayload = {
  case_id?: string;
  title?: string;
  transcript: string;
  incident_location: { lat: number; lon: number };
  limit?: number;
};

export type ManualPayload = {
  or_parameters: OrParameters;
  incident_location: { lat: number; lon: number };
  limit?: number;
};

export function runRecommendation(
  payload: TranscriptPayload | ManualPayload,
): Promise<RecommendationResponse> {
  return jsonFetch<RecommendationResponse>("/api/or/recommendations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function refreshCapacity(district?: string): Promise<CapacityRefreshResponse> {
  return jsonFetch<CapacityRefreshResponse>("/api/or/capacity/refresh", {
    method: "POST",
    body: JSON.stringify(district ? { district } : {}),
  });
}
