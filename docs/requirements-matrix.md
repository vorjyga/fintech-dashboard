# Assignment requirements matrix

Source of truth: the English `Senior Frontend Developer Task.docx`. Stage numbers refer to `implementation-plan.md`. This matrix records delivered behavior rather than planned functionality.

| Assignment requirement | Stage | Status after stage 1 | Implementation / validation |
| --- | --- | --- | --- |
| Angular and TypeScript; dashboard and settings pages | 1 | Shell complete | Strict standalone Angular 21; lazy pages and navigation tests. |
| Live table with one row per instrument and five metrics | 4, 7 | Pending | Dashboard currently shows an explicit placeholder. |
| Cumulative volume/VWAP; count every trade once | 4 | Pending | Snapshot contract reserves bigint totals and exact VWAP ratio. |
| Unavailable initial values, zero denominators, currency formatting | 4, 7 | Pending | Nullable metric contracts; display logic pending. |
| Pause/resume, producer status and preserved totals | 5–7 | Pending | Typed command/status protocol defined. |
| Validated integer settings and specified defaults/ranges | 6, 8 | Defaults displayed; form pending | Defaults: 5 instruments, 100 updates, 500 ms. |
| Apply resets the run; draft edits have no immediate effect | 6, 8 | Pending | Producer settings contract defined. |
| Navigation preserves one producer and active state | 6 | Pending | Navigation exists; no producer is created yet. |
| Reject results from previous runs | 5, 6 | Pending | Protocol includes runId, sequence and commandId. |
| Candidate-written Wasm; real randomness and stateful prices | 2, 3 | Pending | Source directory reserved; numeric ABI defined. |
| Execute Wasm inside a Web Worker | 2, 5 | Pending | Worker directory reserved; no runtime worker yet. |
| Valid updates and requested batch sizes | 3 | Pending | Market update record contract defined. |
| Integer cents; rounding only for display; no full event history | 3, 4, 7 | Pending | Contracts use integer cents and cumulative snapshots. |
| Usable UI at higher generation rates | 5, 9 | Pending | Responsive shell provided; load verification requires producer. |
| Meaningful initialization errors and resource cleanup | 2, 5, 6 | Pending | Typed error events defined. |
| Mandatory metric, settings, lifecycle and generator tests | 3–9 | Pending | Vitest configured; shell/navigation tests provided. |
| Repository, Wasm sources and README with commands | 1–3, 10 | Partially complete | Application and README present; Wasm source follows in stage 2. |
| Automatic deployment on push; repository and live demo links | 10 | Pending | Pages base href supported; workflow and live demo pending. |
| Explain and modify implementation | All | In progress | Implementation plan and documented architecture included. |

Material, Tailwind, OnPush, hash routing and ESLint are agreed implementation decisions; the assignment does not require those specific libraries or patterns.
