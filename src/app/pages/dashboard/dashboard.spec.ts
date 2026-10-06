import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProducerService, ProducerStatus } from '../../core/producer.service';
import { InstrumentSnapshot } from '../../shared/contracts';
import { Dashboard } from './dashboard';

describe('Live dashboard', () => {
  const initial: InstrumentSnapshot = { instrumentId: 0, symbol: 'ALFA', lastPriceCents: null,
    spreadCents: null, volume: 0n, vwap: null, imbalance: null };
  const rows = signal<readonly InstrumentSnapshot[]>([]);
  const status = signal<ProducerStatus>('running');
  const pause = vi.fn(), resume = vi.fn();
  beforeEach(() => {
    rows.set([initial]); status.set('running'); pause.mockClear(); resume.mockClear();
    TestBed.configureTestingModule({ imports: [Dashboard], providers: [{ provide: ProducerService,
      useValue: { rows, status, pause, resume } }] });
  });
  it('renders all initial cells and updates in place using instrument identity', () => {
    const fixture = TestBed.createComponent(Dashboard); fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(Array.from(element.querySelectorAll('td')).map(td => td.textContent?.trim()))
      .toEqual(['ALFA', '—', '—', '0', '—', '—']);
    const row = element.querySelector('tbody tr');
    rows.set([{ ...initial, lastPriceCents: 10001, spreadCents: 2, volume: 2n,
      vwap: { numeratorCents: 20001n, denominator: 2n }, imbalance: -0.5 }]);
    fixture.detectChanges();
    expect(element.querySelector('tbody tr')).toBe(row);
    expect(Array.from(element.querySelectorAll('td')).map(td => td.textContent?.trim()))
      .toEqual(['ALFA', '$100.01', '$0.02', '2', '$100.01', '-0.50']);
  });
  it('dispatches controls and disables pending commands', () => {
    const fixture = TestBed.createComponent(Dashboard); fixture.detectChanges();
    let button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    button.click(); expect(pause).toHaveBeenCalledOnce();
    status.set('pausing'); fixture.detectChanges(); expect(button.disabled).toBe(true);
    status.set('paused'); fixture.detectChanges();
    button = fixture.nativeElement.querySelector('button'); button.click(); expect(resume).toHaveBeenCalledOnce();
    status.set('resuming'); fixture.detectChanges(); expect(button.disabled).toBe(true);
  });
});
