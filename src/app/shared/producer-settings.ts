import type { ProducerSettings } from './contracts';

export const PRODUCER_SETTING_LIMITS = {
  instrumentCount: { min: 1, max: 50 },
  updatesPerBatch: { min: 1, max: 1000 },
  batchIntervalMs: { min: 50, max: 2000 },
} as const;

export function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** Shared guard for worker commands, service settings and form drafts. */
export function isValidProducerSettings(value: unknown): value is ProducerSettings {
  if (typeof value !== 'object' || value === null) return false;
  const settings = value as Record<string, unknown>;
  return (
    isIntegerInRange(
      settings['instrumentCount'],
      PRODUCER_SETTING_LIMITS.instrumentCount.min,
      PRODUCER_SETTING_LIMITS.instrumentCount.max,
    ) &&
    isIntegerInRange(
      settings['updatesPerBatch'],
      PRODUCER_SETTING_LIMITS.updatesPerBatch.min,
      PRODUCER_SETTING_LIMITS.updatesPerBatch.max,
    ) &&
    isIntegerInRange(
      settings['batchIntervalMs'],
      PRODUCER_SETTING_LIMITS.batchIntervalMs.min,
      PRODUCER_SETTING_LIMITS.batchIntervalMs.max,
    )
  );
}
