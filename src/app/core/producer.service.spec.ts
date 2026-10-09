import { TestBed } from '@angular/core/testing';
import { DEFAULT_PRODUCER_SETTINGS, ProducerEvent } from '../shared/contracts';
import { ProducerService, MARKET_WORKER_FACTORY, marketWasmUrl } from './producer.service';
import { FakeWorker } from './testing/fake-worker';

describe('ProducerService', () => {
  let workers: FakeWorker[];
  let service: ProducerService;
  beforeEach(() => {
    workers = [];
    TestBed.configureTestingModule({ providers: [{ provide: MARKET_WORKER_FACTORY, useValue: () => {
      const worker = new FakeWorker(); workers.push(worker); return worker;
    } }] });
    service = TestBed.inject(ProducerService);
    service.start();
  });
  afterEach(() => TestBed.resetTestingModule());
  const running = (worker: FakeWorker, runId: number) => worker.send({ type: 'status', runId, commandId: 0, status: 'running' });

  // Checks the Wasm URL when the application is hosted at the site root or in a subdirectory.
  it('resolves Wasm against root and Pages bases', () => {
    expect(marketWasmUrl('http://localhost:4200/')).toBe('http://localhost:4200/wasm/market.wasm');
    expect(marketWasmUrl('https://example.test/fintech-dashboard/')).toBe('https://example.test/fintech-dashboard/wasm/market.wasm');
  });
  // Checks that the shared service starts once and waits for the worker acknowledgement.
  it('starts once, shares the root instance and waits for running acknowledgement', () => {
    service.start(); expect(workers).toHaveLength(1);
    expect(TestBed.inject(ProducerService)).toBe(service);
    expect(service.rows()).toHaveLength(5);
    workers[0].send({ type: 'ready', runId: 1, abiVersion: 1 });
    expect(service.status()).toBe('initializing');
    running(workers[0], 1); expect(service.status()).toBe('running');
  });
  // Checks that stale snapshots and incorrect acknowledgements are ignored without losing current rows.
  it('accepts only newer snapshots and preserves rows through control acknowledgements', () => {
    running(workers[0], 1);
    const rows = [{ ...service.rows()[0], volume: 123n }];
    workers[0].send({ type: 'snapshot', runId: 1, sequence: 2, rows });
    workers[0].send({ type: 'snapshot', runId: 1, sequence: 1, rows: [] });
    workers[0].send({ type: 'snapshot', runId: 1, sequence: 2, rows: [] });
    service.pause(); service.pause(); service.resume();
    expect(workers[0].postMessage).toHaveBeenCalledTimes(2);
    expect(service.status()).toBe('pausing');
    workers[0].send({ type: 'status', runId: 1, commandId: 2, status: 'paused' });
    workers[0].send({ type: 'status', runId: 1, commandId: 1, status: 'running' });
    expect(service.status()).toBe('pausing');
    workers[0].send({ type: 'status', runId: 1, commandId: 1, status: 'paused' });
    service.resume(); expect(service.status()).toBe('resuming');
    workers[0].send({ type: 'status', runId: 1, commandId: 0, status: 'running' });
    expect(service.status()).toBe('resuming');
    workers[0].send({ type: 'status', runId: 1, commandId: 2, status: 'running' });
    expect(service.status()).toBe('running'); expect(service.rows()).toEqual(rows);
  });
  // Checks that invalid settings leave the active run unchanged.
  it('rejects invalid settings without touching the active run', () => {
    const rows = service.rows();
    expect(service.apply({ ...DEFAULT_PRODUCER_SETTINGS, instrumentCount: 0 })).toBe(false);
    expect(workers).toHaveLength(1); expect(service.rows()).toBe(rows);
    expect(service.settings()).toEqual(DEFAULT_PRODUCER_SETTINGS);
  });
  // Checks that reapplying settings resets totals and rejects events from the previous run.
  it('restarts even with identical settings, clears totals, and rejects all old event types', () => {
    const initialRows = service.rows();
    const populatedRows = initialRows.map(row => ({
      ...row,
      lastPriceCents: 10000,
      spreadCents: 4,
      volume: 123n,
      vwap: { numeratorCents: 1230000n, denominator: 123n },
      imbalance: 0.2,
    }));
    running(workers[0], 1);
    workers[0].send({ type: 'snapshot', runId: 1, sequence: 1, rows: populatedRows });
    expect(service.rows()).toEqual(populatedRows);
    service.apply(DEFAULT_PRODUCER_SETTINGS);
    expect(service.rows()).toEqual(initialRows);
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    const stale: ProducerEvent[] = [
      { type: 'ready', runId: 1, abiVersion: 1 },
      { type: 'snapshot', runId: 1, sequence: 100, rows: [] },
      { type: 'status', runId: 1, commandId: 0, status: 'running' },
      { type: 'error', runId: 1, stage: 'runtime', message: 'stale' },
    ];
    for (const event of stale) { workers[0].send(event); workers[1].send(event); }
    expect(service.status()).toBe('initializing'); expect(service.error()).toBeNull();
    expect(service.rows()).toHaveLength(5); expect(service.rows()[0].volume).toBe(0n);
    expect(service.rows()).toEqual(initialRows);
    running(workers[1], 2); expect(service.status()).toBe('running');
  });
  // Checks that rapid repeated applies preserve a copy of the latest settings.
  it('rapid Apply during loading keeps only the last settings and copies the input', () => {
    const settings = { instrumentCount: 2, updatesPerBatch: 1, batchIntervalMs: 50 };
    service.apply(settings); service.apply(settings); settings.instrumentCount = 10;
    expect(workers[0].terminate).toHaveBeenCalledOnce(); expect(workers[1].terminate).toHaveBeenCalledOnce();
    expect(service.settings().instrumentCount).toBe(2); expect(service.rows()).toHaveLength(2);
    running(workers[2], 3); expect(service.status()).toBe('running');
  });
  // Checks that applying settings while paused starts generation.
  it('Apply while paused starts a new running producer', () => {
    running(workers[0], 1); service.pause();
    workers[0].send({ type: 'status', runId: 1, commandId: 1, status: 'paused' });
    service.apply(DEFAULT_PRODUCER_SETTINGS); running(workers[1], 2);
    expect(service.status()).toBe('running');
  });
  // Checks that errors preserve rows and Retry starts a fresh run with the last applied settings.
  it('preserves last rows on failure; Retry uses last applied settings and resets', () => {
    service.apply({ instrumentCount: 2, updatesPerBatch: 10, batchIntervalMs: 50 });
    const rows = [{ ...service.rows()[0], volume: 999n }];
    workers[1].send({ type: 'snapshot', runId: 2, sequence: 1, rows });
    workers[1].send({ type: 'error', runId: 2, stage: 'load', message: 'HTTP 404' });
    expect(service.status()).toBe('error'); expect(service.rows()).toEqual(rows);
    expect(workers[1].terminate).toHaveBeenCalledOnce(); service.retry();
    expect(service.rows()).toHaveLength(2); expect(service.rows()[0].volume).toBe(0n);
    expect(service.settings().updatesPerBatch).toBe(10); expect(service.error()).toBeNull();
  });
  // Checks worker error handling and resource cleanup when the application is destroyed.
  it('handles native errors, releases listeners and terminates on app destruction', () => {
    workers[0].dispatchEvent(new Event('messageerror')); expect(service.status()).toBe('error');
    service.retry(); TestBed.resetTestingModule(); expect(workers[1].terminate).toHaveBeenCalledOnce();
    running(workers[1], 2); expect(service.status()).toBe('initializing');
    expect(service.apply(DEFAULT_PRODUCER_SETTINGS)).toBe(false);
  });
  // Checks the error message when the browser does not support Web Workers.
  it('reports unsupported browsers', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: MARKET_WORKER_FACTORY, useValue: () => null }] });
    const unsupported = TestBed.inject(ProducerService); unsupported.start();
    expect(unsupported.error()).toContain('does not support');
  });
  // Checks worker termination and error reporting when sending a command fails.
  it('terminates and reports failures while sending start or a control command', () => {
    workers[0].postMessage.mockImplementation(() => { throw new Error('send failed'); });
    running(workers[0], 1); service.pause();
    expect(service.error()).toBe('send failed'); expect(workers[0].terminate).toHaveBeenCalledOnce();
    TestBed.resetTestingModule();
    const broken = new FakeWorker(); broken.postMessage.mockImplementation(() => { throw new Error('start failed'); });
    TestBed.configureTestingModule({ providers: [{ provide: MARKET_WORKER_FACTORY, useValue: () => broken }] });
    const next = TestBed.inject(ProducerService); next.start();
    expect(next.error()).toBe('start failed'); expect(broken.terminate).toHaveBeenCalledOnce();
  });

});
