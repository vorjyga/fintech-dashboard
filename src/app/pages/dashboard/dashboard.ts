import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-dashboard',
  imports: [MatCardModule],
  template: `
    <section aria-labelledby="dashboard-heading">
      <h1 id="dashboard-heading">Market dashboard</h1>
      <p class="page-description">Simulated market data and cumulative trading metrics.</p>
      <mat-card appearance="outlined">
        <mat-card-content>
          <div class="py-6">
            <h2>Market data is coming next</h2>
            <p class="page-description">
              The WebAssembly market generator is ready. Live metrics will be connected in the next
              implementation stages.
            </p>
          </div>
        </mat-card-content>
      </mat-card>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {}
