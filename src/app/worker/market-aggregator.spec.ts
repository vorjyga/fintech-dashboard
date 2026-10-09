import { MarketAggregator } from './market-aggregator';
import type { MarketUpdate } from '../shared/contracts';
import {
  formatPriceCents,
  formatVwap,
  formatVolume,
  formatImbalance,
} from '../shared/metric-formatters';

const trade = (changes: Partial<MarketUpdate> = {}): MarketUpdate => ({
  instrumentId: 0,
  priceCents: 10000,
  tradeQuantity: 10,
  bidCents: 9996,
  askCents: 10000,
  bidQuantity: 600,
  askQuantity: 400,
  ...changes,
});

describe('Market aggregation', () => {
  // Checks stable symbols, zero volume and unavailable metrics before the first trade.
  it('provides stable symbols, zero volume and unavailable initial metrics for all instruments', () => {
    const rows = new MarketAggregator(50).snapshot();
    expect(rows).toHaveLength(50);
    expect(rows.map((row) => row.symbol).slice(0, 6)).toEqual([
      'ALFA',
      'BETA',
      'GAMMA',
      'DELTA',
      'EPSILON',
      'INST006',
    ]);
    expect(rows[49].symbol).toBe('INST050');
    rows.forEach((row, id) =>
      expect(row).toEqual({
        instrumentId: id,
        symbol: row.symbol,
        lastPriceCents: null,
        spreadCents: null,
        volume: 0n,
        vwap: null,
        imbalance: null,
      }),
    );
  });

  // Checks calculation and display of every metric using the worked assignment example.
  it('matches the worked assignment example including display values', () => {
    const aggregator = new MarketAggregator(1);
    aggregator.consumeBatch([
      trade(),
      trade({ priceCents: 10200, tradeQuantity: 30, bidCents: 10196, askCents: 10200 }),
    ]);
    const [row] = aggregator.snapshot();
    expect(row).toMatchObject({
      lastPriceCents: 10200,
      spreadCents: 4,
      volume: 40n,
      vwap: { numeratorCents: 406000n, denominator: 40n },
      imbalance: 0.2,
    });
    expect(formatPriceCents(row.lastPriceCents)).toBe('$102.00');
    expect(formatPriceCents(row.spreadCents)).toBe('$0.04');
    expect(formatVolume(row.volume)).toBe('40');
    expect(formatVwap(row.vwap)).toBe('$101.50');
    expect(formatImbalance(row.imbalance)).toBe('0.20');
  });

  // Checks all metrics per symbol across interleaved batches and unavailable values for untraded instruments.
  it('keeps every metric independent per symbol across interleaved batches', () => {
    const aggregator = new MarketAggregator(3);
    aggregator.consumeBatch([
      trade(),
      trade({
        instrumentId: 1,
        priceCents: 20000,
        tradeQuantity: 2,
        bidCents: 20000,
        askCents: 20010,
        bidQuantity: 100,
        askQuantity: 300,
      }),
    ]);
    const untraded = {
      instrumentId: 2,
      symbol: 'GAMMA',
      lastPriceCents: null,
      spreadCents: null,
      volume: 0n,
      vwap: null,
      imbalance: null,
    };
    expect(aggregator.snapshot()).toEqual([
      {
        instrumentId: 0,
        symbol: 'ALFA',
        lastPriceCents: 10000,
        spreadCents: 4,
        volume: 10n,
        vwap: { numeratorCents: 100000n, denominator: 10n },
        imbalance: 0.2,
      },
      {
        instrumentId: 1,
        symbol: 'BETA',
        lastPriceCents: 20000,
        spreadCents: 10,
        volume: 2n,
        vwap: { numeratorCents: 40000n, denominator: 2n },
        imbalance: -0.5,
      },
      untraded,
    ]);

    aggregator.consumeBatch([
      trade({
        instrumentId: 1,
        priceCents: 21000,
        tradeQuantity: 6,
        bidCents: 20970,
        askCents: 21000,
        bidQuantity: 900,
        askQuantity: 100,
      }),
      trade({
        priceCents: 10200,
        tradeQuantity: 30,
        bidCents: 10180,
        askCents: 10200,
        bidQuantity: 200,
        askQuantity: 800,
      }),
    ]);
    const rows = aggregator.snapshot();
    expect(rows).toEqual([
      {
        instrumentId: 0,
        symbol: 'ALFA',
        lastPriceCents: 10200,
        spreadCents: 20,
        volume: 40n,
        vwap: { numeratorCents: 406000n, denominator: 40n },
        imbalance: -0.6,
      },
      {
        instrumentId: 1,
        symbol: 'BETA',
        lastPriceCents: 21000,
        spreadCents: 30,
        volume: 8n,
        vwap: { numeratorCents: 166000n, denominator: 8n },
        imbalance: 0.8,
      },
      untraded,
    ]);
    expect(rows.map((row) => formatVwap(row.vwap))).toEqual(['$101.50', '$207.50', '—']);
  });

  // Checks that every repeated trade is counted and book quantities do not contribute to trading volume.
  it('counts repeated and identical trades individually across batches; book quantities are not trading volume', () => {
    const aggregator = new MarketAggregator(1);
    const update = trade({ tradeQuantity: 3, bidQuantity: 10000, askQuantity: 10000 });
    aggregator.consumeBatch([update, update, update]);
    aggregator.consumeBatch([update, update]);
    expect(aggregator.snapshot()[0]).toMatchObject({
      volume: 15n,
      vwap: { numeratorCents: 150000n, denominator: 15n },
    });
  });

  // Checks spread and imbalance calculations using the latest order book snapshot.
  it('uses only the latest book snapshot for spread and imbalance', () => {
    const aggregator = new MarketAggregator(1);
    aggregator.consume(trade());
    aggregator.consume(
      trade({ bidCents: 10000, askCents: 10020, bidQuantity: 0, askQuantity: 25 }),
    );
    expect(aggregator.snapshot()[0]).toMatchObject({ spreadCents: 20, imbalance: -1, volume: 20n });
    aggregator.consume(trade({ bidQuantity: 25, askQuantity: 0 }));
    expect(aggregator.snapshot()[0].imbalance).toBe(1);
  });

  // Checks unavailable imbalance for an empty order book while still counting the trade.
  it('returns unavailable imbalance for a zero book denominator and still counts the trade', () => {
    const aggregator = new MarketAggregator(1);
    aggregator.consume(trade({ bidQuantity: 0, askQuantity: 0 }));
    expect(aggregator.snapshot()[0]).toMatchObject({
      imbalance: null,
      volume: 10n,
      vwap: { numeratorCents: 100000n, denominator: 10n },
    });
  });

  // Checks exact products and sums beyond the safe Number range.
  it('preserves exact products and accumulated quantities beyond Number.MAX_SAFE_INTEGER', () => {
    const aggregator = new MarketAggregator(1);
    const maximum = Number.MAX_SAFE_INTEGER;
    aggregator.consume(trade({ priceCents: maximum, tradeQuantity: maximum }));
    aggregator.consume(trade({ priceCents: maximum, tradeQuantity: maximum }));
    const exact = BigInt(maximum);
    expect(aggregator.snapshot()[0]).toMatchObject({
      volume: exact * 2n,
      vwap: { numeratorCents: exact * exact * 2n, denominator: exact * 2n },
    });
  });

  // Checks that VWAP is not rounded internally and reading snapshots does not reset totals.
  it('does not round intermediate VWAP and snapshots do not reset accumulated totals', () => {
    const aggregator = new MarketAggregator(1);
    aggregator.consume(trade({ priceCents: 10000, tradeQuantity: 1 }));
    aggregator.consume(trade({ priceCents: 10001, tradeQuantity: 1, askCents: 10001 }));
    expect(formatVwap(aggregator.snapshot()[0].vwap)).toBe('$100.01');
    aggregator.consume(trade({ priceCents: 10000, tradeQuantity: 1 }));
    expect(aggregator.snapshot()[0].vwap).toEqual({ numeratorCents: 30001n, denominator: 3n });
    expect(formatVwap(aggregator.snapshot()[0].vwap)).toBe('$100.00');
  });

  // Checks that later changes to inputs and snapshots cannot alter accumulated totals.
  it('copies scalar inputs and returns detached snapshots', () => {
    const aggregator = new MarketAggregator(1);
    const update = trade();
    aggregator.consume(update);
    update.priceCents = 1;
    const row = aggregator.snapshot()[0];
    row.volume = 999n;
    row.lastPriceCents = 2;
    row.vwap!.numeratorCents = 3n;
    expect(aggregator.snapshot()[0]).toMatchObject({
      lastPriceCents: 10000,
      volume: 10n,
      vwap: { numeratorCents: 100000n, denominator: 10n },
    });
  });

  // Checks that a new aggregator starts with empty totals.
  it('a new aggregator starts with fresh state', () => {
    const previous = new MarketAggregator(1);
    previous.consume(trade());
    expect(new MarketAggregator(1).snapshot()[0]).toMatchObject({
      volume: 0n,
      vwap: null,
      lastPriceCents: null,
    });
  });

  // Checks rejection of invalid instrument counts and unknown trade instrument IDs.
  it('rejects invalid instrument counts and unknown update instruments', () => {
    for (const count of [0, 51, -1, 1.5, NaN, Infinity])
      expect(() => new MarketAggregator(count)).toThrow(RangeError);
    const aggregator = new MarketAggregator(1);
    for (const instrumentId of [-1, 1, 0.5])
      expect(() => aggregator.consume(trade({ instrumentId }))).toThrow(RangeError);
    expect(aggregator.snapshot()[0].volume).toBe(0n);
  });
});
