import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import { MARKET_WORKER_FACTORY, ProducerService } from './producer.service';

class FakeWorker extends EventTarget {
  postMessage = vi.fn(); terminate = vi.fn();
  send(data: unknown) { this.dispatchEvent(new MessageEvent('message', { data })); }
}

describe('Producer across lazy navigation', () => {
  it('keeps one worker, applied settings and paused totals while discarding drafts', async () => {
    const worker = new FakeWorker(), factory = vi.fn(() => worker);
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: MARKET_WORKER_FACTORY, useValue: factory }] });
    const service = TestBed.inject(ProducerService); service.start();
    worker.send({ type: 'status', runId: 1, commandId: 0, status: 'running' });
    const rows = service.rows().map(row => ({ ...row, volume: 999n }));
    worker.send({ type: 'snapshot', runId: 1, sequence: 1, rows });
    const harness = await RouterTestingHarness.create('/dashboard');
    service.pause(); worker.send({ type: 'status', runId: 1, commandId: 1, status: 'paused' });
    await harness.navigateByUrl('/settings');
    const input = harness.routeNativeElement?.querySelector('input') as HTMLInputElement;
    input.value = '20'; input.dispatchEvent(new Event('input')); harness.detectChanges();
    await harness.navigateByUrl('/dashboard');
    expect(harness.routeNativeElement?.textContent).toContain('Resume');
    expect(service.rows()).toEqual(rows); expect(service.status()).toBe('paused');
    await harness.navigateByUrl('/settings');
    expect((harness.routeNativeElement?.querySelector('input') as HTMLInputElement).value).toBe('5');
    expect(factory).toHaveBeenCalledOnce(); expect(worker.terminate).not.toHaveBeenCalled();
    service.resume(); worker.send({ type: 'status', runId: 1, commandId: 2, status: 'running' });
    expect(service.rows()).toEqual(rows); expect(service.status()).toBe('running');
    TestBed.resetTestingModule(); expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
