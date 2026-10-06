# Fintech Dashboard

An Angular application for simulated market data, based on the [original assignment](Senior%20Frontend%20Developer%20Task.docx). The [Russian translation](Senior%20Frontend%20Developer%20Task.ru.md), [implementation plan](docs/implementation-plan.md), and [requirements matrix](docs/requirements-matrix.md) are included.

## Current progress

Stages 1–3 provide the Angular 21 shell, Web Worker initialization and a stateful AssemblyScript market generator. The Wasm module implements xorshift32, bounded prices and reusable market-update batches. Both pages show initialization status and provide Retry on failure. Scheduled generation, live metrics, editable settings and deployment follow in later stages.

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

Tests execute both real compiled generators and verify batch sizes, valid values, seeded determinism, reset and continuation, invalid calls, price boundaries and constant memory usage. Tests also cover HTTP/network/binary/ABI errors, abort handling, cancelled and superseded loading, base URL resolution, worker replacement and cleanup, and shell navigation. Later stages add metrics, settings and pause/resume tests.

The worker downloads `wasm/market.wasm` relative to `document.baseURI`, checks HTTP status and uses `WebAssembly.instantiate` on an ArrayBuffer. A root service owns the worker across navigation. AssemblyScript aborts and native worker errors produce visible messages; Retry creates a new worker. On initialization the Worker creates a seed and calls the generator’s init export. The generator is implemented and tested; continuous calls and metric snapshots are connected in stages 4–5. See [the generator ABI and model](assembly/README.md).

The package overrides keep Vitest and its optional browser peer on 4.1.11. This avoids npm 10 resolving mismatched Vitest 4/5 peers and keeps the test toolchain on the audited version.
