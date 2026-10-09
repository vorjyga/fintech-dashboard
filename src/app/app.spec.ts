import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { App } from './app';
import { routes } from './app.routes';
import { MARKET_WORKER_FACTORY, ProducerService } from './core/producer.service';
import { FakeWorker } from './core/testing/fake-worker';

describe('Application shell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  // Checks navigation links to both application pages.
  it('exposes both navigation destinations', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const links = Array.from(
      fixture.nativeElement.querySelectorAll('nav a'),
    ) as HTMLAnchorElement[];
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/dashboard', '/settings']);
  });

  // Checks the visible producer status during startup, acknowledgements, pause and resume.
  it('displays producer status throughout pause and resume acknowledgements', () => {
    const worker = new FakeWorker();
    TestBed.overrideProvider(MARKET_WORKER_FACTORY, { useValue: () => worker });
    const fixture = TestBed.createComponent(App);
    const producer = TestBed.inject(ProducerService);
    const expectStatus = (status: string) => {
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('[role="status"] p')?.textContent?.trim()).toBe(
        `Producer: ${status}`,
      );
    };

    expectStatus('initializing');
    worker.send({ type: 'status', runId: 1, commandId: 0, status: 'running' });
    expectStatus('running');
    producer.pause();
    expectStatus('pausing');
    worker.send({ type: 'status', runId: 1, commandId: 1, status: 'paused' });
    expectStatus('paused');
    producer.resume();
    expectStatus('resuming');
    worker.send({ type: 'status', runId: 1, commandId: 2, status: 'running' });
    expectStatus('running');
  });

  // Checks page navigation and redirects for empty and unknown paths.
  it('navigates between lazy pages and redirects empty and unknown paths', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Market dashboard');
    await harness.navigateByUrl('/settings');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Producer settings');
    expect(harness.routeNativeElement?.textContent).toContain('500 ms');
    await harness.navigateByUrl('/unknown');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Market dashboard');
  });
});
