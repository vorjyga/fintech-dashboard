import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { App } from './app';
import { routes } from './app.routes';

describe('Application shell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('exposes both navigation destinations', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const links = Array.from(
      fixture.nativeElement.querySelectorAll('nav a'),
    ) as HTMLAnchorElement[];
    expect(links.map((link) => link.textContent?.trim())).toEqual(['Dashboard', 'Settings']);
  });

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
