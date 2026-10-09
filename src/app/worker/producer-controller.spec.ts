import type {
  MarketWasmExports,
  ProducerCommand,
  ProducerEvent,
  ProducerSettings,
} from '../shared/contracts';
import { ProducerController } from './producer-controller';
import { loadWasm, WasmInitializationError } from './wasm-loader';

import { FakeClock } from './testing/fake-clock';

function fakeWasm() {
  const memory = new WebAssembly.Memory({ initial: 1 });
  let batchNumber = 0;
  let length = 0;
  return {
    memory,
    abiVersion: () => 1,
    init: vi.fn(() => {
      batchNumber = 0;
      length = 0;
      return 0;
    }),
    generateBatch: vi.fn((size: number) => {
      batchNumber++;
      length = size;
      const price = 10000 + batchNumber;
      const view = new Uint32Array(memory.buffer, 64, size * 7);
      for (let index = 0; index < size; index++)
        view.set([0, price, 1, price - 4, price, 600, 400], index * 7);
      return 64;
    }),
    getBatchLength: vi.fn(() => length),
  } satisfies MarketWasmExports;
}

function setup() {
  const clock = new FakeClock();
  const wasm = fakeWasm();
  const events: ProducerEvent[] = [];
  const snapshotTimes: number[] = [];
  const load = vi.fn<typeof loadWasm>().mockResolvedValue(wasm);
  const controller = new ProducerController({
    load,
    now: () => clock.time,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    send: (event) => {
      events.push(event);
      if (event.type === 'snapshot') snapshotTimes.push(clock.time);
    },
  });
  return { controller, clock, wasm, events, snapshotTimes, load };
}

function start(
  runId = 1,
  settings: Partial<ProducerSettings> = {},
): Extract<ProducerCommand, { type: 'start' }> {
  return {
    type: 'start',
    runId,
    seed: 123,
    wasmUrl: '/wasm/market.wasm',
    settings: { instrumentCount: 1, updatesPerBatch: 2, batchIntervalMs: 50, ...settings },
  };
}

function snapshots(events: ProducerEvent[]) {
  return events.filter(
    (event): event is Extract<ProducerEvent, { type: 'snapshot' }> => event.type === 'snapshot',
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('Worker producer controller', () => {
  // Checks initial events and a full interval delay before the first batch.
  it('initializes, sends empty rows and running, and waits a full interval before the first batch', async () => {
    const { controller, clock, wasm, events } = setup();
    await controller.handle(start(1, { batchIntervalMs: 500, instrumentCount: 2 }));
    expect(wasm.init).toHaveBeenCalledExactlyOnceWith(2, 123);
    expect(events.map((event) => event.type)).toEqual(['ready', 'snapshot', 'status']);
    expect(snapshots(events)[0]).toMatchObject({
      runId: 1,
      sequence: 1,
      rows: [
        { volume: 0n, vwap: null },
        { volume: 0n, vwap: null },
      ],
    });
    expect(events[2]).toEqual({ type: 'status', runId: 1, commandId: 0, status: 'running' });
    expect(clock.tasks.size).toBe(1);
    clock.advance(499);
    expect(wasm.generateBatch).not.toHaveBeenCalled();
    clock.advance(1);
    expect(wasm.generateBatch).toHaveBeenCalledExactlyOnceWith(2);
    expect(snapshots(events)[1].rows[0]).toMatchObject({
      volume: 2n,
      vwap: { numeratorCents: 20002n, denominator: 2n },
    });
  });

  // Checks snapshot throttling to once per 100 ms without skipping trades.
  it('throttles normal snapshots to 100 ms while accounting for all intervening trades', async () => {
    const { controller, clock, wasm, events, snapshotTimes } = setup();
    await controller.handle(start());
    clock.advance(250);
    expect(wasm.generateBatch).toHaveBeenCalledTimes(5);
    expect(snapshotTimes).toEqual([0, 100, 200]);
    expect(snapshots(events)[2].rows[0]).toMatchObject({
      volume: 8n,
      vwap: { numeratorCents: 80020n, denominator: 8n },
    });
    await controller.handle({ type: 'pause', runId: 1, commandId: 1 });
    expect(snapshotTimes).toEqual([0, 100, 200, 250]);
    expect(snapshots(events).at(-1)?.rows[0]).toMatchObject({
      volume: 10n,
      vwap: { numeratorCents: 100030n, denominator: 10n },
    });
    expect(snapshots(events).map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
  });

  // Checks that pause stops generation and resume preserves totals after a full interval delay.
  it('pause cancels generation; resume preserves the same Wasm/totals and waits a full interval', async () => {
    const { controller, clock, wasm, events, load } = setup();
    await controller.handle(start());
    clock.advance(75);
    await controller.handle({ type: 'pause', runId: 1, commandId: 1 });
    expect(clock.tasks.size).toBe(0);
    expect(events.at(-1)).toEqual({ type: 'status', runId: 1, commandId: 1, status: 'paused' });
    expect(snapshots(events).at(-1)?.rows[0].volume).toBe(2n);
    clock.advance(10000);
    expect(wasm.generateBatch).toHaveBeenCalledTimes(1);
    await controller.handle({ type: 'resume', runId: 1, commandId: 2 });
    expect(events.at(-1)).toEqual({ type: 'status', runId: 1, commandId: 2, status: 'running' });
    clock.advance(49);
    expect(wasm.generateBatch).toHaveBeenCalledTimes(1);
    clock.advance(1);
    expect(wasm.generateBatch).toHaveBeenCalledTimes(2);
    expect(snapshots(events).at(-1)?.rows[0].volume).toBe(4n);
    expect(load).toHaveBeenCalledOnce();
    expect(wasm.init).toHaveBeenCalledOnce();
  });

  // Checks pausing before the first trade without generating data for the paused interval.
  it('can pause before the first trade without generating missed data', async () => {
    const { controller, clock, wasm, events } = setup();
    await controller.handle(start());
    await controller.handle({ type: 'pause', runId: 1, commandId: 1 });
    clock.advance(2000);
    expect(wasm.generateBatch).not.toHaveBeenCalled();
    expect(snapshots(events).at(-1)?.rows[0].volume).toBe(0n);
    await controller.handle({ type: 'resume', runId: 1, commandId: 2 });
    clock.advance(50);
    expect(wasm.generateBatch).toHaveBeenCalledOnce();
  });

  // Checks rejection of stale commands and prevents extra timers on repeated Resume.
  it('ignores old run/command ids and repeated resume cannot create a second timer or delay the first', async () => {
    const { controller, clock, events } = setup();
    await controller.handle(start());
    await controller.handle({ type: 'pause', runId: 1, commandId: 1 });
    const count = events.length;
    await controller.handle({ type: 'resume', runId: 1, commandId: 1 });
    await controller.handle({ type: 'resume', runId: 99, commandId: 2 });
    expect(events).toHaveLength(count);
    expect(clock.tasks.size).toBe(0);
    await controller.handle({ type: 'resume', runId: 1, commandId: 2 });
    const deadline = [...clock.tasks.values()][0].at;
    clock.advance(10);
    await controller.handle({ type: 'resume', runId: 1, commandId: 3 });
    expect(clock.tasks.size).toBe(1);
    expect([...clock.tasks.values()][0].at).toBe(deadline);
  });

  // Checks that a cancelled callback cannot generate early after Resume.
  it('a canceled callback cannot generate early after resume', async () => {
    const { controller, clock, wasm } = setup();
    await controller.handle(start());
    const staleCallback = [...clock.tasks.values()][0].callback;
    await controller.handle({ type: 'pause', runId: 1, commandId: 1 });
    await controller.handle({ type: 'resume', runId: 1, commandId: 2 });
    staleCallback();
    expect(wasm.generateBatch).not.toHaveBeenCalled();
    expect(clock.tasks.size).toBe(1);
    clock.advance(50);
    expect(wasm.generateBatch).toHaveBeenCalledOnce();
  });

  // Checks that delays start after batch processing without catching up missed intervals.
  it('schedules after processing finishes and never catches up a late callback', async () => {
    const { controller, clock, wasm } = setup();
    const generate = wasm.generateBatch.getMockImplementation()!;
    wasm.generateBatch.mockImplementation((size) => {
      clock.time += 80;
      return generate(size);
    });
    await controller.handle(start());
    clock.advance(50);
    expect(clock.time).toBe(130);
    expect([...clock.tasks.values()][0].at).toBe(180);
    clock.time = 2000;
    clock.advance(0);
    expect(wasm.generateBatch).toHaveBeenCalledTimes(2);
    expect([...clock.tasks.values()][0].at).toBe(2130);
  });

  // Checks that loading completes before scheduling and settings are copied before awaiting.
  it('does not schedule before loading completes and copies settings before await', async () => {
    const { controller, clock, load, wasm } = setup();
    const pending = deferred<MarketWasmExports>();
    load.mockReturnValue(pending.promise);
    const command = start();
    const ready = controller.handle(command);
    command.settings.updatesPerBatch = 999;
    command.settings.batchIntervalMs = 2000;
    clock.advance(1000);
    expect(clock.tasks.size).toBe(0);
    pending.resolve(wasm);
    await ready;
    expect([...clock.tasks.values()][0].at).toBe(1050);
    clock.advance(50);
    expect(wasm.generateBatch).toHaveBeenCalledExactlyOnceWith(2);
  });

  // Checks cancellation of a superseded load and rejection of its late successful result.
  it('aborts a superseded load and ignores its late successful completion', async () => {
    const { controller, clock, load, events } = setup();
    const pending = deferred<MarketWasmExports>();
    const oldWasm = fakeWasm();
    load.mockReturnValueOnce(pending.promise);
    const old = controller.handle(start(1));
    const signal = load.mock.calls[0][1];
    await controller.handle(start(2));
    expect(signal?.aborted).toBe(true);
    pending.resolve(oldWasm);
    await old;
    expect(oldWasm.init).not.toHaveBeenCalled();
    expect(events.every((event) => event.runId === 2)).toBe(true);
    expect(clock.tasks.size).toBe(1);
  });

  // Checks that load errors from a previous run are ignored.
  it('ignores a superseded load error', async () => {
    const { controller, load, events } = setup();
    const pending = deferred<MarketWasmExports>();
    load.mockReturnValueOnce(pending.promise);
    const old = controller.handle(start(1));
    await controller.handle(start(2));
    pending.reject(new Error('Old failure'));
    await old;
    expect(events.some((event) => event.type === 'error')).toBe(false);
  });

  // Checks that restart resets metrics and rejects already queued callbacks from the previous run.
  it('restart resets metrics and cancels old callbacks even if the timer was already queued', async () => {
    const { controller, clock, wasm, events } = setup();
    await controller.handle(start(1));
    clock.advance(100);
    const oldCallback = [...clock.tasks.values()][0].callback;
    await controller.handle(start(2));
    expect(snapshots(events).at(-1)).toMatchObject({
      runId: 2,
      sequence: 1,
      rows: [{ volume: 0n, vwap: null }],
    });
    oldCallback();
    expect(wasm.generateBatch).toHaveBeenCalledTimes(2);
    expect(clock.tasks.size).toBe(1);
    clock.advance(100);
    expect(snapshots(events).at(-1)?.rows[0].volume).toBe(4n);
  });

  // Checks timer cleanup and prevents further work after dispose.
  it('dispose frees timers and prevents further events and starts', async () => {
    const { controller, clock, wasm, events, load } = setup();
    await controller.handle(start());
    const count = events.length;
    controller.dispose();
    clock.advance(10000);
    await controller.handle(start(2));
    expect(clock.tasks.size).toBe(0);
    expect(wasm.generateBatch).not.toHaveBeenCalled();
    expect(events).toHaveLength(count);
    expect(load).toHaveBeenCalledOnce();
  });

  // Checks load cancellation during dispose and rejection of its completion.
  it('dispose during initialization cancels the load and ignores completion', async () => {
    const { controller, load, wasm, events } = setup();
    const pending = deferred<MarketWasmExports>();
    load.mockReturnValue(pending.promise);
    const ready = controller.handle(start());
    controller.dispose();
    expect(load.mock.calls[0][1]?.aborted).toBe(true);
    pending.resolve(wasm);
    await ready;
    expect(wasm.init).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  // Checks rejection of invalid settings before loading Wasm and stopping the previous run.
  it('invalid settings reject start before fetch and cancel a previous run', async () => {
    const { controller, clock, wasm, events, load } = setup();
    await controller.handle(start());
    await controller.handle(start(2, { batchIntervalMs: 49 }));
    expect(load).toHaveBeenCalledOnce();
    expect(events.at(-1)).toMatchObject({ type: 'error', runId: 2, stage: 'settings' });
    expect(clock.tasks.size).toBe(0);
    clock.advance(1000);
    expect(wasm.generateBatch).not.toHaveBeenCalled();
  });

  // Checks Wasm initialization rejection without sending ready or scheduling a timer.
  it('rejects nonzero init result without reporting ready or scheduling', async () => {
    const { controller, clock, wasm, events } = setup();
    wasm.init.mockReturnValue(1);
    await controller.handle(start());
    expect(events).toEqual([
      {
        type: 'error',
        runId: 1,
        stage: 'settings',
        message: expect.stringContaining('instrument count'),
      },
    ]);
    expect(clock.tasks.size).toBe(0);
  });

  // Checks that each initialization error retains its stage and stops the run.
  it.each(['load', 'instantiate', 'abi', 'runtime'] as const)(
    'preserves %s initialization errors and stops',
    async (stage) => {
      const { controller, clock, load, events } = setup();
      load.mockRejectedValue(new WasmInitializationError(stage, 'Failure'));
      await controller.handle(start());
      expect(events).toEqual([{ type: 'error', runId: 1, stage, message: 'Failure' }]);
      expect(clock.tasks.size).toBe(0);
    },
  );

  // Checks that generation errors stop the run and a new start restores operation.
  it('stops on generator failure and can retry with a new start', async () => {
    const { controller, clock, wasm, events } = setup();
    await controller.handle(start());
    wasm.generateBatch.mockImplementationOnce(() => {
      throw new Error('Generation failed');
    });
    clock.advance(50);
    expect(events.at(-1)).toEqual({
      type: 'error',
      runId: 1,
      stage: 'runtime',
      message: 'Generation failed',
    });
    expect(clock.tasks.size).toBe(0);
    clock.advance(5000);
    expect(wasm.generateBatch).toHaveBeenCalledOnce();
    await controller.handle({ type: 'resume', runId: 1, commandId: 1 });
    expect(clock.tasks.size).toBe(0);
    await controller.handle(start(2));
    clock.advance(100);
    expect(snapshots(events).at(-1)?.runId).toBe(2);
    expect(snapshots(events).at(-1)?.rows[0].volume).toBe(4n);
  });

  // Checks that a zero or out-of-bounds batch pointer stops the run.
  it.each([0, 65536])('stops on invalid batch pointer %s', async (pointer) => {
    const { controller, clock, wasm, events } = setup();
    await controller.handle(start());
    wasm.generateBatch.mockReturnValue(pointer);
    wasm.getBatchLength.mockReturnValue(2);
    clock.advance(50);
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      stage: 'runtime',
      message: expect.stringContaining('batch buffer'),
    });
    expect(clock.tasks.size).toBe(0);
  });

  // Checks that a batch length differing from the requested size stops the run.
  it('stops on mismatched batch length', async () => {
    const { controller, clock, wasm, events } = setup();
    await controller.handle(start());
    wasm.getBatchLength.mockReturnValue(1);
    clock.advance(50);
    expect(events.at(-1)).toMatchObject({ type: 'error', stage: 'runtime' });
    expect(clock.tasks.size).toBe(0);
  });
});
