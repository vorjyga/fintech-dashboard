import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ProducerService } from '../../core/producer.service';
import { InstrumentSnapshot } from '../../shared/contracts';
import { formatImbalance, formatPriceCents, formatVolume, formatVwap } from '../../shared/metric-formatters';

@Component({
  selector: 'app-dashboard',
  imports: [MatTableModule, MatButtonModule, MatProgressBarModule],
  template: `
    <section aria-labelledby="dashboard-heading">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 id="dashboard-heading">Market dashboard</h1>
          <p class="page-description">Simulated market data · USD · cumulative volume and VWAP.</p>
        </div>
        <div class="mb-4 flex gap-2">
          @if (producer.status() === 'paused' || producer.status() === 'resuming') {
            <button mat-flat-button type="button" (click)="producer.resume()"
              [disabled]="producer.status() !== 'paused'">{{ producer.status() === 'resuming' ? 'Resuming…' : 'Resume' }}</button>
          } @else {
            <button mat-flat-button type="button" (click)="producer.pause()"
              [disabled]="producer.status() !== 'running'">{{ producer.status() === 'pausing' ? 'Pausing…' : 'Pause' }}</button>
          }
        </div>
      </div>
      @if (producer.status() === 'initializing') {
        <mat-progress-bar mode="indeterminate" aria-label="Initializing market producer" />
      }
      <div class="table-scroll" tabindex="0" role="region" aria-label="Live market metrics table">
        <table mat-table [dataSource]="producer.rows()" [trackBy]="trackInstrument">
          <caption class="sr-only">Latest trade, spread, cumulative volume, volume-weighted average price and order book imbalance by instrument.</caption>
          <ng-container matColumnDef="symbol">
            <th mat-header-cell *matHeaderCellDef scope="col">Instrument</th>
            <td mat-cell *matCellDef="let row">{{ row.symbol }}</td>
          </ng-container>
          <ng-container matColumnDef="last">
            <th mat-header-cell *matHeaderCellDef scope="col" class="metric">Last price</th>
            <td mat-cell *matCellDef="let row" class="metric">{{ price(row.lastPriceCents) }}</td>
          </ng-container>
          <ng-container matColumnDef="spread">
            <th mat-header-cell *matHeaderCellDef scope="col" class="metric">Spread</th>
            <td mat-cell *matCellDef="let row" class="metric">{{ price(row.spreadCents) }}</td>
          </ng-container>
          <ng-container matColumnDef="volume">
            <th mat-header-cell *matHeaderCellDef scope="col" class="metric">Volume</th>
            <td mat-cell *matCellDef="let row" class="metric">{{ volume(row.volume) }}</td>
          </ng-container>
          <ng-container matColumnDef="vwap">
            <th mat-header-cell *matHeaderCellDef scope="col" class="metric">VWAP</th>
            <td mat-cell *matCellDef="let row" class="metric">{{ vwap(row.vwap) }}</td>
          </ng-container>
          <ng-container matColumnDef="imbalance">
            <th mat-header-cell *matHeaderCellDef scope="col" class="metric">Imbalance</th>
            <td mat-cell *matCellDef="let row" class="metric">{{ imbalance(row.imbalance) }}</td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
        </table>
      </div>
      <p class="page-description mt-4">Totals cover this run. Pause preserves them; applying settings starts a new run.</p>
    </section>
  `,
  styles: `
    .table-scroll { overflow-x: auto; border: 1px solid var(--mat-sys-outline-variant); border-radius: 12px; }
    .table-scroll:focus-visible { outline: 2px solid var(--mat-sys-primary); outline-offset: 3px; }
    table { width: 100%; min-width: 680px; }
    .metric { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  protected readonly producer = inject(ProducerService);
  protected readonly columns = ['symbol', 'last', 'spread', 'volume', 'vwap', 'imbalance'];
  protected readonly price = formatPriceCents;
  protected readonly volume = formatVolume;
  protected readonly vwap = formatVwap;
  protected readonly imbalance = formatImbalance;
  protected readonly trackInstrument = (_index: number, row: InstrumentSnapshot) => row.instrumentId;
}
