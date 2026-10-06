# Assignment requirements matrix

Source of truth: the English `Senior Frontend Developer Task.docx`. Stage numbers refer to `implementation-plan.md`. This matrix records delivered behavior rather than planned functionality.

| Assignment requirement | Stage | Final status | Implementation / validation |
| --- | --- | --- | --- |
| Angular and TypeScript; dashboard and settings pages | 1 | Complete | Strict standalone Angular 21; lazy pages and navigation tests. |
| Live table with one row per instrument and five metrics | 4, 7 | Complete | Material table displays all instruments and five formatted metrics; identity and controls tested. |
| Cumulative volume/VWAP; count every trade once | 4 | Complete | Pure aggregator uses bigint cost/volume and exact VWAP ratios; real Wasm integration test checks all trades. |
| Unavailable initial values, zero denominators, currency formatting | 4, 7 | Complete | Null metrics and zero volume; exact USD and half-up VWAP formatting tested. |
| Pause/resume, producer status and preserved totals | 5–7 | Complete | Worker Pause/Resume and final snapshots implemented; Angular controls and status implemented; acknowledgements tested. |
| Validated integer settings and specified defaults/ranges | 6, 8 | Complete | Typed Material form validates required finite integers and ranges; draft and limits tested. Defaults: 5/100/500 ms. |
| Apply resets the run; draft edits have no immediate effect | 6, 8 | Complete | Draft isolated; valid Apply resets even identical settings or a paused run. Tests cover reopening and confirmations. |
| Navigation preserves one producer and active state | 6 | Complete | Root singleton owns one worker across routes; idempotent start and cleanup tested. |
| Reject results from previous runs | 5, 6 | Complete | Worker rejects superseded loading, old run/command IDs and canceled callbacks; Angular rejects old run IDs, snapshot sequences and incorrect control acknowledgements. |
| Candidate-written Wasm; real randomness and stateful prices | 2, 3 | Complete | AssemblyScript xorshift32, persistent instrument bids and numeric batch ABI; both real binaries tested. |
| Execute Wasm inside a Web Worker | 2, 5 | Complete | Real Wasm continuously generates in the Angular CLI worker; protocol checked in a production browser. |
| Valid updates and requested batch sizes | 3 | Complete | All batch sizes 1–1000, counts 1–50, value ranges and clamping verified against real Wasm. |
| Integer cents; rounding only for display; no full event history | 3, 4, 7 | Complete | Generator uses integer cents; aggregator stores only current values and bigint totals; VWAP rounds only in display helpers. |
| Usable UI at higher generation rates | 5, 9 | Complete | Production browser checked at 50/1000/50 ms; snapshots about 102 ms apart, responsive navigation and Pause. |
| Meaningful initialization errors and resource cleanup | 2, 5, 6 | Complete | Load/runtime errors stop the controller; timers, pending fetches and old module state are released. Angular preserves last rows, shows error/Retry; browser HTTP 404 recovery and Worker termination verified. |
| Mandatory metric, settings, lifecycle and generator tests | 3–9 | Complete | Real Wasm, metrics, validation, scheduling, Worker Pause/Resume and lifecycle tests provided; Angular service, form, table and navigation tests included. 25 real Wasm + 72 Angular/Vitest tests. |
| Repository, Wasm sources and README with commands | 1–3, 10 | Complete | Application, stateful AssemblyScript source, tests, build hooks and README commands present. |
| Automatic deployment on push; repository and live demo links | 10 | Complete | Push/PR validation and automatic main deployment; two successful pushes verified via public build-info.json and changed HTML. Repository/demo links in README; stage 10 report links CI runs. |
| Explain and modify implementation | All | Complete | Implementation plan and documented architecture included. |

Material, Tailwind, OnPush, hash routing and ESLint are agreed implementation decisions; the assignment does not require those specific libraries or patterns.
