# AssemblyScript market generator

`index.ts` implements the numeric ABI in `src/app/shared/contracts.ts`:

| Export | Meaning |
| --- | --- |
| `abiVersion()` | Returns 1. |
| `init(instrumentCount, seed)` | Starts a fresh run for 1–50 instruments; returns 0 on success, 1 for an invalid count. An invalid call preserves the previous run. |
| `generateBatch(size)` | Returns the address of 1–1000 market records. Before init or for invalid sizes, returns 0 and sets batch length to 0 without advancing prices or PRNG. |
| `getBatchLength()` | Returns the last successful batch size, or 0 after init/invalid generation. |
| `memory` | Exported linear memory; one 64 KiB page. |

Each record contains seven little-endian `u32` words (28 bytes), in this order: instrumentId, priceCents, tradeQuantity, bidCents, askCents, bidQuantity, askQuantity. Read or copy the batch before the next successful generation or init; the buffer is reused.

The module stores 50 bid prices (200 bytes) and one batch buffer (28,000 bytes) using `memory.data`, `load` and `store`. It retains no trade history and allocates no managed objects while generating. The stub runtime avoids a garbage collector.

The initial bid is `10000 + instrumentId * 1000` cents. A persistent xorshift32 PRNG selects instruments and bid steps from −5 to +5 cents. Bids are clamped to 1–1,000,000 cents; ask is 1–20 cents higher. Trade price is the current bid or ask; quantity is 1–1000; book quantities are 0–10,000. All market decisions happen in Wasm. The Worker creates a fresh seed for each run; zero maps inside Wasm to `0x6d2b79f5`.

`npm run build:wasm` builds both targets configured in the root `asconfig.json`:

- Debug: `assembly/build/market.debug.wasm` and readable `.wat` output.
- Release: `public/wasm/market.wasm`, copied by Angular into public assets.

Generated artifacts are ignored by Git and reproduced during start, build and test. `npm test` checks both real binaries, determinism, state/reset behavior, ranges, invalid inputs, boundary clamping and constant memory usage. Assertions remain enabled in release builds.
