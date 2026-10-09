# Fintech Dashboard

An Angular application for simulated market data, based on the [original assignment](Senior%20Frontend%20Developer%20Task.docx).

[Repository](https://github.com/vorjyga/fintech-dashboard) · [Live demo](https://vorjyga.github.io/fintech-dashboard/#/dashboard) · [CI and deployments](https://github.com/vorjyga/fintech-dashboard/actions/workflows/ci-pages.yml)

All ten implementation stages are complete. The public demo and automatic redeployment on a subsequent push were verified on 2026-10-06.

The dashboard displays five live metrics per instrument. The settings page applies a validated configuration to a fresh run. A stateful AssemblyScript Wasm module generates every trade inside one Web Worker, which calculates exact cumulative metrics and sends throttled snapshots to Angular.

## Getting started

Use Node.js 22.13.1 (see `.nvmrc`) and npm 10.9.2.

```sh
nvm use
npm ci
npm start
```

Open `http://localhost:4200/#/dashboard` or `http://localhost:4200/#/settings`.

| Command | Purpose |
| --- | --- |
| `npm ci` | Install dependencies from the committed lock file. |
| `npm start` | Run the Wasm build hook, then start the Angular development server. |
| `npm run build:wasm` | Compile debug and release AssemblyScript modules; release output is `public/wasm/market.wasm`. |
| `npm run build` | Run the Wasm hook and build the production application. |
| `npm run build:pages` | Build with `/fintech-dashboard/` as the base href. |
| `npm test` | Build Wasm, execute both real binaries in Node, and run Vitest once. |
| `npm run lint` | Check TypeScript and Angular templates without modifying files. |

Production output is written to `dist/fintech-dashboard/browser`. The CI workflow validates every branch push and pull request. A successful push to `main` deploys this directory to GitHub Pages automatically. No manual deployment is needed.

## Structure and decisions

- `src/app/pages/`: standalone pages using OnPush change detection.
- `src/app/shared/contracts.ts`: framework-independent settings, market updates, snapshots, Wasm ABI and worker protocol.
- `src/app/core/`: root producer service, RxJS Worker events and readonly Signals for rows, active settings, status and errors.
- `src/app/worker/`: worker entry point, cancellable loading, sequential scheduling, ABI/error handling and bounded cumulative aggregation.
- `assembly/`: AssemblyScript sources, outside Angular TypeScript compilation; debug/release settings are in `asconfig.json`.
- `scripts/`: build hooks.

Hash routing allows both pages to be reloaded on static hosting. Unknown or empty routes redirect to the dashboard. Material supplies UI components; Tailwind handles layout. The Material theme lives in `src/styles.scss`, while Tailwind is processed separately through PostCSS in `src/tailwind.css`. Preflight is omitted to preserve Material component styling. System fonts avoid a runtime font download.

Tests execute both real compiled generators and verify batch sizes, valid values, seeded determinism, reset and continuation, invalid calls, price boundaries and constant memory usage. Tests also cover HTTP/network/binary/ABI errors, abort handling, cancelled and superseded loading, base URL resolution, worker replacement and cleanup, and shell navigation. Metric tests cover the worked example, zero denominators, independent instruments, repeated trades, large bigint sums, final-only rounding and integration with the real release Wasm binary. Controller tests use artificial time to verify scheduling, Pause/Resume, throttling, stale results, restart and cleanup; an integration test checks the maximum configuration with real Wasm. Angular tests cover settings drafts, reset/retry, pending controls, stale events, row identity and lazy-route navigation.

The worker downloads `wasm/market.wasm` relative to `document.baseURI`, checks HTTP status and uses `WebAssembly.instantiate` on an ArrayBuffer. A root service owns the worker across navigation. AssemblyScript aborts and native worker errors produce visible messages; Retry creates a new worker. On initialization the Worker creates a seed and calls the generator’s init export. The generator is implemented and tested; continuous generation and metric snapshots are implemented in the worker controller. See [the generator ABI and model](assembly/README.md).

## Metric calculations

`src/app/worker/market-aggregator.ts` is independent of Angular and the Worker API. Create one `MarketAggregator` per run and call `consume(update)` once for every generated trade (or `consumeBatch(iterable)`). It stores only latest trade/book values and cumulative volume/cost for each instrument, without retaining events or batches. Identical trades are separate events and are counted separately.

`snapshot()` returns detached rows in instrument order. Spread and imbalance use the latest book; zero denominators return null. Volume and trade cost use bigint, with each operand converted before multiplication. VWAP remains the exact numerator/denominator ratio.

`src/app/shared/metric-formatters.ts` provides USD formatting, exact volume formatting and two-decimal imbalance. VWAP rounds only for display, using integer division; half a cent rounds upward. Currency formatting preserves bigint precision without conversion to Number. Unavailable values use `—`, while initial volume uses `0`.

## Worker scheduling and protocol

`src/app/worker/producer-controller.ts` owns one active run and one sequential timeout. Loading, time, timer operations and event delivery are injected for testing. A start validates integer settings, aborts any previous load, clears its timer, initializes Wasm and fresh metrics, then emits ready, an empty snapshot and running status. The first batch runs after the full configured interval. Subsequent delays begin after batch processing; missed intervals are never caught up.

Every record is consumed before the next call overwrites the Wasm buffer. Ordinary snapshots are emitted at most once per 100 ms, while every trade is accumulated. Pause clears the pending timer, emits a final snapshot and acknowledges paused. Resume preserves the module and totals, acknowledges running and waits a full interval. No trades are generated for the paused interval.

Snapshots have increasing sequence numbers per run. Status commandId 0 is reserved for the initial running state; Pause/Resume acknowledgements echo positive command IDs. Old run/command IDs, canceled timer callbacks and superseded load completions are ignored. Invalid settings, initialization failures, malformed batches and execution errors stop the run and emit a typed error. Restart and dispose release timers/loading/module state.

## Controls and settings

| Setting | Default | Valid integer range |
| --- | --- | --- |
| Instruments | 5 | 1–50 |
| Updates per batch | 100 | 1–1,000 |
| Batch interval | 500 ms | 50–2,000 ms |

The nominal rate is `updatesPerBatch × 1000 / batchIntervalMs` across all instruments: defaults give 200 updates/s; the maximum is 20,000 updates/s. Actual rate depends on processing and browser scheduling.

Editing the form changes a local draft. Apply always clears metrics and creates a new Worker/run, even for unchanged settings or a paused producer. It keeps you on Settings and confirms the new run. Leaving Settings discards unapplied edits; returning displays the active configuration. Reloading restores defaults.

Pause waits for the Worker acknowledgement and a final snapshot. Resume keeps totals and starts a full new interval, with no trades for the paused time. Navigation preserves the single root producer. Status progresses through initializing, running, pausing, paused, resuming or error; controls are disabled while acknowledgement is pending. On error the last snapshot remains visible. Retry starts a fresh run with the last applied settings.

RxJS represents Worker message/error streams; Signals represent current UI state. The service rejects old run IDs, nonincreasing snapshot sequences and incorrect command acknowledgements before updating Signals. Replacement/destruction unsubscribes listeners and terminates the Worker. No Subject mirrors Signal state.
