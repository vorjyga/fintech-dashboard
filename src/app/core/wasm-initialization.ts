import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { fromEvent, map, merge, Observable, Subscription } from 'rxjs';
import { DEFAULT_PRODUCER_SETTINGS, ProducerCommand, ProducerEvent } from '../shared/contracts';

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

export type InitializationState =
  | { status: 'loading' }
  | { status: 'ready'; abiVersion: number }
  | { status: 'error'; message: string };

@Injectable({ providedIn: 'root' })
export class WasmInitialization {
  private readonly createWorker = inject(MARKET_WORKER_FACTORY);
  private readonly document = inject(DOCUMENT);
  private worker: Worker | null = null;
  private subscription?: Subscription;
  private runId = 0;
  private readonly currentState = signal<InitializationState>({ status: 'loading' });
  readonly state = this.currentState.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.releaseWorker());
    this.initialize();
  }

  initialize(): void {
    this.releaseWorker();
    const runId = ++this.runId;
    this.currentState.set({ status: 'loading' });
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
          message: 'The market worker could not initialize. Please retry.',
        })),
      );
      this.subscription = merge(messages, failures).subscribe((event) => {
        if (event.runId !== this.runId) return;
        if (event.type === 'ready')
          this.currentState.set({ status: 'ready', abiVersion: event.abiVersion });
        if (event.type === 'error') {
          this.currentState.set({ status: 'error', message: event.message });
          this.releaseWorker();
        }
      });
      const command: ProducerCommand = {
        type: 'start',
        runId,
        settings: { ...DEFAULT_PRODUCER_SETTINGS },
        seed: 1,
        wasmUrl: marketWasmUrl(this.document.baseURI),
      };
      worker.postMessage(command);
    } catch (error) {
      this.releaseWorker();
      this.currentState.set({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private releaseWorker(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.worker?.terminate();
    this.worker = null;
  }
}
