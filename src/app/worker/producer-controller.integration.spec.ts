/// <reference types="node" />

import { readFile } from 'node:fs/promises';
import type { MarketWasmExports, ProducerEvent, ProducerCommand } from '../shared/contracts';
import { MARKET_UPDATE_BYTES } from '../shared/contracts';
import { ProducerController } from './producer-controller';
import { FakeClock } from './testing/fake-clock';

describe('Producer controller with real release Wasm', () => {
  // Checks every instrument metric with real Wasm under maximum load, including pause, resume and restart.
  it('checks every instrument metric through throttling, pause, resume and restart', async () => {
    const bytes = await readFile('public/wasm/market.wasm');
    const instantiate = async () => {
      const { instance } = await WebAssembly.instantiate(bytes, {
        env: {
          abort: () => {
            throw new Error('Unexpected Wasm abort');
          },
        },
      });
      return instance.exports as MarketWasmExports;
    };
    const reference = await instantiate();
    reference.init(50, 123);
    const clock = new FakeClock();
    const events: ProducerEvent[] = [];
    const controller = new ProducerController({
      load: instantiate,
      now: () => clock.time,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      send: (event) => events.push(event),
    });
    const expectedByInstrument = new Map<
      number,
      {
        volume: bigint;
        cost: bigint;
        lastPriceCents: number;
        spreadCents: number;
        imbalance: number | null;
      }
    >();
    const accountReference = (batches: number) => {
      for (let batch = 0; batch < batches; batch++) {
        const pointer = reference.generateBatch(1000);
        const data = new DataView(reference.memory.buffer, pointer, 1000 * MARKET_UPDATE_BYTES);
        for (let index = 0; index < 1000; index++) {
          const offset = index * MARKET_UPDATE_BYTES;
          const id = data.getUint32(offset, true);
          const price = data.getUint32(offset + 4, true);
          const quantity = BigInt(data.getUint32(offset + 8, true));
          const bid = data.getUint32(offset + 12, true);
          const ask = data.getUint32(offset + 16, true);
          const bidQuantity = data.getUint32(offset + 20, true);
          const askQuantity = data.getUint32(offset + 24, true);
          const previous = expectedByInstrument.get(id);
          expectedByInstrument.set(id, {
            volume: (previous?.volume ?? 0n) + quantity,
            cost: (previous?.cost ?? 0n) + BigInt(price) * quantity,
            lastPriceCents: price,
            spreadCents: ask - bid,
            imbalance:
              bidQuantity + askQuantity === 0
                ? null
                : (bidQuantity - askQuantity) / (bidQuantity + askQuantity),
          });
        }
      }
    };
    const snapshots = () =>
      events.filter(
        (event): event is Extract<ProducerEvent, { type: 'snapshot' }> => event.type === 'snapshot',
      );
    const verifyLatest = () => {
      const rows = snapshots().at(-1)!.rows;
      expect(rows).toHaveLength(50);
      expect(rows.map((row) => row.instrumentId)).toEqual(
        Array.from({ length: 50 }, (_, id) => id),
      );
      expect(expectedByInstrument.size).toBe(50);
      for (const row of rows) {
        const expected = expectedByInstrument.get(row.instrumentId)!;
        expect(row, `instrument ${row.instrumentId}`).toMatchObject({
          lastPriceCents: expected.lastPriceCents,
          spreadCents: expected.spreadCents,
          volume: expected.volume,
          vwap: { numeratorCents: expected.cost, denominator: expected.volume },
          imbalance: expected.imbalance,
        });
      }
    };
    const start: ProducerCommand = {
      type: 'start',
      runId: 1,
      seed: 123,
      wasmUrl: '/wasm/market.wasm',
      settings: { instrumentCount: 50, updatesPerBatch: 1000, batchIntervalMs: 50 },
    };
    await controller.handle(start);
    clock.advance(250);
    expect(snapshots()).toHaveLength(3); // Initial + 100 ms + 200 ms.
    accountReference(5);
    await controller.handle({ type: 'pause', runId: 1, commandId: 1 });
    verifyLatest();
    const count = events.length;
    clock.advance(10000);
    expect(events).toHaveLength(count);
    await controller.handle({ type: 'resume', runId: 1, commandId: 2 });
    clock.advance(49);
    expect(snapshots()).toHaveLength(4);
    clock.advance(1);
    accountReference(1);
    verifyLatest();

    await controller.handle({ ...start, runId: 2 });
    expect(snapshots().at(-1)).toMatchObject({ runId: 2, sequence: 1 });
    for (const row of snapshots().at(-1)!.rows) {
      expect(row).toMatchObject({
        lastPriceCents: null,
        spreadCents: null,
        volume: 0n,
        vwap: null,
        imbalance: null,
      });
    }
    reference.init(50, 123);
    expectedByInstrument.clear();
    clock.advance(100);
    accountReference(2);
    verifyLatest();
    controller.dispose();
    expect(clock.tasks.size).toBe(0);
  });
});
