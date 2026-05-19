# Frontend Designer Handoff: OR Emergency Transfer Console

## 1. Product Goal

이 앱은 응급 통화 transcript와 신고 위치를 받아, LLM이 OR 모델용 변수를 추출하고, 서울 응급의료기관 live capacity를 반영해 최적 병원 top-3를 추천하는 실험용 의사결정 콘솔이다.

프론트엔드의 목적은 “예쁜 랜딩 페이지”가 아니라 “응급 이송 판단 과정을 설명 가능하게 보여주는 작업 화면”을 만드는 것이다. 사용자는 OR 팀플 시연자, 응급 이송 의사결정 흐름을 검토하는 교수/팀원, 그리고 가상의 119 상황실 운영자라고 보면 된다.

핵심 성공 기준:

- transcript 입력부터 병원 top-3 추천까지 한 화면에서 end-to-end로 이해된다.
- LLM이 뽑은 `medical_observations`와 `or_parameters`가 분리되어 보인다.
- 추천 결과가 단순 순위가 아니라 `travel`, `bed buffer`, `resource margin`, `constraints` 근거와 함께 설명된다.
- `available_er_beds > 0`만 보는 모델이 아니라, 병상 여유와 이송시간 slack을 같이 고려하는 `capacity_buffer_v2`임이 명확하다.
- 실제 의료 의사결정 시스템처럼 과장하지 않고, “OR 팀플용 deterministic recommendation demo”라는 경계가 유지된다.

## 2. Surface Strategy

첫 화면은 operational cockpit이어야 한다. 마케팅 hero, 큰 슬로건, 장식적 카드 그리드는 만들지 않는다.

권장 IA:

1. `/` 단일 작업 콘솔
2. 선택적으로 `/hospitals` 또는 같은 페이지의 drawer/tab로 병원 데이터 탐색
3. 별도 관리자 화면 없이 capacity refresh는 “개발/데모용” 보조 액션으로만 노출

권장 첫 화면 구조:

- 상단 status bar
  - 서비스 상태: OpenRouter configured, NEMC configured, model name, live hospital count
  - 데이터 기준: live capacity 51개, active hospital 74개, missing live 23개
- 좌측 input column
  - sample transcript 선택
  - transcript textarea
  - incident location 입력: 서울 preset, 또는 lat/lon manual input
  - `Run Recommendation` primary action
- 중앙 extraction column
  - Stage 1: medical observations
  - Stage 2: OR parameters
  - validation warnings/failures
- 우측 recommendation column
  - top-3 hospital ranking
  - bed buffer tier, available ER beds, estimated travel time, time slack
  - objective decomposition
  - constraint violations
- 하단 또는 drawer
  - hospital data explorer
  - live capacity table
  - raw JSON debug view, 접을 수 있게 처리

## 3. Visual Direction

디자인 톤은 “Seoul EMS operations console”이다. 조용하고 스캔이 빠른 공공/의료 운영 도구처럼 보여야 한다.

권장 스타일:

- 배경: off-white 또는 아주 밝은 neutral gray
- 텍스트: near-black, muted gray
- accent:
  - primary action: restrained blue or teal
  - high urgency / infeasible: red
  - medium risk / warning: amber
  - stable capacity: green
- typography:
  - 기존 Next/Geist 기반을 유지해도 된다.
  - 숫자, id, timestamp, objective score는 mono 스타일을 사용한다.
- layout:
  - dashboard이므로 반복 item card는 허용한다.
  - 다만 card 안에 card를 중첩하지 않는다.
  - 정보 밀도는 높게 유지하되, column별 목적은 명확히 나눈다.

금지:

- hero landing page
- “AI가 생명을 구합니다” 같은 과장된 마케팅 copy
- confidence score 표시
- 병원 추천을 “확정 진료 가능”처럼 표현
- 실제 지도/교통 API를 쓰지 않으면서 live traffic처럼 보이게 하는 표현
- API key, phone-like secret, env raw value 노출

## 4. Core User Flow

### Flow A: Demo Transcript 기반 추천

1. 사용자가 sample case 5개 중 하나를 선택한다.
2. transcript textarea에 내용이 채워진다.
3. 사용자가 신고 위치를 입력한다.
4. `POST /api/or/recommendations`에 `transcript`, `case_id`, `title`, `incident_location`, `limit`을 보낸다.
5. 화면은 순차 loading state를 보여준다:
   - `Extracting medical observations`
   - `Converting to OR parameters`
   - `Ranking hospitals`
6. 결과 화면은 다음 순서로 보여준다:
   - OR parameters summary
   - top-3 recommended hospitals
   - 병원별 추천 근거
   - Stage 1 medical observation details

### Flow B: Manual OR Parameters 기반 추천

1. 사용자가 “Manual OR parameters” mode로 전환한다.
2. severity, deterioration, vulnerability, required departments/resources, max transport time, minimum hospital level을 직접 선택한다.
3. `POST /api/or/recommendations`에 `or_parameters`와 `incident_location`을 보낸다.
4. LLM 없이 OR ranking만 확인한다.

이 mode는 발표 중 LLM 호출이 느리거나 실패할 때 fallback으로 중요하다.

### Flow C: Hospital Data Review

1. 사용자가 hospital data panel을 연다.
2. `GET /api/or/hospitals?mode=live`로 51개 live capacity 후보를 본다.
3. 필요하면 `mode=active`로 74개 전체와 missing live 23개를 확인한다.
4. 병상 수, operating room 수, ICU 관련 field, CT/MRI/ventilator availability를 table로 스캔한다.

## 5. API Contracts

### Health

`GET /api/or/health`

용도:

- 앱 로드 시 backend readiness 확인
- status bar에 model/data readiness 표시

중요 response field:

```ts
{
  status: "ok";
  runtime: "nextjs-node-route-handler";
  env: {
    openrouterConfigured: boolean;
    openrouterModel: string;
    nemcConfigured: boolean;
  };
  data: {
    activeHospitalCount: number;
    liveCapacityHospitalCount: number;
    activeWithoutLiveCapacityCount: number;
    staticProfileCount: number;
    candidatePolicy: "primary_live_capacity_51";
    staticProfilePolicy: string;
  };
}
```

UI rule:

- `openrouterConfigured`와 `nemcConfigured`는 boolean status만 보여준다.
- API key 값은 절대 표시하지 않는다.

### Hospitals

`GET /api/or/hospitals?mode=live`

용도:

- primary recommendation candidate set 확인
- 병원 데이터 explorer/table 구성

`mode=live`:

- 51개 primary candidates
- 각 candidate에 `hospital`, `capability`, `capacity`, `staticProfile` 포함

`mode=active`:

- 74개 active candidates
- 23개 missing-live-capacity 후보도 함께 확인 가능

중요 field:

```ts
candidate.hospital = {
  hospital_id: string;
  hospital_name: string;
  address: string;
  district: string;
  lat: number;
  lon: number;
  emergency_level_model:
    | "regional_center"
    | "local_center_or_above"
    | "emergency_institution_ok";
}

candidate.capacity = {
  available_er_beds: number | null;
  available_operating_rooms: number | null;
  available_general_icu_beds: number | null;
  available_surgical_icu_beds: number | null;
  available_neurosurgery_icu_beds: number | null;
  available_trauma_icu_beds: number | null;
  ct_available_live: boolean | null;
  mri_available_live: boolean | null;
  ventilator_available_live: boolean | null;
  fetched_at: string;
  hvidate_raw: string;
}
```

### Recommendation

`POST /api/or/recommendations`

Transcript input:

```json
{
  "case_id": "C001",
  "title": "고령 낙상 + 두부 충격 + 일시 의식저하",
  "transcript": "119상황실: ...",
  "incident_location": { "lat": 37.5665, "lon": 126.978 },
  "limit": 3
}
```

Manual OR parameter input:

```json
{
  "incident_location": { "lat": 37.5665, "lon": 126.978 },
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
  "limit": 3
}
```

중요 response field:

```ts
{
  candidatePolicy: "primary_live_capacity_51";
  dataSummary: object;
  pipeline: {
    source: "supplied_or_parameters" | "llm_two_stage_pipeline";
    orParameters: OrParameters;
    stage1?: unknown;
    validation?: unknown;
  };
  recommendations: {
    formulation: {
      version: "capacity_buffer_v2";
      objective: string;
      hardConstraints: string[];
      candidateSetPolicy: "primary_live_capacity_only";
    };
    rankings: RankedHospital[];
  };
}
```

Ranking item:

```ts
{
  rank: number;
  feasible: boolean;
  hospital: {
    hospital: HospitalDim;
    capability: HospitalCapability;
    capacity: HospitalCapacity;
    staticProfile: HospitalStaticProfile;
  };
  estimatedTravelTimeMin: number;
  timeSlackMin: number;
  distanceKm: number;
  availableErBeds: number | null;
  bedBufferTier:
    | "unknown"
    | "infeasible_full_or_overcapacity"
    | "high_risk_1_2"
    | "medium_risk_3_5"
    | "low_risk_6_10"
    | "stable_buffer_gt_10";
  totalCost: number;
  objectiveTerms: {
    estimated_travel_time_min: number;
    time_slack_min: number;
    available_er_beds: number | null;
    bed_buffer_tier: string;
    bed_buffer_risk: number;
    resource_margin_risk: number;
    static_reliability_penalty: number;
    travel_cost: number;
    level_penalty: number;
    hard_constraint_penalty: number;
    total_cost: number;
  };
  constraintViolations: string[];
}
```

### LLM Extraction Only

`POST /api/or/pipeline/extract`

용도:

- 추천 없이 LLM pipeline만 디버깅하고 싶을 때
- frontend에서는 optional debug tool로만 둔다.

### Capacity Refresh

`POST /api/or/capacity/refresh`

용도:

- NEMC live capacity를 개발자가 확인할 때
- 일반 사용자 primary flow에는 넣지 않는다.

주의:

- 이 endpoint는 env `NEMC_SERVICE_KEY`가 필요하다.
- 전체 서울 refresh는 느릴 수 있으므로 UI에 노출한다면 district 단위 refresh만 먼저 제공한다.

## 6. Label Dictionary

### Incident Type

- `fall_head_injury`: 낙상 + 두부 손상
- `fall_orthopedic`: 낙상 + 정형외과 손상
- `traffic_trauma`: 교통/오토바이 외상
- `blunt_abdominal_trauma`: 복부 둔상
- `minor_head_injury_anticoagulant`: 경미 두부외상 + 항응고제/취약성
- `other_trauma`: 기타 외상

### Hospital Level

- `regional_center`: 권역응급의료센터
- `local_center_or_above`: 지역응급의료센터 이상
- `emergency_institution_ok`: 응급의료기관 가능

### Departments

- `emergency_medicine`: 응급의학과
- `neurosurgery`: 신경외과
- `orthopedics`: 정형외과
- `general_surgery`: 일반외과
- `trauma_surgery`: 외상외과

### Resources

- `ct`: CT
- `xray`: X-ray
- `orthopedic_trauma`: 정형외상 대응
- `surgery_capability`: 수술 가능성
- `bleeding_control`: 출혈 처치/수술 대응
- `trauma_resuscitation`: 외상 소생

### Bed Buffer Tier

- `stable_buffer_gt_10`: 안정적 여유, green
- `low_risk_6_10`: 낮은 병상 소진 리스크, green/teal
- `medium_risk_3_5`: 중간 병상 소진 리스크, amber
- `high_risk_1_2`: 높은 병상 소진 리스크, orange/red
- `infeasible_full_or_overcapacity`: 이송 후보 부적합, red
- `unknown`: live bed 정보 불명, gray

### Constraint Violations

- `max_transport_time_exceeded`: 최대 이송시간 초과
- `minimum_hospital_level_not_met`: 요구 병원 수준 미충족
- `missing_live_er_bed_count`: 실시간 응급실 병상 정보 없음
- `no_positive_available_er_beds`: 가용 응급실 병상 없음
- `required_department_missing`: 필수 진료과 미충족
- `required_resource_missing`: 필수 자원 미충족

## 7. Component Requirements

### `OperationalStatusBar`

Displays:

- backend status
- OpenRouter configured
- model: default `openai/gpt-5.4-mini`
- NEMC configured
- data counts: `51 live / 74 active / 23 missing`

Do not show raw env values.

### `TranscriptInputPanel`

Must include:

- sample case selector
- textarea
- case title
- run button
- manual OR parameter mode toggle

Good sample cases:

- C001: 고령 낙상 + 두부 충격 + 일시 의식저하
- C002: 오토바이 사고 + 하지 변형/골절 의심 + 출혈
- C003: 계단 낙상 + 허리/골반 통증 + 보행 불가
- C004: 공사장 둔상 + 복부 통증 + 어지러움
- C005: 가벼운 넘어짐처럼 보이나 항응고제/고령 취약성 언급

### `IncidentLocationInput`

Must include:

- lat/lon manual fields
- Seoul preset buttons:
  - 서울시청: `37.5665, 126.9780`
  - 강남역: `37.4979, 127.0276`
  - 홍대입구: `37.5572, 126.9254`
  - 잠실역: `37.5133, 127.1000`

Display copy:

- “현재 위치는 transcript에서 추출하지 않고, 신고 위치를 알고 있다고 가정합니다.”
- “이송시간은 직선거리 기반 추정치이며 실시간 교통 API가 아닙니다.”

### `PipelineOutputPanel`

Show:

- Stage 1 `medical_observations`
  - incident context
  - patient context
  - clinical facts list
  - missing critical info
- Stage 2 `or_parameters`
  - severity / deterioration / vulnerability
  - max transport time
  - required departments/resources
  - minimum hospital level

Do not show:

- LLM confidence score
- patient name
- patient phone
- exact diagnosis language

### `RecommendationPanel`

For each top-3 hospital:

- rank
- hospital name
- district
- emergency level
- estimated travel time
- distance
- available ER beds
- bed buffer tier
- time slack
- total cost
- feasibility state
- constraint violations

Also show score decomposition:

- travel cost
- bed buffer risk
- resource margin risk
- static reliability penalty
- hard constraint penalty

The first-rank item should visually dominate, but second/third must remain readable for comparison.

### `HospitalDataTable`

Columns:

- hospital name
- district
- emergency level
- available ER beds
- operating rooms
- ICU relevant count
- CT
- MRI
- ventilator
- fetched at

Filters:

- district
- hospital level
- bed buffer tier
- CT available
- only feasible for current case

## 8. State And Error Handling

Recommended client state:

```ts
type RunState =
  | "idle"
  | "validating_input"
  | "extracting"
  | "ranking"
  | "success"
  | "error";
```

Input validation:

- transcript mode requires non-empty transcript.
- manual mode requires valid OR parameters.
- location requires numeric lat/lon.
- limit should default to 3 for UI, even though backend accepts up to 20.

Error copy:

- Missing transcript: “응급 통화 transcript를 입력하거나 sample case를 선택하세요.”
- Missing location: “신고 위치 lat/lon이 필요합니다.”
- OpenRouter unavailable: “LLM extraction을 실행할 수 없습니다. OpenRouter 설정을 확인하세요.”
- No feasible hospital: “조건을 모두 만족하는 병원이 없습니다. 제약 위반 후보를 낮은 우선순위로 표시합니다.”
- Capacity unavailable: “일부 병원은 실시간 병상 정보가 없어 primary 추천에서 제외됩니다.”

Loading behavior:

- transcript mode는 LLM 호출 때문에 느릴 수 있다. button disabled + stage label을 보여준다.
- manual OR mode는 빠르게 끝나야 한다.
- raw JSON panel은 success 후 접힌 상태로 제공한다.

## 9. Copy Guidance

Recommended page title:

- “OR Emergency Transfer Console”

Recommended subtitle:

- “응급 통화 transcript와 신고 위치를 OR 변수로 변환하고, 서울 응급의료기관의 live capacity를 반영해 top-3 후보를 비교합니다.”

Primary button:

- “Run Recommendation”

Secondary actions:

- “Use Sample Case”
- “Manual OR Parameters”
- “View Raw JSON”
- “Open Hospital Data”

Avoid:

- “AI diagnosis”
- “확정 병원”
- “실시간 최단 경로”
- “100% 신뢰”
- “생명 구조 AI”

Use:

- “추천 후보”
- “OR parameter”
- “estimated travel time”
- “capacity buffer”
- “constraint violation”
- “modeling note”

## 10. Implementation Boundaries

Frontend developer should change:

- `app/page.tsx`
- frontend components under `components/or/*`
- optional UI helpers under `lib/or-ui/*`
- optional styles in `app/globals.css`

Frontend developer should not change without coordination:

- `lib/or/recommendation.ts`
- `lib/or/pipeline.ts`
- `lib/or/schemas.ts`
- `app/api/or/*`
- `data/or/*`

Reason:

- Backend contracts and OR formulation are already wired and tested.
- UI should consume the API as a client, not duplicate ranking logic.

## 11. Acceptance Checklist

The frontend is complete when:

- Health status loads from `/api/or/health`.
- User can select one of 5 sample transcripts.
- User can enter or choose a Seoul incident location.
- Transcript mode calls `/api/or/recommendations` and displays Stage 1, Stage 2, and top-3 results.
- Manual OR parameter mode calls the same endpoint without LLM.
- Top-3 recommendations display bed buffer tier, available ER beds, time slack, objective decomposition, and constraint violations.
- Hospital data explorer shows 51 live candidates and can explain that 23 active facilities lack live capacity.
- UI does not expose API keys or raw env values.
- UI does not show LLM confidence score.
- UI clearly labels travel time as estimated, not live traffic.
- Desktop and mobile layouts have no overlapping text, overflowing buttons, or unreadable tables.

## 12. Verification Commands

After frontend implementation:

```bash
npm test
npm run lint
npm run build
```

Manual API smoke:

```bash
curl http://localhost:3000/api/or/health
curl http://localhost:3000/api/or/hospitals?mode=live
```

Recommendation smoke:

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
      "or_notes": "frontend smoke"
    },
    "limit": 3
  }'
```

