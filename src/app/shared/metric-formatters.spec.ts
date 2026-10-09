import {
  formatPriceCents,
  formatVwap,
  formatVolume,
  formatImbalance,
  roundVwapCents,
} from './metric-formatters';

describe('Metric formatting', () => {
  // Checks unavailable display for missing prices and VWAP with a zero denominator.
  it('shows unavailable prices and VWAP for null and zero denominators', () => {
    expect(formatPriceCents(null)).toBe('—');
    expect(formatVwap(null)).toBe('—');
    expect(formatVwap({ numeratorCents: 100n, denominator: 0n })).toBe('—');
    expect(roundVwapCents({ numeratorCents: 0n, denominator: 0n })).toBeNull();
  });

  // Checks USD currency formatting with two decimal places.
  it('formats cents as USD with two decimal places', () => {
    expect(formatPriceCents(0)).toBe('$0.00');
    expect(formatPriceCents(1)).toBe('$0.01');
    expect(formatPriceCents(10000)).toBe('$100.00');
    expect(formatPriceCents(123456789n)).toBe('$1,234,567.89');
  });

  // Checks exact display of large currency amounts and volumes without precision loss.
  it('preserves currency and volume precision for bigint values beyond safe Number range', () => {
    expect(formatPriceCents(9007199254740993n)).toBe('$90,071,992,547,409.93');
    expect(formatVolume(9007199254740993n)).toBe('9,007,199,254,740,993');
    expect(formatVolume(0n)).toBe('0');
    expect(formatVwap({ numeratorCents: 18014398509481986n, denominator: 2n })).toBe(
      '$90,071,992,547,409.93',
    );
  });

  // Checks VWAP rounding below, exactly at and above half a cent.
  it('rounds VWAP below, at and above half a cent without floating point', () => {
    expect(roundVwapCents({ numeratorCents: 40001n, denominator: 4n })).toBe(10000n);
    expect(roundVwapCents({ numeratorCents: 20001n, denominator: 2n })).toBe(10001n);
    expect(roundVwapCents({ numeratorCents: 40003n, denominator: 4n })).toBe(10001n);
    expect(formatVwap({ numeratorCents: 19999n, denominator: 2n })).toBe('$100.00');
    expect(formatVwap({ numeratorCents: 0n, denominator: 1n })).toBe('$0.00');
  });

  // Checks half-cent rounding with a large denominator without modifying the original ratio.
  it('handles exact half cents with very large denominators and does not mutate the ratio', () => {
    const denominator = 2n * 2n ** 70n;
    const vwap = { numeratorCents: 10000n * denominator + denominator / 2n, denominator };
    const before = { ...vwap };
    expect(roundVwapCents(vwap)).toBe(10001n);
    expect(roundVwapCents({ ...vwap, numeratorCents: vwap.numeratorCents - 1n })).toBe(10000n);
    expect(vwap).toEqual(before);
  });

  // Checks two-decimal imbalance formatting, negative zero normalization and bounds from -1 to 1.
  it('formats imbalance to two decimals, normalizes negative zero and keeps bounds', () => {
    expect(formatImbalance(null)).toBe('—');
    expect(formatImbalance(0.2)).toBe('0.20');
    expect(formatImbalance(-0.2)).toBe('-0.20');
    expect(formatImbalance(-1)).toBe('-1.00');
    expect(formatImbalance(1)).toBe('1.00');
    expect(formatImbalance(0)).toBe('0.00');
    expect(formatImbalance(-0.004)).toBe('0.00');
    expect(formatImbalance(1.0000001)).toBe('1.00');
    expect(formatImbalance(-1.0000001)).toBe('-1.00');
  });
});
