# Gold Dataset

This folder contains 100 selected Seoul emergency-call JSON cases for the demo app OR pipeline. The target is not generic ambulance dispatch. These are high-acuity cases where hospital capability, travel time, congestion, CT/cath/surgery/ICU availability, or bypass tradeoffs can materially change the recommendation.

## Contents

- `gold_cases.json`: normalized app-ready cases with transcript, labels, severity category, and OR relevance reason.
- `gold_cases.jsonl`: the same normalized records in JSONL form.
- `raw/`: original selected JSON files copied from the local source dataset for reproducibility.
- `selection_manifest.json`: criteria, method, and distribution counts.
- `selected_source_files.txt`: source paths and category labels for quick auditing.

## Selection Method

The first 90 cases came from the six completed explore-agent waves. Because those waves produced 90 explicit picks, the remaining 10 were topped up by the same severity heuristic within the already covered first-six-wave file scope. No extra agent wave was spawned.

Primary criteria: cardiac arrest, respiratory compromise, altered consciousness/stroke, seizure, severe bleeding, chest pain/cardiac risk, major trauma/head injury, acute abdomen, obstetric/special-population, and other high-acuity medical cases. Routine transport and mild/administrative calls were intentionally deprioritized.

## Privacy Boundary

The normalized files exclude address, gender, audioPath, and raw recordId fields and redact common phone/id-number patterns in utterance text. The `raw/` directory preserves original selected JSONs locally, so treat it as source-data material rather than app-facing demo data.
