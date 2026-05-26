# Gold 100 E2E GAP 분석 리포트

생성 시각: 2026-05-26T06:21:31.369Z
Run: gold-100-post-realign

## 핵심 정량 요약

```json
{
  "caseCount": 100,
  "generatedAt": "2026-05-26T06:21:31.368Z",
  "distributions": {
    "categoryCounts": {
      "cardiac_arrest_rosc": 17,
      "stroke_neuro_consciousness": 31,
      "major_trauma_head_injury": 4,
      "respiratory_failure_airway": 24,
      "seizure_neurologic": 8,
      "major_bleeding_gi": 7,
      "chest_pain_cardiac": 8,
      "critical_medical_unspecified": 1
    },
    "districtCounts": {
      "종로구": 4,
      "중구": 4,
      "용산구": 4,
      "성동구": 4,
      "동대문구": 4,
      "성북구": 4,
      "강북구": 4,
      "광진구": 4,
      "중랑구": 4,
      "노원구": 4,
      "은평구": 4,
      "도봉구": 4,
      "서대문구": 4,
      "마포구": 4,
      "양천구": 4,
      "강서구": 4,
      "구로구": 4,
      "금천구": 4,
      "영등포구": 4,
      "동작구": 4,
      "관악구": 4,
      "서초구": 4,
      "강남구": 4,
      "송파구": 4,
      "강동구": 4
    },
    "zoneCounts": {
      "central": 12,
      "east": 20,
      "north": 12,
      "outer": 20,
      "west": 20,
      "south": 16
    }
  },
  "pipeline": {
    "succeeded": 1,
    "failed": 99,
    "validationFailureCases": 99,
    "validationWarningCases": 0,
    "medianLatencyMs": 5521
  },
  "stage1": {
    "medianClinicalFactCount": 6,
    "medianMissingInfoCount": 6,
    "lowFactCountCases": []
  },
  "stage2": {
    "incidentTypeCounts": {
      "cardiac_arrest": 1
    },
    "maxTransportTimeCounts": {
      "15": 1
    },
    "severityCounts": {
      "5": 1
    }
  },
  "ranking": {
    "succeeded": 1,
    "skippedOrFailed": 99,
    "noFeasibleCount": 0,
    "noFeasibleCaseIds": [],
    "changedVsNearestCount": 0,
    "top1BedTierCounts": {
      "low_risk_6_10": 1
    },
    "lowSlackUnder5MinCount": 1,
    "top1HospitalCounts": {
      "학교법인고려중앙학원고려대학교의과대학부속병원(안암병원)": 1
    }
  }
}
```

## Selected Root Gaps

### 1. LLM Stage 2 incident/resource schema가 gold 100의 실제 고위험 질병 분포를 충분히 담지 못함
- evidence: 96/100 cases are non-trauma high-acuity categories; 0 succeeded cases were forced into trauma-centered incident enums.
- root cause: 현재 OR parameter enum은 낙상/외상 중심이라 심정지, 호흡부전, 뇌졸중/의식장애, 흉통 같은 생산 케이스를 표현하는 축이 부족하다.
- fix direction: incident_type과 required_resources를 응급 질병 중심으로 확장하고, category별 최소 자원 규칙을 deterministic validator에 추가한다.
- not fix yet: 병원 ranking 계수부터 조정하면 잘못된 OR 입력을 더 정교하게 최적화하는 문제가 생긴다.

### 2. LLM 출력 품질은 ranking 품질과 분리해서 관리해야 함
- evidence: 99 pipeline failures and 99 validation/low-fact warning cases were observed.
- root cause: Stage 1 사실 보존, Stage 2 parameter mapping, OR ranking이 한 API 응답 안에 붙어 있어 실패 원인이 섞이기 쉽다.
- fix direction: Stage별 retry/review queue를 만들고, Stage 2 후에는 category-aware consistency check를 통과한 case만 ranking claim에 포함한다.
- not fix yet: 단순 프롬프트 강화만으로는 schema mismatch와 validation 문제를 동시에 해결하기 어렵다.

## 케이스별 전수 리뷰 테이블

| case | category | district | stage1 | stage2 | ranking | tags |
|---|---|---|---|---|---|---|
|GOLD-001|cardiac_arrest_rosc|종로구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천의 이송시간 여유가 5분 미만|tight_transport_window, low_time_slack|
|GOLD-002|stroke_neuro_consciousness|중구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-003|cardiac_arrest_rosc|용산구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-004|cardiac_arrest_rosc|성동구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-005|major_trauma_head_injury|중구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-006|stroke_neuro_consciousness|성동구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-007|stroke_neuro_consciousness|동대문구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-008|stroke_neuro_consciousness|성북구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-009|cardiac_arrest_rosc|동대문구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-010|respiratory_failure_airway|중구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-011|cardiac_arrest_rosc|성북구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-012|respiratory_failure_airway|성동구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-013|cardiac_arrest_rosc|강북구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-014|seizure_neurologic|중구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-015|respiratory_failure_airway|광진구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-016|stroke_neuro_consciousness|강북구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-017|respiratory_failure_airway|중랑구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-018|stroke_neuro_consciousness|노원구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-019|stroke_neuro_consciousness|은평구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-020|respiratory_failure_airway|강북구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-021|respiratory_failure_airway|도봉구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-022|major_bleeding_gi|종로구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-023|respiratory_failure_airway|은평구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-024|stroke_neuro_consciousness|서대문구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-025|respiratory_failure_airway|서대문구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-026|seizure_neurologic|성동구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-027|stroke_neuro_consciousness|마포구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-028|cardiac_arrest_rosc|노원구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-029|major_bleeding_gi|용산구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-030|respiratory_failure_airway|마포구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-031|respiratory_failure_airway|양천구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-032|cardiac_arrest_rosc|은평구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-033|cardiac_arrest_rosc|마포구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-034|cardiac_arrest_rosc|마포구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-035|stroke_neuro_consciousness|양천구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-036|stroke_neuro_consciousness|강서구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-037|respiratory_failure_airway|양천구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-038|stroke_neuro_consciousness|강서구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-039|stroke_neuro_consciousness|구로구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-040|respiratory_failure_airway|강서구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-041|respiratory_failure_airway|구로구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-042|seizure_neurologic|동대문구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-043|stroke_neuro_consciousness|금천구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-044|major_bleeding_gi|광진구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-045|major_bleeding_gi|중랑구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-046|cardiac_arrest_rosc|양천구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-047|major_trauma_head_injury|용산구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-048|major_bleeding_gi|성북구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-049|respiratory_failure_airway|금천구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-050|stroke_neuro_consciousness|영등포구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-051|respiratory_failure_airway|금천구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-052|respiratory_failure_airway|영등포구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-053|major_bleeding_gi|도봉구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-054|respiratory_failure_airway|동작구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-055|cardiac_arrest_rosc|강서구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-056|cardiac_arrest_rosc|구로구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-057|cardiac_arrest_rosc|구로구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-058|major_trauma_head_injury|광진구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-059|stroke_neuro_consciousness|영등포구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-060|respiratory_failure_airway|동작구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-061|respiratory_failure_airway|관악구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-062|stroke_neuro_consciousness|동작구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-063|respiratory_failure_airway|관악구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-064|stroke_neuro_consciousness|관악구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-065|stroke_neuro_consciousness|관악구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-066|stroke_neuro_consciousness|서초구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-067|respiratory_failure_airway|서초구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-068|cardiac_arrest_rosc|금천구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-069|stroke_neuro_consciousness|서초구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-070|stroke_neuro_consciousness|강남구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-071|seizure_neurologic|중랑구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-072|cardiac_arrest_rosc|영등포구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-073|stroke_neuro_consciousness|강남구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-074|chest_pain_cardiac|종로구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-075|respiratory_failure_airway|서초구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-076|respiratory_failure_airway|강남구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-077|cardiac_arrest_rosc|동작구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-078|respiratory_failure_airway|강남구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-079|stroke_neuro_consciousness|송파구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-080|stroke_neuro_consciousness|송파구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-081|stroke_neuro_consciousness|송파구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-082|critical_medical_unspecified|종로구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-083|seizure_neurologic|강북구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-084|stroke_neuro_consciousness|송파구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-085|stroke_neuro_consciousness|강동구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-086|major_bleeding_gi|노원구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-087|stroke_neuro_consciousness|강동구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-088|stroke_neuro_consciousness|강동구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-089|major_trauma_head_injury|중랑구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-090|stroke_neuro_consciousness|강동구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-091|seizure_neurologic|도봉구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-092|seizure_neurologic|은평구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-093|seizure_neurologic|서대문구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-094|chest_pain_cardiac|용산구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-095|chest_pain_cardiac|광진구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-096|chest_pain_cardiac|동대문구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-097|chest_pain_cardiac|성북구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-098|chest_pain_cardiac|도봉구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-099|chest_pain_cardiac|노원구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|
|GOLD-100|chest_pain_cardiac|서대문구|LLM pipeline 실패로 Stage 1 검토 불가|OR parameter 생성 실패|ranking 미실행|llm_pipeline_failure, validation_failure|

## 대표 포렌식 후보

### GOLD-001 · cardiac_arrest_rosc · 종로구
- tags: tight_transport_window, low_time_slack
- stage1: 핵심 증상 보존 후보
- stage2: OR parameter 자동 판정 후보
- ranking: 1순위 추천의 이송시간 여유가 5분 미만
- note: top=학교법인고려중앙학원고려대학교의과대학부속병원(안암병원), 18분, 9 beds; max_transport=15분; strict_feasible=6

### GOLD-002 · stroke_neuro_consciousness · 중구
- tags: llm_pipeline_failure, validation_failure
- stage1: LLM pipeline 실패로 Stage 1 검토 불가
- stage2: OR parameter 생성 실패
- ranking: ranking 미실행
- note: fetch failed

### GOLD-003 · cardiac_arrest_rosc · 용산구
- tags: llm_pipeline_failure, validation_failure
- stage1: LLM pipeline 실패로 Stage 1 검토 불가
- stage2: OR parameter 생성 실패
- ranking: ranking 미실행
- note: fetch failed

### GOLD-004 · cardiac_arrest_rosc · 성동구
- tags: llm_pipeline_failure, validation_failure
- stage1: LLM pipeline 실패로 Stage 1 검토 불가
- stage2: OR parameter 생성 실패
- ranking: ranking 미실행
- note: fetch failed

### GOLD-005 · major_trauma_head_injury · 중구
- tags: llm_pipeline_failure, validation_failure
- stage1: LLM pipeline 실패로 Stage 1 검토 불가
- stage2: OR parameter 생성 실패
- ranking: ranking 미실행
- note: fetch failed

### GOLD-006 · stroke_neuro_consciousness · 성동구
- tags: llm_pipeline_failure, validation_failure
- stage1: LLM pipeline 실패로 Stage 1 검토 불가
- stage2: OR parameter 생성 실패
- ranking: ranking 미실행
- note: fetch failed

### GOLD-007 · stroke_neuro_consciousness · 동대문구
- tags: llm_pipeline_failure, validation_failure
- stage1: LLM pipeline 실패로 Stage 1 검토 불가
- stage2: OR parameter 생성 실패
- ranking: ranking 미실행
- note: fetch failed

### GOLD-008 · stroke_neuro_consciousness · 성북구
- tags: llm_pipeline_failure, validation_failure
- stage1: LLM pipeline 실패로 Stage 1 검토 불가
- stage2: OR parameter 생성 실패
- ranking: ranking 미실행
- note: fetch failed

### GOLD-009 · cardiac_arrest_rosc · 동대문구
- tags: llm_pipeline_failure, validation_failure
- stage1: LLM pipeline 실패로 Stage 1 검토 불가
- stage2: OR parameter 생성 실패
- ranking: ranking 미실행
- note: fetch failed

### GOLD-010 · respiratory_failure_airway · 중구
- tags: llm_pipeline_failure, validation_failure
- stage1: LLM pipeline 실패로 Stage 1 검토 불가
- stage2: OR parameter 생성 실패
- ranking: ranking 미실행
- note: fetch failed

### GOLD-011 · cardiac_arrest_rosc · 성북구
- tags: llm_pipeline_failure, validation_failure
- stage1: LLM pipeline 실패로 Stage 1 검토 불가
- stage2: OR parameter 생성 실패
- ranking: ranking 미실행
- note: fetch failed

### GOLD-012 · respiratory_failure_airway · 성동구
- tags: llm_pipeline_failure, validation_failure
- stage1: LLM pipeline 실패로 Stage 1 검토 불가
- stage2: OR parameter 생성 실패
- ranking: ranking 미실행
- note: fetch failed

### GOLD-013 · cardiac_arrest_rosc · 강북구
- tags: llm_pipeline_failure, validation_failure
- stage1: LLM pipeline 실패로 Stage 1 검토 불가
- stage2: OR parameter 생성 실패
- ranking: ranking 미실행
- note: fetch failed

### GOLD-014 · seizure_neurologic · 중구
- tags: llm_pipeline_failure, validation_failure
- stage1: LLM pipeline 실패로 Stage 1 검토 불가
- stage2: OR parameter 생성 실패
- ranking: ranking 미실행
- note: fetch failed

### GOLD-015 · respiratory_failure_airway · 광진구
- tags: llm_pipeline_failure, validation_failure
- stage1: LLM pipeline 실패로 Stage 1 검토 불가
- stage2: OR parameter 생성 실패
- ranking: ranking 미실행
- note: fetch failed

