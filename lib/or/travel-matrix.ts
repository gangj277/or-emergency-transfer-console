import matrixJson from "../../data/or/travel_time_matrix.json";
import type { HospitalCandidate, LocationPoint } from "./types";

/**
 * Precomputed Kakao road-time matrix lookup (the request hot-path travel source).
 *
 * The matrix is built offline by scripts/build-travel-matrix.ts over a grid of Seoul
 * origin nodes × the 51 live-capacity hospitals, with the ambulance factor already
 * applied. At request time we snap the incident origin to the nearest matrix node and
 * read its per-hospital entries — a pure, synchronous, deterministic file lookup with
 * zero live Kakao calls. Falls back to the haversine heuristic per-hospital (or wholly,
 * if the matrix file is absent) so the app degrades gracefully before the first build.
 */

export type TravelEstimate = { minutes: number; routeDistanceKm: number };

export type TravelMatrixNode = {
  lat: number;
  lon: number;
  // hospital_id -> { m: minutes (ambulance-adjusted), km: route distance }
  t: Record<string, { m: number; km: number }>;
};

export type TravelMatrix = {
  generatedAt: string;
  source: string;
  ambulanceFactor: number;
  gridKm: number;
  hospitalCount: number;
  nodes: TravelMatrixNode[];
};

// Statically imported (committed placeholder until the first build overwrites it).
// `nodes: []` in the placeholder makes travelMatrixLoaded() false → graceful fallback.
const MATRIX = matrixJson as TravelMatrix;

export function travelMatrixLoaded(): boolean {
  return Array.isArray(MATRIX.nodes) && MATRIX.nodes.length > 0;
}

export function getTravelMatrixMeta() {
  if (!travelMatrixLoaded()) return null;
  const { generatedAt, source, ambulanceFactor, gridKm, hospitalCount, nodes } = MATRIX;
  return { generatedAt, source, ambulanceFactor, gridKm, hospitalCount, nodeCount: nodes.length };
}

function haversineKm(a: LocationPoint, b: LocationPoint) {
  const r = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

function nearestNode(origin: LocationPoint): TravelMatrixNode | null {
  if (MATRIX.nodes.length === 0) return null;
  let best: TravelMatrixNode | null = null;
  let bestDist = Infinity;
  for (const node of MATRIX.nodes) {
    const d = haversineKm(origin, { lat: node.lat, lon: node.lon });
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return best;
}

/**
 * Build the travel-time map for an incident origin. Snaps to the nearest matrix node
 * and returns ambulance-adjusted minutes + route distance per hospital. Hospitals
 * absent from the node (or a missing matrix) are simply omitted — callers (rankHospitals)
 * fall back to estimateSeoulAmbulanceTravel for any hospital not in the returned map.
 */
export function buildTravelTimes(
  origin: LocationPoint,
  candidates: HospitalCandidate[],
): Map<string, TravelEstimate> {
  const map = new Map<string, TravelEstimate>();
  const node = nearestNode(origin);
  if (!node) return map; // no matrix → empty map → haversine fallback everywhere
  for (const candidate of candidates) {
    const entry = node.t[candidate.hospital.hospital_id];
    if (entry) map.set(candidate.hospital.hospital_id, { minutes: entry.m, routeDistanceKm: entry.km });
  }
  return map;
}
