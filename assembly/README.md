# AssemblyScript producer

`index.ts` currently exports ABI version 1. The compiler exports linear memory, with one initial 64 KiB page. Stage 3 adds the stateful market generator and the rest of the numeric ABI in `src/app/shared/contracts.ts`.

`npm run build:wasm` builds both targets configured in the root `asconfig.json`:

- Debug: `assembly/build/market.debug.wasm` and readable `.wat` output.
- Release: `public/wasm/market.wasm`, copied by Angular into public assets.

The stub runtime avoids a garbage collector; the planned generator uses static memory without managed allocations. Assertions remain enabled in release builds. Generated artifacts are ignored by Git and reproduced during start, build and test.
