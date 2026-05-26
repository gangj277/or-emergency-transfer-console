# Gold 100 E2E GAP 분석 리포트

생성 시각: 2026-05-26T05:15:04.907Z
Run: gold-100-live

## 핵심 정량 요약

```json
{
  "caseCount": 100,
  "generatedAt": "2026-05-26T05:15:04.906Z",
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
    "succeeded": 100,
    "failed": 0,
    "validationFailureCases": 0,
    "validationWarningCases": 0,
    "medianLatencyMs": 4583
  },
  "stage1": {
    "medianClinicalFactCount": 8,
    "medianMissingInfoCount": 7,
    "lowFactCountCases": []
  },
  "stage2": {
    "incidentTypeCounts": {
      "other_trauma": 77,
      "fall_head_injury": 14,
      "traffic_trauma": 8,
      "blunt_abdominal_trauma": 1
    },
    "maxTransportTimeCounts": {
      "10": 44,
      "15": 38,
      "20": 15,
      "30": 3
    },
    "severityCounts": {
      "3": 3,
      "4": 53,
      "5": 44
    }
  },
  "ranking": {
    "succeeded": 100,
    "skippedOrFailed": 0,
    "noFeasibleCount": 46,
    "noFeasibleCaseIds": [
      "GOLD-001",
      "GOLD-002",
      "GOLD-003",
      "GOLD-010",
      "GOLD-013",
      "GOLD-014",
      "GOLD-016",
      "GOLD-018",
      "GOLD-019",
      "GOLD-021",
      "GOLD-024",
      "GOLD-028",
      "GOLD-029",
      "GOLD-031",
      "GOLD-032",
      "GOLD-033",
      "GOLD-034",
      "GOLD-035",
      "GOLD-037",
      "GOLD-043",
      "GOLD-046",
      "GOLD-047",
      "GOLD-050",
      "GOLD-054",
      "GOLD-058",
      "GOLD-060",
      "GOLD-062",
      "GOLD-064",
      "GOLD-066",
      "GOLD-067",
      "GOLD-068",
      "GOLD-069",
      "GOLD-070",
      "GOLD-072",
      "GOLD-073",
      "GOLD-075",
      "GOLD-076",
      "GOLD-077",
      "GOLD-078",
      "GOLD-079",
      "GOLD-083",
      "GOLD-084",
      "GOLD-087",
      "GOLD-090",
      "GOLD-094",
      "GOLD-095"
    ],
    "changedVsNearestCount": 12,
    "top1BedTierCounts": {
      "stable_buffer_gt_10": 17,
      "low_risk_6_10": 28,
      "medium_risk_3_5": 9
    },
    "lowSlackUnder5MinCount": 21,
    "top1HospitalCounts": {
      "한양대학교병원": 10,
      "학교법인고려중앙학원고려대학교의과대학부속병원(안암병원)": 4,
      "건국대학교병원": 1,
      "서울특별시서울의료원": 4,
      "의료법인한전의료재단한일병원": 1,
      "강북삼성병원": 6,
      "가톨릭대학교은평성모병원": 2,
      "이화여자대학교의과대학부속목동병원": 6,
      "한림대학교강남성심병원": 4,
      "고려대학교의과대학부속구로병원": 2,
      "성애의료재단성애병원": 2,
      "인제대학교상계백병원": 5,
      "의료법인서울효천의료재단에이치플러스양지병원": 3,
      "한국보훈복지의료공단중앙보훈병원": 2,
      "성심의료재단강동성심병원": 1,
      "강동경희대학교병원": 1
    }
  }
}
```

## Selected Root Gaps

### 1. LLM Stage 2 incident/resource schema가 gold 100의 실제 고위험 질병 분포를 충분히 담지 못함
- evidence: 96/100 cases are non-trauma high-acuity categories; 96 succeeded cases were forced into trauma-centered incident enums.
- root cause: 현재 OR parameter enum은 낙상/외상 중심이라 심정지, 호흡부전, 뇌졸중/의식장애, 흉통 같은 생산 케이스를 표현하는 축이 부족하다.
- fix direction: incident_type과 required_resources를 응급 질병 중심으로 확장하고, category별 최소 자원 규칙을 deterministic validator에 추가한다.
- not fix yet: 병원 ranking 계수부터 조정하면 잘못된 OR 입력을 더 정교하게 최적화하는 문제가 생긴다.

### 2. 이송시간 proxy와 max_transport_time 하드 제약이 production claim의 병목
- evidence: 46 no-feasible cases and 21 top recommendations with under 5 minutes slack.
- root cause: 현재 시간은 실제 경로/교통/오프로드 시간이 아니라 deterministic Seoul proxy라, 빠듯한 케이스에서 feasibility 판단이 흔들린다.
- fix direction: route-time API 또는 실측 이송시간 분포를 붙이고, tight slack case는 human-confirmation/second-best 비교로 표시한다.
- not fix yet: 병상 버퍼 계수를 보정해도 시간 proxy 오차가 큰 케이스의 feasibility 문제는 남는다.

## 케이스별 전수 리뷰 테이블

| case | category | district | stage1 | stage2 | ranking | tags |
|---|---|---|---|---|---|---|
|GOLD-001|cardiac_arrest_rosc|종로구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-002|stroke_neuro_consciousness|중구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-003|cardiac_arrest_rosc|용산구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-004|cardiac_arrest_rosc|성동구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|1순위 추천의 이송시간 여유가 5분 미만|incident_schema_coverage_gap, tight_transport_window, low_time_slack|
|GOLD-005|major_trauma_head_injury|중구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천의 이송시간 여유가 5분 미만|low_time_slack, differs_from_nearest_feasible|
|GOLD-006|stroke_neuro_consciousness|성동구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|1순위 추천의 이송시간 여유가 5분 미만|incident_schema_coverage_gap, tight_transport_window, low_time_slack|
|GOLD-007|stroke_neuro_consciousness|동대문구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap, tight_transport_window|
|GOLD-008|stroke_neuro_consciousness|성북구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap, tight_transport_window|
|GOLD-009|cardiac_arrest_rosc|동대문구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap|
|GOLD-010|respiratory_failure_airway|중구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-011|cardiac_arrest_rosc|성북구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|1순위 추천의 이송시간 여유가 5분 미만|incident_schema_coverage_gap, tight_transport_window, low_time_slack|
|GOLD-012|respiratory_failure_airway|성동구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|1순위 추천의 이송시간 여유가 5분 미만|incident_schema_coverage_gap, tight_transport_window, low_time_slack|
|GOLD-013|cardiac_arrest_rosc|강북구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-014|seizure_neurologic|중구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-015|respiratory_failure_airway|광진구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap|
|GOLD-016|stroke_neuro_consciousness|강북구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-017|respiratory_failure_airway|중랑구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|1순위 추천의 이송시간 여유가 5분 미만|incident_schema_coverage_gap, tight_transport_window, low_time_slack|
|GOLD-018|stroke_neuro_consciousness|노원구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-019|stroke_neuro_consciousness|은평구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-020|respiratory_failure_airway|강북구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap, tight_transport_window|
|GOLD-021|respiratory_failure_airway|도봉구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-022|major_bleeding_gi|종로구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap|
|GOLD-023|respiratory_failure_airway|은평구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap|
|GOLD-024|stroke_neuro_consciousness|서대문구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-025|respiratory_failure_airway|서대문구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|1순위 추천의 이송시간 여유가 5분 미만|incident_schema_coverage_gap, tight_transport_window, low_time_slack|
|GOLD-026|seizure_neurologic|성동구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap, tight_transport_window|
|GOLD-027|stroke_neuro_consciousness|마포구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|1순위 추천의 이송시간 여유가 5분 미만|incident_schema_coverage_gap, tight_transport_window, low_time_slack|
|GOLD-028|cardiac_arrest_rosc|노원구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-029|major_bleeding_gi|용산구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-030|respiratory_failure_airway|마포구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|1순위 추천의 이송시간 여유가 5분 미만|incident_schema_coverage_gap, tight_transport_window, low_time_slack|
|GOLD-031|respiratory_failure_airway|양천구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-032|cardiac_arrest_rosc|은평구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-033|cardiac_arrest_rosc|마포구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-034|cardiac_arrest_rosc|마포구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-035|stroke_neuro_consciousness|양천구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-036|stroke_neuro_consciousness|강서구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|1순위 추천의 이송시간 여유가 5분 미만|incident_schema_coverage_gap, tight_transport_window, low_time_slack|
|GOLD-037|respiratory_failure_airway|양천구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-038|stroke_neuro_consciousness|강서구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|1순위 추천의 이송시간 여유가 5분 미만|incident_schema_coverage_gap, tight_transport_window, low_time_slack|
|GOLD-039|stroke_neuro_consciousness|구로구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap, differs_from_nearest_feasible|
|GOLD-040|respiratory_failure_airway|강서구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|1순위 추천의 이송시간 여유가 5분 미만|incident_schema_coverage_gap, tight_transport_window, low_time_slack|
|GOLD-041|respiratory_failure_airway|구로구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap, tight_transport_window|
|GOLD-042|seizure_neurologic|동대문구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap, tight_transport_window|
|GOLD-043|stroke_neuro_consciousness|금천구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-044|major_bleeding_gi|광진구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|1순위 추천의 이송시간 여유가 5분 미만|incident_schema_coverage_gap, low_time_slack|
|GOLD-045|major_bleeding_gi|중랑구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap, tight_transport_window|
|GOLD-046|cardiac_arrest_rosc|양천구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-047|major_trauma_head_injury|용산구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|제약 만족 후보 없음|tight_transport_window, no_strict_feasible_candidate|
|GOLD-048|major_bleeding_gi|성북구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|1순위 추천의 이송시간 여유가 5분 미만|incident_schema_coverage_gap, tight_transport_window, low_time_slack|
|GOLD-049|respiratory_failure_airway|금천구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap, differs_from_nearest_feasible|
|GOLD-050|stroke_neuro_consciousness|영등포구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-051|respiratory_failure_airway|금천구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap, differs_from_nearest_feasible|
|GOLD-052|respiratory_failure_airway|영등포구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|1순위 추천의 이송시간 여유가 5분 미만|incident_schema_coverage_gap, tight_transport_window, low_time_slack|
|GOLD-053|major_bleeding_gi|도봉구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|1순위 추천의 이송시간 여유가 5분 미만|incident_schema_coverage_gap, tight_transport_window, low_time_slack|
|GOLD-054|respiratory_failure_airway|동작구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-055|cardiac_arrest_rosc|강서구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap|
|GOLD-056|cardiac_arrest_rosc|구로구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap, tight_transport_window|
|GOLD-057|cardiac_arrest_rosc|구로구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap, tight_transport_window, differs_from_nearest_feasible|
|GOLD-058|major_trauma_head_injury|광진구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|제약 만족 후보 없음|tight_transport_window, no_strict_feasible_candidate|
|GOLD-059|stroke_neuro_consciousness|영등포구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|1순위 추천의 이송시간 여유가 5분 미만|incident_schema_coverage_gap, tight_transport_window, low_time_slack|
|GOLD-060|respiratory_failure_airway|동작구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-061|respiratory_failure_airway|관악구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap, tight_transport_window|
|GOLD-062|stroke_neuro_consciousness|동작구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-063|respiratory_failure_airway|관악구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap, tight_transport_window|
|GOLD-064|stroke_neuro_consciousness|관악구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-065|stroke_neuro_consciousness|관악구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap, tight_transport_window|
|GOLD-066|stroke_neuro_consciousness|서초구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-067|respiratory_failure_airway|서초구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-068|cardiac_arrest_rosc|금천구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-069|stroke_neuro_consciousness|서초구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-070|stroke_neuro_consciousness|강남구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-071|seizure_neurologic|중랑구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap|
|GOLD-072|cardiac_arrest_rosc|영등포구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-073|stroke_neuro_consciousness|강남구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-074|chest_pain_cardiac|종로구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap, tight_transport_window|
|GOLD-075|respiratory_failure_airway|서초구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-076|respiratory_failure_airway|강남구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-077|cardiac_arrest_rosc|동작구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-078|respiratory_failure_airway|강남구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-079|stroke_neuro_consciousness|송파구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-080|stroke_neuro_consciousness|송파구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|1순위 추천의 이송시간 여유가 5분 미만|incident_schema_coverage_gap, tight_transport_window, low_time_slack|
|GOLD-081|stroke_neuro_consciousness|송파구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|1순위 추천의 이송시간 여유가 5분 미만|incident_schema_coverage_gap, tight_transport_window, low_time_slack|
|GOLD-082|critical_medical_unspecified|종로구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap, tight_transport_window|
|GOLD-083|seizure_neurologic|강북구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-084|stroke_neuro_consciousness|송파구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-085|stroke_neuro_consciousness|강동구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap, tight_transport_window|
|GOLD-086|major_bleeding_gi|노원구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap|
|GOLD-087|stroke_neuro_consciousness|강동구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-088|stroke_neuro_consciousness|강동구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|1순위 추천의 이송시간 여유가 5분 미만|incident_schema_coverage_gap, tight_transport_window, low_time_slack|
|GOLD-089|major_trauma_head_injury|중랑구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|tight_transport_window|
|GOLD-090|stroke_neuro_consciousness|강동구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-091|seizure_neurologic|도봉구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap|
|GOLD-092|seizure_neurologic|은평구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap|
|GOLD-093|seizure_neurologic|서대문구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap, differs_from_nearest_feasible|
|GOLD-094|chest_pain_cardiac|용산구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, no_strict_feasible_candidate|
|GOLD-095|chest_pain_cardiac|광진구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|제약 만족 후보 없음|incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate|
|GOLD-096|chest_pain_cardiac|동대문구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap, tight_transport_window|
|GOLD-097|chest_pain_cardiac|성북구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap, tight_transport_window|
|GOLD-098|chest_pain_cardiac|도봉구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap|
|GOLD-099|chest_pain_cardiac|노원구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap|
|GOLD-100|chest_pain_cardiac|서대문구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|1순위 추천의 이송시간 여유가 5분 미만|incident_schema_coverage_gap, tight_transport_window, low_time_slack|

## 대표 포렌식 후보

### GOLD-001 · cardiac_arrest_rosc · 종로구
- tags: incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate
- stage1: 핵심 증상 보존 후보
- stage2: 비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨
- ranking: 제약 만족 후보 없음
- note: top=no top feasible; max_transport=10분; strict_feasible=0

### GOLD-002 · stroke_neuro_consciousness · 중구
- tags: incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate
- stage1: 핵심 증상 보존 후보
- stage2: 비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨
- ranking: 제약 만족 후보 없음
- note: top=no top feasible; max_transport=10분; strict_feasible=0

### GOLD-003 · cardiac_arrest_rosc · 용산구
- tags: incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate
- stage1: 핵심 증상 보존 후보
- stage2: 비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨
- ranking: 제약 만족 후보 없음
- note: top=no top feasible; max_transport=10분; strict_feasible=0

### GOLD-004 · cardiac_arrest_rosc · 성동구
- tags: incident_schema_coverage_gap, tight_transport_window, low_time_slack
- stage1: 핵심 증상 보존 후보
- stage2: 비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨
- ranking: 1순위 추천의 이송시간 여유가 5분 미만
- note: top=한양대학교병원, 7분, 14 beds; max_transport=10분; strict_feasible=1

### GOLD-005 · major_trauma_head_injury · 중구
- tags: low_time_slack, differs_from_nearest_feasible
- stage1: 핵심 증상 보존 후보
- stage2: OR parameter 자동 판정 후보
- ranking: 1순위 추천의 이송시간 여유가 5분 미만
- note: top=한양대학교병원, 17분, 14 beds; max_transport=20분; strict_feasible=2

### GOLD-006 · stroke_neuro_consciousness · 성동구
- tags: incident_schema_coverage_gap, tight_transport_window, low_time_slack
- stage1: 핵심 증상 보존 후보
- stage2: 비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨
- ranking: 1순위 추천의 이송시간 여유가 5분 미만
- note: top=한양대학교병원, 7분, 14 beds; max_transport=10분; strict_feasible=1

### GOLD-007 · stroke_neuro_consciousness · 동대문구
- tags: incident_schema_coverage_gap, tight_transport_window
- stage1: 핵심 증상 보존 후보
- stage2: 비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨
- ranking: 추천 후보는 현재 정식화 기준 납득 가능
- note: top=한양대학교병원, 10분, 14 beds; max_transport=15분; strict_feasible=2

### GOLD-008 · stroke_neuro_consciousness · 성북구
- tags: incident_schema_coverage_gap, tight_transport_window
- stage1: 핵심 증상 보존 후보
- stage2: 비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨
- ranking: 추천 후보는 현재 정식화 기준 납득 가능
- note: top=학교법인고려중앙학원고려대학교의과대학부속병원(안암병원), 7분, 9 beds; max_transport=15분; strict_feasible=1

### GOLD-009 · cardiac_arrest_rosc · 동대문구
- tags: incident_schema_coverage_gap
- stage1: 핵심 증상 보존 후보
- stage2: 비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨
- ranking: 추천 후보는 현재 정식화 기준 납득 가능
- note: top=한양대학교병원, 10분, 14 beds; max_transport=20분; strict_feasible=2

### GOLD-010 · respiratory_failure_airway · 중구
- tags: incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate
- stage1: 핵심 증상 보존 후보
- stage2: 비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨
- ranking: 제약 만족 후보 없음
- note: top=no top feasible; max_transport=10분; strict_feasible=0

### GOLD-011 · cardiac_arrest_rosc · 성북구
- tags: incident_schema_coverage_gap, tight_transport_window, low_time_slack
- stage1: 핵심 증상 보존 후보
- stage2: 비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨
- ranking: 1순위 추천의 이송시간 여유가 5분 미만
- note: top=학교법인고려중앙학원고려대학교의과대학부속병원(안암병원), 7분, 9 beds; max_transport=10분; strict_feasible=1

### GOLD-012 · respiratory_failure_airway · 성동구
- tags: incident_schema_coverage_gap, tight_transport_window, low_time_slack
- stage1: 핵심 증상 보존 후보
- stage2: 비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨
- ranking: 1순위 추천의 이송시간 여유가 5분 미만
- note: top=한양대학교병원, 7분, 14 beds; max_transport=10분; strict_feasible=1

### GOLD-013 · cardiac_arrest_rosc · 강북구
- tags: incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate
- stage1: 핵심 증상 보존 후보
- stage2: 비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨
- ranking: 제약 만족 후보 없음
- note: top=no top feasible; max_transport=15분; strict_feasible=0

### GOLD-014 · seizure_neurologic · 중구
- tags: incident_schema_coverage_gap, tight_transport_window, no_strict_feasible_candidate
- stage1: 핵심 증상 보존 후보
- stage2: 비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨
- ranking: 제약 만족 후보 없음
- note: top=no top feasible; max_transport=10분; strict_feasible=0

### GOLD-015 · respiratory_failure_airway · 광진구
- tags: incident_schema_coverage_gap
- stage1: 핵심 증상 보존 후보
- stage2: 비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨
- ranking: 추천 후보는 현재 정식화 기준 납득 가능
- note: top=건국대학교병원, 6분, 13 beds; max_transport=20분; strict_feasible=5

