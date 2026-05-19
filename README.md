# OR Emergency Transfer Demo App

Next.js backend for the OR emergency-transfer team project.

It exposes:

- two-stage LLM extraction: emergency transcript -> medical observations -> OR parameters
- Seoul emergency hospital data: active candidates, live NEMC capacity candidates, missing-live candidates
- NEMC live capacity refresh
- capacity-buffer-aware hospital recommendation ranking from incident location and OR parameters

## Setup

```bash
npm install
cp .env.example .env.local
```

Set:

```bash
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=openai/gpt-5.4-mini
NEMC_SERVICE_KEY=...
```

The local `.env.local` in this workspace is already configured and ignored by git.

## Handoff

- [Frontend designer handoff](docs/frontend-designer-handoff.md)

## Run

```bash
npm run dev
```

Open `http://localhost:3000`.

## API

### Health

```bash
curl http://localhost:3000/api/or/health
```

### Hospitals

```bash
curl http://localhost:3000/api/or/hospitals?mode=live
curl http://localhost:3000/api/or/hospitals?mode=active
```

`mode=live` returns the 51 primary candidates with NEMC live capacity.
`mode=active` returns all 74 active candidates and flags the 23 candidates without live capacity.

### Refresh NEMC Capacity

```bash
curl -X POST http://localhost:3000/api/or/capacity/refresh \
  -H 'Content-Type: application/json' \
  -d '{"district":"강남구"}'
```

Omit `district` to refresh all Seoul districts.

### LLM Extraction

```bash
curl -X POST http://localhost:3000/api/or/pipeline/extract \
  -H 'Content-Type: application/json' \
  -d '{"case_id":"DEMO-1","title":"demo","transcript":"119상황실: ..."}'
```

### Recommendation

With precomputed OR parameters:

```bash
curl -X POST http://localhost:3000/api/or/recommendations \
  -H 'Content-Type: application/json' \
  -d '{
    "incident_location": {"lat": 37.5665, "lon": 126.9780},
    "or_parameters": {
      "incident_type": "fall_head_injury",
      "severity_level": 4,
      "deterioration_risk": 4,
      "vulnerability_level": 4,
      "required_departments": ["emergency_medicine", "neurosurgery"],
      "required_resources": ["ct", "trauma_resuscitation"],
      "max_transport_time_min": 30,
      "minimum_hospital_level": "local_center_or_above",
      "or_notes": "demo"
    },
    "limit": 5
  }'
```

With transcript input, omit `or_parameters` and include `case_id`, `title`, and `transcript`. The route will run the two-stage LLM pipeline first, then rank hospitals.

The recommendation engine uses `capacity_buffer_v2`: `available_er_beds > 0` is a hard constraint, but positive beds are still risk-weighted. One or two available ER beds receive a large buffer-risk penalty, three to five receive a medium penalty, six to ten receive a low penalty, and more than ten is treated as a stable reserve. The penalty is amplified when estimated travel time leaves little slack against `max_transport_time_min`.

## Data

The migrated data lives in `data/or`:

- `hospital_dim_active.{json,csv}`
- `hospital_capability_active.{json,csv}`
- `hospital_capacity_snapshot_active.{json,csv}`
- `hospital_capacity_missing_active.{json,csv}`
- `hospital_static_profile.{json,csv}`
- `source_crosscheck.{json,csv}`
- `test_transcripts.jsonl`
- `expected_review.json`

`hospital_static_profile` is currently a neutral HIRA-ready table because the current NEMC key is not authorized for HIRA hospital profile endpoints. Static doctor and bed counts are therefore not allowed to override live NEMC capacity until a matched HIRA profile is loaded.

## Verification

```bash
npm test
npm run lint
npm run build
```
