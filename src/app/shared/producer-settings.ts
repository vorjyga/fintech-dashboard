import type { ProducerSettings } from './contracts';

function integerInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** Shared guard for worker commands and the upcoming service/form validation. */
export function isValidProducerSettings(value: unknown): value is ProducerSettings {
  if (typeof value !== 'object' || value === null) return false;
  const settings = value as Record<string, unknown>;
  return (
    integerInRange(settings['instrumentCount'], 1, 50) &&
    integerInRange(settings['updatesPerBatch'], 1, 1000) &&
    integerInRange(settings['batchIntervalMs'], 50, 2000)
  );
}
