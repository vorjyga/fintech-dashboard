import type {
  MarketWasmExports,
  ProducerCommand,
  ProducerEvent,
  ProducerSettings,
} from '../shared/contracts';
import { MARKET_UPDATE_BYTES } from '../shared/contracts';
import { errorMessage } from '../shared/error-message';
import { isValidProducerSettings } from '../shared/producer-settings';
import { MarketAggregator } from './market-aggregator';
import { WasmInitializationError } from './wasm-loader';

export interface ProducerDependencies {
  load: (wasmUrl: string, signal?: AbortSignal) => Promise<MarketWasmExports>;
  now: () => number;
  setTimer: (callback: () => void, delayMs: number) => unknown;
  clearTimer: (timer: unknown) => void;
  send: (event: ProducerEvent) => void;
}

interface ActiveRun {
  runId: number;
  settings: ProducerSettings;
  wasm: MarketWasmExports;
  aggregator: MarketAggregator;
  state: 'running' | 'paused';
  sequence: number;
  lastSnapshotAt: number;
  lastCommandId: number;
  timer?: unknown;
  timerVersion: number;
}

const SNAPSHOT_INTERVAL_MS = 100;

/** One run, one sequential timer, and no dependency on Angular or the Worker global. */
export class ProducerController {
  private active?: ActiveRun;
  private pendingLoad?: AbortController;
  private epoch = 0;
  private disposed = false;

  constructor(private readonly dependencies: ProducerDependencies) {}

  async handle(command: ProducerCommand): Promise<void> {
    if (this.disposed) return;
    if (command.type === 'start') {
      await this.start(command);
      return;
    }
    const run = this.active;
    if (
      !run ||
      command.runId !== run.runId ||
      !Number.isSafeInteger(command.commandId) ||
      command.commandId <= run.lastCommandId
    )
      return;
    try {
      run.lastCommandId = command.commandId;
      if (command.type === 'pause') {
        if (run.state === 'running') {
          run.state = 'paused';
          this.cancelTimer(run);
          this.sendSnapshot(run);
        }
      } else if (run.state === 'paused') {
        run.state = 'running';
        this.schedule(run);
      }
      this.dependencies.send({
        type: 'status',
        runId: run.runId,
        commandId: command.commandId,
        status: run.state,
      });
    } catch (error) {
      if (this.active !== run) return;
      this.stop();
      this.reportError(run.runId, error);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
  }

  private stop(): void {
    this.epoch++;
    this.pendingLoad?.abort();
    this.pendingLoad = undefined;
    if (this.active) this.cancelTimer(this.active);
    this.active = undefined;
  }

  private async start(command: Extract<ProducerCommand, { type: 'start' }>): Promise<void> {
    this.stop();
    const epoch = this.epoch;
    const { runId, seed, wasmUrl } = command;
    if (!isValidProducerSettings(command.settings)) {
      this.reportError(
        runId,
        new WasmInitializationError('settings', 'Invalid market producer settings.'),
      );
      return;
    }
    const settings = { ...command.settings };
    const pendingLoad = new AbortController();
    this.pendingLoad = pendingLoad;
    try {
      const wasm = await this.dependencies.load(wasmUrl, pendingLoad.signal);
      if (epoch !== this.epoch || pendingLoad.signal.aborted) return;
      if (wasm.init(settings.instrumentCount, seed) !== 0) {
        throw new WasmInitializationError(
          'settings',
          'The market module rejected the instrument count.',
        );
      }
      const run: ActiveRun = {
        runId,
        settings,
        wasm,
        aggregator: new MarketAggregator(settings.instrumentCount),
        state: 'running',
        sequence: 0,
        lastSnapshotAt: this.dependencies.now(),
        lastCommandId: 0,
        timerVersion: 0,
      };
      this.active = run;
      this.pendingLoad = undefined;
      this.dependencies.send({ type: 'ready', runId, abiVersion: wasm.abiVersion() });
      this.sendSnapshot(run);
      // commandId 0 denotes the initial running state, not a control acknowledgement.
      this.dependencies.send({ type: 'status', runId, commandId: 0, status: 'running' });
      this.schedule(run);
    } catch (error) {
      if (epoch !== this.epoch || pendingLoad.signal.aborted) return;
      this.stop();
      this.reportError(runId, error);
    }
  }

  private schedule(run: ActiveRun): void {
    if (this.active !== run || run.state !== 'running' || run.timer !== undefined) return;
    const timerVersion = ++run.timerVersion;
    run.timer = this.dependencies.setTimer(
      () => this.tick(run, timerVersion),
      run.settings.batchIntervalMs,
    );
  }

  private tick(run: ActiveRun, timerVersion: number): void {
    if (this.active !== run || run.state !== 'running' || run.timerVersion !== timerVersion) return;
    run.timer = undefined;
    try {
      const count = run.settings.updatesPerBatch;
      const pointer = run.wasm.generateBatch(count);
      if (
        !Number.isSafeInteger(pointer) ||
        pointer <= 0 ||
        pointer % 4 !== 0 ||
        run.wasm.getBatchLength() !== count ||
        pointer + count * MARKET_UPDATE_BYTES > run.wasm.memory.buffer.byteLength
      ) {
        throw new Error('The market module returned an invalid batch buffer.');
      }
      const data = new DataView(run.wasm.memory.buffer, pointer, count * MARKET_UPDATE_BYTES);
      // Fully consume this view before the next call can overwrite Wasm memory.
      for (let index = 0; index < count; index++) {
        const offset = index * MARKET_UPDATE_BYTES;
        run.aggregator.consume({
          instrumentId: data.getUint32(offset, true),
          priceCents: data.getUint32(offset + 4, true),
          tradeQuantity: data.getUint32(offset + 8, true),
          bidCents: data.getUint32(offset + 12, true),
          askCents: data.getUint32(offset + 16, true),
          bidQuantity: data.getUint32(offset + 20, true),
          askQuantity: data.getUint32(offset + 24, true),
        });
      }
      if (this.dependencies.now() - run.lastSnapshotAt >= SNAPSHOT_INTERVAL_MS)
        this.sendSnapshot(run);
      // Delay starts after processing; missed intervals are never caught up.
      this.schedule(run);
    } catch (error) {
      this.stop();
      this.reportError(run.runId, error);
    }
  }

  private sendSnapshot(run: ActiveRun): void {
    run.lastSnapshotAt = this.dependencies.now();
    this.dependencies.send({
      type: 'snapshot',
      runId: run.runId,
      sequence: ++run.sequence,
      rows: run.aggregator.snapshot(),
    });
  }

  private cancelTimer(run: ActiveRun): void {
    run.timerVersion++;
    if (run.timer !== undefined) this.dependencies.clearTimer(run.timer);
    run.timer = undefined;
  }

  private reportError(runId: number, error: unknown): void {
    this.dependencies.send({
      type: 'error',
      runId,
      stage: error instanceof WasmInitializationError ? error.stage : 'runtime',
      message: errorMessage(error),
    });
  }
}
