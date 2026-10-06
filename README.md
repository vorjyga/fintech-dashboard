# Fintech Dashboard

An Angular application for simulated market data, based on the [original assignment](Senior%20Frontend%20Developer%20Task.docx). The [Russian translation](Senior%20Frontend%20Developer%20Task.ru.md), [implementation plan](docs/implementation-plan.md), and [requirements matrix](docs/requirements-matrix.md) are included.

## Current progress

Stages 1–5 provide the Angular 21 shell, a stateful Wasm market generator running in a Web Worker, cumulative metrics and exact display formatters. The Wasm module implements xorshift32, bounded prices and reusable market-update batches. Both pages show initialization status and provide Retry on failure. The Worker now generates continuously and supports Pause/Resume. The Angular control service, live metrics table, editable settings and deployment follow in later stages.

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

Production output is written to `dist/fintech-dashboard/browser`. GitHub Pages deployment is scheduled for stage 10; `build:pages` prepares the correct base path but does not publish anything.

## Structure and decisions

- `src/app/pages/`: standalone pages using OnPush change detection.
- `src/app/shared/contracts.ts`: framework-independent settings, market updates, snapshots, Wasm ABI and worker protocol.
- `src/app/core/`: root Wasm initialization service, RxJS worker events and readonly status Signal.
- `src/app/worker/`: worker entry point, cancellable loading and ABI/error handling.
- `assembly/`: AssemblyScript sources, outside Angular TypeScript compilation; debug/release settings are in `asconfig.json`.
- `scripts/`: build hooks.

Hash routing allows both pages to be reloaded on static hosting. Unknown or empty routes redirect to the dashboard. Material supplies UI components; Tailwind handles layout. The Material theme lives in `src/styles.scss`, while Tailwind is processed separately through PostCSS in `src/tailwind.css`. Preflight is omitted to preserve Material component styling. System fonts avoid a runtime font download.

Tests execute both real compiled generators and verify batch sizes, valid values, seeded determinism, reset and continuation, invalid calls, price boundaries and constant memory usage. Tests also cover HTTP/network/binary/ABI errors, abort handling, cancelled and superseded loading, base URL resolution, worker replacement and cleanup, and shell navigation. Metric tests cover the worked example, zero denominators, independent instruments, repeated trades, large bigint sums, final-only rounding and integration with the real release Wasm binary. Controller tests use artificial time to verify scheduling, Pause/Resume, throttling, stale results, restart and cleanup; an integration test checks the maximum configuration with real Wasm. Later stages add service and form tests.

The worker downloads `wasm/market.wasm` relative to `document.baseURI`, checks HTTP status and uses `WebAssembly.instantiate` on an ArrayBuffer. A root service owns the worker across navigation. AssemblyScript aborts and native worker errors produce visible messages; Retry creates a new worker. On initialization the Worker creates a seed and calls the generator’s init export. The generator is implemented and tested; continuous generation and metric snapshots are implemented in the worker controller. See [the generator ABI and model](assembly/README.md).

The package overrides keep Vitest and its optional browser peer on 4.1.11. This avoids npm 10 resolving mismatched Vitest 4/5 peers and keeps the test toolchain on the audited version.

## Metric calculations

`src/app/worker/market-aggregator.ts` is independent of Angular and the Worker API. Create one `MarketAggregator` per run and call `consume(update)` once for every generated trade (or `consumeBatch(iterable)`). It stores only latest trade/book values and cumulative volume/cost for each instrument, without retaining events or batches. Identical trades are separate events and are counted separately.

`snapshot()` returns detached rows in instrument order. Spread and imbalance use the latest book; zero denominators return null. Volume and trade cost use bigint, with each operand converted before multiplication. VWAP remains the exact numerator/denominator ratio.

`src/app/shared/metric-formatters.ts` provides USD formatting, exact volume formatting and two-decimal imbalance. VWAP rounds only for display, using integer division; half a cent rounds upward. Currency formatting preserves bigint precision without conversion to Number. Unavailable values use `—`, while initial volume uses `0`.

## Worker scheduling and protocol

`src/app/worker/producer-controller.ts` owns one active run and one sequential timeout. Loading, time, timer operations and event delivery are injected for testing. A start validates integer settings, aborts any previous load, clears its timer, initializes Wasm and fresh metrics, then emits ready, an empty snapshot and running status. The first batch runs after the full configured interval. Subsequent delays begin after batch processing; missed intervals are never caught up.

Every record is consumed before the next call overwrites the Wasm buffer. Ordinary snapshots are emitted at most once per 100 ms, while every trade is accumulated. Pause clears the pending timer, emits a final snapshot and acknowledges paused. Resume preserves the module and totals, acknowledges running and waits a full interval. No trades are generated for the paused interval.

Snapshots have increasing sequence numbers per run. Status commandId 0 is reserved for the initial running state; Pause/Resume acknowledgements echo positive command IDs. Old run/command IDs, canceled timer callbacks and superseded load completions are ignored. Invalid settings, initialization failures, malformed batches and execution errors stop the run and emit a typed error. Restart and dispose release timers/loading/module state.

The Angular shell currently observes initialization/errors. Exposing snapshots, user Pause/Resume and Apply through the root service is stage 6; the live table and settings form are stages 7–8.
