import type { InstrumentSnapshot, MarketUpdate } from '../shared/contracts';
import { instrumentSymbol } from '../shared/instrument-symbol';
import { isIntegerInRange, PRODUCER_SETTING_LIMITS } from '../shared/producer-settings';

interface InstrumentTotals {
  lastPriceCents: number | null;
  bidCents: number | null;
  askCents: number | null;
  bidQuantity: number;
  askQuantity: number;
  volume: bigint;
  numeratorCents: bigint;
}

/** One bounded accumulator per instrument. Each consume call represents one trade. */
export class MarketAggregator {
  private readonly totals: InstrumentTotals[];

  constructor(instrumentCount: number) {
    const { min, max } = PRODUCER_SETTING_LIMITS.instrumentCount;
    if (!isIntegerInRange(instrumentCount, min, max)) {
      throw new RangeError(`Instrument count must be an integer from ${min} to ${max}.`);
    }
    this.totals = Array.from({ length: instrumentCount }, () => ({
      lastPriceCents: null,
      bidCents: null,
      askCents: null,
      bidQuantity: 0,
      askQuantity: 0,
      volume: 0n,
      numeratorCents: 0n,
    }));
  }

  /** Consume validated integer values from the Wasm generator; never retain the update. */
  consume(update: MarketUpdate): void {
    const totals = this.totals[update.instrumentId];
    if (!Number.isInteger(update.instrumentId) || !totals) {
      throw new RangeError('Market update refers to an unknown instrument.');
    }
    // Convert each operand before multiplying, to avoid Number precision loss.
    const quantity = BigInt(update.tradeQuantity);
    const cost = BigInt(update.priceCents) * quantity;
    totals.volume += quantity;
    totals.numeratorCents += cost;
    totals.lastPriceCents = update.priceCents;
    totals.bidCents = update.bidCents;
    totals.askCents = update.askCents;
    totals.bidQuantity = update.bidQuantity;
    totals.askQuantity = update.askQuantity;
  }

  consumeBatch(updates: Iterable<MarketUpdate>): void {
    for (const update of updates) this.consume(update);
  }

  /** Fresh structured-clone-compatible rows; callers cannot mutate accumulated state. */
  snapshot(): InstrumentSnapshot[] {
    return this.totals.map((totals, instrumentId) => {
      const bookQuantity = totals.bidQuantity + totals.askQuantity;
      return {
        instrumentId,
        symbol: instrumentSymbol(instrumentId),
        lastPriceCents: totals.lastPriceCents,
        spreadCents:
          totals.bidCents === null || totals.askCents === null
            ? null
            : totals.askCents - totals.bidCents,
        volume: totals.volume,
        vwap:
          totals.volume === 0n
            ? null
            : {
                numeratorCents: totals.numeratorCents,
                denominator: totals.volume,
              },
        imbalance:
          bookQuantity === 0 ? null : (totals.bidQuantity - totals.askQuantity) / bookQuantity,
      };
    });
  }
}
