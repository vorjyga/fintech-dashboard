/// <reference types="node" />

import { readFile } from 'node:fs/promises';
import type { MarketWasmExports } from '../shared/contracts';
import { MARKET_UPDATE_WORDS, MARKET_UPDATE_BYTES } from '../shared/contracts';
import { MarketAggregator } from './market-aggregator';

/** Execute the same release binary shipped in the application's public assets. */
describe('Real Wasm and market aggregation', () => {
  // Checks real Wasm decoding and accounting for every trade before the buffer is overwritten.
  it('decodes the numeric ABI and accounts for every trade before buffer reuse', async () => {
    const bytes = await readFile('public/wasm/market.wasm');
    const { instance } = await WebAssembly.instantiate(bytes, {
      env: {
        abort: () => {
          throw new Error('Unexpected Wasm abort');
        },
      },
    });
    const wasm = instance.exports as MarketWasmExports;
    expect(wasm.init(5, 1)).toBe(0);
    const aggregator = new MarketAggregator(5);
    let expectedVolume = 0n;
    let expectedCost = 0n;

    for (const size of [1, 100, 1000, 1000]) {
      const pointer = wasm.generateBatch(size);
      expect(wasm.getBatchLength()).toBe(size);
      const data = new DataView(wasm.memory.buffer, pointer, size * MARKET_UPDATE_BYTES);
      for (let index = 0; index < size; index++) {
        const offset = index * MARKET_UPDATE_WORDS * 4;
        const words = Array.from({ length: MARKET_UPDATE_WORDS }, (_, field) =>
          data.getUint32(offset + field * 4, true),
        );
        const [
          instrumentId,
          priceCents,
          tradeQuantity,
          bidCents,
          askCents,
          bidQuantity,
          askQuantity,
        ] = words;
        expectedVolume += BigInt(tradeQuantity);
        expectedCost += BigInt(priceCents) * BigInt(tradeQuantity);
        aggregator.consume({
          instrumentId,
          priceCents,
          tradeQuantity,
          bidCents,
          askCents,
          bidQuantity,
          askQuantity,
        });
      }
      if (size === 1) {
        expect(aggregator.snapshot()[4]).toEqual({
          instrumentId: 4,
          symbol: 'EPSILON',
          lastPriceCents: 13998,
          spreadCents: 2,
          volume: 234n,
          vwap: { numeratorCents: 3275532n, denominator: 234n },
          imbalance: (962 - 2245) / (962 + 2245),
        });
      }
    }
    const rows = aggregator.snapshot();
    expect(rows.reduce((sum, row) => sum + row.volume, 0n)).toBe(expectedVolume);
    expect(rows.reduce((sum, row) => sum + (row.vwap?.numeratorCents ?? 0n), 0n)).toBe(
      expectedCost,
    );
    expect(rows.every((row) => row.volume > 0n)).toBe(true);
  });
});
