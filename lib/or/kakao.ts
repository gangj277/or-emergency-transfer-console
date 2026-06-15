import type { LocationPoint } from "./types";

/**
 * Kakao Mobility car-directions client (자동차 길찾기).
 *
 * Endpoint: GET https://apis-navi.kakaomobility.com/v1/directions
 *  - auth:   Authorization: KakaoAK {REST_API_KEY}   (REST key, NOT the JavaScript key;
 *            verified empirically — the JS key returns -401 "KA Header is required")
 *  - params: origin / destination as "x,y" = "longitude,latitude"
 *  - result: routes[0].summary.{distance (m), duration (s)}; result_code 0 = success
 *
 * Used only by scripts/build-travel-matrix.ts (offline matrix build). The request
 * hot-path reads the precomputed matrix and never calls this.
 */

export const KAKAO_DIRECTIONS_ENDPOINT = "https://apis-navi.kakaomobility.com/v1/directions";

export type Directions = { durationMin: number; routeDistanceKm: number };

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Parse a Kakao directions JSON response body into {durationMin, routeDistanceKm}. */
export function parseDirections(json: unknown): Directions {
  const body = json as { routes?: Array<{ result_code?: number; result_msg?: string; summary?: { distance?: number; duration?: number } }> };
  const route = body?.routes?.[0];
  if (!route) throw new Error("Kakao directions: no routes in response");
  if (route.result_code !== 0) {
    throw new Error(`Kakao directions failed: result_code=${route.result_code} ${route.result_msg ?? ""}`.trim());
  }
  const distanceM = num(route.summary?.distance);
  const durationS = num(route.summary?.duration);
  if (distanceM === null || durationS === null) throw new Error("Kakao directions: missing summary.distance/duration");
  return { durationMin: durationS / 60, routeDistanceKm: distanceM / 1000 };
}

/** Fetch car travel time + route distance between two coordinates. */
export async function fetchDirections(
  origin: LocationPoint,
  destination: LocationPoint,
  {
    serviceKey,
    fetchImpl = fetch,
    timeoutMs = 5000,
  }: { serviceKey: string; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<Directions> {
  if (!serviceKey?.trim()) throw new Error("Kakao REST API key is required.");
  const url = new URL(KAKAO_DIRECTIONS_ENDPOINT);
  url.searchParams.set("origin", `${origin.lon},${origin.lat}`);
  url.searchParams.set("destination", `${destination.lon},${destination.lat}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: { Authorization: `KakaoAK ${serviceKey.trim()}`, "Content-Type": "application/json" },
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Kakao directions HTTP ${res.status}: ${text.slice(0, 200)}`);
    return parseDirections(JSON.parse(text));
  } finally {
    clearTimeout(timer);
  }
}
