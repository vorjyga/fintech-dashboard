import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProducerService, ProducerStatus } from '../../core/producer.service';
import { InstrumentSnapshot } from '../../shared/contracts';
import { Dashboard } from './dashboard';

describe('Live dashboard', () => {
  const initial: InstrumentSnapshot = {
    instrumentId: 0,
    symbol: 'ALFA',
    lastPriceCents: null,
    spreadCents: null,
    volume: 0n,
    vwap: null,
    imbalance: null,
  };
  const rows = signal<readonly InstrumentSnapshot[]>([]);
  const status = signal<ProducerStatus>('running');
  const pause = vi.fn(),
    resume = vi.fn();
  beforeEach(() => {
    rows.set([initial]);
    status.set('running');
    pause.mockClear();
    resume.mockClear();
    TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [{ provide: ProducerService, useValue: { rows, status, pause, resume } }],
    });
  });
  // Checks initial values and cell updates that preserve the existing row element.
  it('renders all initial cells and updates in place using instrument identity', () => {
    status.set('initializing');
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(Array.from(element.querySelectorAll('td')).map((td) => td.textContent?.trim())).toEqual([
      'ALFA',
      '—',
      '—',
      '0',
      '—',
      '—',
    ]);
    const row = element.querySelector('tbody tr');
    rows.set([
      {
        ...initial,
        lastPriceCents: 10001,
        spreadCents: 2,
        volume: 2n,
        vwap: { numeratorCents: 20001n, denominator: 2n },
        imbalance: -0.5,
      },
    ]);
    status.set('running');
    fixture.detectChanges();
    expect(element.querySelector('tbody tr')).toBe(row);
    expect(Array.from(element.querySelectorAll('td')).map((td) => td.textContent?.trim())).toEqual([
      'ALFA',
      '$100.01',
      '$0.02',
      '2',
      '$100.01',
      '-0.50',
    ]);
  });

  // Checks unavailable ratios for zero denominators while preserving currency formatting.
  it('renders unavailable ratios for zero denominators and preserves currency and zero volume', () => {
    rows.set([
      {
        ...initial,
        lastPriceCents: 123456,
        spreadCents: 4,
        vwap: { numeratorCents: 0n, denominator: 0n },
        imbalance: null,
      },
    ]);
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(Array.from(element.querySelectorAll('td')).map((td) => td.textContent?.trim())).toEqual([
      'ALFA',
      '$1,234.56',
      '$0.04',
      '0',
      '—',
      '—',
    ]);
  });

  // Checks imbalance display at both bounds and at zero with two decimal places.
  it.each([
    [-1, '-1.00'],
    [0, '0.00'],
    [1, '1.00'],
  ] as const)('renders imbalance %s as %s', (imbalance, expected) => {
    rows.set([{ ...initial, imbalance }]);
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('td.mat-column-imbalance')?.textContent?.trim()).toBe(expected);
  });

  // Checks pause and resume commands and disables controls until acknowledgement.
  it('dispatches controls and disables pending commands', () => {
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    let button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('Pause');
    button.click();
    expect(pause).toHaveBeenCalledOnce();
    status.set('pausing');
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    expect(button.textContent?.trim()).toBe('Pausing…');
    status.set('paused');
    fixture.detectChanges();
    button = fixture.nativeElement.querySelector('button');
    expect(button.textContent?.trim()).toBe('Resume');
    button.click();
    expect(resume).toHaveBeenCalledOnce();
    status.set('resuming');
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    expect(button.textContent?.trim()).toBe('Resuming…');
  });
});
