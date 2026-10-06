import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ProducerService } from '../../core/producer.service';
import { DEFAULT_PRODUCER_SETTINGS, ProducerSettings } from '../../shared/contracts';
import { integerRange, Settings } from './settings';

describe('Settings draft and validation', () => {
  const active = signal<ProducerSettings>({ ...DEFAULT_PRODUCER_SETTINGS });
  const apply = vi.fn((settings: ProducerSettings) => { active.set({ ...settings }); return true; });
  const open = vi.fn();
  beforeEach(() => {
    active.set({ ...DEFAULT_PRODUCER_SETTINGS }); apply.mockClear(); open.mockClear();
    TestBed.configureTestingModule({ imports: [Settings], providers: [
      { provide: ProducerService, useValue: { settings: active, apply } },
      { provide: MatSnackBar, useValue: { open } },
    ] });
  });
  it('isolates draft changes, applies once and displays confirmation without navigation', () => {
    const fixture = TestBed.createComponent(Settings); fixture.detectChanges();
    fixture.componentInstance.form.setValue({ instrumentCount: 50, updatesPerBatch: 1000, batchIntervalMs: 50 });
    fixture.detectChanges(); expect(apply).not.toHaveBeenCalled(); expect(active()).toEqual(DEFAULT_PRODUCER_SETTINGS);
    expect(fixture.nativeElement.textContent).toContain('20000 updates per second across all instruments');
    fixture.componentInstance.apply(); fixture.detectChanges();
    expect(apply).toHaveBeenCalledOnce(); expect(active().instrumentCount).toBe(50);
    expect(fixture.nativeElement.textContent).toContain('Settings applied. A new run has started.');
    expect(open).toHaveBeenCalledOnce();
  });
  it('blocks invalid forms, identifies errors, and accepts the exact lower/upper limits', () => {
    const fixture = TestBed.createComponent(Settings); const form = fixture.componentInstance.form;
    form.controls.instrumentCount.setValue(null); form.markAllAsTouched(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('A value is required.');
    fixture.componentInstance.apply(); expect(apply).not.toHaveBeenCalled();
    for (const values of [
      { instrumentCount: 1, updatesPerBatch: 1, batchIntervalMs: 50 },
      { instrumentCount: 50, updatesPerBatch: 1000, batchIntervalMs: 2000 },
    ]) { form.setValue(values); expect(form.valid).toBe(true); }
  });
  it('reopening discards unapplied drafts and reads the applied configuration', () => {
    let fixture = TestBed.createComponent(Settings);
    fixture.componentInstance.form.controls.instrumentCount.setValue(20); fixture.destroy();
    fixture = TestBed.createComponent(Settings); expect(fixture.componentInstance.form.getRawValue()).toEqual(DEFAULT_PRODUCER_SETTINGS);
    fixture.componentInstance.form.controls.instrumentCount.setValue(3); fixture.componentInstance.apply(); fixture.destroy();
    fixture = TestBed.createComponent(Settings); expect(fixture.componentInstance.form.controls.instrumentCount.value).toBe(3);
  });
  it('rejects fractions, nonnumeric values, NaN, infinity and out-of-range values', () => {
    const validator = integerRange(1, 50);
    for (const value of [1.5, NaN, Infinity, -Infinity, '2']) {
      expect(validator(new FormControl(value))).toEqual({ integer: true });
    }
    for (const value of [0, -1, 51]) expect(validator(new FormControl(value))).toEqual({ range: { min: 1, max: 50 } });
  });
});
