/// <reference types="node" />

import { readFile } from 'node:fs/promises';
import type { MarketWasmExports, ProducerEvent } from '../shared/contracts';
import { MARKET_UPDATE_BYTES } from '../shared/contracts';
import { ProducerController } from './producer-controller';
import { FakeClock } from './testing/fake-clock';

describe('Producer controller with real release Wasm', () => {
  it('accounts for maximum-sized batches through throttling, pause and resume', async () => {
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
    let expectedVolume = 0n;
    let expectedCost = 0n;
    const accountReference = (batches: number) => {
      for (let batch = 0; batch < batches; batch++) {
        const pointer = reference.generateBatch(1000);
        const data = new DataView(reference.memory.buffer, pointer, 1000 * MARKET_UPDATE_BYTES);
        for (let index = 0; index < 1000; index++) {
          const offset = index * MARKET_UPDATE_BYTES;
          const quantity = BigInt(data.getUint32(offset + 8, true));
          expectedVolume += quantity;
          expectedCost += BigInt(data.getUint32(offset + 4, true)) * quantity;
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
      expect(rows.reduce((sum, row) => sum + row.volume, 0n)).toBe(expectedVolume);
      expect(rows.reduce((sum, row) => sum + (row.vwap?.numeratorCents ?? 0n), 0n)).toBe(
        expectedCost,
      );
    };
    await controller.handle({
      type: 'start',
      runId: 1,
      seed: 123,
      wasmUrl: '/wasm/market.wasm',
      settings: { instrumentCount: 50, updatesPerBatch: 1000, batchIntervalMs: 50 },
    });
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
    controller.dispose();
    expect(clock.tasks.size).toBe(0);
  });
});
