import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { DEFAULT_PRODUCER_SETTINGS } from '../../shared/contracts';

@Component({
  selector: 'app-settings',
  imports: [MatCardModule],
  template: `
    <section aria-labelledby="settings-heading">
      <h1 id="settings-heading">Producer settings</h1>
      <p class="page-description">Default configuration for the upcoming market producer.</p>
      <mat-card appearance="outlined">
        <mat-card-content>
          <dl class="grid grid-cols-1 gap-6 py-6 sm:grid-cols-3">
            <div>
              <dt>Instruments</dt>
              <dd class="m-0 mt-2">{{ defaults.instrumentCount }}</dd>
            </div>
            <div>
              <dt>Updates per batch</dt>
              <dd class="m-0 mt-2">{{ defaults.updatesPerBatch }}</dd>
            </div>
            <div>
              <dt>Batch interval</dt>
              <dd class="m-0 mt-2">{{ defaults.batchIntervalMs }} ms</dd>
            </div>
          </dl>
          <p class="page-description">
            Editing and applying settings will be available when producer controls are implemented.
          </p>
        </mat-card-content>
      </mat-card>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {
  protected readonly defaults = DEFAULT_PRODUCER_SETTINGS;
}
