import { TestBed } from '@angular/core/testing';
import { DEFAULT_PRODUCER_SETTINGS, ProducerEvent } from '../shared/contracts';
import { ProducerService, MARKET_WORKER_FACTORY, marketWasmUrl } from './producer.service';

class FakeWorker extends EventTarget {
  postMessage = vi.fn();
  terminate = vi.fn();
  send(data: ProducerEvent) { this.dispatchEvent(new MessageEvent('message', { data })); }
}

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

  it('resolves Wasm against root and Pages bases', () => {
    expect(marketWasmUrl('http://localhost:4200/')).toBe('http://localhost:4200/wasm/market.wasm');
    expect(marketWasmUrl('https://example.test/fintech-dashboard/')).toBe('https://example.test/fintech-dashboard/wasm/market.wasm');
  });
  it('starts once, shares the root instance and waits for running acknowledgement', () => {
    service.start(); expect(workers).toHaveLength(1);
    expect(TestBed.inject(ProducerService)).toBe(service);
    expect(service.rows()).toHaveLength(5);
    workers[0].send({ type: 'ready', runId: 1, abiVersion: 1 });
    expect(service.status()).toBe('initializing');
    running(workers[0], 1); expect(service.status()).toBe('running');
  });
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
  it('rejects invalid settings without touching the active run', () => {
    const rows = service.rows();
    expect(service.apply({ ...DEFAULT_PRODUCER_SETTINGS, instrumentCount: 0 })).toBe(false);
    expect(workers).toHaveLength(1); expect(service.rows()).toBe(rows);
    expect(service.settings()).toEqual(DEFAULT_PRODUCER_SETTINGS);
  });
  it('restarts even with identical settings, clears totals, and rejects all old event types', () => {
    service.apply(DEFAULT_PRODUCER_SETTINGS);
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
    running(workers[1], 2); expect(service.status()).toBe('running');
  });
  it('rapid Apply during loading keeps only the last settings and copies the input', () => {
    const settings = { instrumentCount: 2, updatesPerBatch: 1, batchIntervalMs: 50 };
    service.apply(settings); service.apply(settings); settings.instrumentCount = 10;
    expect(workers[0].terminate).toHaveBeenCalledOnce(); expect(workers[1].terminate).toHaveBeenCalledOnce();
    expect(service.settings().instrumentCount).toBe(2); expect(service.rows()).toHaveLength(2);
    running(workers[2], 3); expect(service.status()).toBe('running');
  });
  it('Apply while paused starts a new running producer', () => {
    running(workers[0], 1); service.pause();
    workers[0].send({ type: 'status', runId: 1, commandId: 1, status: 'paused' });
    service.apply(DEFAULT_PRODUCER_SETTINGS); running(workers[1], 2);
    expect(service.status()).toBe('running');
  });
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
  it('handles native errors, releases listeners and terminates on app destruction', () => {
    workers[0].dispatchEvent(new Event('messageerror')); expect(service.status()).toBe('error');
    service.retry(); TestBed.resetTestingModule(); expect(workers[1].terminate).toHaveBeenCalledOnce();
    running(workers[1], 2); expect(service.status()).toBe('initializing');
    expect(service.apply(DEFAULT_PRODUCER_SETTINGS)).toBe(false);
  });
  it('reports unsupported browsers and postMessage failures', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: MARKET_WORKER_FACTORY, useValue: () => null }] });
    const unsupported = TestBed.inject(ProducerService); unsupported.start();
    expect(unsupported.error()).toContain('does not support');
  });
});
