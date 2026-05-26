# 임상 스키마 재정렬 (Clinical-Axis Realignment)

> OR 병원배정 모델 고도화 — 현재 수집 자산 한정 (신규 데이터 수집 없음)
> 작업일: 2026-05-26

## 1. 배경 / 문제

100케이스 골드 E2E 평가(`outputs/gold-e2e/.../analysis/gap-report.md`)가 드러낸 핵심 한계:

- 실제 서울 119 케이스 분포는 **96%가 비외상 내과 고위험**
  (심정지 17 · 뇌졸중/신경 31 · 호흡부전 24 · 발작 8 · 흉통 8 · 소화기출혈 7), 외상은 4건.
- 그런데 OR 파라미터 ENUM(`incident_type`/`required_departments`/`required_resources`)이
  **전부 외상·수술 전용**이었음.

결과:
| 지표 | 재정렬 전 |
|---|---|
| `other_trauma`로 강제 붕괴 | **77 / 100** |
| feasible 병원 0개 | **46 / 100** |
| `max_transport=10분` 과도 부여 | **44 / 100** |

근본 원인은 계수나 데이터 부족이 아니라 **임상 스키마 설계**. 그리고 뇌졸중·심정지·호흡부전에
필요한 라이브 신호(MRI 98% · 혈관조영 72% · 인공호흡기 98% · 일반/내과 ICU · 혼잡도 100%)는
**이미 수집 중이나 스코어링에서 미사용** 상태였음 → 추가 수집 없이 활용 가능.

## 2. 목표

1. `incident_type`을 실제 질환 분포로 재정렬
2. 신규 자원을 **이미 수집 중인 라이브 capacity 필드**에 매핑
3. 이송시간 하드제약 → 단계적 소프트 페널티 (feasibility 절벽 제거)
4. 결정론적 검증기에 incident별 자원 정합성 규칙 + 자동보정
5. 계수를 단일 config로 외부화 (라벨 부재 → fit 대신 민감도 원칙화)

스코프 제외: 경로 API, HIRA 등 신규 데이터 수집.

## 3. 변경 내역 (파일별)

### `lib/or/types.ts` — enum 단일 소스 확장
- `incidentTypes` += `cardiac_arrest, stroke, respiratory_failure, seizure, cardiac, gi_bleeding` (외상 6개 유지 → 총 12)
- `departments` += `cardiology, neurology, pulmonology, internal_medicine` (총 9)
- `resources` += `cath_lab_pci, thrombectomy_thrombolysis, airway_ventilation, defibrillation_resuscitation, critical_care` (총 11)
- 기존 외상 값은 **절대 제거하지 않음** (테스트 픽스처·UI·structured output `strict:true` 의존).

### `lib/or/schemas.ts` — 단일 소스화 (드리프트 방지)
- 하드코딩 enum을 버리고 `./types` 배열을 import해 `enum: [...incidentTypes]` 식으로 전개.
- types.ts와 schemas.ts가 따로 놀면 "LLM은 통과·파서는 거부"하는 버그가 생기므로 한 곳에서 관리.

### `lib/or/cost-config.ts` — **신규**, 계수 외부화
- 흩어져 있던 인라인 계수(`700`, `×10`, tier base, slack factor, marginPenalty 임계/페널티,
  `100000+2500`, static 임계)를 `OR_COST_CONFIG`로 집약. **값은 그대로(추출만)**.
- 신규 `time` 블록: 소프트 이송시간 페널티 파라미터(`softBase/perMin/quadratic`).
- 라벨 정답이 없으므로 계수는 "보정된 값"이 아니라 "민감도를 보고해야 할 사전값"임을 주석에 명시.

### `lib/or/recommendation.ts` — 매칭/ICU/시간/계수
- **`hasDepartment`**: medical 진료과 4종 추가. 정적 capability 플래그가 없으므로
  라이브 신호 + 응급등급 프록시로 **폴백**(아래 매핑표). 폴백이 없으면 96% 케이스가 하드 실패.
- **`hasResource`**: medical 자원 5종 추가(아래 매핑표).
- **`relevantIcuBeds`**: incident별 올바른 ICU 풀 선택
  (뇌졸중/발작→neuro 계열, 심장/호흡→내과+일반+흉부 CCU 프록시, 소화기→외과+일반+내과).
- **`calculateResourceMarginRisk`**: `icuNeeded`/`surgeryNeeded` 트리거에 신규 incident/자원 반영,
  신규 라이브 신호 미충족 페널티(angiography/MRI/ventilator) 추가.
- **시간 소프트화**: `max_transport_time_exceeded`를 하드제약에서 제거.
  `overTime = max(0, travel − max_t)`, `timeSoftPenalty = softBase + perMin·overTime + quadratic·overTime²`.
  `costBreakdown.timeSoftPenalty` / `objectiveTerms.time_soft_penalty` / `totalCost`에 반영.
  시간만 초과한 병원은 `feasible:true` + `softFlags:["max_transport_time_soft_exceeded"]`.
- **진단(`buildConstraintDiagnostics`)**: `nonTimeFeasible`을 softFlags 기반으로 재정의,
  `relaxationHint`가 softFlag에서 시간 힌트를 읽도록 변경.
- 모든 인라인 리터럴을 `OR_COST_CONFIG.*`로 치환.

### `lib/or/validate.ts` — 정합성 규칙 + 자동보정
- `INCIDENT_REQUIREMENTS` 테이블 + `checkIncidentConsistency(params)` 추가.
- incident별 최소 자원/진료과가 누락되면 **경고 + 결정론적 자동보정**(corrected 사본에 주입).
  `failures` 아닌 `warnings`에만 추가 → 파이프라인 throw 안 함.

### `lib/or/pipeline.ts` — corrected params 사용
- Stage2 파싱 후 `checkIncidentConsistency`의 corrected params로 랭킹 → feasibility 직접 회복.

### `lib/or/prompts.ts` — Stage2 rubric 재정렬
- 외상 프레임 → **임상축 선택 가이드**(arrest→cardiac_arrest, FAST→stroke, 호흡곤란→respiratory_failure 등).
- incident별 required_resources/departments 힌트를 검증기 테이블과 일치 → 자동보정 최소화.
- **시간 rubric 완화**: 고위험 내과는 default 20–30분, 10–15분은 진짜 time-critical(arrest/불안정 기도)에만.

### `lib/or-ui/labels.ts` — 한국어 라벨 (컴파일 필수)
- 신규 incident/department/resource 라벨 + soft flag 라벨 추가
  (exhaustive `Record<Enum,string>`라 누락 시 빌드 실패).

### `scripts/evaluate-or-gaps.ts` — 컴파일 수정
- `formatResource`의 exhaustive `Record<Resource,string>`에 신규 자원 라벨 추가.

### `test/or-engine.test.ts` — 시간 소프트화 단언 갱신
- "no feasible" → "soft feasible + softFlag + timeSoftPenalty>0" 의미로 테스트 재작성.

## 4. 신규 자원/진료과 → 라이브 신호 매핑

| 항목 | 매칭 근거 (이미 수집 중인 신호 우선) |
|---|---|
| `cardiology` | `angiography_available_live` ∥ 내과 ICU ∥ 등급≠말단 |
| `neurology` | `mri_available_live` ∥ neuro/neurosurgery ICU ∥ has_neurosurgery ∥ 권역센터 |
| `pulmonology` | `ventilator_available_live` ∥ 내과/일반 ICU ∥ 등급≠말단 |
| `internal_medicine` | 내과/일반 ICU ∥ has_icu_static ∥ er_open_static |
| `cath_lab_pci` | `angiography_available_live` ∥ cardiology |
| `thrombectomy_thrombolysis` | `mri_available_live` ∥ 권역센터 |
| `airway_ventilation` | `ventilator_available_live` ∥ ICU |
| `defibrillation_resuscitation` | ER 운영 ∥ 응급의학과 ∥ ICU (거의 보편 — 심정지 zero-feasible 방지) |
| `critical_care` | has_icu_static ∥ 임의 ICU ∥ 등급≠말단 |

## 5. incident별 최소 요구 (검증기 자동보정)

| incident_type | 최소 자원 | 최소 진료과 |
|---|---|---|
| cardiac_arrest | defibrillation_resuscitation, critical_care | emergency_medicine |
| cardiac | cath_lab_pci \| ct | emergency_medicine, cardiology |
| stroke | ct, thrombectomy_thrombolysis | emergency_medicine, neurology |
| respiratory_failure | airway_ventilation, critical_care | emergency_medicine, (pulmonology\|internal_medicine) |
| seizure | ct, critical_care | emergency_medicine, neurology |
| gi_bleeding | bleeding_control, ct | emergency_medicine, (general_surgery\|internal_medicine) |

## 6. 검증 결과

| 검증 | 결과 |
|---|---|
| `tsc --noEmit` | ✅ 통과 (no errors) |
| `npm test` (단위) | ✅ 12/12 통과 |
| `npm run or:evaluate` (결정론 40시나리오) | ✅ 정상 (NaN/크래시 없음, 시간 소프트화 반영) |
| `npm run gold:e2e:run` (LLM 100케이스) | ✅ 100/100 파이프라인 성공 (run-id `gold-100-post-realign`) |

### 골드 100 전후 비교 (핵심 회귀)

수치는 검증된 `outputs/gold-e2e/gold-100-post-realign/results/raw-results.json`(100/100 성공)에서 직접 집계.

| 지표 | 재정렬 전 | 재정렬 후 | 효과 |
|---|---:|---:|---|
| `other_trauma`로 강제 붕괴 | 77 / 100 | **5 / 100** | 96% 내과 케이스가 올바른 incident_type으로 |
| feasible 병원 0개 | 46 / 100 | **0 / 100** | 이송시간 소프트화 + medical 진료과 폴백 |
| `max_transport=10분` 과도 부여 | 44 / 100 | **4 / 100** | 프롬프트 rubric 완화 |
| top-1 병원 집중(최다 share) | 한양대 10/54 feasible (~18.5%) | 14 / 100 (14%), 서로 다른 19개 병원 | 분산 개선 |
| 이송창 초과 top-1 처리 | (하드 → 후보 소멸) | **15건이 soft-time-exceeded로 노출** | 침묵 탈락 대신 투명한 경고 |

재정렬 후 incident 분포(실제 임상과 정합):
`respiratory_failure 20 · cardiac 17 · stroke 15 · cardiac_arrest 10 · seizure 10 · traffic_trauma 8 · fall_head_injury 8 · gi_bleeding 6 · other_trauma 5 · fall_orthopedic 1`.

> 참고: `analyze-gold-e2e.ts` 리포트 생성기는 2차 하드닝(§8) 동시 수정 중 일시적으로 불안정했으나,
> `raw-results.json`이 권위 있는 원천이며 위 수치는 그로부터 재현 가능하게 직접 집계한 값이다.

## 7. 알려진 주의점

- 시간 소프트화로 eval Test 5(이송시간 하드제약) 내러티브가 의도적으로 바뀜.
  신호는 `softFlags`로 보존되어 진단/relaxationHint는 계속 동작.
- 계수는 라벨 부재로 지도학습 보정이 아님 → 민감도 분석으로만 정당화.
- HIRA `static_reliability_penalty` 항은 여전히 데이터 부재로 사실상 0 (스코프 외).
- 백그라운드에서 LLM 호출 시 네트워크 샌드박스로 `fetch failed` 발생 가능 →
  골드 런은 샌드박스 비활성화 환경에서 실행.

## 8. 2차 하드닝 (재실험 인프라)

1차 재정렬 이후 추가로 필요한 부분은 계수 추가 조정보다 **재실험의 반복성/처리량/해석 가능성**이었다.

- `scripts/run-gold-e2e.ts`
  - `--workers` / `--max-workers` 옵션 추가. 최대 20개 worker로 cap.
  - 병원 스냅샷은 run 시작 시 1회만 로드하고 모든 case ranking에 재사용.
  - case 완료마다 `raw-results.json`과 `quant-summary.json`을 atomic write로 갱신.
  - `--resume` 시 이미 성공한 case는 재호출하지 않음.
- `lib/or/gold-e2e.ts`
  - bounded worker pool(`runWithConcurrency`)과 worker cap helper 추가.
  - `HospitalSummary`에 `softFlags`, `withinMaxTransportTime`, `timeSoftPenalty` 저장.
  - summary에서 hard feasible 0, within-time feasible 0, top-1 soft time exceedance를 분리 집계.
- `scripts/analyze-gold-e2e.ts`
  - 시간 소프트화 이후 `no_strict_feasible_candidate`와 `soft_transport_exceeded_top1`을 분리.
  - 리포트의 시간 GAP 문구를 "하드 제약 실패"가 아니라 "소프트 비용/경고 calibration" 문제로 갱신.
  - category만으로 trauma mismatch를 세지 않고, source transcript의 외상 기전(낙상/교통/충돌/골절/열상 등)을 확인해 실제 외상성 문맥은 false positive에서 제외.

검증:
- `npm test -- test/gold-e2e.test.ts` 통과.

## 9. 3차 — 근본 원인 수정 (하드 제약 = "수용 최소 역량"으로 정렬)

### Root cause
v2 골드 분석에서 잔여 문제(16건 이송창 초과 중 12건, 심정지 원거리 라우팅)의 근인은 feasible 후보군이 6곳으로 붕괴하는 것이었고, 그 지배 변수는 `minimum_hospital_level`(regional_center → ~6곳)이었다.

한 단계 더 들어간 **진짜 root cause**: 모델에는 "이 병원이 환자를 받을 수 있나"를 표현하는 메커니즘이 둘 있었다 —
(a) **역량 매칭**(required_departments/resources, 실데이터·라이브신호 기반, 정확) 과
(b) **행정 등급 게이트**(`minimum_hospital_level`, acuity에서 파생된 proxy).
그런데 (b)가 **하드 제약**으로 (a)를 덮어썼다. 즉 **하드 제약이 "받아서 시급 처치를 시작할 최소 역량"이 아니라 "이상적 최종치료 등급"을 인코딩**했다. acuity가 높을수록(심정지 sev5) 등급이 올라가고 후보가 붕괴해 원거리로 가는 구조적 결함. `critical_care`(ICU)를 하드 요구로 둔 것도 같은 결함(ICU는 ROSC 이후 필요).

이는 v1의 이송시간 하드→소프트 전환과 동일 부류의 오류(거친 proxy를 하드 절벽으로 사용).

### 수정 (동일 원칙, 최소 변경)
- `lib/or/recommendation.ts`
  - **`minimum_hospital_level`: 하드 → 소프트.** `buildConstraintViolations`에서 `minimum_hospital_level_not_met` 제거.
    등급차 비례 페널티 `levelPenalty = levelGap × levelPenaltyPerTier`(소프트)로 대체. 역량 매칭이 유일한 등급 관련 수용 게이트.
  - **`critical_care`: 하드 요구 제외.** `SOFT_RESOURCES` 집합으로 하드 `missingResources` 계산에서 제외.
    ICU 필요성은 기존 `resourceMarginRisk`의 `icuNeeded`로 소프트 반영(이중계산 아님).
  - `formulation`의 hard/soft 목록 갱신.
- `lib/or/cost-config.ts`: `levelPenalty:700` → `levelPenaltyPerTier:350`(1등급차 350, 2등급차 700 = 기존 최대 크기 보존).

### 왜 표면 패치가 아닌가
- LLM이 `minimum_hospital_level`을 과승급해도 **구조적으로 비파국화**(소프트 비용만 추가) → 프롬프트를 완벽히 만들 필요 없음.
- incident 오분류(stroke→trauma)의 피해도 **함께 완화**(후보군 붕괴가 사라짐) → 한 수정이 다중 증상 해소.
- 역량 없는 병원은 여전히 resource/dept 하드제약으로 탈락 → 안전성 유지.
- 의도적으로 하지 않은 것: 시간 페널티 계수 튜닝(ETA proxy 문제), incident guard·프롬프트 땜질, 병원 집중 인위적 캡.

### 검증 결과 (골드 100, run-id `gold-100-rootfix`)

`raw-results.json`에서 직접 집계한 v2(전) vs rootfix(후):

| 지표 | v2(전) | rootfix(후) | 의미 |
|---|---:|---:|---|
| 파이프라인 성공 | 100 | 100 | 유지 |
| feasible 0개(하드) | 0 | 0 | 유지 |
| **이송창 초과 top-1** | **16** | **4** | regional 승급발 12건 해소 |
| **중앙 hard-feasible 후보군** | **24** | **42** | 후보군 붕괴(6곳) 해소 |
| top-1 최대 집중 | 16% | 11% | 종합센터 강제 쏠림 완화 |
| **심정지 최대 이송시간** | **27분** | **18분** | 원거리 라우팅 해소 |
| (대표) GOLD-003 심정지 | 한양대 23분, hardF=6 | **순천향대 9분, hardF=44** | 가까운 ER로 정상화 |

남은 4건 분석: 2건(GOLD-076/078 호흡부전)은 올바른 분류 + 거대 후보군(hardF=43)인데 15분 창에 최근접이 17분 — **모델 오류 아닌 정직한 ETA-창 케이스**(소프트 경고로 노출). 2건(GOLD-018/019)은 **뇌졸중→외상 incident 오분류**라는 별개의 더 작은 잔여 root cause.

- 단위테스트: `min_level 소프트 preference` / `critical_care 소프트 margin` 신규 테스트 포함 16/16 통과, tsc 0 errors, `or:evaluate` 정상.

### 남은 잔여 이슈 (별개 root cause, 미수정 — 의도적)
- **incident 오분류 (stroke→trauma)**: 약 2~4건. 외상 기전이 없는 비외상 케이스가 trauma incident_type으로 매핑되어 잘못된 required_resources(수술/외상)로 후보군이 좁아짐.
  - 이는 min_level/critical_care와 **다른 메커니즘**(LLM 분류 오류)이라, 이번 수정에 끼워넣지 않고 별도로 둠(표면 패치 방지).
  - 권장 후속: 동일 철학으로 "Stage1에 외상 기전이 없으면 trauma incident_type 금지" 결정론적 guard + 제한적 medical catch-all 1개. 라벨 없으므로 질환 enum 추가 세분화는 지양.
