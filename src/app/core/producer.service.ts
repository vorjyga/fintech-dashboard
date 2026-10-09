import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { fromEvent, map, merge, Observable, Subscription } from 'rxjs';
import {
  DEFAULT_PRODUCER_SETTINGS,
  InstrumentSnapshot,
  ProducerCommand,
  ProducerEvent,
  ProducerSettings,
} from '../shared/contracts';
import { isValidProducerSettings } from '../shared/producer-settings';
import { instrumentSymbol } from '../shared/instrument-symbol';
import { errorMessage } from '../shared/error-message';

export const MARKET_WORKER_FACTORY = new InjectionToken<() => Worker | null>(
  'Market worker factory',
  {
    providedIn: 'root',
    factory: () => () =>
      typeof Worker === 'undefined'
        ? null
        : new Worker(new URL('../worker/market.worker', import.meta.url), { type: 'module' }),
  },
);

export function marketWasmUrl(baseUri: string): string {
  return new URL('wasm/market.wasm', baseUri).href;
}

export type ProducerStatus =
  'initializing' | 'running' | 'pausing' | 'paused' | 'resuming' | 'error';

function emptyRows(count: number): InstrumentSnapshot[] {
  return Array.from({ length: count }, (_, instrumentId) => ({
    instrumentId,
    symbol: instrumentSymbol(instrumentId),
    lastPriceCents: null,
    spreadCents: null,
    volume: 0n,
    vwap: null,
    imbalance: null,
  }));
}

@Injectable({ providedIn: 'root' })
export class ProducerService {
  private readonly createWorker = inject(MARKET_WORKER_FACTORY);
  private readonly document = inject(DOCUMENT);
  private worker: Worker | null = null;
  private subscription?: Subscription;
  private runId = 0;
  private sequence = 0;
  private commandId = 0;
  private pending?: { commandId: number; status: 'running' | 'paused' };
  private destroyed = false;
  private readonly currentRows = signal<readonly InstrumentSnapshot[]>(
    emptyRows(DEFAULT_PRODUCER_SETTINGS.instrumentCount),
  );
  private readonly currentSettings = signal<Readonly<ProducerSettings>>({
    ...DEFAULT_PRODUCER_SETTINGS,
  });
  private readonly currentStatus = signal<ProducerStatus>('initializing');
  private readonly currentError = signal<string | null>(null);
  readonly rows = this.currentRows.asReadonly();
  readonly settings = this.currentSettings.asReadonly();
  readonly status = this.currentStatus.asReadonly();
  readonly error = this.currentError.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.releaseWorker();
    });
  }

  /** Root component calls once; navigation never creates a producer. */
  start(): void {
    if (this.runId === 0) this.apply(this.settings());
  }

  apply(settings: ProducerSettings): boolean {
    if (this.destroyed || !isValidProducerSettings(settings)) return false;
    this.releaseWorker();
    const runId = ++this.runId;
    this.sequence = 0;
    this.commandId = 0;
    this.pending = undefined;
    this.currentSettings.set({ ...settings });
    this.currentRows.set(emptyRows(settings.instrumentCount));
    this.currentError.set(null);
    this.currentStatus.set('initializing');
    try {
      const worker = this.createWorker();
      if (!worker) throw new Error('This browser does not support Web Workers.');
      this.worker = worker;
      const messages: Observable<ProducerEvent> = fromEvent<MessageEvent<ProducerEvent>>(
        worker,
        'message',
      ).pipe(map((event) => event.data));
      const failures = merge(fromEvent(worker, 'error'), fromEvent(worker, 'messageerror')).pipe(
        map((): ProducerEvent => ({
          type: 'error',
          runId,
          stage: 'runtime',
          message: 'The market worker stopped unexpectedly. Please retry.',
        })),
      );
      this.subscription = merge(messages, failures).subscribe((event) => this.receive(event));
      const command: ProducerCommand = {
        type: 'start',
        runId,
        settings: { ...settings },
        seed: 0,
        wasmUrl: marketWasmUrl(this.document.baseURI),
      };
      worker.postMessage(command);
    } catch (error) {
      this.fail(errorMessage(error));
    }
    return true;
  }

  pause(): void {
    if (this.status() === 'running') this.control('pause');
  }
  resume(): void {
    if (this.status() === 'paused') this.control('resume');
  }
  retry(): void {
    if (this.status() === 'error') this.apply(this.settings());
  }

  private control(type: 'pause' | 'resume'): void {
    if (!this.worker || this.pending) return;
    const commandId = ++this.commandId;
    this.pending = { commandId, status: type === 'pause' ? 'paused' : 'running' };
    this.currentStatus.set(type === 'pause' ? 'pausing' : 'resuming');
    try {
      this.worker.postMessage({ type, runId: this.runId, commandId } satisfies ProducerCommand);
    } catch (error) {
      this.fail(errorMessage(error));
    }
  }

  private receive(event: ProducerEvent): void {
    if (event.runId !== this.runId || this.destroyed) return;
    switch (event.type) {
      case 'ready':
        break; // Running requires the controller's acknowledgement.
      case 'snapshot':
        if (event.sequence > this.sequence) {
          this.sequence = event.sequence;
          this.currentRows.set(event.rows);
        }
        break;
      case 'status':
        if (
          event.commandId === 0 &&
          this.commandId === 0 &&
          this.status() === 'initializing' &&
          event.status === 'running'
        ) {
          this.currentStatus.set('running');
        } else if (
          this.pending?.commandId === event.commandId &&
          this.pending.status === event.status
        ) {
          this.pending = undefined;
          this.currentStatus.set(event.status);
        }
        break;
      case 'error':
        this.fail(event.message);
        break;
    }
  }

  private fail(message: string): void {
    this.pending = undefined;
    this.currentError.set(message);
    this.currentStatus.set('error');
    this.releaseWorker();
  }

  private releaseWorker(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.worker?.terminate();
    this.worker = null;
  }
}
