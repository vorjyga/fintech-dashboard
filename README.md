# Fintech Dashboard

An Angular application for simulated market data, based on the [original assignment](Senior%20Frontend%20Developer%20Task.docx). The [Russian translation](Senior%20Frontend%20Developer%20Task.ru.md), [implementation plan](docs/implementation-plan.md), and [requirements matrix](docs/requirements-matrix.md) are included.

## Current progress

Stage 1 provides the standalone Angular 21 shell, lazy dashboard/settings pages, hash routing, Material light theme, Tailwind 4 layout utilities, shared contracts, ESLint and Vitest. Market data generation, worker execution, editable settings and deployment are scheduled for later stages. Pages clearly identify this incomplete functionality.

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
| `npm run build:wasm` | Reserved Wasm build hook; stage 1 reports that no binary exists yet. Stage 2 adds AssemblyScript compilation. |
| `npm run build` | Run the Wasm hook and build the production application. |
| `npm run build:pages` | Build with `/fintech-dashboard/` as the base href. |
| `npm test` | Run the Wasm hook and Vitest once, without watch mode. |
| `npm run lint` | Check TypeScript and Angular templates without modifying files. |

Production output is written to `dist/fintech-dashboard/browser`. GitHub Pages deployment is scheduled for stage 10; `build:pages` prepares the correct base path but does not publish anything.

## Structure and decisions

- `src/app/pages/`: standalone pages using OnPush change detection.
- `src/app/shared/contracts.ts`: framework-independent settings, market updates, snapshots, Wasm ABI and worker protocol.
- `src/app/core/`: reserved for the application-wide producer service.
- `src/app/worker/`: reserved for worker loading, scheduling and aggregation.
- `assembly/`: reserved for AssemblyScript sources, outside Angular's `src/**/*.ts` compilation scope.
- `scripts/`: build hooks.

Hash routing allows both pages to be reloaded on static hosting. Unknown or empty routes redirect to the dashboard. Material supplies UI components; Tailwind handles layout. The Material theme lives in `src/styles.scss`, while Tailwind is processed separately through PostCSS in `src/tailwind.css`. Preflight is omitted to preserve Material component styling. System fonts avoid a runtime font download.

Tests currently cover navigation destinations, lazy page navigation, displayed defaults and route fallbacks. Later stages add the mandatory generator, metrics, validation and lifecycle tests from the assignment.

The package overrides keep Vitest and its optional browser peer on 4.1.11. This avoids npm 10 resolving mismatched Vitest 4/5 peers and keeps the test toolchain on the audited version.
