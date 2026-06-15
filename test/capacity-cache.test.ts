import assert from "node:assert/strict";
import test from "node:test";

import { _resetCapacityCacheForTests, getSeoulCapacity } from "../lib/or/capacity-cache";

function districtXml(hpid: string, name: string, beds: number) {
  return `<response><header><resultCode>00</resultCode><resultMsg>OK</resultMsg></header><body><items><item><hpid>${hpid}</hpid><dutyName>${name}</dutyName><hvec>${beds}</hvec></item></items><totalCount>1</totalCount><pageNo>1</pageNo><numOfRows>100</numOfRows></body></response>`;
}

// Minimal Response-shaped stub for the injected fetch.
function okResponse(xml: string) {
  return { ok: true, status: 200, text: async () => xml } as unknown as Response;
}

function baseOptions(overrides: Record<string, unknown> = {}) {
  return {
    serviceKey: "test-key",
    districts: ["강남구"],
    activeHospitalIds: new Set(["H-A"]),
    freshTtlMs: 60_000,
    hardTtlMs: 900_000,
    ...overrides,
  } as Parameters<typeof getSeoulCapacity>[0];
}

test("serves from cache within the fresh TTL (no second network call)", async () => {
  _resetCapacityCacheForTests();
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return okResponse(districtXml("H-A", "Hosp A", 5));
  }) as unknown as typeof fetch;

  let now = 1_000_000;
  const opts = baseOptions({ fetchImpl, nowMs: () => now });

  const first = await getSeoulCapacity(opts);
  assert.equal(calls, 1);
  assert.equal(first.cache.servedLive, 1);
  assert.equal(first.rows.length, 1);
  assert.equal(first.rows[0].available_er_beds, 5);

  now += 30_000; // still inside the 60s fresh window
  const second = await getSeoulCapacity(opts);
  assert.equal(calls, 1, "fresh cache must not refetch");
  assert.equal(second.cache.servedFreshCache, 1);
});

test("single-flight de-dups concurrent fetches of the same cold district", async () => {
  _resetCapacityCacheForTests();
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return okResponse(districtXml("H-A", "Hosp A", 3));
  }) as unknown as typeof fetch;

  const opts = baseOptions({ fetchImpl, nowMs: () => 1_000_000 });
  const [a, b] = await Promise.all([getSeoulCapacity(opts), getSeoulCapacity(opts)]);
  assert.equal(calls, 1, "two concurrent callers should share one in-flight fetch");
  assert.equal(a.rows.length, 1);
  assert.equal(b.rows.length, 1);
});

test("stale-if-error falls back to last good cache when a live fetch fails", async () => {
  _resetCapacityCacheForTests();
  let mode: "ok" | "fail" = "ok";
  const fetchImpl = (async () => {
    if (mode === "fail") throw new Error("network down");
    return okResponse(districtXml("H-A", "Hosp A", 7));
  }) as unknown as typeof fetch;

  let now = 1_000_000;
  const opts = baseOptions({ fetchImpl, nowMs: () => now });

  await getSeoulCapacity(opts); // prime cache (live)
  now += 1_000_000; // beyond hard TTL -> must refetch
  mode = "fail";

  const result = await getSeoulCapacity(opts);
  assert.equal(result.rows.length, 1, "should still return last good rows");
  assert.equal(result.rows[0].available_er_beds, 7);
  assert.equal(result.cache.servedStaleIfError, 1);
});

test("stale-while-revalidate serves cache and refreshes in the background", async () => {
  _resetCapacityCacheForTests();
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return okResponse(districtXml("H-A", "Hosp A", 4));
  }) as unknown as typeof fetch;

  let now = 1_000_000;
  const opts = baseOptions({ fetchImpl, nowMs: () => now });

  await getSeoulCapacity(opts); // calls -> 1
  now += 120_000; // past fresh (60s), within hard (900s) -> revalidate

  const result = await getSeoulCapacity(opts);
  assert.equal(result.cache.servedRevalidating, 1, "stale-but-ok district is served from cache");

  await new Promise((resolve) => setImmediate(resolve)); // let the background refresh settle
  assert.equal(calls, 2, "a background revalidation should have fired");
});
