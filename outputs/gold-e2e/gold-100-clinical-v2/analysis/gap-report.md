# Gold 100 E2E GAP 분석 리포트

생성 시각: 2026-05-26T11:42:46.575Z
Run: gold-100-clinical-v2

## 핵심 정량 요약

```json
{
  "caseCount": 100,
  "generatedAt": "2026-05-26T11:42:46.573Z",
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
    "medianLatencyMs": 4724
  },
  "stage1": {
    "medianClinicalFactCount": 7,
    "medianMissingInfoCount": 7,
    "lowFactCountCases": []
  },
  "stage2": {
    "incidentTypeCounts": {
      "cardiac_arrest": 10,
      "traffic_trauma": 6,
      "fall_head_injury": 11,
      "stroke": 14,
      "cardiac": 16,
      "respiratory_failure": 20,
      "gi_bleeding": 5,
      "seizure": 11,
      "other_trauma": 7
    },
    "maxTransportTimeCounts": {
      "10": 4,
      "15": 23,
      "20": 43,
      "30": 30
    },
    "severityCounts": {
      "3": 1,
      "4": 59,
      "5": 40
    }
  },
  "ranking": {
    "succeeded": 100,
    "skippedOrFailed": 0,
    "noFeasibleCount": 0,
    "noHardFeasibleCount": 0,
    "noFeasibleCaseIds": [],
    "noWithinTimeFeasibleCount": 16,
    "noWithinTimeFeasibleCaseIds": [
      "GOLD-002",
      "GOLD-003",
      "GOLD-016",
      "GOLD-018",
      "GOLD-019",
      "GOLD-024",
      "GOLD-028",
      "GOLD-029",
      "GOLD-032",
      "GOLD-033",
      "GOLD-047",
      "GOLD-066",
      "GOLD-067",
      "GOLD-075",
      "GOLD-076",
      "GOLD-078"
    ],
    "changedVsNearestCount": 29,
    "softTimeExceededTop1Count": 16,
    "softTimeExceededTop1CaseIds": [
      "GOLD-002",
      "GOLD-003",
      "GOLD-016",
      "GOLD-018",
      "GOLD-019",
      "GOLD-024",
      "GOLD-028",
      "GOLD-029",
      "GOLD-032",
      "GOLD-033",
      "GOLD-047",
      "GOLD-066",
      "GOLD-067",
      "GOLD-075",
      "GOLD-076",
      "GOLD-078"
    ],
    "medianSoftTimeExceededCandidateCount": 17,
    "medianTop1TimeSoftPenalty": 0,
    "top1BedTierCounts": {
      "low_risk_6_10": 43,
      "stable_buffer_gt_10": 37,
      "medium_risk_3_5": 20
    },
    "lowSlackUnder5MinCount": 11,
    "softFlagCounts": {
      "max_transport_time_soft_exceeded": 16
    },
    "hardConstraintViolationCounts": {},
    "top1HospitalCounts": {
      "강북삼성병원": 7,
      "학교법인고려중앙학원고려대학교의과대학부속병원(안암병원)": 5,
      "한양대학교병원": 16,
      "국립중앙의료원": 2,
      "의료법인한전의료재단한일병원": 6,
      "건국대학교병원": 4,
      "서울특별시서울의료원": 7,
      "이화여자대학교의과대학부속목동병원": 11,
      "가톨릭대학교은평성모병원": 2,
      "고려대학교의과대학부속구로병원": 8,
      "한림대학교강남성심병원": 5,
      "성애의료재단성애병원": 5,
      "인제대학교상계백병원": 3,
      "가톨릭대학교여의도성모병원": 2,
      "의료법인서울효천의료재단에이치플러스양지병원": 4,
      "순천향대학교부속서울병원": 5,
      "한국보훈복지의료공단중앙보훈병원": 5,
      "성심의료재단강동성심병원": 2,
      "강동경희대학교병원": 1
    }
  }
}
```

## Selected Root Gaps

### 1. 임상축 재정렬 후에도 dominant 6축 밖 medical edge case가 trauma fallback으로 남음
- evidence: 76/100 cases now use medical incident enums, but 2/96 non-trauma high-acuity cases with no source trauma mechanism still mapped to trauma-centered incident enums.
- root cause: 심정지/뇌졸중/호흡부전/발작/흉통/GI 출혈 축은 생겼지만, 중독·대사성 의식저하·산과성 출혈·원인미상 critical medical처럼 현장 텍스트에 실제로 나타나는 edge medical 축은 아직 명시되지 않았다.
- fix direction: enum을 진단명처럼 크게 늘리지 말고 `toxicologic_metabolic`, `obstetric_bleeding`, `undifferentiated_critical_medical` 정도의 제한된 catch-all medical 축을 추가하거나, 최소한 `other_trauma` 대신 medical fallback으로 보내는 deterministic guard를 둔다.
- not fix yet: 남은 케이스를 모두 개별 질환 enum으로 쪼개면 라벨 없는 상태에서 schema가 다시 과적합되고 Stage 2 선택 안정성이 떨어진다.

### 2. 이송시간은 하드 탈락보다 소프트 비용·경고 calibration 문제로 관리해야 함
- evidence: 0 hard no-feasible cases, 16 no within-time feasible cases, 16 top-1 soft transport exceedances, and 11 top recommendations with 0-5 minutes slack.
- root cause: 시간 소프트화로 zero-feasible 절벽은 줄었지만, 현재 ETA는 실제 경로/교통/오프로드 시간이 아니라 deterministic Seoul proxy라 초과 페널티와 경고 문구의 calibration이 production claim을 좌우한다.
- fix direction: 시간 초과를 feasible 실패와 분리해 표시하고, top-1이 시간을 넘는 케이스는 second-best/within-time 후보와 같이 노출하며, 추후 route-time API 또는 실측 이송시간으로만 계수를 보정한다.
- not fix yet: 시간 소프트 페널티 계수를 라벨 없이 임의로 키우면 schema 개선 효과와 ETA proxy 오차가 다시 섞인다.

## 케이스별 전수 리뷰 테이블

| case | category | district | stage1 | stage2 | ranking | tags |
|---|---|---|---|---|---|---|
|GOLD-001|cardiac_arrest_rosc|종로구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|tight_transport_window|
|GOLD-002|stroke_neuro_consciousness|중구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천이 요청 이송시간을 초과해 소프트 페널티로 처리됨|tight_transport_window, no_within_time_feasible_candidate, soft_transport_exceeded_top1|
|GOLD-003|cardiac_arrest_rosc|용산구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천이 요청 이송시간을 초과해 소프트 페널티로 처리됨|tight_transport_window, no_within_time_feasible_candidate, soft_transport_exceeded_top1|
|GOLD-004|cardiac_arrest_rosc|성동구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-005|major_trauma_head_injury|중구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천의 이송시간 여유가 5분 미만|low_time_slack, differs_from_nearest_feasible|
|GOLD-006|stroke_neuro_consciousness|성동구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-007|stroke_neuro_consciousness|동대문구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-008|stroke_neuro_consciousness|성북구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-009|cardiac_arrest_rosc|동대문구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-010|respiratory_failure_airway|중구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-011|cardiac_arrest_rosc|성북구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|tight_transport_window|
|GOLD-012|respiratory_failure_airway|성동구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|tight_transport_window|
|GOLD-013|cardiac_arrest_rosc|강북구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-014|seizure_neurologic|중구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|tight_transport_window|
|GOLD-015|respiratory_failure_airway|광진구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-016|stroke_neuro_consciousness|강북구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천이 요청 이송시간을 초과해 소프트 페널티로 처리됨|no_within_time_feasible_candidate, soft_transport_exceeded_top1, differs_from_nearest_feasible|
|GOLD-017|respiratory_failure_airway|중랑구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|tight_transport_window|
|GOLD-018|stroke_neuro_consciousness|노원구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천이 요청 이송시간을 초과해 소프트 페널티로 처리됨|no_within_time_feasible_candidate, soft_transport_exceeded_top1|
|GOLD-019|stroke_neuro_consciousness|은평구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천이 요청 이송시간을 초과해 소프트 페널티로 처리됨|tight_transport_window, no_within_time_feasible_candidate, soft_transport_exceeded_top1|
|GOLD-020|respiratory_failure_airway|강북구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-021|respiratory_failure_airway|도봉구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천의 이송시간 여유가 5분 미만|tight_transport_window, low_time_slack, differs_from_nearest_feasible|
|GOLD-022|major_bleeding_gi|종로구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-023|respiratory_failure_airway|은평구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-024|stroke_neuro_consciousness|서대문구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천이 요청 이송시간을 초과해 소프트 페널티로 처리됨|tight_transport_window, no_within_time_feasible_candidate, soft_transport_exceeded_top1|
|GOLD-025|respiratory_failure_airway|서대문구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|differs_from_nearest_feasible|
|GOLD-026|seizure_neurologic|성동구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-027|stroke_neuro_consciousness|마포구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|differs_from_nearest_feasible|
|GOLD-028|cardiac_arrest_rosc|노원구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천이 요청 이송시간을 초과해 소프트 페널티로 처리됨|tight_transport_window, no_within_time_feasible_candidate, soft_transport_exceeded_top1|
|GOLD-029|major_bleeding_gi|용산구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천이 요청 이송시간을 초과해 소프트 페널티로 처리됨|no_within_time_feasible_candidate, soft_transport_exceeded_top1|
|GOLD-030|respiratory_failure_airway|마포구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|differs_from_nearest_feasible|
|GOLD-031|respiratory_failure_airway|양천구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천의 이송시간 여유가 5분 미만|tight_transport_window, low_time_slack, differs_from_nearest_feasible|
|GOLD-032|cardiac_arrest_rosc|은평구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천이 요청 이송시간을 초과해 소프트 페널티로 처리됨|tight_transport_window, no_within_time_feasible_candidate, soft_transport_exceeded_top1|
|GOLD-033|cardiac_arrest_rosc|마포구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천이 요청 이송시간을 초과해 소프트 페널티로 처리됨|tight_transport_window, no_within_time_feasible_candidate, soft_transport_exceeded_top1|
|GOLD-034|cardiac_arrest_rosc|마포구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천의 이송시간 여유가 5분 미만|tight_transport_window, low_time_slack, differs_from_nearest_feasible|
|GOLD-035|stroke_neuro_consciousness|양천구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천의 이송시간 여유가 5분 미만|tight_transport_window, low_time_slack, differs_from_nearest_feasible|
|GOLD-036|stroke_neuro_consciousness|강서구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-037|respiratory_failure_airway|양천구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|differs_from_nearest_feasible|
|GOLD-038|stroke_neuro_consciousness|강서구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-039|stroke_neuro_consciousness|구로구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|differs_from_nearest_feasible|
|GOLD-040|respiratory_failure_airway|강서구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-041|respiratory_failure_airway|구로구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|tight_transport_window|
|GOLD-042|seizure_neurologic|동대문구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-043|stroke_neuro_consciousness|금천구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|1순위 추천의 이송시간 여유가 5분 미만|incident_schema_coverage_gap, tight_transport_window, low_time_slack|
|GOLD-044|major_bleeding_gi|광진구|핵심 증상 보존 후보|비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨|추천 후보는 현재 정식화 기준 납득 가능|incident_schema_coverage_gap|
|GOLD-045|major_bleeding_gi|중랑구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-046|cardiac_arrest_rosc|양천구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|differs_from_nearest_feasible|
|GOLD-047|major_trauma_head_injury|용산구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천이 요청 이송시간을 초과해 소프트 페널티로 처리됨|no_within_time_feasible_candidate, soft_transport_exceeded_top1|
|GOLD-048|major_bleeding_gi|성북구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-049|respiratory_failure_airway|금천구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|differs_from_nearest_feasible|
|GOLD-050|stroke_neuro_consciousness|영등포구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|differs_from_nearest_feasible|
|GOLD-051|respiratory_failure_airway|금천구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|differs_from_nearest_feasible|
|GOLD-052|respiratory_failure_airway|영등포구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|differs_from_nearest_feasible|
|GOLD-053|major_bleeding_gi|도봉구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-054|respiratory_failure_airway|동작구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천의 이송시간 여유가 5분 미만|low_time_slack|
|GOLD-055|cardiac_arrest_rosc|강서구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-056|cardiac_arrest_rosc|구로구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|tight_transport_window|
|GOLD-057|cardiac_arrest_rosc|구로구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|differs_from_nearest_feasible|
|GOLD-058|major_trauma_head_injury|광진구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천의 이송시간 여유가 5분 미만|low_time_slack|
|GOLD-059|stroke_neuro_consciousness|영등포구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|differs_from_nearest_feasible|
|GOLD-060|respiratory_failure_airway|동작구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-061|respiratory_failure_airway|관악구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-062|stroke_neuro_consciousness|동작구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천의 이송시간 여유가 5분 미만|low_time_slack|
|GOLD-063|respiratory_failure_airway|관악구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-064|stroke_neuro_consciousness|관악구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-065|stroke_neuro_consciousness|관악구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-066|stroke_neuro_consciousness|서초구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천이 요청 이송시간을 초과해 소프트 페널티로 처리됨|tight_transport_window, no_within_time_feasible_candidate, soft_transport_exceeded_top1|
|GOLD-067|respiratory_failure_airway|서초구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천이 요청 이송시간을 초과해 소프트 페널티로 처리됨|tight_transport_window, no_within_time_feasible_candidate, soft_transport_exceeded_top1|
|GOLD-068|cardiac_arrest_rosc|금천구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천의 이송시간 여유가 5분 미만|tight_transport_window, low_time_slack, differs_from_nearest_feasible|
|GOLD-069|stroke_neuro_consciousness|서초구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-070|stroke_neuro_consciousness|강남구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천의 이송시간 여유가 5분 미만|low_time_slack|
|GOLD-071|seizure_neurologic|중랑구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-072|cardiac_arrest_rosc|영등포구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|differs_from_nearest_feasible|
|GOLD-073|stroke_neuro_consciousness|강남구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|differs_from_nearest_feasible|
|GOLD-074|chest_pain_cardiac|종로구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-075|respiratory_failure_airway|서초구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천이 요청 이송시간을 초과해 소프트 페널티로 처리됨|tight_transport_window, no_within_time_feasible_candidate, soft_transport_exceeded_top1|
|GOLD-076|respiratory_failure_airway|강남구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천이 요청 이송시간을 초과해 소프트 페널티로 처리됨|tight_transport_window, no_within_time_feasible_candidate, soft_transport_exceeded_top1|
|GOLD-077|cardiac_arrest_rosc|동작구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-078|respiratory_failure_airway|강남구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|1순위 추천이 요청 이송시간을 초과해 소프트 페널티로 처리됨|tight_transport_window, no_within_time_feasible_candidate, soft_transport_exceeded_top1|
|GOLD-079|stroke_neuro_consciousness|송파구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|differs_from_nearest_feasible|
|GOLD-080|stroke_neuro_consciousness|송파구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|differs_from_nearest_feasible|
|GOLD-081|stroke_neuro_consciousness|송파구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|differs_from_nearest_feasible|
|GOLD-082|critical_medical_unspecified|종로구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|tight_transport_window|
|GOLD-083|seizure_neurologic|강북구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-084|stroke_neuro_consciousness|송파구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|differs_from_nearest_feasible|
|GOLD-085|stroke_neuro_consciousness|강동구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-086|major_bleeding_gi|노원구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-087|stroke_neuro_consciousness|강동구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-088|stroke_neuro_consciousness|강동구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-089|major_trauma_head_injury|중랑구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-090|stroke_neuro_consciousness|강동구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-091|seizure_neurologic|도봉구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|differs_from_nearest_feasible|
|GOLD-092|seizure_neurologic|은평구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-093|seizure_neurologic|서대문구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|differs_from_nearest_feasible|
|GOLD-094|chest_pain_cardiac|용산구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-095|chest_pain_cardiac|광진구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|tight_transport_window|
|GOLD-096|chest_pain_cardiac|동대문구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-097|chest_pain_cardiac|성북구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-098|chest_pain_cardiac|도봉구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|differs_from_nearest_feasible|
|GOLD-099|chest_pain_cardiac|노원구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능||
|GOLD-100|chest_pain_cardiac|서대문구|핵심 증상 보존 후보|OR parameter 자동 판정 후보|추천 후보는 현재 정식화 기준 납득 가능|differs_from_nearest_feasible|

## 대표 포렌식 후보

### GOLD-001 · cardiac_arrest_rosc · 종로구
- tags: tight_transport_window
- stage1: 핵심 증상 보존 후보
- stage2: OR parameter 자동 판정 후보
- ranking: 추천 후보는 현재 정식화 기준 납득 가능
- note: top=강북삼성병원, 9분, 6 beds; max_transport=15분; hard_feasible=24; within_time_feasible=3; top1_time_soft_penalty=0

### GOLD-002 · stroke_neuro_consciousness · 중구
- tags: tight_transport_window, no_within_time_feasible_candidate, soft_transport_exceeded_top1
- stage1: 핵심 증상 보존 후보
- stage2: OR parameter 자동 판정 후보
- ranking: 1순위 추천이 요청 이송시간을 초과해 소프트 페널티로 처리됨
- note: top=학교법인고려중앙학원고려대학교의과대학부속병원(안암병원), 16분, 9 beds; max_transport=10분; hard_feasible=6; within_time_feasible=0; top1_time_soft_penalty=1336

### GOLD-003 · cardiac_arrest_rosc · 용산구
- tags: tight_transport_window, no_within_time_feasible_candidate, soft_transport_exceeded_top1
- stage1: 핵심 증상 보존 후보
- stage2: OR parameter 자동 판정 후보
- ranking: 1순위 추천이 요청 이송시간을 초과해 소프트 페널티로 처리됨
- note: top=한양대학교병원, 23분, 14 beds; max_transport=10분; hard_feasible=6; within_time_feasible=0; top1_time_soft_penalty=2974

### GOLD-005 · major_trauma_head_injury · 중구
- tags: low_time_slack, differs_from_nearest_feasible
- stage1: 핵심 증상 보존 후보
- stage2: OR parameter 자동 판정 후보
- ranking: 1순위 추천의 이송시간 여유가 5분 미만
- note: top=한양대학교병원, 17분, 14 beds; max_transport=20분; hard_feasible=6; within_time_feasible=2; top1_time_soft_penalty=0

### GOLD-011 · cardiac_arrest_rosc · 성북구
- tags: tight_transport_window
- stage1: 핵심 증상 보존 후보
- stage2: OR parameter 자동 판정 후보
- ranking: 추천 후보는 현재 정식화 기준 납득 가능
- note: top=학교법인고려중앙학원고려대학교의과대학부속병원(안암병원), 7분, 9 beds; max_transport=15분; hard_feasible=24; within_time_feasible=3; top1_time_soft_penalty=0

### GOLD-012 · respiratory_failure_airway · 성동구
- tags: tight_transport_window
- stage1: 핵심 증상 보존 후보
- stage2: OR parameter 자동 판정 후보
- ranking: 추천 후보는 현재 정식화 기준 납득 가능
- note: top=한양대학교병원, 7분, 14 beds; max_transport=15분; hard_feasible=24; within_time_feasible=3; top1_time_soft_penalty=0

### GOLD-014 · seizure_neurologic · 중구
- tags: tight_transport_window
- stage1: 핵심 증상 보존 후보
- stage2: OR parameter 자동 판정 후보
- ranking: 추천 후보는 현재 정식화 기준 납득 가능
- note: top=국립중앙의료원, 7분, 9 beds; max_transport=15분; hard_feasible=24; within_time_feasible=3; top1_time_soft_penalty=0

### GOLD-016 · stroke_neuro_consciousness · 강북구
- tags: no_within_time_feasible_candidate, soft_transport_exceeded_top1, differs_from_nearest_feasible
- stage1: 핵심 증상 보존 후보
- stage2: OR parameter 자동 판정 후보
- ranking: 1순위 추천이 요청 이송시간을 초과해 소프트 페널티로 처리됨
- note: top=서울특별시서울의료원, 21분, 8 beds; max_transport=20분; hard_feasible=6; within_time_feasible=0; top1_time_soft_penalty=526

### GOLD-017 · respiratory_failure_airway · 중랑구
- tags: tight_transport_window
- stage1: 핵심 증상 보존 후보
- stage2: OR parameter 자동 판정 후보
- ranking: 추천 후보는 현재 정식화 기준 납득 가능
- note: top=서울특별시서울의료원, 6분, 8 beds; max_transport=15분; hard_feasible=24; within_time_feasible=3; top1_time_soft_penalty=0

### GOLD-018 · stroke_neuro_consciousness · 노원구
- tags: no_within_time_feasible_candidate, soft_transport_exceeded_top1
- stage1: 핵심 증상 보존 후보
- stage2: OR parameter 자동 판정 후보
- ranking: 1순위 추천이 요청 이송시간을 초과해 소프트 페널티로 처리됨
- note: top=서울특별시서울의료원, 22분, 8 beds; max_transport=20분; hard_feasible=11; within_time_feasible=0; top1_time_soft_penalty=664

### GOLD-019 · stroke_neuro_consciousness · 은평구
- tags: tight_transport_window, no_within_time_feasible_candidate, soft_transport_exceeded_top1
- stage1: 핵심 증상 보존 후보
- stage2: OR parameter 자동 판정 후보
- ranking: 1순위 추천이 요청 이송시간을 초과해 소프트 페널티로 처리됨
- note: top=이화여자대학교의과대학부속목동병원, 27분, 5 beds; max_transport=15분; hard_feasible=6; within_time_feasible=0; top1_time_soft_penalty=2704

### GOLD-021 · respiratory_failure_airway · 도봉구
- tags: tight_transport_window, low_time_slack, differs_from_nearest_feasible
- stage1: 핵심 증상 보존 후보
- stage2: OR parameter 자동 판정 후보
- ranking: 1순위 추천의 이송시간 여유가 5분 미만
- note: top=의료법인한전의료재단한일병원, 13분, 9 beds; max_transport=15분; hard_feasible=24; within_time_feasible=2; top1_time_soft_penalty=0

### GOLD-024 · stroke_neuro_consciousness · 서대문구
- tags: tight_transport_window, no_within_time_feasible_candidate, soft_transport_exceeded_top1
- stage1: 핵심 증상 보존 후보
- stage2: OR parameter 자동 판정 후보
- ranking: 1순위 추천이 요청 이송시간을 초과해 소프트 페널티로 처리됨
- note: top=이화여자대학교의과대학부속목동병원, 22분, 5 beds; max_transport=15분; hard_feasible=6; within_time_feasible=0; top1_time_soft_penalty=1534

### GOLD-025 · respiratory_failure_airway · 서대문구
- tags: differs_from_nearest_feasible
- stage1: 핵심 증상 보존 후보
- stage2: OR parameter 자동 판정 후보
- ranking: 추천 후보는 현재 정식화 기준 납득 가능
- note: top=강북삼성병원, 13분, 6 beds; max_transport=30분; hard_feasible=24; within_time_feasible=11; top1_time_soft_penalty=0

### GOLD-027 · stroke_neuro_consciousness · 마포구
- tags: differs_from_nearest_feasible
- stage1: 핵심 증상 보존 후보
- stage2: OR parameter 자동 판정 후보
- ranking: 추천 후보는 현재 정식화 기준 납득 가능
- note: top=이화여자대학교의과대학부속목동병원, 15분, 5 beds; max_transport=20분; hard_feasible=24; within_time_feasible=2; top1_time_soft_penalty=0

