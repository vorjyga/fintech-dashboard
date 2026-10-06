import type { InstrumentSnapshot } from './contracts';

export const UNAVAILABLE_METRIC = '—';
const integerFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
type Vwap = InstrumentSnapshot['vwap'];

/** Format integer cents without converting bigint amounts to floating point. */
export function formatPriceCents(cents: number | bigint | null): string {
  if (cents === null) return UNAVAILABLE_METRIC;
  const value = BigInt(cents);
  const absolute = value < 0n ? -value : value;
  const fraction = String(absolute % 100n).padStart(2, '0');
  return `${value < 0n ? '-' : ''}$${integerFormat.format(absolute / 100n)}.${fraction}`;
}

/** Market prices and quantities are nonnegative; half a cent rounds upward. */
export function roundVwapCents(vwap: Vwap): bigint | null {
  if (vwap === null || vwap.denominator === 0n) return null;
  const quotient = vwap.numeratorCents / vwap.denominator;
  const remainder = vwap.numeratorCents % vwap.denominator;
  return quotient + (remainder * 2n >= vwap.denominator ? 1n : 0n);
}

export function formatVwap(vwap: Vwap): string {
  return formatPriceCents(roundVwapCents(vwap));
}

export function formatVolume(volume: bigint): string {
  return integerFormat.format(volume);
}

export function formatImbalance(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return UNAVAILABLE_METRIC;
  const formatted = Math.max(-1, Math.min(1, value)).toFixed(2);
  return formatted === '-0.00' ? '0.00' : formatted;
}
