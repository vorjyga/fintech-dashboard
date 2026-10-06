import { TestBed } from '@angular/core/testing';
import { WasmInitialization, MARKET_WORKER_FACTORY, marketWasmUrl } from './wasm-initialization';

class FakeWorker extends EventTarget {
  postMessage = vi.fn();
  terminate = vi.fn();
  send(data: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}

describe('Application Wasm initialization', () => {
  let workers: FakeWorker[];
  beforeEach(() => {
    workers = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MARKET_WORKER_FACTORY,
          useValue: () => {
            const worker = new FakeWorker();
            workers.push(worker);
            return worker;
          },
        },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());

  it('resolves Wasm against the application base path', () => {
    expect(marketWasmUrl('http://localhost:4200/')).toBe('http://localhost:4200/wasm/market.wasm');
    expect(marketWasmUrl('https://example.test/fintech-dashboard/')).toBe(
      'https://example.test/fintech-dashboard/wasm/market.wasm',
    );
  });

  it('shares one worker, displays ready and frees resources on destruction', () => {
    const service = TestBed.inject(WasmInitialization);
    expect(TestBed.inject(WasmInitialization)).toBe(service);
    expect(workers).toHaveLength(1);
    const command = workers[0].postMessage.mock.calls[0][0];
    expect(command.type).toBe('start');
    workers[0].send({ type: 'ready', runId: command.runId, abiVersion: 1 });
    expect(service.state()).toEqual({ status: 'ready', abiVersion: 1 });
    TestBed.resetTestingModule();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    workers[0].send({ type: 'error', runId: command.runId, message: 'Late error' });
    expect(service.state().status).toBe('ready');
  });

  it('terminates the old worker and rejects old run results after retry', () => {
    const service = TestBed.inject(WasmInitialization);
    service.initialize();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    workers[1].send({ type: 'ready', runId: 1, abiVersion: 1 });
    expect(service.state().status).toBe('loading');
    workers[1].send({ type: 'ready', runId: 2, abiVersion: 1 });
    expect(service.state().status).toBe('ready');
  });

  it('reports native worker failures', () => {
    const service = TestBed.inject(WasmInitialization);
    workers[0].dispatchEvent(new Event('messageerror'));
    expect(service.state()).toMatchObject({
      status: 'error',
      message: expect.stringContaining('worker'),
    });
  });

  it('reports unsupported browsers without attempting to post a message', () => {
    TestBed.overrideProvider(MARKET_WORKER_FACTORY, { useValue: () => null });
    expect(TestBed.inject(WasmInitialization).state()).toMatchObject({
      status: 'error',
      message: expect.stringContaining('does not support'),
    });
  });
});
