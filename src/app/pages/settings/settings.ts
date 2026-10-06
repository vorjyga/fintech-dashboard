import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ProducerService } from '../../core/producer.service';
import { isValidProducerSettings } from '../../shared/producer-settings';

export function integerRange(min: number, max: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value: unknown = control.value;
    if (value === null || value === '') return null; // required handles empty input.
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) return { integer: true };
    return value < min || value > max ? { range: { min, max } } : null;
  };
}

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, MatCardModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <section aria-labelledby="settings-heading">
      <h1 id="settings-heading">Producer settings</h1>
      <p class="page-description">Edit a draft, then apply to start a new run and clear accumulated totals.</p>
      <mat-card appearance="outlined">
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="apply()" class="py-6">
            <div class="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <mat-form-field appearance="outline">
                <mat-label>Instruments</mat-label>
                <input matInput type="number" formControlName="instrumentCount" min="1" max="50" step="1" required />
                <mat-hint>Integer from 1 to 50</mat-hint>
                <mat-error>{{ errorFor(form.controls.instrumentCount, 1, 50) }}</mat-error>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Updates per batch</mat-label>
                <input matInput type="number" formControlName="updatesPerBatch" min="1" max="1000" step="1" required />
                <mat-hint>Integer from 1 to 1,000</mat-hint>
                <mat-error>{{ errorFor(form.controls.updatesPerBatch, 1, 1000) }}</mat-error>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Batch interval (ms)</mat-label>
                <input matInput type="number" formControlName="batchIntervalMs" min="50" max="2000" step="1" required />
                <mat-hint>Integer from 50 to 2,000 ms</mat-hint>
                <mat-error>{{ errorFor(form.controls.batchIntervalMs, 50, 2000) }}</mat-error>
              </mat-form-field>
            </div>
            <p class="mt-6" aria-live="polite">Nominal rate: {{ rate() === null ? '—' : rate() }} updates per second across all instruments.</p>
            <p class="page-description">Active run: {{ producer.settings().instrumentCount }} instruments ·
              {{ producer.settings().updatesPerBatch }} updates per batch · {{ producer.settings().batchIntervalMs }} ms.</p>
            <button mat-flat-button type="submit" [disabled]="form.invalid">Apply settings</button>
            @if (applied()) { <p role="status" class="mt-4">Settings applied. A new run has started.</p> }
          </form>
        </mat-card-content>
      </mat-card>
      <p class="page-description mt-4">Leaving this page discards unapplied edits. Reloading uses the default settings.</p>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {
  protected readonly producer = inject(ProducerService);
  private readonly snackBar = inject(MatSnackBar);
  readonly form = new FormGroup({
    instrumentCount: new FormControl<number | null>(this.producer.settings().instrumentCount, [Validators.required, integerRange(1, 50)]),
    updatesPerBatch: new FormControl<number | null>(this.producer.settings().updatesPerBatch, [Validators.required, integerRange(1, 1000)]),
    batchIntervalMs: new FormControl<number | null>(this.producer.settings().batchIntervalMs, [Validators.required, integerRange(50, 2000)]),
  });
  private readonly draft = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly rate = computed(() => {
    const draft = this.draft();
    return isValidProducerSettings(draft) ? Number((draft.updatesPerBatch * 1000 / draft.batchIntervalMs).toFixed(2)) : null;
  });
  protected readonly applied = signal(false);

  apply(): void {
    const draft = this.form.getRawValue();
    if (this.form.invalid || !isValidProducerSettings(draft)) { this.form.markAllAsTouched(); return; }
    if (this.producer.apply(draft)) {
      this.applied.set(true);
      this.form.markAsPristine();
      this.snackBar.open('Settings applied. New run started.', 'Dismiss', { duration: 4000 });
    }
  }

  protected errorFor(control: AbstractControl, min: number, max: number): string {
    if (control.hasError('required')) return 'A value is required.';
    if (control.hasError('integer')) return 'Enter a finite whole number.';
    return `Enter a value from ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')}.`;
  }
}
